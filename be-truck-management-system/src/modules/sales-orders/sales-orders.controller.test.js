import assert from 'node:assert/strict';
import test from 'node:test';
import { locationAuditChanges } from './sales-orders.controller.js';

test('Phase 8: locationAuditChanges mendeteksi lokasi dipilih (dari kosong ke terisi)', () => {
  assert.deepEqual(
    locationAuditChanges(
      { warehouseLocationId: null, warehouseLocationNameSnapshot: '', destination: 'Cikarang' },
      { warehouseLocationId: 'location-1', warehouseLocationNameSnapshot: 'Gudang Cikarang', destination: 'Cikarang' },
    ),
    [
      {
        field: 'warehouseLocationId',
        changeType: 'selected',
        before: null,
        beforeName: '',
        after: 'location-1',
        afterName: 'Gudang Cikarang',
      },
    ],
  );
});

test('Phase 8: locationAuditChanges mendeteksi lokasi diganti (antar lokasi berbeda)', () => {
  assert.deepEqual(
    locationAuditChanges(
      { warehouseLocationId: 'location-1', warehouseLocationNameSnapshot: 'Gudang A', destination: 'Cikarang' },
      { warehouseLocationId: 'location-2', warehouseLocationNameSnapshot: 'Gudang B', destination: 'Cikarang' },
    ),
    [
      {
        field: 'warehouseLocationId',
        changeType: 'changed',
        before: 'location-1',
        beforeName: 'Gudang A',
        after: 'location-2',
        afterName: 'Gudang B',
      },
    ],
  );
});

test('Phase 8: locationAuditChanges mendeteksi lokasi dikosongkan', () => {
  assert.deepEqual(
    locationAuditChanges(
      { warehouseLocationId: 'location-1', warehouseLocationNameSnapshot: 'Gudang A', destination: 'Cikarang' },
      { warehouseLocationId: null, warehouseLocationNameSnapshot: '', destination: 'Cikarang' },
    ),
    [
      {
        field: 'warehouseLocationId',
        changeType: 'cleared',
        before: 'location-1',
        beforeName: 'Gudang A',
        after: null,
        afterName: '',
      },
    ],
  );
});

test('Phase 8: locationAuditChanges mendeteksi tujuan diganti secara independen dari lokasi', () => {
  assert.deepEqual(
    locationAuditChanges(
      { warehouseLocationId: null, destination: 'Cikarang' },
      { warehouseLocationId: null, destination: 'Bekasi' },
    ),
    [
      { field: 'destination', changeType: 'destination_changed', before: 'Cikarang', after: 'Bekasi' },
    ],
  );
});

test('Phase 8: locationAuditChanges bisa mencatat lokasi DAN tujuan berubah sekaligus dalam satu edit', () => {
  const changes = locationAuditChanges(
    { warehouseLocationId: 'location-1', warehouseLocationNameSnapshot: 'Gudang Cikarang', destination: 'Cikarang' },
    { warehouseLocationId: null, warehouseLocationNameSnapshot: '', destination: 'Bekasi' },
  );

  assert.equal(changes.length, 2);
  assert.ok(changes.some((item) => item.field === 'warehouseLocationId' && item.changeType === 'cleared'));
  assert.ok(changes.some((item) => item.field === 'destination' && item.changeType === 'destination_changed'));
});

test('Phase 8: locationAuditChanges kosong kalau lokasi dan tujuan sama sekali tidak berubah', () => {
  assert.deepEqual(
    locationAuditChanges(
      { warehouseLocationId: 'location-1', warehouseLocationNameSnapshot: 'Gudang Cikarang', destination: 'Cikarang' },
      { warehouseLocationId: 'location-1', warehouseLocationNameSnapshot: 'Gudang Cikarang', destination: 'Cikarang' },
    ),
    [],
  );
});

test('Phase 8: locationAuditChanges kosong kalau lokasi tetap kosong (data lama tanpa lokasi diedit untuk alasan lain)', () => {
  assert.deepEqual(
    locationAuditChanges(
      { warehouseLocationId: null, destination: 'Cikarang' },
      { warehouseLocationId: null, destination: 'Cikarang' },
    ),
    [],
  );
});
