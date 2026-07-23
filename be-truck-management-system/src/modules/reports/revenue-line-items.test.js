import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FINANCIAL_LINE_ITEM_CATEGORY,
  classifyRevenueLineItem,
  getTransportLineItemForSize,
  parseRevenueLineItems,
  splitFinancialLineItems,
  sumLineItems,
} from './revenue-line-items.js';

test('revenue line items membaca array JSON sales order', () => {
  const items = parseRevenueLineItems(JSON.stringify([
    { serviceName: 'Jasa Angkut D20', qty: 2, price: 1500000 },
    { serviceName: 'Jasa Lainnya', qty: 1, price: 250000, notes: 'Admin dokumen' },
  ]));

  assert.equal(items.length, 2);
  assert.equal(items[0].total, 3000000);
  assert.equal(items[1].total, 250000);
});

test('jasa angkut D20 dan D40 masuk kategori transport revenue', () => {
  const item20 = classifyRevenueLineItem({ serviceName: 'Jasa Angkut D20', qty: 1, price: 1500000 });
  const item40 = classifyRevenueLineItem({ serviceName: 'Jasa Angkut D40', qty: 1, price: 2500000 });

  assert.equal(item20.financialCategory, FINANCIAL_LINE_ITEM_CATEGORY.TRANSPORT);
  assert.equal(item20.containerSize, '20FT');
  assert.equal(item20.isTransportRevenue, true);
  assert.equal(item40.financialCategory, FINANCIAL_LINE_ITEM_CATEGORY.TRANSPORT);
  assert.equal(item40.containerSize, '40FT');
  assert.equal(item40.isTransportRevenue, true);
});

test('jasa non-container masuk reimbursement dan bukan revenue', () => {
  const reimbursementServices = [
    'Bon Muat/Bongkar',
    'Tila/Gatepass',
    'Jasa Handling',
    'Jasa Lainnya',
  ];

  reimbursementServices.forEach((serviceName) => {
    const item = classifyRevenueLineItem({ serviceName, qty: 1, price: 100000 });
    assert.equal(item.financialCategory, FINANCIAL_LINE_ITEM_CATEGORY.REIMBURSEMENT);
    assert.equal(item.isTransportRevenue, false);
    assert.equal(item.isReimbursement, true);
  });
});

test('split financial line items memisahkan revenue transport, reimbursement, dan unknown', () => {
  const result = splitFinancialLineItems([
    { serviceName: 'Jasa Angkut D20', qty: 1, price: 1500000 },
    { serviceName: 'Jasa Lainnya', qty: 1, price: 500000 },
    { serviceName: 'Biaya Tak Terdaftar', qty: 1, price: 100000 },
  ]);

  assert.equal(result.transportItems.length, 1);
  assert.equal(result.reimbursementItems.length, 1);
  assert.equal(result.unknownItems.length, 1);
});

test('get transport line item memilih jasa angkut sesuai ukuran container', () => {
  const items = [
    { serviceName: 'Jasa Angkut D20', qty: 2, price: 1500000 },
    { serviceName: 'Jasa Angkut D40', qty: 1, price: 2500000 },
    { serviceName: 'Jasa Lainnya', qty: 1, price: 300000 },
  ];

  assert.equal(getTransportLineItemForSize(items, '20FT')?.price, 1500000);
  assert.equal(getTransportLineItemForSize(items, '40FT')?.price, 2500000);
});

test('sum line items hanya menjumlah item yang diberikan', () => {
  const { transportItems, reimbursementItems } = splitFinancialLineItems([
    { serviceName: 'Jasa Angkut D20', qty: 1, price: 1500000 },
    { serviceName: 'Jasa Lainnya', qty: 1, price: 300000 },
  ]);

  assert.equal(sumLineItems(transportItems), 1500000);
  assert.equal(sumLineItems(reimbursementItems), 300000);
});
