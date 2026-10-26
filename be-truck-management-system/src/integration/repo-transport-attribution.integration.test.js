// Integrasi atribusi revenue transport asli untuk job Repo terhadap PostgreSQL sungguhan.
// Opt-in: hanya jalan kalau ATMS_SCRATCH_DATABASE_URL diisi DAN lolos scratch-db-guard (database
// scratch lokal), bukan database dev/production, karena test ini menulis data.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { prepareScratchDatabase } from '../test-support/scratch-db-guard.js';

const scratch = await prepareScratchDatabase();

if (scratch.skip) {
  test('repo transport attribution integration skipped without ATMS_SCRATCH_DATABASE_URL', { skip: scratch.skip }, () => {});
} else {
  process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';
  const { query, withTransaction, closePool } = await import('../db/client.js');
  const { createRepoRevenueLines } = await import('../modules/container-jobs/repo-pickup-revenue.js');
  const { pickupComboRepoContainerJobs, pickupSingleRepoContainerJob } = await import('../modules/container-jobs/container-jobs.repository.js');
  const {
    getCustomerPerformanceReport,
    getDriverPerformanceReport,
    getMonthlyComparisonReport,
    getMonthlyRevenueReport,
    getSalesPerformanceReport,
  } = await import('../modules/reports/reports.repository.js');

  const tag = crypto.randomBytes(3).toString('hex').toUpperCase();
  let seq = 0;
  const nextTag = () => `${tag}${String(++seq).padStart(3, '0')}`;
  // Tahun jauh supaya tidak bercampur data lain: titip 30 Sep, pickup/selesai 2 Okt (WIB).
  const YEAR = 2031;
  const STORED_AT = `${YEAR}-09-30T03:00:00.000Z`;
  const PICKUP_AT = `${YEAR}-10-02T02:00:00.000Z`;
  const COMPLETED_AT = `${YEAR}-10-02T08:00:00.000Z`;

  async function cloneRow(table, templateSql, overrides) {
    const result = await query(
      `insert into ${table}
       select (jsonb_populate_record(null::${table}, to_jsonb(t) || $1::jsonb)).*
       from (${templateSql}) t returning *`,
      [JSON.stringify({ id: crypto.randomUUID(), ...overrides })],
    );
    return result.rows[0];
  }

  const createSalesOrder = () => cloneRow('sales_orders', `
    select * from sales_orders
    where status <> 'cancelled' and coalesce(is_vendor_order, false) = false
    order by created_at limit 1
  `, { so_number: `SO-TA-${nextTag()}`, accurate_so_number: `ACC-TA-${nextTag()}`, finance_verification_status: 'verified', is_vendor_order: false, debit_note_number: null, cancel_request_status: 'none', cancelled_at: null, status: 'completed' });

  const createDriver = () => cloneRow('drivers', 'select * from drivers where archived_at is null order by created_at limit 1', {
    name: `SOPIR TA ${nextTag()}`, nik: null, operational_status: 'Aktif', archived_at: null,
  });

  const createVehicle = (size) => {
    const code = nextTag();
    return cloneRow('vehicles', 'select * from vehicles where archived_at is null order by created_at limit 1', {
      plate_number: `B ${code} TA`, unit_code: `TA-${code}`, engine_number: null, kir_number: null, vin: null,
      container_size: size, current_chassis_id: null, operational_status: 'Aktif', archived_at: null,
    });
  };

  const jobTemplate = `
    select * from container_jobs
    where coalesce(execution_source, 'internal') = 'internal' and status = 'completed'
    order by created_at limit 1
  `;

  // Job yang dititip 30 Sep oleh sopir/truck asli (snapshot + released assignment).
  const createStoredJob = (salesOrderId, driver, vehicle) => cloneRow('container_jobs', jobTemplate, {
    sales_order_id: salesOrderId,
    container_number: `TAJ${nextTag()}`.padEnd(11, '0').slice(0, 11),
    container_size: '20FT',
    status: 'repo_stored',
    repo_stored_at: STORED_AT,
    repo_location: 'Depo TA',
    repo_eir_number: `EIR-${tag}`,
    repo_released_driver_id: driver.id,
    repo_released_vehicle_id: vehicle.id,
    assignment_snapshot: { driver: driver.name, plateNumber: vehicle.plate_number, unitCode: vehicle.unit_code },
    driver_id: null, vehicle_id: null, assignment_group_id: null,
    entry_source: 'realtime', is_backdate_entry: false, rpuj_status: 'pending',
    completed_at: null, cancelled_at: null, repo_picked_up_at: null, running_at: null,
  });

  async function finishRepo(jobIds, movementId) {
    await query('update container_pickup_movements set started_at = $2 where id = $1', [movementId, PICKUP_AT]);
    await query("update container_jobs set status = 'completed', completed_at = $2 where id = any($1::uuid[])", [jobIds, COMPLETED_AT]);
  }

  const report = (month) => getMonthlyRevenueReport({ year: YEAR, month });
  const rowsFor = (result, jobId) => result.rows.filter((row) => row.jobId === jobId);

  let comparisonBefore;
  const monthlyBefore = {};
  const driverBefore = {};
  const performanceBefore = {};
  const performance = async (month) => ({
    sales: await getSalesPerformanceReport({ year: YEAR, month }),
    customer: await getCustomerPerformanceReport({ year: YEAR, month }),
  });
  const customerRevenue = (report, name) => report.rows
    .filter((row) => String(row.customer ?? row.customerName ?? '').trim().toLowerCase() === String(name).trim().toLowerCase())
    .reduce((sum, row) => sum + Number(row.totalRevenue || 0), 0);
  const salesRevenue = (report, name) => report.rows
    .filter((row) => String(row.salesName || '').trim().toLowerCase() === String(name).trim().toLowerCase())
    .reduce((sum, row) => sum + Number(row.totalRevenue || 0), 0);

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
    comparisonBefore = await getMonthlyComparisonReport({ year: YEAR });
    for (const month of [9, 10, 11]) {
      performanceBefore[month] = await performance(month);
      monthlyBefore[month] = await report(month);
      driverBefore[month] = await getDriverPerformanceReport({ month: `${YEAR}-${String(month).padStart(2, '0')}` });
    }

    const so = await createSalesOrder();
    const [driverA, truckA, driverB, truckB] = [await createDriver(), await createVehicle('20FT'), await createDriver(), await createVehicle('20FT')];
    const job = await createStoredJob(so.id, driverA, truckA);
    const picked = await pickupSingleRepoContainerJob(job.id, {
      pickupConfirmed: true, repoPickedUpAt: PICKUP_AT, driverId: driverB.id, vehicleId: truckB.id, updatedBy: 'Integration Test', repoUjAmount: 150000,
    });
    await finishRepo([job.id], picked.movement.id);
    single = { so, job, driverA, truckA, driverB, truckB, movement: picked.movement };
    single.revenueAtPickup = await repoRevenueCount([job.id]);
    await seedLegacyRepoRevenue(picked.movement.id, 'single');

    const soCombo = await createSalesOrder();
    const [driverX, truckX, driverY, truckY, driverC, truckC] = [
      await createDriver(), await createVehicle('20FT'), await createDriver(), await createVehicle('20FT'),
      await createDriver(), await createVehicle('40FT'),
    ];
    const jobX = await createStoredJob(soCombo.id, driverX, truckX);
    const jobY = await createStoredJob(soCombo.id, driverY, truckY);
    const pickedCombo = await pickupComboRepoContainerJobs({
      pickupConfirmed: true, repoPickedUpAt: PICKUP_AT, containerJobIds: [jobX.id, jobY.id], driverId: driverC.id, vehicleId: truckC.id,
      updatedBy: 'Integration Test', repoUjAmount: 175000,
    });
    await finishRepo([jobX.id, jobY.id], pickedCombo.movement.id);
    combo = { jobX, jobY, truckX, truckY, driverX, driverY, truckC, driverC, movement: pickedCombo.movement };
    combo.revenueAtPickup = await repoRevenueCount([jobX.id, jobY.id]);
    await seedLegacyRepoRevenue(pickedCombo.movement.id, 'combo_2x20');
  });

  test.after(async () => {
    await closePool();
  });

  test('B+C: titip 30 Sep, Repo selesai 2 Okt -> transport milik September, atribusi truck/sopir asli', async () => {
    const september = rowsFor(await report(9), single.job.id);
    assert.equal(september.length, 1);
    assert.equal(september[0].completedDate, `${YEAR}-09-30`);
    assert.equal(september[0].plateNumber, single.truckA.plate_number);
    assert.equal(september[0].driver, single.driverA.name);
    assert.equal(september[0].unitCode, single.truckA.unit_code);
    assert.ok(september[0].revenue > 0);
    assert.equal(rowsFor(await report(10), single.job.id).length, 0, 'transport tidak muncul lagi di bulan Repo');
  });

  test('D: Ambil Titip tidak membuat Revenue Repo; Revenue Repo lama tetap Oktober dan milik truck/sopir Repo', async () => {
    assert.equal(single.revenueAtPickup, 0);
    assert.equal(combo.revenueAtPickup, 0);
    const october = await report(10);
    const repoRows = october.repoRevenueRows.filter((row) => row.movementId === single.movement.id);
    assert.equal(repoRows.length, 1);
    assert.equal(repoRows[0].revenueDate, `${YEAR}-10-02`);
    assert.equal(repoRows[0].plateNumber, single.truckB.plate_number);
    assert.equal(repoRows[0].driver, single.driverB.name);
    assert.equal(repoRows[0].amount, 300000);
    assert.equal((await report(9)).repoRevenueRows.filter((row) => row.movementId === single.movement.id).length, 0);
  });

  test('Driver Performance: original transport follows storage driver/month, not Repo driver/month', async () => {
    const [september, october] = await Promise.all([
      getDriverPerformanceReport({ month: `${YEAR}-09` }),
      getDriverPerformanceReport({ month: `${YEAR}-10` }),
    ]);
    const revenueSeptember = await report(9);
    const ownTransport = [single.job, combo.jobX, combo.jobY]
      .reduce((sum, job) => sum + rowsFor(revenueSeptember, job.id).reduce((total, row) => total + row.revenue, 0), 0);
    for (const [driver, job] of [[single.driverA, single.job], [combo.driverX, combo.jobX], [combo.driverY, combo.jobY]]) {
      const row = september.rows.find((item) => item.driverId === driver.id);
      assert.ok(row);
      assert.equal(row.totalRevenue, rowsFor(revenueSeptember, job.id)[0].revenue);
      assert.equal(row.totalTrips, 0);
    }
    // Repo pickup tidak menambah trip sopir Repo B/C (baris boleh ada karena komisi job), revenue 0.
    for (const driver of [single.driverB, combo.driverC]) {
      const row = october.rows.find((item) => item.driverId === driver.id);
      assert.equal(row ? row.totalTrips : 0, 0);
      assert.equal(row ? row.totalRevenue : 0, 0);
    }
    assert.equal(september.summary.totalRevenue - driverBefore[9].summary.totalRevenue, ownTransport);
    assert.equal(october.summary.totalRevenue - driverBefore[10].summary.totalRevenue, 0);
    assert.equal(ownTransport, revenueSeptember.summary.transportRevenue - monthlyBefore[9].summary.transportRevenue);
  });

  test('E: single dan combo tanpa duplikasi revenue', async () => {
    const [september, october] = [await report(9), await report(10)];
    for (const [job, truck, driver] of [[combo.jobX, combo.truckX, combo.driverX], [combo.jobY, combo.truckY, combo.driverY]]) {
      const transport = [...rowsFor(september, job.id), ...rowsFor(october, job.id)];
      assert.equal(transport.length, 1);
      assert.equal(transport[0].plateNumber, truck.plate_number);
      assert.equal(transport[0].driver, driver.name);
    }
    const comboRepo = [...september.repoRevenueRows, ...october.repoRevenueRows].filter((row) => row.movementId === combo.movement.id);
    assert.equal(comboRepo.length, 2);
    assert.ok(comboRepo.every((row) => row.plateNumber === combo.truckC.plate_number));
    assert.equal(comboRepo.reduce((sum, row) => sum + row.amount, 0), 600000);
  });

  test('Monthly Comparison: transport tiga job pindah ke September, Revenue Repo di Oktober', async () => {
    const [september, october] = [await report(9), await report(10)];
    const ownTransport = [single.job, combo.jobX, combo.jobY]
      .reduce((sum, job) => sum + rowsFor(september, job.id).reduce((total, row) => total + row.revenue, 0), 0);
    const after = await getMonthlyComparisonReport({ year: YEAR });
    assert.equal(after.rows[8].totalRevenue - comparisonBefore.rows[8].totalRevenue, ownTransport);
    assert.equal(after.rows[9].totalRevenue - comparisonBefore.rows[9].totalRevenue, 0);
    assert.equal(after.rows[9].repoRevenue - comparisonBefore.rows[9].repoRevenue, 900000);
    assert.ok(october.summary.repoRevenue >= 900000);
  });

  test('D+E: Repo pickup tidak menambah trip Driver Performance maupun Monthly Comparison', async () => {
    // Driver Performance Oktober: sopir Repo B dan C tidak mendapat trip.
    const october = await getDriverPerformanceReport({ month: `${YEAR}-10` });
    for (const driver of [single.driverB, combo.driverC]) {
      const row = october.rows.find((item) => item.driverId === driver.id);
      assert.equal(row ? row.totalTrips : 0, 0);
    }
    // Trip final masuk Oktober, sementara revenue transport tetap September.
    const september = await getDriverPerformanceReport({ month: `${YEAR}-09` });
    const monthly = await report(9);
    for (const [driver, job] of [[single.driverA, single.job], [combo.driverX, combo.jobX], [combo.driverY, combo.jobY]]) {
      const row = september.rows.find((item) => item.driverId === driver.id);
      assert.equal(row.totalTrips, 0);
      assert.equal(row.totalRevenue, rowsFor(monthly, job.id)[0].revenue);
    }
    for (const driver of [single.driverA, combo.driverX, combo.driverY]) {
      const row = october.rows.find((item) => item.driverId === driver.id);
      assert.equal(row?.totalTrips, 1);
    }
    // Monthly Comparison: tiga job final di Oktober, nol trip di September.
    const comparison = await getMonthlyComparisonReport({ year: YEAR });
    assert.equal(comparison.rows[8].totalTrips - comparisonBefore.rows[8].totalTrips, 0);
    assert.equal(comparison.rows[9].totalTrips - comparisonBefore.rows[9].totalTrips, 3);
  });

  test('Sales & Customer Performance: transport job titip masuk September, atribusi sales/customer tetap', async () => {
    const september = await report(9);
    const ownSeptember = [single.job, combo.jobX, combo.jobY]
      .reduce((sum, job) => sum + rowsFor(september, job.id).reduce((total, row) => total + row.revenue, 0), 0);
    assert.ok(ownSeptember > 0);
    const [sep, oct] = [await performance(9), await performance(10)];
    // B: masuk September, tidak lagi di Oktober (bulan Repo selesai).
    assert.equal(sep.sales.summary.totalRevenue - performanceBefore[9].sales.summary.totalRevenue, ownSeptember);
    assert.equal(sep.customer.summary.totalRevenue - performanceBefore[9].customer.summary.totalRevenue, ownSeptember);
    assert.equal(oct.sales.summary.totalRevenue - performanceBefore[10].sales.summary.totalRevenue, 0);
    assert.equal(oct.customer.summary.totalRevenue - performanceBefore[10].customer.summary.totalRevenue, 0);
    // C/D: tetap ke customer dan sales milik SO (tidak berubah oleh aturan tanggal).
    const so = (await query('select customer_name, sales_name from sales_orders where id = $1', [single.so.id])).rows[0];
    assert.ok(customerRevenue(sep.customer, so.customer_name) - customerRevenue(performanceBefore[9].customer, so.customer_name) >= rowsFor(september, single.job.id)[0].revenue);
    const salesRow = sep.sales.rows.find((row) => (row.customers || []).some((customer) => String(customer.customer || '').trim().toLowerCase() === String(so.customer_name).trim().toLowerCase()));
    assert.ok(salesRow, 'baris sales untuk customer SO harus ada');
    assert.ok(salesRevenue(sep.sales, salesRow.salesName) - salesRevenue(performanceBefore[9].sales, salesRow.salesName) >= rowsFor(september, single.job.id)[0].revenue);
    // Revenue Repo tidak tercampur ke laporan Sales/Customer (transport saja).
    assert.ok(!('repoRevenue' in sep.sales.summary));
  });

  test('E: job batal (walau pernah dititip) tidak dihitung', async () => {
    const before = await performance(9);
    const driverRevenueBefore = (await getDriverPerformanceReport({ month: `${YEAR}-09` })).summary.totalRevenue;
    const so = await createSalesOrder();
    const [driver, truck] = [await createDriver(), await createVehicle('20FT')];
    const job = await createStoredJob(so.id, driver, truck);
    await query("update container_jobs set status = 'cancelled', cancelled_at = now() where id = $1", [job.id]);
    const after = await performance(9);
    assert.equal(after.sales.summary.totalRevenue, before.sales.summary.totalRevenue);
    assert.equal(after.customer.summary.totalRevenue, before.customer.summary.totalRevenue);
    assert.equal(rowsFor(await report(9), job.id).length, 0);
    assert.equal((await getDriverPerformanceReport({ month: `${YEAR}-09` })).summary.totalRevenue, driverRevenueBefore);
  });

  test('G: total transport Sales/Customer Performance = Monthly Revenue untuk periode yang sama', async () => {
    for (const month of [9, 10]) {
      const [monthly, perf] = [await report(month), await performance(month)];
      assert.equal(perf.sales.summary.totalRevenue, monthly.summary.transportRevenue, `sales bulan ${month}`);
      assert.equal(perf.customer.summary.totalRevenue, monthly.summary.transportRevenue, `customer bulan ${month}`);
    }
  });

  test('A: job normal yang selesai tetap memakai completed_at dan assignment saat ini', async () => {
    const before = await getDriverPerformanceReport({ month: `${YEAR}-10` });
    const so = await createSalesOrder();
    const [driver, truck] = [await createDriver(), await createVehicle('20FT')];
    const job = await cloneRow('container_jobs', jobTemplate, {
      sales_order_id: so.id, container_number: `TAN${nextTag()}`.padEnd(11, '0').slice(0, 11), container_size: '20FT',
      status: 'completed', completed_at: `${YEAR}-10-05T03:00:00.000Z`, repo_stored_at: null,
      assignment_snapshot: { driver: driver.name, plateNumber: truck.plate_number, unitCode: truck.unit_code },
      driver_id: null, vehicle_id: null, assignment_group_id: null, entry_source: 'realtime', is_backdate_entry: false,
    });
    const october = rowsFor(await report(10), job.id);
    assert.equal(october.length, 1);
    assert.equal(october[0].completedDate, `${YEAR}-10-05`);
    assert.equal(october[0].plateNumber, truck.plate_number);
    assert.equal(october[0].driver, driver.name);
    const after = await getDriverPerformanceReport({ month: `${YEAR}-10` });
    assert.equal(after.summary.totalRevenue - before.summary.totalRevenue, october[0].revenue);
    assert.equal(after.rows.find((row) => row.driver === driver.name)?.totalRevenue, october[0].revenue);
  });

  test('F: data lama repo_stored tanpa repo_stored_at -> tidak ada tanggal/assignment karangan', async () => {
    const driverRevenueBefore = (await getDriverPerformanceReport({ month: `${YEAR}-09` })).summary.totalRevenue;
    const so = await createSalesOrder();
    const [driver, truck] = [await createDriver(), await createVehicle('20FT')];
    const job = await cloneRow('container_jobs', jobTemplate, {
      sales_order_id: so.id, container_number: `TAL${nextTag()}`.padEnd(11, '0').slice(0, 11), container_size: '20FT',
      status: 'repo_stored', repo_stored_at: null, completed_at: null,
      repo_released_driver_id: null, repo_released_vehicle_id: null,
      assignment_snapshot: { driver: driver.name, plateNumber: truck.plate_number },
      driver_id: null, vehicle_id: null, assignment_group_id: null, entry_source: 'realtime', is_backdate_entry: false,
    });
    for (const month of [9, 10, 11]) {
      assert.equal(rowsFor(await report(month), job.id).length, 0, 'belum selesai dan tanpa tanggal titip: tidak dilaporkan');
      const perf = await performance(month);
      const monthly = await report(month);
      assert.equal(perf.sales.summary.totalRevenue, monthly.summary.transportRevenue, 'data lama tidak membuat revenue palsu di Sales');
      assert.equal(perf.customer.summary.totalRevenue, monthly.summary.transportRevenue, 'data lama tidak membuat revenue palsu di Customer');
    }
    assert.equal((await getDriverPerformanceReport({ month: `${YEAR}-09` })).summary.totalRevenue, driverRevenueBefore);

    // Setelah selesai: perilaku lama (completed_at + snapshot), tanpa repo_stored_at buatan.
    await query("update container_jobs set status = 'completed', completed_at = $2 where id = $1", [job.id, `${YEAR}-11-03T03:00:00.000Z`]);
    const november = rowsFor(await report(11), job.id);
    assert.equal(november.length, 1);
    assert.equal(november[0].completedDate, `${YEAR}-11-03`);
    assert.equal(november[0].plateNumber, truck.plate_number);
    const novemberDriver = (await getDriverPerformanceReport({ month: `${YEAR}-11` })).rows.find((row) => row.driver === driver.name);
    assert.equal(novemberDriver?.totalRevenue, november[0].revenue);
    const stored = await query('select repo_stored_at from container_jobs where id = $1', [job.id]);
    assert.equal(stored.rows[0].repo_stored_at, null);
  });
}
