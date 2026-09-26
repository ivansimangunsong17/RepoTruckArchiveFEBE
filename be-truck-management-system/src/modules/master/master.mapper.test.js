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

test('destination mapper membaca dan menyimpan komisi sopir', () => {
  const mapped = resourceConfig.destinations.toApi({
    id: 'destination-1',
    name: 'Cikarang',
    driver_commission_amount: '50000',
    driver_commission_20ft_amount: '45000',
    driver_commission_40ft_amount: '75000',
  });

  assert.equal(mapped.driverCommissionAmount, 50000);
  assert.equal(mapped.driverCommission20ftAmount, 45000);
  assert.equal(mapped.driverCommission40ftAmount, 75000);

  const databaseRow = resourceConfig.destinations.toDb({
    name: 'Cikarang',
    driverCommission20ftAmount: '50000',
    driverCommission40ftAmount: '80000',
  });

  assert.equal(databaseRow.driver_commission_amount, 0);
  assert.equal(databaseRow.driver_commission_20ft_amount, 50000);
  assert.equal(databaseRow.driver_commission_40ft_amount, 80000);
});

test('end user mapper membaca dan menyimpan data kontak', () => {
  const mapped = resourceConfig['end-users'].toApi({
    id: 'end-user-1',
    name: 'PT Penerima Akhir',
    code: 'EU-001',
    address: 'Cikarang',
    pic_name: 'Budi',
    phone: '08123456789',
    email: 'budi@example.com',
    operational_status: 'Aktif',
    notes: 'Prioritas',
  });

  assert.deepEqual(mapped, {
    id: 'end-user-1',
    name: 'PT Penerima Akhir',
    code: 'EU-001',
    address: 'Cikarang',
    pic: 'Budi',
    phone: '08123456789',
    email: 'budi@example.com',
    status: 'Aktif',
    notes: 'Prioritas',
    destinationId: null,
    googleMapsUrl: '',
    latitude: null,
    longitude: null,
  });

  const databaseRow = resourceConfig['end-users'].toDb({
    name: 'PT Penerima Akhir',
    code: 'EU-001',
    address: 'Cikarang',
    pic: 'Budi',
    phone: '08123456789',
    email: 'budi@example.com',
    status: 'Tidak Aktif',
    notes: 'Hold',
  });

  assert.equal(databaseRow.name, 'PT Penerima Akhir');
  assert.equal(databaseRow.code, 'EU-001');
  assert.equal(databaseRow.pic_name, 'Budi');
  assert.equal(databaseRow.operational_status, 'Tidak Aktif');
  assert.equal(databaseRow.destination_id, null);
  assert.equal(databaseRow.google_maps_url, null);
  assert.equal(databaseRow.latitude, null);
  assert.equal(databaseRow.longitude, null);
});

test('end user mapper membaca dan menyimpan tujuan serta lokasi maps (Phase 2)', () => {
  const mapped = resourceConfig['end-users'].toApi({
    id: 'end-user-2',
    name: 'Gudang Cikarang',
    destination_id: 'destination-1',
    google_maps_url: 'https://maps.google.com/?q=-6.123,107.456',
    latitude: '-6.123000',
    longitude: '107.456000',
  });

  assert.equal(mapped.destinationId, 'destination-1');
  assert.equal(mapped.googleMapsUrl, 'https://maps.google.com/?q=-6.123,107.456');
  assert.equal(mapped.latitude, -6.123);
  assert.equal(mapped.longitude, 107.456);

  const databaseRow = resourceConfig['end-users'].toDb({
    name: 'Gudang Cikarang',
    destinationId: 'destination-1',
    googleMapsUrl: 'https://maps.google.com/?q=-6.123,107.456',
    latitude: '-6.123',
    longitude: '107.456',
  });

  assert.equal(databaseRow.destination_id, 'destination-1');
  assert.equal(databaseRow.google_maps_url, 'https://maps.google.com/?q=-6.123,107.456');
  assert.equal(databaseRow.latitude, -6.123);
  assert.equal(databaseRow.longitude, 107.456);

  const clearedRow = resourceConfig['end-users'].toDb({
    name: 'Gudang Cikarang',
    destinationId: '',
    googleMapsUrl: '',
    latitude: '',
    longitude: '',
  });

  assert.equal(clearedRow.destination_id, null);
  assert.equal(clearedRow.google_maps_url, null);
  assert.equal(clearedRow.latitude, null);
  assert.equal(clearedRow.longitude, null);
});
