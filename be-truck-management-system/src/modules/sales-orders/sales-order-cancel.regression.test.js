// Regresi P1-4: SO dengan job cancelled + received harus bisa dibatalkan; status job lain tetap terkunci.
// Tanpa database: guard dijalankan lewat client palsu.
import assert from 'node:assert/strict';
import test from 'node:test';

process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';
const { ensureSalesOrderCanBeCancelled } = await import('./sales-orders.repository.js');
const { ensureSalesOrderStillSafeForSalesRevision } = await import('./sales-orders.service.js');

function guardClient(statuses, activeExpenseCount = 0) {
  return {
    async query(sql) {
      if (/select status from container_jobs where sales_order_id/.test(sql)) {
        return { rows: statuses.map((status) => ({ status })) };
      }
      if (/from container_job_expenses/.test(sql)) {
        return { rows: [{ count: activeExpenseCount, total: activeExpenseCount ? 150000 : 0 }] };
      }
      throw new Error(`Query tidak terduga: ${sql}`);
    },
  };
}

test('regresi: job cancelled + received tidak lagi mengunci pembatalan SO', async () => {
  await assert.doesNotReject(ensureSalesOrderCanBeCancelled(guardClient(['cancelled', 'received']), 'so-1'));
  await assert.doesNotReject(ensureSalesOrderCanBeCancelled(guardClient(['received', 'cancelled', 'cancelled']), 'so-1'));
  await assert.doesNotReject(ensureSalesOrderCanBeCancelled(guardClient(['received']), 'so-1'));
});

test('job yang sudah diproses Operational tetap mengunci pembatalan SO', async () => {
  for (const status of ['running', 'inap', 'completed', 'repo_stored']) {
    await assert.rejects(
      ensureSalesOrderCanBeCancelled(guardClient([status, 'cancelled', 'received']), 'so-1'),
      { code: 'SALES_ORDER_LOCKED' },
      `status ${status} harus tetap mengunci`,
    );
  }
});

test('biaya operasional aktif tetap mengunci pembatalan walau job hanya received/cancelled', async () => {
  await assert.rejects(
    ensureSalesOrderCanBeCancelled(guardClient(['cancelled', 'received'], 1), 'so-1'),
    { code: 'SALES_ORDER_CANCEL_HAS_ACTIVE_EXPENSE' },
  );
});

test('Sales pada SO terkunci Finance: container berjalan tetap mengunci revisi/pembatalan', async () => {
  const lockedOrder = { id: 'so-1', accurateSoNumber: 'ACC-1', financeVerificationStatus: 'verified' };
  for (const status of ['running', 'inap', 'completed', 'repo_stored']) {
    await assert.rejects(
      ensureSalesOrderStillSafeForSalesRevision({ ...lockedOrder, containers: [{ status }, { status: 'cancelled' }] }),
      { code: 'SALES_ORDER_ADVANCED_PROCESSING_LOCKED' },
    );
  }
});

// --- Pemisahan hak batal vs hak revisi Sales (lanjutan P1-4) ---
const { mapSalesOrder } = await import('./sales-orders.mapper.js');

function mapped(rowOverrides, statuses) {
  return mapSalesOrder(
    { id: 'so-1', so_number: 'SO-1', status: 'waiting_operational', ...rowOverrides },
    statuses.map((status, index) => ({ id: `job-${index + 1}`, status, rpujStatus: 'pending' })),
  );
}

test('flag mapper: SO terkunci Finance dengan container received+cancelled boleh dibatalkan tetapi tidak boleh direvisi Sales', () => {
  const locked = { accurate_so_number: 'ACC-1', finance_verification_status: 'verified' };
  const order = mapped(locked, ['received', 'cancelled']);
  assert.equal(order.canRevise, false);
  assert.equal(order.canCancel, true);
  // Aturan revisi lama tetap: semua received -> boleh revisi dan batal.
  assert.equal(mapped(locked, ['received']).canRevise, true);
  assert.equal(mapped(locked, ['received']).canCancel, true);
  // Pengaman lain tetap mengunci keduanya.
  assert.equal(mapped({ ...locked, invoice_number: 'INV-1' }, ['received', 'cancelled']).canCancel, false);
  assert.equal(mapped(locked, ['running', 'cancelled']).canCancel, false);
  const rpujSent = mapSalesOrder({ id: 'so-2', ...locked }, [{ id: 'j', status: 'received', rpujStatus: 'submitted' }, { id: 'k', status: 'cancelled' }]);
  assert.equal(rpujSent.canCancel, false);
  assert.equal(rpujSent.canRevise, false);
  // SO belum terkunci Finance: perilaku lama, keduanya boleh.
  assert.equal(mapped({}, ['received', 'cancelled']).canRevise, true);
  assert.equal(mapped({}, ['received', 'cancelled']).canCancel, true);
});

test('revisi Sales pada SO terkunci Finance dengan container cancelled tetap ditolak (aturan sebelum P1-4)', async () => {
  const lockedOrder = { id: 'so-1', accurateSoNumber: 'ACC-1', financeVerificationStatus: 'verified', containers: [{ status: 'received' }, { status: 'cancelled' }] };
  await assert.rejects(ensureSalesOrderStillSafeForSalesRevision(lockedOrder), { code: 'SALES_ORDER_ADVANCED_PROCESSING_LOCKED' });
  await assert.rejects(ensureSalesOrderStillSafeForSalesRevision(lockedOrder, { purpose: 'revise' }), { code: 'SALES_ORDER_ADVANCED_PROCESSING_LOCKED' });
  // purpose 'cancel' lolos pengecekan container dan lanjut ke pengaman Finance berbasis database
  // (di unit test tanpa DB terlihat sebagai DATABASE_NOT_CONFIGURED, bukan lock container).
  await assert.rejects(ensureSalesOrderStillSafeForSalesRevision(lockedOrder, { purpose: 'cancel' }), { code: 'DATABASE_NOT_CONFIGURED' });
});
