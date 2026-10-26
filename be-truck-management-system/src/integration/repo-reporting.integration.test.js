// Integrasi konsistensi laporan Repo (Phase 5) terhadap PostgreSQL sungguhan.
// Opt-in: hanya jalan kalau ATMS_SCRATCH_DATABASE_URL diisi DAN lolos scratch-db-guard (database
// scratch lokal), bukan database dev/production, karena test ini menulis data.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { prepareScratchDatabase } from '../test-support/scratch-db-guard.js';

const scratch = await prepareScratchDatabase();

if (scratch.skip) {
  test('repo reporting integration skipped without ATMS_SCRATCH_DATABASE_URL', { skip: scratch.skip }, () => {});
} else {
  process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';
  const { query, withTransaction, closePool } = await import('../db/client.js');
  const { createRepoRevenueLines } = await import('../modules/container-jobs/repo-pickup-revenue.js');
  const { pickupComboRepoContainerJobs, pickupSingleRepoContainerJob } = await import('../modules/container-jobs/container-jobs.repository.js');
  const { getUtilizationTripRows } = await import('../modules/reports/utilization-trips.repository.js');
  const { getMonthlyComparisonReport, getMonthlyRevenueReport } = await import('../modules/reports/reports.repository.js');
  const { activateManualRevenueLine, invoiceOrdersCte, voidManualRevenueLine } = await import('../modules/finance/finance.repository.js');

  const tag = crypto.randomBytes(3).toString('hex').toUpperCase();
  let seq = 0;
  const nextTag = () => `${tag}${String(++seq).padStart(3, '0')}`;
  const jakartaToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
  const [year, month] = jakartaToday.split('-').map(Number);

  async function cloneRow(table, templateSql, overrides) {
    const result = await query(
      `insert into ${table}
       select (jsonb_populate_record(null::${table}, to_jsonb(t) || $1::jsonb)).*
       from (${templateSql}) t returning *`,
      [JSON.stringify({ id: crypto.randomUUID(), ...overrides })],
    );
    return result.rows[0];
  }

  async function createSalesOrder(customerName) {
    const code = nextTag();
    return cloneRow('sales_orders', `
      select * from sales_orders
      where status <> 'cancelled' and coalesce(is_vendor_order, false) = false
      order by created_at limit 1
    `, {
      so_number: `SO-RP-${code}`, accurate_so_number: `ACC-RP-${code}`, finance_verification_status: 'verified', is_vendor_order: false, debit_note_number: null, cancel_request_status: 'none', cancelled_at: null, customer_name: customerName,
      invoice_number: null, billing_status: 'belum_invoice', debit_note_document_uploaded_at: null, status: 'completed',
    });
  }

  const createDriver = () => cloneRow('drivers', 'select * from drivers where archived_at is null order by created_at limit 1', {
    name: `SOPIR RP ${nextTag()}`, nik: null, operational_status: 'Aktif', archived_at: null,
  });

  const createVehicle = (size) => {
    const code = nextTag();
    return cloneRow('vehicles', 'select * from vehicles where archived_at is null order by created_at limit 1', {
      plate_number: `B ${code} RP`, unit_code: `RP-${code}`, engine_number: null, kir_number: null, vin: null,
      container_size: size, current_chassis_id: null, operational_status: 'Aktif', archived_at: null,
    });
  };

  // Job titip dengan truck/sopir leg asli yang dilepas saat titip.
  async function createStoredJob(salesOrderId, originalDriver, originalVehicle) {
    return cloneRow('container_jobs', `
      select * from container_jobs
      where coalesce(execution_source, 'internal') = 'internal' and status = 'completed'
      order by created_at limit 1
    `, {
      sales_order_id: salesOrderId,
      container_number: `RPT${nextTag()}`.padEnd(11, '0').slice(0, 11),
      container_size: '20FT',
      status: 'repo_stored',
      repo_stored_at: new Date().toISOString(),
      repo_location: `Depo RP ${tag}`,
      repo_eir_number: `EIR-${tag}`,
      repo_released_driver_id: originalDriver.id,
      repo_released_vehicle_id: originalVehicle.id,
      // Snapshot saat titip = assignment asli (seperti alur nyata), bukan warisan job template.
      assignment_snapshot: { driver: originalDriver.name, plateNumber: originalVehicle.plate_number, unitCode: originalVehicle.unit_code },
      driver_id: null, vehicle_id: null, assignment_group_id: null,
      entry_source: 'realtime', is_backdate_entry: false, rpuj_status: 'pending',
      completed_at: null, cancelled_at: null, repo_picked_up_at: null, running_at: null,
    });
  }

  const pickup = (driver, vehicle, extra = {}) => ({
    pickupConfirmed: true, repoPickedUpAt: new Date().toISOString(), driverId: driver.id, vehicleId: vehicle.id, updatedBy: 'Integration Test', ...extra,
  });

  async function billing(salesOrderId) {
    const result = await query(`${invoiceOrdersCte()} select billing_amount from invoice_orders where id = $1`, [salesOrderId]);
    assert.ok(result.rows[0], 'SO titip harus layak Finance');
    return Number(result.rows[0].billing_amount);
  }

  const monthReport = (y = year, m = month) => getMonthlyRevenueReport({ year: y, month: m });
  // File integrasi lain berjalan paralel di bulan yang sama: bandingkan hanya baris milik test ini.
  const ownRepoTotal = (report, movementIds) => report.repoRevenueRows
    .filter((row) => movementIds.includes(row.movementId))
    .reduce((sum, row) => sum + row.amount, 0);


  // Revenue Repo LAMA: sebelum aturan 2026-10-26 dibuat saat Ambil Titip (draft). Pickup sekarang tidak
  // membuatnya lagi (Biaya Titip ditagih sebagai Reimbursement saat titip), tetapi baris lama tetap
  // dilaporkan dan dikelola Finance -- disimulasikan eksplisit sebagai data lama.
  async function seedLegacyRepoRevenue(movementId, pickupType) {
    return withTransaction(async (client) => {
      const items = await client.query(
        `select cpi.id, cj.id as job_id, cj.sales_order_id, cj.container_number
         from container_pickup_items cpi join container_jobs cj on cj.id = cpi.container_job_id
         where cpi.movement_id = $1 order by cpi.sequence_no`,
        [movementId],
      );
      return createRepoRevenueLines(client, {
        movementId,
        pickupType,
        items: items.rows.map((row) => ({ id: row.id, job: { id: row.job_id, sales_order_id: row.sales_order_id, container_number: row.container_number } })),
        actorName: 'Data Lama',
      });
    });
  }
  const repoRevenueCount = async (jobIds) => (await query(
    "select count(*)::int as n from manual_revenue_lines where charge_type = 'repo' and container_job_id = any($1::uuid[])",
    [jobIds],
  )).rows[0].n;

  let single;
  let combo;

  test.before(async () => {
    // CASE B -- single Repo: leg asli truck A / sopir A, Repo truck B / sopir B.
    const driverA = await createDriver();
    const truckA = await createVehicle('20FT');
    const soSingle = await createSalesOrder(`Customer Single ${tag}`);
    const jobSingle = await createStoredJob(soSingle.id, driverA, truckA);
    const driverB = await createDriver();
    const truckB = await createVehicle('20FT');
    const singleResult = await pickupSingleRepoContainerJob(jobSingle.id, pickup(driverB, truckB, { repoUjAmount: 150000 }));
    single = { so: soSingle, job: jobSingle, driverA, truckA, driverB, truckB, movement: singleResult.movement };
    single.revenueAtPickup = await repoRevenueCount([jobSingle.id]);
    await seedLegacyRepoRevenue(singleResult.movement.id, 'single');

    // CASE C -- combo dari dua SO/customer berbeda, Repo truck C / sopir C.
    const soX = await createSalesOrder(`Customer X ${tag}`);
    const soY = await createSalesOrder(`Customer Y ${tag}`);
    const [driverX, truckX, driverY, truckY] = [await createDriver(), await createVehicle('20FT'), await createDriver(), await createVehicle('20FT')];
    const jobX = await createStoredJob(soX.id, driverX, truckX);
    const jobY = await createStoredJob(soY.id, driverY, truckY);
    const driverC = await createDriver();
    const truckC = await createVehicle('40FT');
    const comboResult = await pickupComboRepoContainerJobs(pickup(driverC, truckC, {
      containerJobIds: [jobX.id, jobY.id], repoUjAmount: 175000,
    }));
    combo = { soX, soY, jobX, jobY, driverX, truckX, driverY, truckY, driverC, truckC, movement: comboResult.movement };
    combo.revenueAtPickup = await repoRevenueCount([jobX.id, jobY.id]);
    await seedLegacyRepoRevenue(comboResult.movement.id, 'combo_2x20');
  });

  test.after(async () => {
    await closePool();
  });

  test('CASE B: single Repo belum menambah ritasi sebelum selesai final; Repo B +0 utilisasi', async () => {
    const trips = await getUtilizationTripRows({ dateFrom: jakartaToday, dateTo: jakartaToday });
    const original = trips.filter((row) => row.jobId === single.job.id);
    assert.equal(original.length, 0);
    // Repo pickup tidak menambah utilisasi truck/sopir Repo.
    assert.equal(trips.filter((row) => row.movementId === single.movement.id).length, 0);
    assert.equal(trips.filter((row) => row.vehicleId === single.truckB.id || row.driverId === single.driverB.id).length, 0);
    // Truck/sopir Repo tetap tersimpan di movement (riwayat, UJ, revenue, lifecycle).
    const movement = await query('select vehicle_id, driver_id, status, started_at from container_pickup_movements where id = $1', [single.movement.id]);
    assert.equal(movement.rows[0].vehicle_id, single.truckB.id);
    assert.equal(movement.rows[0].driver_id, single.driverB.id);
    assert.ok(movement.rows[0].started_at);

    const jobs = await query('select count(*)::int as n from container_jobs where sales_order_id = $1', [single.so.id]);
    assert.equal(jobs.rows[0].n, 1);
    const uj = await query("select amount from operational_fund_transactions where source = 'repo_uj' and source_ref_id = $1 and status = 'posted'", [single.movement.id]);
    assert.equal(uj.rows.length, 1);

    // Aturan baru: Ambil Titip tidak membuat Revenue Repo.
    assert.equal(single.revenueAtPickup, 0);
    // Revenue Repo lama (data lama) tetap dilaporkan sekali, milik truck/sopir Repo.
    const report = await monthReport();
    const repoRows = report.repoRevenueRows.filter((row) => row.movementId === single.movement.id);
    assert.equal(repoRows.length, 1);
    assert.equal(repoRows[0].amount, 300000);
    assert.equal(repoRows[0].revenueDate, jakartaToday);
    // Transport asli dilaporkan sekali sejak titip (tanggal titip, truck/sopir asli A), terpisah
    // dari Revenue Repo milik truck/sopir B.
    const transport = report.rows.filter((row) => row.jobId === single.job.id);
    assert.equal(transport.length, 1);
    assert.equal(transport[0].completedDate, jakartaToday);
    assert.equal(transport[0].plateNumber, single.truckA.plate_number);
    assert.equal(transport[0].driver, single.driverA.name);
    assert.notEqual(transport[0].plateNumber, repoRows[0].plateNumber);
  });

  test('CASE C: combo belum menambah ritasi sebelum kedua job selesai; Repo C +0 utilisasi', async () => {
    const trips = await getUtilizationTripRows({ dateFrom: jakartaToday, dateTo: jakartaToday });
    const originals = trips.filter((row) => [combo.jobX.id, combo.jobY.id].includes(row.jobId));
    assert.equal(originals.length, 0);
    // Combo Repo pickup tidak menambah utilisasi truck/sopir C.
    assert.equal(trips.filter((row) => row.vehicleId === combo.truckC.id || row.driverId === combo.driverC.id).length, 0);
    const movement = await query('select vehicle_id, driver_id from container_pickup_movements where id = $1', [combo.movement.id]);
    assert.equal(movement.rows[0].vehicle_id, combo.truckC.id);
    assert.equal(movement.rows[0].driver_id, combo.driverC.id);

    const uj = await query("select amount from operational_fund_transactions where source = 'repo_uj' and source_ref_id = $1 and status = 'posted'", [combo.movement.id]);
    assert.equal(uj.rows.length, 1);
    assert.equal(Number(uj.rows[0].amount), 175000);

    assert.equal(combo.revenueAtPickup, 0, 'Ambil Titip combo tidak membuat Revenue Repo');
    const report = await monthReport();
    const repoRows = report.repoRevenueRows.filter((row) => row.movementId === combo.movement.id);
    assert.equal(repoRows.length, 2);
    assert.equal(repoRows.reduce((sum, row) => sum + row.amount, 0), 600000);
    assert.deepEqual(
      repoRows.map((row) => [row.jobId, row.salesOrderId, row.customer]).sort(),
      [[combo.jobX.id, combo.soX.id, combo.soX.customer_name], [combo.jobY.id, combo.soY.id, combo.soY.customer_name]].sort(),
    );
  });

  test('CASE D/E: draft dihitung operasional tanpa billing; setelah aktif dihitung sekali dan billing +Rp300.000', async () => {
    const [line] = (await monthReport()).repoRevenueRows.filter((row) => row.jobId === combo.jobX.id);
    assert.equal(line.status, 'draft');
    const before = await monthReport();
    const billingBefore = await billing(combo.soX.id);

    await activateManualRevenueLine(combo.soX.id, line.id, { actorName: 'Finance' });

    const after = await monthReport();
    assert.equal(ownRepoTotal(after, [combo.movement.id]), ownRepoTotal(before, [combo.movement.id]), 'aktivasi tidak menambah revenue operasional');
    assert.equal(after.repoRevenueRows.filter((row) => row.id === line.id).length, 1);
    assert.equal(after.repoRevenueRows.find((row) => row.id === line.id).status, 'active');
    assert.equal(await billing(combo.soX.id), billingBefore + 300000);
    assert.equal(after.summary.totalOperationalRevenue, after.summary.transportRevenue + after.summary.repoRevenue);
  });

  test('CASE F: void dikeluarkan dari revenue Repo operasional dan tidak masuk billing', async () => {
    const [line] = (await monthReport()).repoRevenueRows.filter((row) => row.jobId === combo.jobY.id);
    const before = await monthReport();
    const billingBefore = await billing(combo.soY.id);

    await voidManualRevenueLine(combo.soY.id, line.id, { reason: 'Test void Phase 5', actorName: 'Finance' });

    const after = await monthReport();
    assert.equal(after.repoRevenueRows.filter((row) => row.id === line.id).length, 0);
    assert.equal(ownRepoTotal(after, [combo.movement.id]), ownRepoTotal(before, [combo.movement.id]) - 300000);
    assert.equal(await billing(combo.soY.id), billingBefore);
  });

  test('tanggal revenue Repo mengikuti movement.started_at, bukan tanggal aktivasi/invoice', async () => {
    const previous = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
    const lastDayPrev = new Date(Date.UTC(previous.y, previous.m, 0, 3, 0, 0)); // 10:00 WIB hari terakhir bulan lalu
    await query('update container_pickup_movements set started_at = $2 where id = $1', [single.movement.id, lastDayPrev.toISOString()]);

    const current = await monthReport();
    const prev = await monthReport(previous.y, previous.m);
    assert.equal(current.repoRevenueRows.filter((row) => row.movementId === single.movement.id).length, 0);
    const moved = prev.repoRevenueRows.filter((row) => row.movementId === single.movement.id);
    assert.equal(moved.length, 1);

    const comparison = await getMonthlyComparisonReport({ year: previous.y });
    assert.ok(comparison.rows[previous.m - 1].repoRevenue >= 300000);
    assert.equal(
      comparison.summary.totalOperationalRevenue,
      comparison.summary.totalRevenue + comparison.summary.repoRevenue,
    );
  });

  test('CASE A: transport normal tetap sama dan tidak menghasilkan revenue/UJ Repo', async () => {
    const so = await createSalesOrder(`Customer Normal ${tag}`);
    const job = await cloneRow('container_jobs', `
      select * from container_jobs where coalesce(execution_source, 'internal') = 'internal' and status = 'completed'
      order by created_at limit 1
    `, {
      sales_order_id: so.id, container_number: `NRM${nextTag()}`.padEnd(11, '0').slice(0, 11), container_size: '20FT',
      status: 'completed', completed_at: new Date().toISOString(), repo_stored_at: null,
      driver_id: null, vehicle_id: null, assignment_group_id: null, entry_source: 'realtime', is_backdate_entry: false,
    });
    const report = await monthReport();
    const transportRows = report.rows.filter((row) => row.jobId === job.id);
    assert.equal(transportRows.length, 1);
    assert.ok(transportRows[0].revenue > 0);
    assert.equal(report.repoRevenueRows.filter((row) => row.jobId === job.id).length, 0);
    const trips = await getUtilizationTripRows({ dateFrom: jakartaToday, dateTo: jakartaToday });
    assert.equal(trips.filter((row) => row.jobId === job.id).length, 1);
    const repoUj = await query("select count(*)::int as n from operational_fund_transactions where source = 'repo_uj' and container_job_id = $1", [job.id]);
    assert.equal(repoUj.rows[0].n, 0);
  });
}
