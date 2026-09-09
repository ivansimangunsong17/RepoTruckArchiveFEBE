import assert from 'node:assert/strict';
import test from 'node:test';

process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';

const {
  driverCommissionBatchAuditSnapshot,
  driverCommissionPaymentAuditSnapshot,
} = await import('./driver-commissions.controller.js');

test('audit snapshot batch komisi ringkas tanpa detail item container', () => {
  const snapshot = driverCommissionBatchAuditSnapshot({
    id: 'batch-1',
    periodStart: '2026-08-08',
    periodEnd: '2026-08-14',
    status: 'submitted',
    totalItems: 2,
    totalAmount: 125000,
    payments: [
      {
        id: 'payment-1',
        driverId: 'driver-1',
        driverName: 'Rahmat',
        status: 'pending',
        totalItems: 2,
        totalAmount: 125000,
        items: [
          { id: 'item-1', containerNumber: 'CONT-001', amount: 50000 },
        ],
      },
    ],
  });

  assert.equal(snapshot.id, 'batch-1');
  assert.equal(snapshot.payments.length, 1);
  assert.equal(snapshot.payments[0].driverName, 'Rahmat');
  assert.equal(snapshot.payments[0].items, undefined);
});

test('audit snapshot payment komisi hanya memuat batch ringkas dan payment terkait', () => {
  const snapshot = driverCommissionPaymentAuditSnapshot({
    id: 'batch-1',
    periodStart: '2026-08-08',
    periodEnd: '2026-08-14',
    status: 'approved',
    totalItems: 3,
    totalAmount: 175000,
    payments: [
      { id: 'payment-1', driverName: 'Rahmat', status: 'pending', totalItems: 2, totalAmount: 125000 },
      { id: 'payment-2', driverName: 'Jajam', status: 'paid', totalItems: 1, totalAmount: 50000 },
    ],
  }, 'payment-2');

  assert.deepEqual(snapshot.batch, {
    id: 'batch-1',
    periodStart: '2026-08-08',
    periodEnd: '2026-08-14',
    status: 'approved',
    totalItems: 3,
    totalAmount: 175000,
  });
  assert.equal(snapshot.payment.id, 'payment-2');
  assert.equal(snapshot.payment.driverName, 'Jajam');
});
