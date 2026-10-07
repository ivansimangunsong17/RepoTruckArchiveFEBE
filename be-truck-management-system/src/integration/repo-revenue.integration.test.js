// Integrasi Revenue Repo (Phase 4) terhadap PostgreSQL sungguhan.
// Opt-in: hanya jalan kalau ATMS_SCRATCH_DATABASE_URL diisi -- arahkan ke database SCRATCH
// (salinan dev), bukan database dev/production, karena test ini menulis data.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

const databaseUrl = process.env.ATMS_SCRATCH_DATABASE_URL;

if (!databaseUrl) {
  test('repo revenue integration skipped without ATMS_SCRATCH_DATABASE_URL', { skip: 'opt-in' }, () => {});
} else {
  process.env.DATABASE_URL = databaseUrl;
  process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';
  const { query, withTransaction, closePool } = await import('../db/client.js');
  const {
    pickupComboRepoContainerJobs,
    pickupSingleRepoContainerJob,
  } = await import('../modules/container-jobs/container-jobs.repository.js');
  const { lockRepoPickupMovementForJob, reconcileRepoPickupMovement } = await import('../modules/container-jobs/repo-pickup-lifecycle.js');
  const {
    createManualRevenueLine,
    invoiceOrdersCte,
    updateManualRevenueLine,
    voidManualRevenueLine,
  } = await import('../modules/finance/finance.repository.js');

  const tag = crypto.randomBytes(3).toString('hex').toUpperCase();
  let seq = 0;
  const nextTag = () => `${tag}${String(++seq).padStart(2, '0')}`;

  async function cloneRow(table, templateSql, templateParams, overrides) {
    const result = await query(
      `
        insert into ${table}
        select (jsonb_populate_record(null::${table}, to_jsonb(t) || $${templateParams.length + 1}::jsonb)).*
        from (${templateSql}) t
        returning *
      `,
      [...templateParams, JSON.stringify({ id: crypto.randomUUID(), ...overrides })],
    );
    return result.rows[0];
  }

  // Sales Order yang masuk daftar invoice Finance, supaya billing_amount bisa dihitung.
  async function invoiceSalesOrders(limit = 2) {
    const result = await query(
      `${invoiceOrdersCte()} select id from invoice_orders where billing_status <> 'lunas' order by id limit $1`,
      [limit],
    );
    assert.ok(result.rows.length >= limit, 'butuh Sales Order invoice di database scratch');
    return result.rows.map((row) => row.id);
  }

  async function billingAmount(salesOrderId) {
    const result = await query(`${invoiceOrdersCte()} select billing_amount from invoice_orders where id = $1`, [salesOrderId]);
    assert.ok(result.rows[0], 'Sales Order harus ada di daftar invoice saat billing diukur');
    return Number(result.rows[0].billing_amount);
  }

  // Pickup menjalankan job lagi sehingga SO keluar dari daftar invoice (perilaku lama
  // refreshOrderStatus). Untuk mengukur billing murni, job test dibatalkan (keluar dari
  // finance_rows) dan status SO dikembalikan; yang tersisa hanya efek revenue line-nya.
  async function isolateBillingAfterPickup(jobId, salesOrderId) {
    await query("update container_jobs set status = 'cancelled', cancelled_at = now() where id = $1", [jobId]);
    await query("update sales_orders set status = 'completed' where id = $1", [salesOrderId]);
  }

  const createdJobs = [];

  async function createRepoStoredJob(salesOrderId) {
    const job = await createRepoStoredJobRow(salesOrderId);
    createdJobs.push(job);
    return job;
  }

  async function createRepoStoredJobRow(salesOrderId) {
    return cloneRow('container_jobs', `
      select * from container_jobs
      where coalesce(execution_source, 'internal') = 'internal' and sales_order_id = $1
      order by created_at limit 1
    `, [salesOrderId], {
      status: 'repo_stored',
      container_number: `RVN${nextTag()}`.padEnd(11, '0').slice(0, 11),
      container_size: '20FT',
      repo_location: `Repo Revenue ${tag}`,
      repo_eir_number: `EIR-${tag}`,
      driver_id: null,
      vehicle_id: null,
      assignment_group_id: null,
      entry_source: 'realtime',
      is_backdate_entry: false,
      running_at: null,
      completed_at: null,
      cancelled_at: null,
      repo_picked_up_at: null,
      rpuj_status: 'pending',
      uj_amount_snapshot: 123000,
    });
  }

  async function createDriver() {
    return cloneRow('drivers', 'select * from drivers where archived_at is null order by created_at limit 1', [], {
      name: `SOPIR REVENUE ${nextTag()}`, nik: null, operational_status: 'Aktif', archived_at: null,
    });
  }

  async function createVehicle(size) {
    const code = nextTag();
    return cloneRow('vehicles', 'select * from vehicles where archived_at is null order by created_at limit 1', [], {
      plate_number: `B ${code} RVN`, unit_code: `RVN-${code}`, engine_number: null, kir_number: null, vin: null,
      container_size: size, current_chassis_id: null, operational_status: 'Aktif', archived_at: null,
    });
  }

  async function repoRevenueRows(where, params) {
    const result = await query(`
      select mrl.*, cpi.movement_id, so.customer_name
      from manual_revenue_lines mrl
      left join container_pickup_items cpi on cpi.id = mrl.container_pickup_item_id
      join sales_orders so on so.id = mrl.sales_order_id
      where mrl.charge_type = 'repo' and ${where}
      order by cpi.sequence_no
    `, params);
    return result.rows;
  }

  const pickupPayload = (driver, vehicle, extra = {}) => ({
    pickupConfirmed: true, driverId: driver.id, vehicleId: vehicle.id, updatedBy: 'Integration Test', repoUjAmount: 150000, ...extra,
  });

  // Setiap test mengembalikan SO-nya ke daftar invoice supaya test berikutnya tetap punya SO.
  test.afterEach(async () => {
    const jobs = createdJobs.splice(0);
    if (!jobs.length) return;
    await query("update container_jobs set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()) where id = any($1::uuid[])", [jobs.map((job) => job.id)]);
    await query("update sales_orders set status = 'completed' where id = any($1::uuid[])", [[...new Set(jobs.map((job) => job.sales_order_id))]]);
  });

  test.after(async () => {
    await closePool();
  });

  test('1. single Repo: satu revenue Rp300.000 ter-link ke movement, item, job, dan SO', async () => {
    const [salesOrderId] = await invoiceSalesOrders(1);
    const job = await createRepoStoredJob(salesOrderId);
    const result = await pickupSingleRepoContainerJob(job.id, pickupPayload(await createDriver(), await createVehicle('20FT')));

    const rows = await repoRevenueRows('mrl.container_job_id = $1', [job.id]);
    assert.equal(rows.length, 1);
    assert.equal(Number(rows[0].total_amount), 300000);
    assert.equal(Number(rows[0].unit_price), 300000);
    assert.equal(Number(rows[0].quantity), 1);
    assert.equal(rows[0].status, 'draft');
    assert.equal(rows[0].movement_id, result.movement.id);
    assert.equal(rows[0].sales_order_id, salesOrderId);
    assert.equal(result.repoRevenueLines.length, 1);
  });

  test('2+3. combo 2x20 dari dua SO berbeda: dua revenue Rp300.000, masing-masing ke SO/customer-nya', async () => {
    const [soA, soB] = await invoiceSalesOrders(2);
    const jobs = [await createRepoStoredJob(soA), await createRepoStoredJob(soB)];
    const result = await pickupComboRepoContainerJobs(pickupPayload(await createDriver(), await createVehicle('40FT'), {
      containerJobIds: jobs.map((job) => job.id),
      repoUjAmount: 175000,
    }));

    const rows = await repoRevenueRows('cpi.movement_id = $1', [result.movement.id]);
    assert.equal(rows.length, 2);
    assert.equal(rows.reduce((sum, row) => sum + Number(row.total_amount), 0), 600000);
    assert.deepEqual(rows.map((row) => [row.container_job_id, row.sales_order_id]), [[jobs[0].id, soA], [jobs[1].id, soB]]);
    const customers = await query('select id, customer_name from sales_orders where id = any($1::uuid[])', [[soA, soB]]);
    const customerBySo = new Map(customers.rows.map((row) => [row.id, row.customer_name]));
    assert.deepEqual(rows.map((row) => row.customer_name), [customerBySo.get(soA), customerBySo.get(soB)]);

    // 7. UJ Repo tetap satu nilai per movement.
    const uj = await query("select amount from operational_fund_transactions where source = 'repo_uj' and source_ref_id = $1 and status = 'posted'", [result.movement.id]);
    assert.equal(uj.rows.length, 1);
    assert.equal(Number(uj.rows[0].amount), 175000);
  });

  test('4+5. retry dan submit bersamaan tidak menggandakan revenue', async () => {
    const [salesOrderId] = await invoiceSalesOrders(1);
    const job = await createRepoStoredJob(salesOrderId);
    const payload = pickupPayload(await createDriver(), await createVehicle('20FT'));
    const outcomes = await Promise.allSettled([
      pickupSingleRepoContainerJob(job.id, payload),
      pickupSingleRepoContainerJob(job.id, payload),
    ]);
    assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
    await assert.rejects(pickupSingleRepoContainerJob(job.id, payload), (error) => error.statusCode === 409);
    assert.equal((await repoRevenueRows('mrl.container_job_id = $1', [job.id])).length, 1);

    // Database sendiri menolak revenue kedua untuk item yang sama.
    const [line] = await repoRevenueRows('mrl.container_job_id = $1', [job.id]);
    await assert.rejects(query(
      `insert into manual_revenue_lines (sales_order_id, container_job_id, container_pickup_item_id, charge_type, description, unit_price, total_amount, status)
       values ($1, $2, $3, 'repo', 'duplikat', 300000, 300000, 'draft')`,
      [line.sales_order_id, line.container_job_id, line.container_pickup_item_id],
    ), (error) => error.code === '23505');
  });

  test('6. revenue transport SO dan billing invoice tidak berubah oleh revenue Repo draft', async () => {
    const [salesOrderId] = await invoiceSalesOrders(1);
    const before = await query('select total_amount from sales_orders where id = $1', [salesOrderId]);
    const billingBefore = await billingAmount(salesOrderId);
    const job = await createRepoStoredJob(salesOrderId);

    await pickupSingleRepoContainerJob(job.id, pickupPayload(await createDriver(), await createVehicle('20FT')));
    assert.equal((await repoRevenueRows('mrl.container_job_id = $1', [job.id])).length, 1);

    await isolateBillingAfterPickup(job.id, salesOrderId);
    const after = await query('select total_amount from sales_orders where id = $1', [salesOrderId]);
    assert.equal(Number(after.rows[0].total_amount), Number(before.rows[0].total_amount));
    assert.equal(await billingAmount(salesOrderId), billingBefore);

    // Kontrol: kalau baris yang sama berstatus active, billing naik tepat Rp300.000 -- jadi
    // status draft-lah yang menahannya di luar invoice.
    const [line] = await repoRevenueRows('mrl.container_job_id = $1', [job.id]);
    await query("update manual_revenue_lines set status = 'active' where id = $1", [line.id]);
    assert.equal(await billingAmount(salesOrderId), billingBefore + 300000);
    await query("update manual_revenue_lines set status = 'draft' where id = $1", [line.id]);
  });

  test('8. job batal setelah pickup fisik: revenue Repo tetap ada', async () => {
    const [salesOrderId] = await invoiceSalesOrders(1);
    const job = await createRepoStoredJob(salesOrderId);
    await pickupSingleRepoContainerJob(job.id, pickupPayload(await createDriver(), await createVehicle('20FT')));
    await query("update container_jobs set status = 'cancelled', cancelled_at = now() where id = $1", [job.id]);
    await withTransaction(async (client) => reconcileRepoPickupMovement(client, await lockRepoPickupMovementForJob(client, job.id)));

    const rows = await repoRevenueRows('mrl.container_job_id = $1', [job.id]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, 'draft');
    assert.equal(Number(rows[0].total_amount), 300000);
  });

  test('9. movement lama (belum mulai/cancelled) tidak mendapat revenue Repo otomatis', async () => {
    const [salesOrderId] = await invoiceSalesOrders(1);
    const job = await createRepoStoredJob(salesOrderId);
    const legacy = await query(
      "insert into container_pickup_movements (pickup_type, status, started_at) values ('single', 'running', null) returning id",
    );
    await query('insert into container_pickup_items (movement_id, container_job_id) values ($1, $2)', [legacy.rows[0].id, job.id]);
    await query("update container_jobs set status = 'cancelled' where id = $1", [job.id]);
    const reconciled = await withTransaction(async (client) => reconcileRepoPickupMovement(client, { id: legacy.rows[0].id, status: 'running' }));
    assert.equal(reconciled.status, 'cancelled');
    assert.equal((await repoRevenueRows('cpi.movement_id = $1', [legacy.rows[0].id])).length, 0);

    // Tidak ada backfill: movement yang dibuat sebelum Phase 4 tidak punya revenue Repo.
    const backfilled = await query(`
      select count(*)::int as n from manual_revenue_lines mrl
      join container_pickup_items cpi on cpi.id = mrl.container_pickup_item_id
      join container_pickup_movements cpm on cpm.id = cpi.movement_id
      where cpm.created_at < (select min(applied_at) from schema_migrations where version = '202610070003_repo_revenue_lines')
    `);
    assert.equal(backfilled.rows[0].n, 0);
  });

  test('Finance: revenue Repo terkunci dari edit/aktivasi, koreksi lewat void yang sudah ada', async () => {
    const [salesOrderId] = await invoiceSalesOrders(1);
    const billingBefore = await billingAmount(salesOrderId);
    const job = await createRepoStoredJob(salesOrderId);
    await pickupSingleRepoContainerJob(job.id, pickupPayload(await createDriver(), await createVehicle('20FT')));
    const [line] = await repoRevenueRows('mrl.container_job_id = $1', [job.id]);
    await isolateBillingAfterPickup(job.id, salesOrderId);

    await assert.rejects(updateManualRevenueLine(salesOrderId, line.id, { status: 'active', actorName: 'Finance' }), { code: 'REPO_REVENUE_LINE_LOCKED' });
    await assert.rejects(updateManualRevenueLine(salesOrderId, line.id, { unitPrice: 1, actorName: 'Finance' }), { code: 'REPO_REVENUE_LINE_LOCKED' });
    assert.equal(await billingAmount(salesOrderId), billingBefore);

    const voided = await voidManualRevenueLine(salesOrderId, line.id, { reason: 'Koreksi test', actorName: 'Finance' });
    assert.equal(voided.line.status, 'void');
  });

  test('10. revenue manual non-Repo (inap) tetap masuk billing seperti sebelumnya', async () => {
    const [salesOrderId] = await invoiceSalesOrders(1);
    const before = await billingAmount(salesOrderId);
    const created = await createManualRevenueLine(salesOrderId, {
      chargeType: 'inap', description: 'Inap test', quantity: 2, unit: 'malam', unitPrice: 50000, actorName: 'Finance',
    });
    assert.equal(created.line.status, 'active');
    assert.equal(created.billingAmount, before + 100000);
    await voidManualRevenueLine(salesOrderId, created.line.id, { reason: 'Bersihkan test', actorName: 'Finance' });
    assert.equal(await billingAmount(salesOrderId), before);
  });
}
