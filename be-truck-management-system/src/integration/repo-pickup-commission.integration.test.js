// Regresi titip -> Ambil Titip oleh sopir lain: satu Container Job, satu ritasi, satu baris komisi
// milik sopir yang menitipkan (A) dengan plat truck A; sopir pickup (B) hanya UJ Repo. Termasuk
// peringatan nomor container berpotensi ganda. Opt-in: hanya jalan kalau ATMS_SCRATCH_DATABASE_URL
// diisi DAN lolos scratch-db-guard. Semua fixture dihapus di akhir.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { prepareScratchDatabase } from '../test-support/scratch-db-guard.js';

const scratch = await prepareScratchDatabase();

if (scratch.skip) {
  test('repo pickup commission integration skipped without ATMS_SCRATCH_DATABASE_URL', { skip: scratch.skip }, () => {});
} else {
  process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';
  const { query, closePool } = await import('../db/client.js');
  const {
    pickupSingleRepoContainerJob,
    updateContainerJob,
  } = await import('../modules/container-jobs/container-jobs.repository.js');
  const {
    findDriverCommissionPeriodReport,
    findEligibleDriverCommissions,
  } = await import('../modules/driver-commissions/driver-commissions.repository.js');
  const { getUtilizationTripRows } = await import('../modules/reports/utilization-trips.repository.js');
  const { createSalesOrder: createSalesOrderRecord } = await import('../modules/sales-orders/sales-orders.repository.js');

  const tag = crypto.randomBytes(3).toString('hex').toUpperCase();
  let seq = 0;
  const nextTag = () => `${tag}${String(++seq).padStart(3, '0')}`;
  // 11 karakter unik per fixture (R + tag 6 + urutan 4).
  const nextContainerNumber = () => `R${tag}${String(++seq).padStart(4, '0')}`;
  // Tahun jauh supaya tidak bercampur data lain: titip 30 Sep, pickup/selesai 2 Okt (WIB).
  const YEAR = 2032;
  const STORED_DATE = `${YEAR}-09-30`;
  const PICKUP_DATE = `${YEAR}-10-02`;
  const RUNNING_AT = `${YEAR}-09-30T01:00:00.000Z`;
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
    assert.ok(result.rows[0], `Template ${table} tidak ditemukan -- jalankan seed sintetis di database scratch.`);
    return result.rows[0];
  }

  async function createSalesOrder() {
    const code = nextTag();
    const so = await cloneRow('sales_orders', `
      select * from sales_orders
      where status <> 'cancelled' and coalesce(is_vendor_order, false) = false
      order by created_at limit 1
    `, {
      so_number: `SO-RPC-${code}`, accurate_so_number: `ACC-RPC-${code}`, finance_verification_status: 'verified',
      is_vendor_order: false, status: 'running',
      entry_source: 'realtime', historical_period: null, invoice_number: null, billing_status: 'belum_invoice',
      cancel_request_status: 'none', cancelled_at: null,
    });
    return so;
  }

  async function createDriver(label) {
    const code = nextTag();
    const driver = await cloneRow('drivers', 'select * from drivers where archived_at is null order by created_at limit 1', {
      name: `SOPIR ${label} ${code}`, nickname: null, nik: null, operational_status: 'Aktif', archived_at: null,
      payment_method: 'bank', bank_name: 'BANK RPC', bank_account_number: `ACC-${label}-${code}`, bank_account_holder: `SOPIR ${label} ${code}`,
    });
    return driver;
  }

  async function createVehicle(label) {
    const code = nextTag();
    const vehicle = await cloneRow('vehicles', 'select * from vehicles where archived_at is null order by created_at limit 1', {
      plate_number: `B ${code} ${label}`, unit_code: `RPC-${code}`, engine_number: null, kir_number: null, vin: null,
      container_size: '20FT', current_chassis_id: null, operational_status: 'Aktif', archived_at: null,
      default_driver_id: null, default_driver_name: null,
    });
    return vehicle;
  }

  const assignmentOf = (driver, vehicle) => ({
    driver: driver.name, plateNumber: vehicle.plate_number, unitCode: vehicle.unit_code,
    driverPaymentMethod: 'bank', driverBankName: driver.bank_name,
    driverBankAccountNumber: driver.bank_account_number, driverBankAccountHolder: driver.bank_account_holder,
  });

  const jobTemplate = `
    select * from container_jobs
    where coalesce(execution_source, 'internal') = 'internal'
    order by created_at limit 1
  `;

  // Job yang dijalankan sopir A lalu dititip. lockCommission=false meniru data lama yang penerima
  // komisinya belum sempat terkunci.
  function createJob(salesOrderId, overrides = {}) {
    return cloneRow('container_jobs', jobTemplate, {
      sales_order_id: salesOrderId,
      container_number: nextContainerNumber(),
      container_size: '20FT', execution_source: 'internal',
      status: 'received', running_at: null, completed_at: null, cancelled_at: null,
      repo_stored_at: null, repo_picked_up_at: null, repo_picked_up_by_name: null,
      repo_released_driver_id: null, repo_released_vehicle_id: null,
      driver_id: null, vehicle_id: null, assignment_group_id: null, assignment_snapshot: {},
      has_driver_commission: false, driver_commission_amount: 0, commission_locked_amount: null,
      commission_status: 'without_commission', commission_driver_id: null, commission_driver_name: null,
      commission_driver_snapshot: {},
      entry_source: 'realtime', is_backdate_entry: false, rpuj_status: 'pending', rpuj_requested_at: null,
      cancel_request_status: 'none', cancel_reason: null, cancel_source: null,
      ...overrides,
    });
  }

  function createStoredJob(salesOrderId, driverA, truckA, { lockCommission = true, extra = {} } = {}) {
    const assignment = assignmentOf(driverA, truckA);
    return createJob(salesOrderId, {
      status: 'repo_stored', running_at: RUNNING_AT, repo_stored_at: STORED_AT,
      repo_location: 'Depo RPC', repo_eir_number: `EIR-${tag}`,
      repo_released_driver_id: driverA.id, repo_released_vehicle_id: truckA.id,
      assignment_snapshot: assignment,
      has_driver_commission: true, driver_commission_amount: 100000, commission_locked_amount: 100000,
      commission_status: 'with_commission',
      commission_driver_id: lockCommission ? driverA.id : null,
      commission_driver_name: lockCommission ? driverA.name : null,
      commission_driver_snapshot: lockCommission ? { driver: driverA.name } : {},
      ...extra,
    });
  }

  async function pickup(job, driverB, truckB) {
    const result = await pickupSingleRepoContainerJob(job.id, {
      pickupConfirmed: true, repoPickedUpAt: PICKUP_AT, driverId: driverB.id, vehicleId: truckB.id,
      updatedBy: 'Integration Test', repoUjAmount: 150000,
    });
    return result;
  }

  async function finish(jobId, movementId) {
    if (movementId) await query('update container_pickup_movements set started_at = $2 where id = $1', [movementId, PICKUP_AT]);
    await query("update container_jobs set status = 'completed', completed_at = $2 where id = $1", [jobId, COMPLETED_AT]);
  }

  const commissionRows = async (date, jobId) => (await findEligibleDriverCommissions({ periodStart: date, periodEnd: date }))
    .rows.filter((row) => row.containerJobId === jobId);

  // Fixture dikenali dari prefix: SO-RPC-*, truck RPC-*, sopir bank 'BANK RPC'. Dijalankan sebelum
  // dan sesudah suite supaya sisa run yang gagal ikut dibersihkan.
  async function cleanupFixtures() {
    const salesOrders = (await query("select id from sales_orders where so_number like 'SO-RPC-%'")).rows.map((row) => row.id);
    const movements = (await query(
      `select distinct cpi.movement_id from container_pickup_items cpi
       join container_jobs cj on cj.id = cpi.container_job_id
       where cj.sales_order_id = any($1::uuid[])`,
      [salesOrders],
    )).rows.map((row) => row.movement_id);
    if (movements.length) {
      const batches = await query(
        "select distinct batch_id from operational_fund_transactions where source = 'repo_uj' and source_ref_id = any($1::text[])",
        [movements],
      );
      await query("delete from operational_fund_transactions where source = 'repo_uj' and source_ref_id = any($1::text[])", [movements]);
      // Batch dana operasional tahun uji yang hanya berisi debit UJ Repo test ini.
      await query(
        `delete from operational_fund_batches b
         where b.id = any($1::uuid[])
           and extract(year from b.batch_date) = $2
           and not exists (select 1 from operational_fund_transactions t where t.batch_id = b.id)`,
        [batches.rows.map((row) => row.batch_id), YEAR],
      );
    }
    await query('delete from manual_revenue_lines where sales_order_id = any($1::uuid[])', [salesOrders]);
    await query('delete from container_pickup_movements where id = any($1::uuid[])', [movements]);
    await query('delete from sales_orders where id = any($1::uuid[])', [salesOrders]);
    await query("delete from vehicles where unit_code like 'RPC-%'");
    await query("delete from drivers where bank_name = 'BANK RPC' and name like 'SOPIR %'");
  }

  test.before(cleanupFixtures);

  test.after(async () => {
    try {
      await cleanupFixtures();
    } finally {
      await closePool();
    }
  });

  test('A titip, B Ambil Titip: satu job, satu ritasi, satu komisi milik A dengan plat truck A; B hanya UJ Repo', async () => {
    const so = await createSalesOrder();
    const [driverA, truckA, driverB, truckB] = [await createDriver('A'), await createVehicle('A'), await createDriver('B'), await createVehicle('B')];
    const job = await createStoredJob(so.id, driverA, truckA);

    const picked = await pickup(job, driverB, truckB);
    const afterPickup = (await query('select * from container_jobs where id = $1', [job.id])).rows[0];
    assert.equal(afterPickup.driver_id, driverB.id, 'perjalanan lanjutan memakai sopir B');
    assert.equal(afterPickup.commission_driver_id, driverA.id, 'penerima komisi tetap A');
    await finish(job.id, picked.movement.id);

    // Tidak ada Container Job tambahan.
    const sameContainer = await query('select id from container_jobs where container_number = $1', [job.container_number]);
    assert.deepEqual(sameContainer.rows.map((row) => row.id), [job.id]);

    // Komisi: satu baris, sopir A, rekening A, plat truck A -- bukan truck pickup B.
    const rows = await commissionRows(STORED_DATE, job.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].driverId, driverA.id);
    assert.equal(rows[0].driverName, driverA.name);
    assert.equal(rows[0].truckPlateNumber, truckA.plate_number);
    assert.equal(rows[0].bankAccountNumber, driverA.bank_account_number);
    assert.equal(rows[0].amount, 100000);
    assert.equal((await commissionRows(PICKUP_DATE, job.id)).length, 0, 'tidak ada komisi di hari pickup');
    const report = await findDriverCommissionPeriodReport({ periodStart: STORED_DATE, periodEnd: PICKUP_DATE });
    const reportItems = report.drivers.flatMap((driver) => driver.items.map((item) => ({ ...item, driverName: driver.driverName })))
      .filter((item) => item.containerJobId === job.id);
    assert.equal(reportItems.length, 1);
    assert.equal(reportItems[0].driverName, driverA.name);
    assert.equal(reportItems[0].truckPlateNumber, truckA.plate_number);
    assert.equal(report.drivers.some((driver) => driver.driverId === driverB.id), false, 'sopir B tidak masuk laporan komisi');

    // Ritasi: tetap satu, atribusi sopir/truck A.
    const trips = (await getUtilizationTripRows({ dateFrom: STORED_DATE, dateTo: `${YEAR}-10-31` })).filter((row) => row.jobId === job.id);
    assert.equal(trips.length, 1);
    assert.equal(trips[0].driverId, driverA.id);
    assert.equal(trips[0].plateNumber, truckA.plate_number);

    // UJ Repo: satu debit atas nama B. Ambil Titip tidak membuat tagihan Rp300.000 (Biaya Titip/Repo
    // ditagihkan saat penitipan, lihat repo-titip-e2e), dan SO tidak berinvoice.
    const uj = await query("select * from operational_fund_transactions where source = 'repo_uj' and source_ref_id = $1", [picked.movement.id]);
    assert.equal(uj.rows.length, 1);
    assert.equal(uj.rows[0].driver_name, driverB.name);
    assert.equal(Number(uj.rows[0].amount), 150000);
    const revenue = await query('select status from manual_revenue_lines where container_job_id = $1', [job.id]);
    assert.deepEqual(revenue.rows, []);
    const pickupFee = await query("select id from container_job_expenses where container_job_id = $1 and source = 'repo_storage_fee'", [job.id]);
    assert.deepEqual(pickupFee.rows, [], 'Ambil Titip tidak membuat Biaya Titip/Repo');
    const order = (await query('select invoice_number from sales_orders where id = $1', [so.id])).rows[0];
    assert.equal(order.invoice_number, null);
  });

  test('data lama: penerima komisi belum terkunci saat dititip -> Ambil Titip mengunci ke A, bukan B', async () => {
    const so = await createSalesOrder();
    const [driverA, truckA, driverB, truckB] = [await createDriver('A'), await createVehicle('A'), await createDriver('B'), await createVehicle('B')];
    const job = await createStoredJob(so.id, driverA, truckA, { lockCommission: false });

    const picked = await pickup(job, driverB, truckB);
    const afterPickup = (await query('select * from container_jobs where id = $1', [job.id])).rows[0];
    assert.equal(afterPickup.commission_driver_id, driverA.id);
    assert.equal(afterPickup.commission_driver_name, driverA.name);
    assert.equal(afterPickup.commission_driver_snapshot.plateNumber, truckA.plate_number);
    assert.equal(afterPickup.commission_driver_snapshot.driverBankAccountNumber, driverA.bank_account_number);
    await finish(job.id, picked.movement.id);

    const rows = await commissionRows(STORED_DATE, job.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].driverName, driverA.name);
    assert.equal(rows[0].truckPlateNumber, truckA.plate_number);
  });

  test('jalur update biasa (PATCH) dari titip ke Sedang Jalan oleh B tidak memindahkan komisi ke B', async () => {
    const so = await createSalesOrder();
    const [driverA, truckA, driverB, truckB] = [await createDriver('A'), await createVehicle('A'), await createDriver('B'), await createVehicle('B')];
    const job = await createStoredJob(so.id, driverA, truckA, { lockCommission: false });

    await updateContainerJob(job.id, {
      status: 'running', driverId: driverB.id, vehicleId: truckB.id, driver: driverB.name, plateNumber: truckB.plate_number,
      repoPickedUpAt: PICKUP_AT, updatedBy: 'Integration Test',
    });
    const after = (await query('select * from container_jobs where id = $1', [job.id])).rows[0];
    assert.equal(after.driver_id, driverB.id);
    assert.equal(after.commission_driver_id, driverA.id);
    assert.equal(after.commission_driver_name, driverA.name);
    assert.equal(after.commission_driver_snapshot.plateNumber, truckA.plate_number);
  });

  test('data lama: sudah diambil B sebelum perbaikan (komisi belum terkunci) -> export tetap sopir, rekening, dan plat A', async () => {
    const so = await createSalesOrder();
    const [driverA, truckA, driverB, truckB] = [await createDriver('A'), await createVehicle('A'), await createDriver('B'), await createVehicle('B')];
    const job = await createStoredJob(so.id, driverA, truckA, {
      lockCommission: false,
      extra: {
        status: 'completed', completed_at: COMPLETED_AT, repo_picked_up_at: PICKUP_AT, repo_picked_up_by_name: 'Ops Lama',
        driver_id: driverB.id, vehicle_id: truckB.id, assignment_snapshot: assignmentOf(driverB, truckB),
      },
    });
    await query(
      `insert into container_job_assignment_history (
         container_job_id, change_source, previous_driver_id, previous_driver_name, next_driver_id, next_driver_name,
         previous_vehicle_id, previous_plate_number, next_vehicle_id, next_plate_number, reason, changed_by_name
       ) values ($1, 'repo_pickup', $2, $3, $4, $5, $6, $7, $8, $9, 'Pickup container titip', 'Ops Lama')`,
      [job.id, driverA.id, driverA.name, driverB.id, driverB.name, truckA.id, truckA.plate_number, truckB.id, truckB.plate_number],
    );

    const rows = await commissionRows(STORED_DATE, job.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].driverId, driverA.id);
    assert.equal(rows[0].driverName, driverA.name);
    assert.equal(rows[0].truckPlateNumber, truckA.plate_number);
    assert.equal(rows[0].bankAccountNumber, driverA.bank_account_number, 'rekening B dari snapshot pickup tidak boleh dipakai');
  });

  test('nomor container titip/aktif: job kedua ditolak walau dikonfirmasi, diarahkan ke Ambil Titip; job asli utuh', async () => {
    const soStored = await createSalesOrder();
    const [driverA, truckA] = [await createDriver('A'), await createVehicle('A')];
    const stored = await createStoredJob(soStored.id, driverA, truckA);
    const running = await createJob(soStored.id, { container_number: nextContainerNumber(), status: 'running', running_at: RUNNING_AT });
    const soOther = await createSalesOrder();
    const other = await createJob(soOther.id, { container_number: null });

    for (const confirmPossibleDuplicateContainer of [undefined, true]) {
      await assert.rejects(
        updateContainerJob(other.id, { containerNumber: stored.container_number.toLowerCase(), updatedBy: 'Integration Test', confirmPossibleDuplicateContainer }),
        (error) => {
          assert.equal(error.code, 'CONTAINER_NUMBER_IN_ACTIVE_JOB');
          assert.equal(error.statusCode, 409);
          assert.equal(error.details.matches[0].containerJobId, stored.id);
          assert.equal(error.details.matches[0].reason, 'repo_stored');
          assert.match(error.message, /Ambil Titip/);
          return true;
        },
      );
      await assert.rejects(
        updateContainerJob(other.id, { containerNumber: running.container_number, updatedBy: 'Integration Test', confirmPossibleDuplicateContainer }),
        { code: 'CONTAINER_NUMBER_IN_ACTIVE_JOB' },
      );
    }
    assert.equal((await query('select container_number from container_jobs where id = $1', [other.id])).rows[0].container_number, null);
    const storedAfter = (await query('select status, container_number from container_jobs where id = $1', [stored.id])).rows[0];
    assert.deepEqual(storedAfter, { status: 'repo_stored', container_number: stored.container_number });
    // Edit job yang tidak mengganti nomor container tetap bisa disimpan, termasuk data lama yang
    // sudah terlanjur memakai nomor container yang sama.
    const legacyDuplicate = await createJob(soOther.id, { container_number: stored.container_number });
    const edited = await updateContainerJob(legacyDuplicate.id, { containerNumber: stored.container_number, eirNumber: `EIR-EDIT-${tag}`, updatedBy: 'Integration Test' });
    assert.equal(edited.eirNumber, `EIR-EDIT-${tag}`);
  });

  test('pemakaian ulang sah: setelah selesai (SO sama atau baru selesai) cukup konfirmasi; selesai lama langsung tersimpan', async () => {
    const so = await createSalesOrder();
    const done = nextContainerNumber();
    await createJob(so.id, { container_number: done, status: 'completed', running_at: '2020-01-01T01:00:00.000Z', completed_at: '2020-01-02T01:00:00.000Z' });
    const second = await createJob(so.id, { container_number: null });
    await assert.rejects(
      updateContainerJob(second.id, { containerNumber: done, updatedBy: 'Integration Test' }),
      (error) => error.code === 'CONTAINER_NUMBER_POSSIBLE_DUPLICATE' && error.details.matches[0].reason === 'same_sales_order',
    );
    const confirmed = await updateContainerJob(second.id, { containerNumber: done, updatedBy: 'Integration Test', confirmPossibleDuplicateContainer: true });
    assert.equal(confirmed.containerNumber, done);
    // Simpan ulang tanpa mengganti nomor: tidak ditahan lagi.
    await assert.doesNotReject(updateContainerJob(second.id, { containerNumber: done, updatedBy: 'Integration Test' }));

    const oldSo = await createSalesOrder();
    const reused = nextContainerNumber();
    await createJob(oldSo.id, { container_number: reused, status: 'completed', running_at: '2020-01-01T01:00:00.000Z', completed_at: '2020-01-02T01:00:00.000Z' });
    const fresh = await createJob((await createSalesOrder()).id, { container_number: null });
    const saved = await updateContainerJob(fresh.id, { containerNumber: reused, updatedBy: 'Integration Test' });
    assert.equal(saved.containerNumber, reused);
  });

  test('penyimpanan bersamaan: beberapa job mengisi nomor container yang sama, hanya satu yang tersimpan', async () => {
    const number = nextContainerNumber();
    const jobs = [];
    for (let index = 0; index < 4; index += 1) jobs.push(await createJob((await createSalesOrder()).id, { container_number: null }));
    const results = await Promise.allSettled(jobs.map((job) => updateContainerJob(job.id, { containerNumber: number, updatedBy: 'Integration Test' })));
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    for (const result of results.filter((item) => item.status === 'rejected')) {
      assert.equal(result.reason.code, 'CONTAINER_NUMBER_IN_ACTIVE_JOB');
    }
    const stored = await query('select count(*)::int as total from container_jobs where container_number = $1', [number]);
    assert.equal(stored.rows[0].total, 1);
  });

  test('request langsung pembuatan SO tidak bisa memakai container yang masih dititip atau dobel dalam satu request', async () => {
    const soStored = await createSalesOrder();
    const [driverA, truckA] = [await createDriver('A'), await createVehicle('A')];
    const stored = await createStoredJob(soStored.id, driverA, truckA);
    const form = (containers) => ({
      soNumber: `SO-RPC-${nextTag()}`, customer: soStored.customer_name, tripDate: `${YEAR}-10-05`,
      origin: 'Asal RPC', destination: 'Tujuan RPC', createdBy: 'Integration Test', containers,
    });
    const countSo = async (soNumber) => (await query('select count(*)::int as total from sales_orders where so_number = $1', [soNumber])).rows[0].total;

    const viaStored = form([{ size: '20FT', containerNumber: stored.container_number, confirmPossibleDuplicateContainer: true }]);
    await assert.rejects(createSalesOrderRecord(viaStored), { code: 'CONTAINER_NUMBER_IN_ACTIVE_JOB' });
    assert.equal(await countSo(viaStored.soNumber), 0, 'SO tidak ikut tersimpan (rollback)');

    const twice = nextContainerNumber();
    const doubled = form([{ size: '20FT', containerNumber: twice }, { size: '20FT', containerNumber: twice }]);
    await assert.rejects(createSalesOrderRecord(doubled), { code: 'CONTAINER_NUMBER_IN_ACTIVE_JOB' });
    assert.equal(await countSo(doubled.soNumber), 0);

    const valid = form([{ size: '20FT', containerNumber: nextContainerNumber() }, { size: '20FT' }]);
    const created = await createSalesOrderRecord(valid);
    assert.equal(created.containers.length, 2);
  });

  test('identitas penitip tidak terverifikasi atau penerima komisi = sopir pickup: ditahan untuk review, bukan dibayar', async () => {
    const so = await createSalesOrder();
    const [driverA, truckA, driverB, truckB] = [await createDriver('A'), await createVehicle('A'), await createDriver('B'), await createVehicle('B')];
    const pickedUpAsB = {
      status: 'completed', completed_at: COMPLETED_AT, repo_picked_up_at: PICKUP_AT, repo_picked_up_by_name: 'Ops Lama',
      driver_id: driverB.id, vehicle_id: truckB.id, assignment_snapshot: assignmentOf(driverB, truckB),
    };
    // (1) Data lama: penerima komisi terlanjur terkunci ke B, rekening dan plat B ada di snapshot komisi.
    const capturedAsB = await createStoredJob(so.id, driverA, truckA, {
      lockCommission: false,
      extra: {
        ...pickedUpAsB,
        commission_driver_id: driverB.id, commission_driver_name: driverB.name,
        commission_driver_snapshot: { driver: driverB.name, driverBankAccountNumber: driverB.bank_account_number, plateNumber: truckB.plate_number },
      },
    });
    await query(
      `insert into container_job_assignment_history (
         container_job_id, change_source, previous_driver_id, previous_driver_name, next_driver_id, next_driver_name,
         previous_vehicle_id, previous_plate_number, next_vehicle_id, next_plate_number, reason, changed_by_name
       ) values ($1, 'repo_pickup', $2, $3, $4, $5, $6, $7, $8, $9, 'Pickup container titip', 'Ops Lama')`,
      [capturedAsB.id, driverA.id, driverA.name, driverB.id, driverB.name, truckA.id, truckA.plate_number, truckB.id, truckB.plate_number],
    );
    // (2) Data lama: penerima belum terkunci dan asal titip (riwayat/released) tidak tersedia.
    const unverifiable = await createStoredJob(so.id, driverA, truckA, {
      lockCommission: false,
      extra: { ...pickedUpAsB, repo_released_driver_id: null, repo_released_vehicle_id: null },
    });
    // (3) Data normal (penerima A terkunci) tetap eligible.
    const normal = await createStoredJob(so.id, driverA, truckA, { extra: pickedUpAsB });
    const snapshotSql = 'select id, commission_driver_id, commission_driver_name, commission_driver_snapshot from container_jobs where id = any($1::uuid[]) order by id';
    const before = (await query(snapshotSql, [[capturedAsB.id, unverifiable.id]])).rows;

    const result = await findEligibleDriverCommissions({ periodStart: STORED_DATE, periodEnd: STORED_DATE });
    const eligibleIds = result.rows.map((row) => row.containerJobId);
    assert.equal(eligibleIds.includes(capturedAsB.id), false, 'komisi tidak boleh dibayar ke B');
    assert.equal(eligibleIds.includes(unverifiable.id), false);
    assert.equal(eligibleIds.includes(normal.id), true);
    const normalRow = result.rows.find((row) => row.containerJobId === normal.id);
    assert.equal(normalRow.driverName, driverA.name);
    assert.equal(normalRow.truckPlateNumber, truckA.plate_number);
    assert.equal(normalRow.bankAccountNumber, driverA.bank_account_number);

    const review = new Map(result.reviewRows.map((row) => [row.containerJobId, row]));
    assert.deepEqual(review.get(capturedAsB.id)?.reviewReasons, ['Penerima komisi tercatat sebagai sopir Ambil Titip']);
    assert.ok(review.get(unverifiable.id)?.reviewReasons.includes('Identitas sopir penitip belum terverifikasi'));
    assert.equal(review.has(normal.id), false);
    assert.notEqual(review.get(unverifiable.id).truckPlateNumber, truckB.plate_number, 'plat B tidak dipakai sebagai fallback');
    // Tidak ada perubahan otomatis pada data lama.
    assert.deepEqual((await query(snapshotSql, [[capturedAsB.id, unverifiable.id]])).rows, before);
  });
}
