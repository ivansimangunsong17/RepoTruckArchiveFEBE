import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRequiredFinancePermission } from './attachments.controller.js';

test('mewajibkan izin finance untuk bukti transfer dan pembayaran keuangan', () => {
  assert.equal(
    resolveRequiredFinancePermission({ entityType: 'operational_fund_transaction', category: 'transferProof' }),
    'finance.operational_fund.read',
  );
  assert.equal(
    resolveRequiredFinancePermission({ entityType: 'operational_fund_request', category: 'transferProof' }),
    'finance.operational_fund.read',
  );
  assert.equal(
    resolveRequiredFinancePermission({ entityType: 'operational_fund_batch', category: 'anything' }),
    'finance.operational_fund.read',
  );
  assert.equal(
    resolveRequiredFinancePermission({ entityType: 'driver_commission_payment', category: 'driverCommissionTransferProof' }),
    'finance.read',
  );
  assert.equal(
    resolveRequiredFinancePermission({ entityType: 'driver_commission_batch', category: 'anything' }),
    'finance.read',
  );
  assert.equal(
    resolveRequiredFinancePermission({ entityType: 'finance_correction_request', category: 'anything' }),
    'finance.correction.read',
  );
});

test('mewajibkan izin finance untuk bukti pembayaran biaya container job secara spesifik', () => {
  assert.equal(
    resolveRequiredFinancePermission({ entityType: 'container_job', category: 'expensePaymentProof' }),
    'finance.operational_fund.read',
  );
});

test('tidak membatasi dokumen operasional container job yang lain', () => {
  assert.equal(resolveRequiredFinancePermission({ entityType: 'container_job', category: 'eirDocument' }), null);
  assert.equal(resolveRequiredFinancePermission({ entityType: 'container_job', category: 'spkDocument' }), null);
  assert.equal(resolveRequiredFinancePermission({ entityType: 'container_job', category: 'travelDocumentFile' }), null);
});

test('tidak membatasi entity type lain di luar domain finance', () => {
  assert.equal(resolveRequiredFinancePermission({ entityType: 'sales_order', category: 'deliveryOrder' }), null);
  assert.equal(resolveRequiredFinancePermission({ entityType: 'driver', category: 'identityDocument' }), null);
  assert.equal(resolveRequiredFinancePermission({ entityType: 'vehicle', category: 'stnk' }), null);
  assert.equal(resolveRequiredFinancePermission({ entityType: 'chassis', category: 'kirDocument' }), null);
  assert.equal(resolveRequiredFinancePermission({ entityType: 'customer', category: 'contract' }), null);
});
