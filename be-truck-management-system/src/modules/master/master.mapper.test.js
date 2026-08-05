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

test('driver mapper membaca dan menyimpan nama panggilan', () => {
  const mapped = resourceConfig.drivers.toApi({
    id: 'driver-1',
    name: 'Sopir Contoh',
    nickname: 'Sopir',
  });
  assert.equal(mapped.nickname, 'Sopir');

  const databaseRow = resourceConfig.drivers.toDb({
    name: 'Sopir Contoh',
    nickname: 'Sopir',
  });
  assert.equal(databaseRow.nickname, 'Sopir');
});

test('truck mapper menyimpan nomor KIR baru saat ada nilai lama', () => {
  const databaseRow = resourceConfig.trucks.toDb({
    plateNumber: 'B 1234 XYZ',
    kirNumber: 'KIR-BARU',
    kirHeadNumber: 'KIR-LAMA',
  });

  assert.equal(databaseRow.kir_number, 'KIR-BARU');
  assert.equal(databaseRow.kir_head_number, 'KIR-BARU');
});

test('truck mapper membaca dan menyimpan barcode solar', () => {
  const document = { name: 'Barcode Solar.pdf', path: 'attachment-1' };
  const mapped = resourceConfig.trucks.toApi({
    id: 'truck-1',
    plate_number: 'B 1234 XYZ',
    solar_barcode_number: 'SOLAR-001',
    solar_barcode_date: '2026-08-05',
    solar_barcode_document: document,
  });

  assert.equal(mapped.solarBarcodeNumber, 'SOLAR-001');
  assert.equal(mapped.solarBarcodeDate, '2026-08-05');
  assert.deepEqual(mapped.solarBarcodeDocument, document);

  const databaseRow = resourceConfig.trucks.toDb({
    plateNumber: 'B 1234 XYZ',
    solarBarcodeNumber: 'SOLAR-002',
    solarBarcodeDate: '2026-08-06',
    solarBarcodeDocument: document,
  });

  assert.equal(databaseRow.solar_barcode_number, 'SOLAR-002');
  assert.equal(databaseRow.solar_barcode_date, '2026-08-06');
  assert.deepEqual(databaseRow.solar_barcode_document, document);
});
