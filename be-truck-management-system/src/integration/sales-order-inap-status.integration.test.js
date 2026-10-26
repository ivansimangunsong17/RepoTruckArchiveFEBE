// Regresi status Sales Order saat Container Job berstatus inap, terhadap PostgreSQL sungguhan.
// Opt-in: hanya jalan kalau ATMS_SCRATCH_DATABASE_URL diisi DAN lolos scratch-db-guard (host lokal,
// nama atms_scratch_*, konfirmasi ATMS_SCRATCH_DATABASE_NAME, tabel penanda, role non-superuser,
// migrasi lengkap). Tidak pernah fallback ke DATABASE_URL/.env. Data test dihapus di akhir.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { prepareScratchDatabase } from '../test-support/scratch-db-guard.js';

// Melempar (file gagal) bila variabel diisi tetapi target tidak tervalidasi sebagai scratch.
const scratch = await prepareScratchDatabase();

if (scratch.skip) {
  test('sales order inap status integration skipped without ATMS_SCRATCH_DATABASE_URL', { skip: scratch.skip }, () => {});
} else {
  process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';
  const { query, closePool } = await import('../db/client.js');
  const { findSalesOrderById } = await import('../modules/sales-orders/sales-orders.repository.js');
  const { saveSalesOrder } = await import('../modules/sales-orders/sales-orders.service.js');

  const tag = crypto.randomBytes(3).toString('hex').toUpperCase();
  let seq = 0;
  const nextTag = () => `${tag}${String(++seq).padStart(3, '0')}`;
  const admin = { sub: null, role: 'admin', name: `Admin Inap ${tag}` };
  const createdSalesOrderIds = [];

  const templateSalesOrderSql = `
    select * from sales_orders
    where status <> 'cancelled' and coalesce(is_vendor_order, false) = false
      and nullif(btrim(coalesce(origin, '')), '') is not null
      and nullif(btrim(coalesce(destination, '')), '') is not null
    order by created_at limit 1
  `;
  const templateContainerJobSql = `
    select * from container_jobs
    where coalesce(execution_source, 'internal') = 'internal'
    order by created_at limit 1
  `;

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

  // SO internal yang sedang running. lockedByFinance=true meniru SO yang sudah diverifikasi Finance
  // sehingga edit Admin wajib lewat mode Admin Correction.
  async function createRunningSalesOrder({ lockedByFinance = false } = {}) {
    const code = nextTag();
    const order = await cloneRow('sales_orders', templateSalesOrderSql, {
      so_number: `SO-INAP-${code}`,
      accurate_so_number: lockedByFinance ? `ACC-INAP-${code}` : null,
      finance_verification_status: lockedByFinance ? 'verified' : 'pending_so',
      customer_name: `Customer Inap ${tag}`,
      status: 'running',
      entry_source: 'realtime',
      historical_period: null,
      is_vendor_order: false,
      invoice_number: null,
      billing_status: 'belum_invoice',
      debit_note_document_uploaded_at: null,
      line_items: [
        { serviceName: 'Jasa Angkut D20', qty: 2, price: 1000000, total: 2000000, containerType: 'Dry' },
      ],
    });
    createdSalesOrderIds.push(order.id);
    return order;
  }

  async function createJob(salesOrderId, status, extra = {}) {
    return cloneRow('container_jobs', templateContainerJobSql, {
      sales_order_id: salesOrderId,
      // "IN" + tag 6 + urutan 3 = tepat 11 karakter, unik per job dalam satu run.
      container_number: `IN${nextTag()}`,
      container_size: '20FT',
      status,
      inap_started_at: status === 'inap' ? new Date().toISOString() : null,
      // Tanpa resource agar test tidak mengubah status driver/truck master.
      driver_id: null, vehicle_id: null, assignment_group_id: null,
      entry_source: 'realtime', is_backdate_entry: false,
      rpuj_status: 'pending', rpuj_requested_at: null,
      completed_at: null, cancelled_at: null, repo_stored_at: null,
      ...extra,
    });
  }

  async function salesOrderStatus(id) {
    const result = await query('select status from sales_orders where id = $1', [id]);
    return result.rows[0]?.status;
  }

  async function editPayload(id, overrides = {}) {
    const order = await findSalesOrderById(id);
    return { ...order, notes: `Edit regresi inap ${tag}`, ...overrides };
  }

  test.before(async () => {
    // Gagal cepat dengan pesan jelas bila scratch belum di-seed, bukan TypeError di tengah test.
    for (const [table, sql] of [['sales_orders', templateSalesOrderSql], ['container_jobs', templateContainerJobSql]]) {
      const result = await query(`select count(*)::int as total from (${sql}) t`);
      assert.equal(result.rows[0].total, 1, `Template ${table} tidak ada di database scratch.`);
    }
  });

  test.after(async () => {
    try {
      // container_jobs ikut terhapus lewat FK on delete cascade.
      if (createdSalesOrderIds.length) {
        await query('delete from sales_orders where id = any($1::uuid[])', [createdSalesOrderIds]);
      }
    } finally {
      await closePool();
    }
  });

  test('regresi: edit SO sah oleh Admin pada SO running dengan job inap tetap running', async () => {
    const so = await createRunningSalesOrder();
    await createJob(so.id, 'inap');
    await createJob(so.id, 'inap');

    const saved = await saveSalesOrder(await editPayload(so.id), so.id, admin);

    assert.equal(saved.status, 'running');
    assert.equal(await salesOrderStatus(so.id), 'running');
  });

  test('Admin Correction pada SO terkunci Finance dengan job inap tetap running', async () => {
    const so = await createRunningSalesOrder({ lockedByFinance: true });
    await createJob(so.id, 'inap');
    await createJob(so.id, 'completed', { completed_at: new Date().toISOString() });

    const saved = await saveSalesOrder(
      await editPayload(so.id, { adminCorrectionMode: true, adminCorrectionReason: 'Koreksi catatan SO regresi inap' }),
      so.id,
      admin,
    );

    assert.equal(saved.status, 'running');
    assert.equal(await salesOrderStatus(so.id), 'running');
  });

  test('Admin Correction yang menghapus job received menyisakan job inap + cancelled tetap running', async () => {
    const so = await createRunningSalesOrder({ lockedByFinance: true });
    const inapJob = await createJob(so.id, 'inap');
    await createJob(so.id, 'cancelled', { cancelled_at: new Date().toISOString() });
    await createJob(so.id, 'received');

    const order = await findSalesOrderById(so.id);
    const keptContainers = order.containers.filter((container) => container.status !== 'received');
    const saved = await saveSalesOrder(
      {
        ...order,
        containers: keptContainers,
        adminCorrectionMode: true,
        adminCorrectionReason: 'Hapus container received regresi inap',
      },
      so.id,
      admin,
    );

    assert.equal(saved.status, 'running');
    assert.ok(saved.containers.some((container) => container.id === inapJob.id && container.status === 'inap'));
    assert.ok(!saved.containers.some((container) => container.status === 'received'));
  });

  test('edit SO dengan semua job completed tetap completed dan semua cancelled tetap ditolak edit', async () => {
    const completedSo = await createRunningSalesOrder({ lockedByFinance: true });
    await createJob(completedSo.id, 'completed', { completed_at: new Date().toISOString() });
    await createJob(completedSo.id, 'completed', { completed_at: new Date().toISOString() });
    const saved = await saveSalesOrder(
      await editPayload(completedSo.id, { adminCorrectionMode: true, adminCorrectionReason: 'Koreksi SO completed regresi' }),
      completedSo.id,
      admin,
    );
    assert.equal(saved.status, 'completed');

    const cancelledSo = await createRunningSalesOrder();
    await createJob(cancelledSo.id, 'cancelled', { cancelled_at: new Date().toISOString() });
    await query("update sales_orders set status = 'cancelled' where id = $1", [cancelledSo.id]);
    await assert.rejects(
      saveSalesOrder(await editPayload(cancelledSo.id), cancelledSo.id, admin),
      { code: 'SALES_ORDER_CANCELLED_LOCKED' },
    );
  });
}
