// Regresi P1-5: job aktif pada SO di luar 100 baris pertama list SO tetap terbaca lewat endpoint
// active-operational. Opt-in: hanya jalan kalau ATMS_SCRATCH_DATABASE_URL diisi DAN lolos scratch-db-guard.
// Fixture (100+ SO bertag) dihapus di akhir.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { prepareScratchDatabase } from '../test-support/scratch-db-guard.js';

const scratch = await prepareScratchDatabase();

if (scratch.skip) {
  test('sales order active operational integration skipped without ATMS_SCRATCH_DATABASE_URL', { skip: scratch.skip }, () => {});
} else {
  process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';
  const { query, closePool } = await import('../db/client.js');
  const { findSalesOrdersPage } = await import('../modules/sales-orders/sales-orders.repository.js');
  const { listActiveOperationalSalesOrders } = await import('../modules/sales-orders/sales-orders.service.js');

  const tag = crypto.randomBytes(3).toString('hex').toUpperCase();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
  const salesOrderIds = [];
  const templateSalesOrderSql = `
    select * from sales_orders
    where status <> 'cancelled' and coalesce(is_vendor_order, false) = false
    order by created_at limit 1
  `;
  const templateJobSql = `
    select * from container_jobs
    where coalesce(execution_source, 'internal') = 'internal'
    order by created_at limit 1
  `;
  const fixtures = {};

  async function cloneSalesOrder(key, overrides) {
    const result = await query(
      `insert into sales_orders
       select (jsonb_populate_record(null::sales_orders, to_jsonb(t) || $1::jsonb)).*
       from (${templateSalesOrderSql}) t returning id`,
      [JSON.stringify({
        id: crypto.randomUUID(), so_number: `SO-ACT-${tag}-${key}`, accurate_so_number: null,
        trip_date: today, entry_source: 'realtime', historical_period: null, is_vendor_order: false,
        invoice_number: null, billing_status: 'belum_invoice', ...overrides,
      })],
    );
    assert.ok(result.rows[0], 'Template sales_orders tidak ditemukan -- jalankan seed sintetis di database scratch.');
    salesOrderIds.push(result.rows[0].id);
    return result.rows[0].id;
  }

  async function addJob(salesOrderId, status) {
    const result = await query(
      `insert into container_jobs
       select (jsonb_populate_record(null::container_jobs, to_jsonb(t) || $1::jsonb)).*
       from (${templateJobSql}) t returning id`,
      [JSON.stringify({
        id: crypto.randomUUID(), sales_order_id: salesOrderId, container_number: `AC${tag}${String(Object.keys(fixtures).length).padStart(3, '0')}`,
        container_size: '20FT', execution_source: 'internal', status,
        running_at: ['running', 'inap', 'completed'].includes(status) ? new Date().toISOString() : null,
        completed_at: status === 'completed' ? new Date().toISOString() : null,
        repo_stored_at: status === 'repo_stored' ? new Date().toISOString() : null,
        cancelled_at: null, driver_id: null, vehicle_id: null, assignment_group_id: null,
        assignment_snapshot: { driver: `SOPIR LAMA ${tag}`, plateNumber: `B ${tag} OLD` },
        rpuj_status: 'pending', rpuj_requested_at: null, entry_source: 'realtime', is_backdate_entry: false,
      })],
    );
    assert.ok(result.rows[0], 'Template container_jobs tidak ditemukan.');
  }

  test.before(async () => {
    // 100 SO dengan trip_date paling awal -> mengisi penuh halaman pertama list SO (trip_date asc).
    const fillers = await query(
      `insert into sales_orders
       select (jsonb_populate_record(null::sales_orders, to_jsonb(t) || jsonb_build_object(
         'id', gen_random_uuid(), 'so_number', 'SO-ACT-' || $1 || '-F' || lpad(g::text, 3, '0'),
         'accurate_so_number', null, 'trip_date', '2000-01-01', 'status', 'completed',
         'entry_source', 'realtime', 'historical_period', null, 'is_vendor_order', false,
         'invoice_number', null, 'billing_status', 'belum_invoice'))).*
       from (${templateSalesOrderSql}) t, generate_series(1, 100) g
       returning id`,
      [tag],
    );
    assert.equal(fillers.rows.length, 100);
    salesOrderIds.push(...fillers.rows.map((row) => row.id));

    for (const [key, status, soStatus] of [
      ['RUN', 'running', 'running'],
      ['INAP', 'inap', 'running'],
      ['REPO', 'repo_stored', 'running'],
      ['WAIT', 'received', 'waiting_operational'],
      ['DONE', 'completed', 'completed'],
      ['CANCEL', 'received', 'cancelled'],
    ]) {
      fixtures[key] = await cloneSalesOrder(key, { status: soStatus });
      await addJob(fixtures[key], status);
    }
  });

  test.after(async () => {
    try {
      if (salesOrderIds.length) await query('delete from sales_orders where id = any($1::uuid[])', [salesOrderIds]);
    } finally {
      await closePool();
    }
  });

  test('regresi: SO aktif di luar halaman pertama (100 SO) tidak ikut terbaca oleh list SO', async () => {
    const firstPage = await findSalesOrdersPage({ page: 1, pageSize: 100 });
    const firstPageIds = new Set(firstPage.rows.map((row) => row.id));
    for (const key of ['RUN', 'INAP', 'REPO', 'WAIT']) {
      assert.equal(firstPageIds.has(fixtures[key]), false, `${key} seharusnya di luar 100 baris pertama`);
    }
  });

  test('endpoint active-operational mengembalikan semua SO dengan job aktif, tanpa completed/cancelled', async () => {
    const result = await listActiveOperationalSalesOrders();
    assert.equal(result.truncated, false);
    const byId = new Map(result.rows.map((row) => [row.id, row]));
    for (const key of ['RUN', 'INAP', 'REPO', 'WAIT']) {
      assert.ok(byId.has(fixtures[key]), `${key} wajib ikut terbaca`);
    }
    assert.equal(byId.has(fixtures.DONE), false, 'SO yang job-nya sudah selesai bukan job aktif');
    assert.equal(byId.has(fixtures.CANCEL), false, 'SO yang dibatalkan bukan job aktif');
    const running = byId.get(fixtures.RUN);
    assert.equal(running.containers[0].status, 'running');
    assert.equal(running.containers[0].driver, `SOPIR LAMA ${tag}`);
    assert.equal(running.containers[0].plateNumber, `B ${tag} OLD`);
    for (const row of result.rows) {
      assert.notEqual(row.status, 'cancelled');
      assert.ok(row.containers.some((job) => ['received', 'running', 'inap', 'repo_stored'].includes(job.status)));
    }
  });
  test('hasil yang melewati limit ditandai truncated (bukan ditampilkan sebagai data lengkap)', async () => {
    const result = await listActiveOperationalSalesOrders({ limit: 1 });
    assert.equal(result.truncated, true);
    assert.equal(result.rows.length, 1);
  });
}
