import assert from 'node:assert/strict';
import test from 'node:test';

import {
  analyzeOrder,
  readArgs,
  summarize,
} from './audit-revenue-line-items.js';

function issueCodes(result) {
  return result.issues.map((issue) => issue.code).sort();
}

test('audit revenue membaca argumen json, all, dan limit', () => {
  assert.deepEqual(readArgs(['--json', '--all']), { json: true, limit: 0 });
  assert.deepEqual(readArgs(['--limit', '7']), { json: false, limit: 7 });
  assert.deepEqual(readArgs(['--limit=3']), { json: false, limit: 3 });
});

test('audit revenue menandai SO bersih dengan jasa angkut dan reimbursement valid', () => {
  const result = analyzeOrder({
    id: 'so-1',
    so_number: 'SO-CLEAN',
    customer_name: 'Customer Clean',
    total_amount: 1750000,
    completed_jobs: 1,
    cancelled_jobs: 0,
    line_items: [
      { serviceName: 'Jasa Angkut D20', qty: 1, price: 1500000 },
      { serviceName: 'Jasa Lainnya', qty: 1, price: 250000 },
    ],
  }, true);

  assert.equal(result.transportTotal, 1500000);
  assert.equal(result.reimbursementTotal, 250000);
  assert.deepEqual(result.issues, []);
});

test('audit revenue menangkap total SO yang tidak sama dengan rincian line items', () => {
  const result = analyzeOrder({
    id: 'so-2',
    so_number: 'SO-MISMATCH',
    customer_name: 'Customer Mismatch',
    total_amount: 3000000,
    completed_jobs: 1,
    line_items: [
      { serviceName: 'Jasa Angkut D20', qty: 1, price: 1500000 },
      { serviceName: 'Jasa Lainnya', qty: 1, price: 250000 },
    ],
  }, true);

  assert.equal(issueCodes(result).includes('TOTAL_AMOUNT_MISMATCH'), true);
  assert.equal(result.issues.find((issue) => issue.code === 'TOTAL_AMOUNT_MISMATCH')?.severity, 'critical');
});

test('audit revenue menolak job selesai yang hanya punya reimbursement tanpa jasa angkut', () => {
  const result = analyzeOrder({
    id: 'so-3',
    so_number: 'SO-ONLY-REIMB',
    customer_name: 'Customer Reimb',
    total_amount: 500000,
    completed_jobs: 1,
    line_items: [
      { serviceName: 'Jasa Lainnya', qty: 1, price: 500000 },
    ],
  }, true);

  assert.deepEqual(issueCodes(result), ['TRANSPORT_REVENUE_MISSING']);
});

test('audit revenue memberi warning untuk service yang belum dimapping', () => {
  const result = analyzeOrder({
    id: 'so-4',
    so_number: 'SO-UNKNOWN',
    customer_name: 'Customer Unknown',
    total_amount: 1600000,
    completed_jobs: 1,
    line_items: [
      { serviceName: 'Jasa Angkut D20', qty: 1, price: 1500000 },
      { serviceName: 'Biaya Tambahan Baru', qty: 1, price: 100000 },
    ],
  }, true);

  assert.equal(issueCodes(result).includes('UNKNOWN_SERVICE'), true);
  assert.equal(result.issues.find((issue) => issue.code === 'UNKNOWN_SERVICE')?.severity, 'warning');
});

test('audit revenue menandai data legacy dengan container batal sebagai critical', () => {
  const result = analyzeOrder({
    id: 'so-5',
    so_number: 'SO-LEGACY-CANCELLED',
    customer_name: 'Customer Legacy',
    total_amount: 3000000,
    completed_jobs: 1,
    cancelled_jobs: 1,
    line_items: [],
  }, true);

  assert.deepEqual(issueCodes(result), [
    'CANCELLED_JOB_WITH_LEGACY_AMOUNT',
    'LEGACY_REVENUE_FALLBACK',
    'LINE_ITEMS_EMPTY',
  ]);
});

test('audit revenue merangkum jumlah issue dan total nominal', () => {
  const clean = analyzeOrder({
    id: 'so-6',
    so_number: 'SO-SUMMARY-CLEAN',
    total_amount: 1750000,
    completed_jobs: 1,
    line_items: [
      { serviceName: 'Jasa Angkut D20', qty: 1, price: 1500000 },
      { serviceName: 'Jasa Lainnya', qty: 1, price: 250000 },
    ],
  }, true);
  const mismatch = analyzeOrder({
    id: 'so-7',
    so_number: 'SO-SUMMARY-MISMATCH',
    total_amount: 2000000,
    completed_jobs: 1,
    line_items: [
      { serviceName: 'Jasa Angkut D20', qty: 1, price: 1500000 },
    ],
  }, true);

  const summary = summarize([clean, mismatch], true);

  assert.equal(summary.totalOrders, 2);
  assert.equal(summary.cleanOrders, 1);
  assert.equal(summary.ordersWithIssues, 1);
  assert.equal(summary.criticalOrders, 1);
  assert.equal(summary.totalTransportRevenue, 3000000);
  assert.equal(summary.totalReimbursement, 250000);
  assert.deepEqual(summary.issueCounts, { TOTAL_AMOUNT_MISMATCH: 1 });
});
