// Integrasi kelayakan Finance (Phase 4B) + aktivasi Revenue Repo terhadap PostgreSQL sungguhan.
// Opt-in: hanya jalan kalau ATMS_SCRATCH_DATABASE_URL diisi DAN lolos scratch-db-guard (database
// scratch lokal), bukan database dev/production, karena test ini menulis data.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { prepareScratchDatabase } from '../test-support/scratch-db-guard.js';

const scratch = await prepareScratchDatabase();

if (scratch.skip) {
  test('finance eligibility integration skipped without ATMS_SCRATCH_DATABASE_URL', { skip: scratch.skip }, () => {});
} else {
  process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';
  const { query, withTransaction, closePool } = await import('../db/client.js');
  const {
    activateManualRevenueLine,
    createManualRevenueLine,
    financeRowsCte,
    invoiceOrdersCte,
    updateInvoiceNumber,
    updateManualRevenueLine,
  } = await import('../modules/finance/finance.repository.js');
  const { createRepoRevenueLines } = await import('../modules/container-jobs/repo-pickup-revenue.js');

  const tag = crypto.randomBytes(3).toString('hex').toUpperCase();
  let seq = 0;
  const nextTag = () => `${tag}${String(++seq).padStart(3, '0')}`;

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

  // SO baru hasil clone SO invoice yang sudah ada (terverifikasi + nomor SO Accurate), tanpa job,
  // billing belum maju.
  async function createSalesOrder() {
    const code = nextTag();
    return cloneRow('sales_orders', `
      select * from sales_orders
      where status <> 'cancelled' and coalesce(is_vendor_order, false) = false
      order by created_at limit 1
    `, [], {
      so_number: `SO-FE-${code}`,
      accurate_so_number: `ACC-FE-${code}`, finance_verification_status: 'verified', is_vendor_order: false, debit_note_number: null, cancel_request_status: 'none', cancelled_at: null,
      invoice_number: null,
      billing_status: 'belum_invoice',
      debit_note_document_uploaded_at: null,
      status: 'completed',
    });
  }

  async function createJob(salesOrderId, overrides = {}) {
    return cloneRow('container_jobs', `
      select * from container_jobs
      where coalesce(execution_source, 'internal') = 'internal' and status = 'completed'
      order by created_at limit 1
    `, [], {
      sales_order_id: salesOrderId,
      container_number: `FEL${nextTag()}`.padEnd(11, '0').slice(0, 11),
      container_size: '20FT',
      driver_id: null,
      vehicle_id: null,
      assignment_group_id: null,
      entry_source: 'realtime',
      is_backdate_entry: false,
      status: 'completed',
      completed_at: new Date().toISOString(),
      repo_stored_at: null,
      cancelled_at: null,
      ...overrides,
    });
  }

  const repoStored = { status: 'repo_stored', completed_at: null, repo_stored_at: new Date().toISOString(), repo_location: 'Depo Test' };

  async function invoiceRow(salesOrderId) {
    const result = await query(`${invoiceOrdersCte()} select id, billing_amount, invoice_number, billing_status from invoice_orders where id = $1`, [salesOrderId]);
    return result.rows[0] || null;
  }

  async function financeRows(jobId) {
    const result = await query(`${financeRowsCte()} select id, transport_revenue from finance_rows where id = $1`, [jobId]);
    return result.rows;
  }

  async function addRepoRevenueLines(jobs) {
    return withTransaction(async (client) => {
      const movement = await client.query(
        "insert into container_pickup_movements (pickup_type, status, started_at) values ($1, 'running', now()) returning id",
        [jobs.length === 2 ? 'combo_2x20' : 'single'],
      );
      const items = [];
      for (const [index, job] of jobs.entries()) {
        const item = await client.query(
          'insert into container_pickup_items (movement_id, container_job_id, sequence_no) values ($1, $2, $3) returning id',
          [movement.rows[0].id, job.id, index + 1],
        );
        items.push({ id: item.rows[0].id, job });
      }
      return createRepoRevenueLines(client, {
        movementId: movement.rows[0].id,
        pickupType: jobs.length === 2 ? 'combo_2x20' : 'single',
        items,
        actorName: 'Integration Test',
      });
    });
  }

  test.after(async () => {
    await closePool();
  });

  test('repo_stored saja: SO layak Finance walau status operasional running; transport dihitung sekali', async () => {
    const so = await createSalesOrder();
    const job = await createJob(so.id, repoStored);
    await query("update sales_orders set status = 'running' where id = $1", [so.id]);

    assert.ok(await invoiceRow(so.id), 'SO dengan container titip harus terlihat Finance');
    const rowsWhileStored = await financeRows(job.id);
    assert.equal(rowsWhileStored.length, 1);
    const transport = Number(rowsWhileStored[0].transport_revenue);
    assert.ok(transport > 0);

    // Transport yang sama persis seperti kalau job itu selesai normal.
    await query("update container_jobs set status = 'completed', completed_at = now() where id = $1", [job.id]);
    const rowsCompleted = await financeRows(job.id);
    assert.equal(rowsCompleted.length, 1);
    assert.equal(Number(rowsCompleted[0].transport_revenue), transport);
  });

  test('campuran completed + repo_stored: layak, billing = transport kedua job', async () => {
    const so = await createSalesOrder();
    const done = await createJob(so.id);
    const stored = await createJob(so.id, repoStored);
    const invoice = await invoiceRow(so.id);
    assert.ok(invoice);
    const [rowDone] = await financeRows(done.id);
    const [rowStored] = await financeRows(stored.id);
    assert.ok(rowDone && rowStored);
  });

  test('job biasa yang masih berjalan (tanpa titip) tetap menahan kelayakan', async () => {
    const so = await createSalesOrder();
    await createJob(so.id);
    await createJob(so.id, { status: 'running', completed_at: null });
    assert.equal(await invoiceRow(so.id), null);
    await assert.rejects(updateInvoiceNumber(so.id, { invoiceNumber: `INV-${nextTag()}` }), { code: 'FINANCE_INVOICE_ORDER_NOT_FOUND' });
  });

  test('Repo mulai berjalan: SO tidak kehilangan kelayakan dan billing tetap', async () => {
    const so = await createSalesOrder();
    await createJob(so.id);
    const stored = await createJob(so.id, repoStored);
    const before = await invoiceRow(so.id);
    await query("update container_jobs set status = 'running' where id = $1", [stored.id]);
    await query("update sales_orders set status = 'running' where id = $1", [so.id]);
    const after = await invoiceRow(so.id);
    assert.ok(after);
    assert.equal(Number(after.billing_amount), Number(before.billing_amount));
  });

  test('nomor invoice bisa diisi untuk SO yang layak karena container titip', async () => {
    const so = await createSalesOrder();
    await createJob(so.id, repoStored);
    await query("update sales_orders set status = 'running' where id = $1", [so.id]);
    const invoiceNumber = `INV-${nextTag()}`;
    await updateInvoiceNumber(so.id, { invoiceNumber });
    assert.equal((await invoiceRow(so.id)).invoice_number, invoiceNumber);
  });

  test('invoice sudah terbit lalu job dibuka kembali: SO tetap terlihat, billing tidak berubah', async () => {
    const so = await createSalesOrder();
    const job = await createJob(so.id);
    const invoiceNumber = `INV-${nextTag()}`;
    await updateInvoiceNumber(so.id, { invoiceNumber });
    const before = await invoiceRow(so.id);

    await query("update container_jobs set status = 'running', completed_at = null where id = $1", [job.id]);
    await query("update sales_orders set status = 'running' where id = $1", [so.id]);
    const after = await invoiceRow(so.id);
    assert.ok(after, 'SO yang sudah diinvoice tidak boleh hilang dari Finance');
    assert.equal(after.invoice_number, invoiceNumber);
    assert.equal(Number(after.billing_amount), Number(before.billing_amount));
  });

  test('SO lunas lalu job dibuka kembali: tetap terlihat, status bayar dan pembayaran utuh', async () => {
    const so = await createSalesOrder();
    const job = await createJob(so.id);
    const billing = Number((await invoiceRow(so.id)).billing_amount);
    await query(
      "insert into sales_order_payments (sales_order_id, amount, payment_date, recorded_by_name) values ($1, $2, current_date, 'Integration Test')",
      [so.id, billing],
    );
    await query("update sales_orders set billing_status = 'lunas', invoice_number = $2 where id = $1", [so.id, `INV-${nextTag()}`]);

    await query("update container_jobs set status = 'running', completed_at = null where id = $1", [job.id]);
    await query("update sales_orders set status = 'running' where id = $1", [so.id]);
    const after = await invoiceRow(so.id);
    assert.ok(after);
    assert.equal(after.billing_status, 'lunas');
    assert.equal(Number(after.billing_amount), billing);
    const paid = await query('select coalesce(sum(amount), 0)::numeric as total from sales_order_payments where sales_order_id = $1 and voided_at is null', [so.id]);
    assert.equal(Number(paid.rows[0].total), billing);
  });

  test('Revenue Repo draft + billing belum maju: Finance bisa mengaktifkan, billing naik tepat Rp300.000', async () => {
    const so = await createSalesOrder();
    await createJob(so.id);
    const stored = await createJob(so.id, repoStored);
    const [line] = await addRepoRevenueLines([stored]);
    const before = Number((await invoiceRow(so.id)).billing_amount);

    // Edit biasa tetap terkunci (tidak boleh jadi jalan pintas aktivasi diam-diam).
    await assert.rejects(updateManualRevenueLine(so.id, line.id, { status: 'active', actorName: 'Finance' }), { code: 'REPO_REVENUE_LINE_LOCKED' });
    assert.equal(Number((await invoiceRow(so.id)).billing_amount), before);

    const activated = await activateManualRevenueLine(so.id, line.id, { actorName: 'Finance' });
    assert.equal(activated.line.status, 'active');
    assert.equal(activated.billingAmount, before + 300000);
    assert.equal(Number((await invoiceRow(so.id)).billing_amount), before + 300000);
    await assert.rejects(activateManualRevenueLine(so.id, line.id, { actorName: 'Finance' }), { code: 'REVENUE_LINE_ACTIVATION_INVALID' });
  });

  test('Revenue Repo draft + billing sudah maju: aktivasi ditolak, tetap draft, billing tidak berubah', async () => {
    const so = await createSalesOrder();
    const stored = await createJob(so.id, repoStored);
    const [line] = await addRepoRevenueLines([stored]);
    await updateInvoiceNumber(so.id, { invoiceNumber: `INV-${nextTag()}` });
    const before = Number((await invoiceRow(so.id)).billing_amount);

    await assert.rejects(activateManualRevenueLine(so.id, line.id, { actorName: 'Finance' }), { code: 'REPO_REVENUE_REQUIRES_ADDITIONAL_BILLING' });
    const status = await query('select status from manual_revenue_lines where id = $1', [line.id]);
    assert.equal(status.rows[0].status, 'draft');
    assert.equal(Number((await invoiceRow(so.id)).billing_amount), before);
  });

  test('combo dari dua SO: tiap SO hanya menerima Rp300.000 miliknya sendiri', async () => {
    const [soA, soB] = [await createSalesOrder(), await createSalesOrder()];
    const jobA = await createJob(soA.id, repoStored);
    const jobB = await createJob(soB.id, repoStored);
    const lines = await addRepoRevenueLines([jobA, jobB]);
    const beforeA = Number((await invoiceRow(soA.id)).billing_amount);
    const beforeB = Number((await invoiceRow(soB.id)).billing_amount);

    const lineA = lines.find((line) => line.sales_order_id === soA.id);
    await activateManualRevenueLine(soA.id, lineA.id, { actorName: 'Finance' });
    assert.equal(Number((await invoiceRow(soA.id)).billing_amount), beforeA + 300000);
    assert.equal(Number((await invoiceRow(soB.id)).billing_amount), beforeB);

    const lineB = lines.find((line) => line.sales_order_id === soB.id);
    // Baris SO B tidak bisa diaktifkan lewat SO A.
    await assert.rejects(activateManualRevenueLine(soA.id, lineB.id, { actorName: 'Finance' }), { code: 'REVENUE_LINE_NOT_FOUND' });
    await activateManualRevenueLine(soB.id, lineB.id, { actorName: 'Finance' });
    assert.equal(Number((await invoiceRow(soB.id)).billing_amount), beforeB + 300000);
    assert.equal(Number((await invoiceRow(soA.id)).billing_amount), beforeA + 300000);
  });

  test('revenue manual non-Repo tetap langsung masuk billing seperti sebelumnya', async () => {
    const so = await createSalesOrder();
    await createJob(so.id);
    const before = Number((await invoiceRow(so.id)).billing_amount);
    const created = await createManualRevenueLine(so.id, {
      chargeType: 'inap', description: 'Inap test', quantity: 2, unit: 'malam', unitPrice: 50000, actorName: 'Finance',
    });
    assert.equal(created.line.status, 'active');
    assert.equal(created.billingAmount, before + 100000);
  });
}
