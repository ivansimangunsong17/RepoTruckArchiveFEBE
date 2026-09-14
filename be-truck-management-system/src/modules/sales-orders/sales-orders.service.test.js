import assert from 'node:assert/strict';
import test from 'node:test';
import { saveSalesOrder } from './sales-orders.service.js';

test('sales order menolak harga container D20/D40 kosong atau nol', async () => {
  await assert.rejects(
    () => saveSalesOrder({
      customer: 'PT Armada Test',
      origin: 'Tanjung Priok',
      destination: 'Cikarang',
      lineItems: [
        { serviceName: 'Jasa Angkut D20', containerType: 'Dry', qty: 1, price: 0 },
      ],
    }, null, { role: 'sales', name: 'Sales Test', sub: 'sales-test' }),
    (error) => {
      assert.equal(error.statusCode, 400);
      assert.equal(error.code, 'VALIDATION_ERROR');
      assert.equal(error.message, 'Harga container D20/D40 wajib diisi lebih dari 0.');
      return true;
    },
  );
});

test('status order vendor (Phase 4) hanya boleh Dicatat/Selesai, bukan status ritasi', async () => {
  await assert.rejects(
    () => saveSalesOrder({
      customer: 'PT Vendor Test',
      origin: 'Tanjung Priok',
      destination: 'Cikarang',
      isVendorOrder: true,
      status: 'running',
      lineItems: [
        { serviceName: 'Jasa Angkut D20', containerType: 'Dry', qty: 1, price: 1000000 },
      ],
    }, null, { role: 'sales', name: 'Sales Test', sub: 'sales-test' }),
    (error) => {
      assert.equal(error.statusCode, 400);
      assert.equal(error.code, 'VALIDATION_ERROR');
      assert.equal(error.message, 'Status order vendor hanya boleh Dicatat atau Selesai. Gunakan menu batalkan untuk membatalkan order.');
      return true;
    },
  );
});
