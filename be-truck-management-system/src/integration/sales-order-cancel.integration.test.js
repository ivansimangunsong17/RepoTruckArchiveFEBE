// Regresi P1-4: pembatalan SO dengan container cancelled + received terhadap PostgreSQL sungguhan.
// Opt-in: hanya jalan kalau ATMS_SCRATCH_DATABASE_URL diisi DAN lolos scratch-db-guard. Fixture dihapus di akhir.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { prepareScratchDatabase } from '../test-support/scratch-db-guard.js';

const scratch = await prepareScratchDatabase();

if (scratch.skip) {
  test('sales order cancel integration skipped without ATMS_SCRATCH_DATABASE_URL', { skip: scratch.skip }, () => {});
} else {
  process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';
  const { query, closePool } = await import('../db/client.js');
  const {
    removeSalesOrder,
    requestSalesOrderCancellation,
    reviewSalesOrderCancellation,
    saveSalesOrder,
  } = await import('../modules/sales-orders/sales-orders.service.js');

  const tag = crypto.randomBytes(3).toString('hex').toUpperCase();
  let seq = 0;
  const nextTag = () => `${tag}${String(++seq).padStart(3, '0')}`;
  const admin = { role: 'admin', name: `Admin Batal ${tag}` };
  const operational = { role: 'operational', name: `Ops Batal ${tag}` };
  const sales = { role: 'sales', name: `Sales Batal ${tag}`, sub: null };
  const salesOrderIds = [];
  const earlierCancelledAt = '2026-10-01T02:00:00.000Z';

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

  async function createOrder(jobStatuses, { lockedByFinance = false, extra = {} } = {}) {
    const code = nextTag();
    const so = await cloneRow('sales_orders', `
      select * from sales_orders
      where status <> 'cancelled' and coalesce(is_vendor_order, false) = false
      order by created_at limit 1
    `, {
      so_number: `SO-BTL-${code}`,
      accurate_so_number: lockedByFinance ? `ACC-BTL-${code}` : null,
      finance_verification_status: lockedByFinance ? 'verified' : 'pending_so',
      status: 'waiting_operational', entry_source: 'realtime', historical_period: null, is_vendor_order: false,
      invoice_number: null, billing_status: 'belum_invoice', debit_note_document_uploaded_at: null,
      cancel_request_status: 'none', cancelled_at: null,
      created_by_name: sales.name, created_by_user_id: null,
      ...extra,
    });
    salesOrderIds.push(so.id);
    const jobs = [];
    for (const status of jobStatuses) {
      jobs.push(await cloneRow('container_jobs', `
        select * from container_jobs
        where coalesce(execution_source, 'internal') = 'internal'
        order by created_at limit 1
      `, {
        sales_order_id: so.id,
        container_number: `BT${nextTag()}`,
        container_size: '20FT', execution_source: 'internal', status,
        running_at: status === 'running' ? new Date().toISOString() : null,
        completed_at: null, repo_stored_at: null,
        cancelled_at: status === 'cancelled' ? earlierCancelledAt : null,
        cancel_reason: status === 'cancelled' ? `Batal lebih dulu ${tag}` : null,
        cancel_source: status === 'cancelled' ? 'operational' : null,
        driver_id: null, vehicle_id: null, assignment_group_id: null,
        rpuj_status: 'pending', rpuj_requested_at: null,
        entry_source: 'realtime', is_backdate_entry: false,
      }));
    }
    return { so, jobs };
  }

  async function orderState(soId) {
    const so = (await query('select status from sales_orders where id = $1', [soId])).rows[0];
    const jobs = (await query(
      'select id, status, cancel_reason, cancel_source, cancelled_at from container_jobs where sales_order_id = $1',
      [soId],
    )).rows;
    return { so, jobs };
  }

  function assertCancelledCorrectly(state, jobs, expectedReason = 'Sales Order dibatalkan') {
    assert.equal(state.so.status, 'cancelled');
    const byId = new Map(state.jobs.map((job) => [job.id, job]));
    for (const job of jobs) {
      const after = byId.get(job.id);
      assert.equal(after.status, 'cancelled');
      if (job.status === 'cancelled') {
        // Job yang sudah batal lebih dulu tidak ditimpa.
        assert.equal(after.cancel_reason, `Batal lebih dulu ${tag}`);
        assert.equal(after.cancel_source, 'operational');
        assert.equal(new Date(after.cancelled_at).toISOString(), earlierCancelledAt);
      } else {
        assert.equal(after.cancel_reason, expectedReason);
        assert.equal(after.cancel_source, 'sales');
      }
    }
  }

  test.after(async () => {
    try {
      if (salesOrderIds.length) await query('delete from sales_orders where id = any($1::uuid[])', [salesOrderIds]);
    } finally {
      await closePool();
    }
  });

  test('Admin membatalkan SO dengan container cancelled + received', async () => {
    const { so, jobs } = await createOrder(['cancelled', 'received']);
    await removeSalesOrder(so.id, admin);
    assertCancelledCorrectly(await orderState(so.id), jobs);
  });

  test('approval permintaan batal SO dengan container cancelled + received', async () => {
    const { so, jobs } = await createOrder(['received', 'cancelled', 'received']);
    await requestSalesOrderCancellation(so.id, admin, { cancelRequestNote: 'Customer batal seluruh sisa order' });
    await reviewSalesOrderCancellation(so.id, operational, { approved: true, cancelReviewNote: 'Disetujui' });
    // Mekanisme existing: alasan batal job received diambil dari catatan permintaan batal.
    assertCancelledCorrectly(await orderState(so.id), jobs, 'Customer batal seluruh sisa order');
  });

  test('Sales pemilik SO terkunci Finance tetap bisa membatalkan bila container hanya cancelled + received', async () => {
    const { so, jobs } = await createOrder(['cancelled', 'received'], { lockedByFinance: true });
    await removeSalesOrder(so.id, sales);
    assertCancelledCorrectly(await orderState(so.id), jobs);
  });

  test('akses API langsung: Sales tetap tidak boleh merevisi SO terkunci Finance yang berisi container cancelled', async () => {
    const { so } = await createOrder(['cancelled', 'received'], { lockedByFinance: true });
    const before = await orderState(so.id);
    const { findSalesOrderById } = await import('../modules/sales-orders/sales-orders.repository.js');
    const current = await findSalesOrderById(so.id);
    await assert.rejects(
      saveSalesOrder({ ...current, notes: `Revisi Sales ${tag}` }, so.id, sales),
      { code: 'SALES_ORDER_ADVANCED_PROCESSING_LOCKED' },
    );
    assert.deepEqual(await orderState(so.id), before);
  });

  test('pengaman Finance tetap berlaku: SO berinvoice tidak bisa dibatalkan Sales walau container hanya cancelled + received', async () => {
    const { so } = await createOrder(['cancelled', 'received'], { lockedByFinance: true, extra: { invoice_number: `INV-BTL-${tag}` } });
    const before = await orderState(so.id);
    await assert.rejects(removeSalesOrder(so.id, sales), { code: 'SALES_ORDER_ADVANCED_PROCESSING_LOCKED' });
    await assert.rejects(requestSalesOrderCancellation(so.id, sales, { cancelRequestNote: 'Coba batal lewat API' }), { code: 'SALES_ORDER_ADVANCED_PROCESSING_LOCKED' });
    assert.deepEqual(await orderState(so.id), before);
  });

  test('akses API langsung: Sales bukan pemilik tidak bisa membatalkan SO', async () => {
    const { so } = await createOrder(['cancelled', 'received']);
    const before = await orderState(so.id);
    await assert.rejects(removeSalesOrder(so.id, { role: 'sales', name: `Sales Lain ${tag}`, sub: null }), { code: 'SALES_ORDER_OWNER_FORBIDDEN' });
    assert.deepEqual(await orderState(so.id), before);
  });

  test('container yang sudah berjalan tetap mengunci pembatalan tanpa perubahan data', async () => {
    const { so } = await createOrder(['running', 'cancelled']);
    const before = await orderState(so.id);
    await assert.rejects(removeSalesOrder(so.id, admin), { code: 'SALES_ORDER_LOCKED' });
    assert.deepEqual(await orderState(so.id), before);
  });
}
