import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hasContainerSentRpuj,
  isSalesOrderLockedByFinanceNumber,
  isSalesOrderLockedByRpuj,
} from './sales-orders.rpuj-lock.js';

test('mengunci SO setelah RPUJ diajukan ke Finance', () => {
  assert.equal(isSalesOrderLockedByRpuj({
    containers: [{ rpujStatus: 'submitted', rpujRequestedAt: '2026-07-20T08:00:00.000Z' }],
  }), true);
});

test('tetap mengunci SO ketika RPUJ sudah approve, dibayar, atau pernah ditolak', () => {
  ['approved', 'paid', 'rejected'].forEach((rpujStatus) => {
    assert.equal(hasContainerSentRpuj({ rpujStatus }), true);
  });
});

test('tidak mengunci SO selama seluruh RPUJ masih pending', () => {
  assert.equal(isSalesOrderLockedByRpuj({
    containers: [{ rpujStatus: 'pending', rpujRequestedAt: null }],
  }), false);
});

test('mengunci SO untuk Sales setelah nomor SO Accurate terisi', () => {
  assert.equal(isSalesOrderLockedByFinanceNumber({ accurateSoNumber: '26/080/ARM/00054' }), true);
});

test('mengunci SO untuk Sales setelah status Finance verified', () => {
  assert.equal(isSalesOrderLockedByFinanceNumber({ financeVerificationStatus: 'verified' }), true);
});

test('tidak mengunci SO Finance ketika masih menunggu nomor SO Accurate', () => {
  assert.equal(isSalesOrderLockedByFinanceNumber({ soNumber: '', accurateSoNumber: '', financeVerificationStatus: 'pending_so' }), false);
});

test('nomor internal tidak mengunci sales order seperti nomor SO Accurate', () => {
  assert.equal(isSalesOrderLockedByFinanceNumber({
    soNumber: 'SO-ARM-202608-0001',
    accurateSoNumber: '',
    financeVerificationStatus: 'pending_so',
  }), false);
});
