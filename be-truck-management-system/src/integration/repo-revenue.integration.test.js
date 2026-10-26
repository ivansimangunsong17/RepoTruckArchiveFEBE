// Integrasi aturan tagihan Repo terhadap PostgreSQL sungguhan (aturan 2026-10-26): Biaya Titip/Repo
// Rp300.000 ditagihkan sebagai item Reimbursement SO saat job pertama kali dititip, sehingga Ambil
// Titip (single maupun combo 2x20) TIDAK membuat Revenue Repo maupun tagihan baru. Revenue Repo lama
// (manual_revenue_lines 'repo') tetap dikelola Finance apa adanya dan tidak dihitung ganda.
// Opt-in: hanya jalan kalau ATMS_SCRATCH_DATABASE_URL diisi DAN lolos scratch-db-guard.
// Fixture dikenali dari prefix (SO-RV-*, truck RVN-*, sopir bank 'BANK RV') dan dihapus sebelum dan
// sesudah suite.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { prepareScratchDatabase } from '../test-support/scratch-db-guard.js';

const scratch = await prepareScratchDatabase();

if (scratch.skip) {
  test('repo revenue integration skipped without ATMS_SCRATCH_DATABASE_URL', { skip: scratch.skip }, () => {});
} else {
  process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';
  const { query, closePool } = await import('../db/client.js');
  const {
    pickupComboRepoContainerJobs,
    pickupSingleRepoContainerJob,
    updateContainerJob,
  } = await import('../modules/container-jobs/container-jobs.repository.js');
  const {
    activateManualRevenueLine,
    createManualRevenueLine,
    invoiceOrdersCte,
    updateManualRevenueLine,
    voidManualRevenueLine,
  } = await import('../modules/finance/finance.repository.js');

  const tag = crypto.randomBytes(3).toString('hex').toUpperCase();
  let seq = 0;
  const nextTag = () => `${tag}${String(++seq).padStart(3, '0')}`;
  const nextContainerNumber = () => `V${tag}${String(++seq).padStart(4, '0')}`;
  const hoursAgo = (hours) => new Date(Date.now() - hours * 3600 * 1000).toISOString();

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

  async function createSalesOrder(extra = {}) {
    const code = nextTag();
    return cloneRow('sales_orders', `
      select * from sales_orders
      where status <> 'cancelled' and coalesce(is_vendor_order, false) = false
      order by created_at limit 1
    `, {
      so_number: `SO-RV-${code}`, accurate_so_number: `ACC-RV-${code}`, finance_verification_status: 'verified',
      customer_name: `Customer RV ${code}`, status: 'running', is_vendor_order: false, entry_source: 'realtime',
      historical_period: null, invoice_number: null, billing_status: 'belum_invoice', debit_note_number: null,
      debit_note_document_uploaded_at: null, cancel_request_status: 'none', cancelled_at: null, ...extra,
    });
  }

  const jobTemplate = `
    select * from container_jobs
    where coalesce(execution_source, 'internal') = 'internal'
    order by created_at limit 1
  `;

  function createJob(salesOrderId, overrides = {}) {
    return cloneRow('container_jobs', jobTemplate, {
      sales_order_id: salesOrderId, container_number: nextContainerNumber(), container_size: '20FT',
      execution_source: 'internal', status: 'received', running_at: null, completed_at: null, cancelled_at: null,
      repo_stored_at: null, repo_picked_up_at: null, repo_released_driver_id: null, repo_released_vehicle_id: null,
      driver_id: null, vehicle_id: null, assignment_group_id: null, assignment_snapshot: {},
      has_driver_commission: false, driver_commission_amount: 0, commission_status: 'without_commission',
      commission_driver_id: null, commission_driver_name: null, commission_driver_snapshot: {},
      entry_source: 'realtime', historical_period: null, is_backdate_entry: false, rpuj_status: 'pending',
      cancel_request_status: 'none', cancel_reason: null, cancel_source: null, uj_amount_snapshot: 123000,
      ...overrides,
    });
  }

  // Job yang sudah dititip (data dibuat langsung, tanpa transisi titip -> tanpa Biaya Titip otomatis).
  function createRepoStoredJob(salesOrderId, overrides = {}) {
    return createJob(salesOrderId, {
      status: 'repo_stored', running_at: hoursAgo(72), repo_stored_at: hoursAgo(70),
      repo_location: `Repo Revenue ${tag}`, repo_eir_number: `EIR-${tag}`, ...overrides,
    });
  }

  async function createDriver() {
    const code = nextTag();
    return cloneRow('drivers', 'select * from drivers where archived_at is null order by created_at limit 1', {
      name: `SOPIR RV ${code}`, nickname: null, nik: null, operational_status: 'Aktif', archived_at: null,
      bank_name: 'BANK RV', bank_account_number: `ACC-RV-${code}`,
    });
  }

  async function createVehicle(size) {
    const code = nextTag();
    return cloneRow('vehicles', 'select * from vehicles where archived_at is null order by created_at limit 1', {
      plate_number: `B ${code} RVN`, unit_code: `RVN-${code}`, engine_number: null, kir_number: null, vin: null,
      container_size: size, current_chassis_id: null, operational_status: 'Aktif', archived_at: null,
      default_driver_id: null, default_driver_name: null,
    });
  }

  const pickupPayload = (driver, vehicle, extra = {}) => ({
    pickupConfirmed: true, repoPickedUpAt: hoursAgo(30), driverId: driver.id, vehicleId: vehicle.id,
    updatedBy: 'Integration Test', repoUjAmount: 150000, ...extra,
  });

  const repoRevenueRows = async (jobIds) => (await query(
    "select * from manual_revenue_lines where charge_type = 'repo' and container_job_id = any($1::uuid[])",
    [jobIds],
  )).rows;
  const storageFees = async (jobIds) => (await query(
    "select * from container_job_expenses where source = 'repo_storage_fee' and container_job_id = any($1::uuid[])",
    [jobIds],
  )).rows;
  async function billingAmount(salesOrderId) {
    const result = await query(`${invoiceOrdersCte()} select billing_amount from invoice_orders where id = $1`, [salesOrderId]);
    assert.ok(result.rows[0], 'Sales Order harus ada di daftar invoice saat billing diukur');
    return Number(result.rows[0].billing_amount);
  }

  async function cleanupFixtures() {
    const salesOrders = (await query("select id from sales_orders where so_number like 'SO-RV-%'")).rows.map((row) => row.id);
    const jobs = (await query('select id from container_jobs where sales_order_id = any($1::uuid[])', [salesOrders])).rows.map((row) => row.id);
    const movements = (await query(
      'select distinct movement_id from container_pickup_items where container_job_id = any($1::uuid[])',
      [jobs],
    )).rows.map((row) => row.movement_id);
    if (movements.length) {
      const fundBatches = await query(
        "select distinct batch_id from operational_fund_transactions where source = 'repo_uj' and source_ref_id = any($1::text[])",
        [movements],
      );
      await query("delete from operational_fund_transactions where source = 'repo_uj' and source_ref_id = any($1::text[])", [movements]);
      await query(
        `delete from operational_fund_batches b
         where b.id = any($1::uuid[]) and b.created_at > now() - interval '1 day'
           and not exists (select 1 from operational_fund_transactions t where t.batch_id = b.id)`,
        [fundBatches.rows.map((row) => row.batch_id)],
      );
    }
    await query('delete from operational_fund_transactions where container_job_id = any($1::uuid[])', [jobs]);
    await query('delete from manual_revenue_lines where sales_order_id = any($1::uuid[])', [salesOrders]);
    await query('delete from container_pickup_movements where id = any($1::uuid[])', [movements]);
    await query('delete from sales_orders where id = any($1::uuid[])', [salesOrders]);
    await query("delete from vehicles where unit_code like 'RVN-%'");
    await query("delete from drivers where bank_name = 'BANK RV' and name like 'SOPIR RV %'");
  }

  test.before(cleanupFixtures);
  test.after(async () => {
    try {
      await cleanupFixtures();
    } finally {
      await closePool();
    }
  });

  test('single Ambil Titip: tidak ada Revenue Repo maupun Biaya Titip baru; UJ Repo tetap satu debit', async () => {
    const so = await createSalesOrder();
    const job = await createRepoStoredJob(so.id);
    const result = await pickupSingleRepoContainerJob(job.id, pickupPayload(await createDriver(), await createVehicle('20FT')));

    assert.equal(result.repoRevenueLines, undefined);
    assert.deepEqual(await repoRevenueRows([job.id]), []);
    assert.deepEqual(await storageFees([job.id]), []);
    const uj = await query("select amount from operational_fund_transactions where source = 'repo_uj' and source_ref_id = $1 and status = 'posted'", [result.movement.id]);
    assert.deepEqual(uj.rows.map((row) => Number(row.amount)), [150000]);
  });

  test('combo 2x20 dari dua SO: tidak ada tagihan Repo baru di kedua SO; UJ Repo satu nilai per movement', async () => {
    const [soA, soB] = [await createSalesOrder(), await createSalesOrder()];
    const jobs = [await createRepoStoredJob(soA.id), await createRepoStoredJob(soB.id)];
    const result = await pickupComboRepoContainerJobs(pickupPayload(await createDriver(), await createVehicle('40FT'), {
      containerJobIds: jobs.map((job) => job.id),
      repoUjAmount: 175000,
    }));

    assert.deepEqual(await repoRevenueRows(jobs.map((job) => job.id)), []);
    assert.deepEqual(await storageFees(jobs.map((job) => job.id)), []);
    const uj = await query("select amount from operational_fund_transactions where source = 'repo_uj' and source_ref_id = $1 and status = 'posted'", [result.movement.id]);
    assert.deepEqual(uj.rows.map((row) => Number(row.amount)), [175000]);
  });

  test('retry dan Ambil Titip bersamaan: satu pickup, tanpa tagihan Repo', async () => {
    const so = await createSalesOrder();
    const job = await createRepoStoredJob(so.id);
    const payload = pickupPayload(await createDriver(), await createVehicle('20FT'));
    const outcomes = await Promise.allSettled([
      pickupSingleRepoContainerJob(job.id, payload),
      pickupSingleRepoContainerJob(job.id, payload),
    ]);
    assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
    await assert.rejects(pickupSingleRepoContainerJob(job.id, payload), (error) => error.statusCode === 409);
    assert.deepEqual(await repoRevenueRows([job.id]), []);
    assert.deepEqual(await storageFees([job.id]), []);
  });

  test('data lama dengan Revenue Repo: dititip ulang tidak menambah Reimbursement; Revenue Repo lama tetap dikelola Finance', async () => {
    const so = await createSalesOrder();
    const [driverA, truckA, driverB, truckB] = [await createDriver(), await createVehicle('20FT'), await createDriver(), await createVehicle('20FT')];
    const job = await createRepoStoredJob(so.id, { repo_released_driver_id: driverA.id, repo_released_vehicle_id: truckA.id });
    const picked = await pickupSingleRepoContainerJob(job.id, pickupPayload(driverB, truckB));
    // Revenue Repo lama dari aturan sebelumnya (dibuat saat pickup, draft).
    const item = (await query('select id from container_pickup_items where movement_id = $1', [picked.movement.id])).rows[0];
    const legacy = (await query(
      `insert into manual_revenue_lines (sales_order_id, container_job_id, container_pickup_item_id, charge_type, description,
         quantity, unit, unit_price, total_amount, note, status, created_by_name, updated_by_name)
       values ($1, $2, $3, 'repo', $4, 1, 'container', 300000, 300000, $5, 'draft', 'Legacy', 'Legacy') returning id`,
      [so.id, job.id, item.id, `Revenue Repo ${job.container_number}`, `movement:${picked.movement.id}`],
    )).rows[0];

    // Container dititip lagi oleh sopir B: bukan titip pertama, dan sudah punya Revenue Repo lama. Timeline
    // existing menyimpan waktu titip awal (titip ulang tidak boleh lebih akhir dari pickup).
    await updateContainerJob(job.id, {
      status: 'repo_stored', repoLocation: `Depo ulang ${tag}`, repoEirNumber: `EIR-ULANG-${tag}`,
      updatedBy: 'Integration Test',
    });
    assert.equal((await query('select status from container_jobs where id = $1', [job.id])).rows[0].status, 'repo_stored');
    assert.deepEqual(await storageFees([job.id]), [], 'tidak ada tagihan Repo ganda');

    // Finance tetap memakai mekanisme lama untuk baris lama: terkunci dari edit, bisa dibatalkan.
    await assert.rejects(updateManualRevenueLine(so.id, legacy.id, { unitPrice: 1, actorName: 'Finance' }), { code: 'REPO_REVENUE_LINE_LOCKED' });
    const voided = await voidManualRevenueLine(so.id, legacy.id, { reason: 'Bersihkan test', actorName: 'Finance' });
    assert.equal(voided.line.status, 'void');
    await assert.rejects(activateManualRevenueLine(so.id, legacy.id, { actorName: 'Finance' }), { code: 'REVENUE_LINE_ACTIVATION_INVALID' });
  });

  test('input historis: dititip tidak membuat Reimbursement Repo otomatis', async () => {
    const so = await createSalesOrder({ entry_source: 'historical' });
    const [driver, truck] = [await createDriver(), await createVehicle('20FT')];
    const job = await createJob(so.id, {
      status: 'running', running_at: hoursAgo(72), entry_source: 'historical',
      historical_period: new Date(hoursAgo(72)).toISOString().slice(0, 7),
      driver_id: driver.id, vehicle_id: truck.id, assignment_snapshot: { driver: driver.name, plateNumber: truck.plate_number },
    });
    await updateContainerJob(job.id, {
      status: 'repo_stored', repoStoredAt: hoursAgo(70), repoLocation: `Depo historis ${tag}`, repoEirNumber: `EIR-H-${tag}`,
      updatedBy: 'Admin Test',
    });
    assert.equal((await query('select status from container_jobs where id = $1', [job.id])).rows[0].status, 'repo_stored');
    assert.deepEqual(await storageFees([job.id]), []);
  });

  test('reimbursement titip yang sudah dicatat manual: penitipan tidak menambah Biaya Titip otomatis', async () => {
    const so = await createSalesOrder();
    const [driver, truck] = [await createDriver(), await createVehicle('20FT')];
    const job = await createJob(so.id, {
      status: 'running', running_at: hoursAgo(72), driver_id: driver.id, vehicle_id: truck.id,
      assignment_snapshot: { driver: driver.name, plateNumber: truck.plate_number },
    });
    await query(
      `insert into container_job_expenses (sales_order_id, container_job_id, category, expense_group, amount, description,
         recipient_type, payment_status, source, created_by_name, updated_by_name)
       values ($1, $2, 'reimbursement', 'reimbursement', 300000, 'Biaya titip depo (manual)', 'customer', 'belum_dibayar', 'manual', 'Ops', 'Ops')`,
      [so.id, job.id],
    );
    await updateContainerJob(job.id, {
      status: 'repo_stored', repoStoredAt: hoursAgo(70), repoLocation: `Depo manual ${tag}`, repoEirNumber: `EIR-M-${tag}`,
      updatedBy: 'Integration Test',
    });
    assert.deepEqual(await storageFees([job.id]), []);
    const reimbursements = await query(
      "select amount from container_job_expenses where container_job_id = $1 and expense_group = 'reimbursement' and payment_status <> 'batal'",
      [job.id],
    );
    assert.deepEqual(reimbursements.rows.map((row) => Number(row.amount)), [300000]);
  });

  test('revenue manual non-Repo (inap) tetap masuk billing invoice seperti sebelumnya', async () => {
    const so = await createSalesOrder({ status: 'completed' });
    await createJob(so.id, { status: 'completed', running_at: hoursAgo(30), completed_at: hoursAgo(24) });
    const before = await billingAmount(so.id);
    const created = await createManualRevenueLine(so.id, {
      chargeType: 'inap', description: 'Inap test', quantity: 2, unit: 'malam', unitPrice: 50000, actorName: 'Finance',
    });
    assert.equal(created.line.status, 'active');
    assert.equal(created.billingAmount, before + 100000);
    await voidManualRevenueLine(so.id, created.line.id, { reason: 'Bersihkan test', actorName: 'Finance' });
    assert.equal(await billingAmount(so.id), before);
  });
}
