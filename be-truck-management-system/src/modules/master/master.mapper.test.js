import assert from 'node:assert/strict';
import test from 'node:test';
import { resourceConfig } from './master.mapper.js';

test('customer mapper membaca dan menyimpan nama sales', () => {
  const mapped = resourceConfig.customers.toApi({
    id: 'customer-1',
    name: 'PT Contoh',
    sales_name: 'Sales Armada 01',
  });
  assert.equal(mapped.salesName, 'Sales Armada 01');

  const databaseRow = resourceConfig.customers.toDb({
    name: 'PT Contoh',
    salesName: 'Sales Armada 02',
  });
  assert.equal(databaseRow.sales_name, 'Sales Armada 02');
});

test('driver mapper membaca dan menyimpan tanggal lahir', () => {
  const mapped = resourceConfig.drivers.toApi({
    id: 'driver-1',
    name: 'Sopir Contoh',
    birth_date: '1988-04-12',
  });
  assert.equal(mapped.birthDate, '1988-04-12');

  const databaseRow = resourceConfig.drivers.toDb({
    name: 'Sopir Contoh',
    birthDate: '1988-04-12',
  });
  assert.equal(databaseRow.birth_date, '1988-04-12');
});
