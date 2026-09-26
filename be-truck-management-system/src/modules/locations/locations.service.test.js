import assert from 'node:assert/strict';
import test from 'node:test';
import { canViewLocationSensitiveFields, toLocationApiItem } from './locations.service.js';

test('role sales tidak boleh lihat field sensitif lokasi, role lain boleh', () => {
  assert.equal(canViewLocationSensitiveFields('sales'), false);
  assert.equal(canViewLocationSensitiveFields('operational'), true);
  assert.equal(canViewLocationSensitiveFields('admin'), true);
  assert.equal(canViewLocationSensitiveFields('finance'), true);
  assert.equal(canViewLocationSensitiveFields('observer'), true);
});

test('toLocationApiItem menyembunyikan alamat dan maps untuk Sales', () => {
  const row = {
    id: 'loc-1',
    name: 'Gudang Cikarang',
    address: 'Jl. Industri No. 1',
    operational_status: 'Aktif',
    destination_id: 'destination-1',
    google_maps_url: 'https://maps.google.com/?q=-6.2,106.8',
    latitude: '-6.200000',
    longitude: '106.800000',
  };

  const salesView = toLocationApiItem(row, { includeSensitive: false });
  assert.deepEqual(salesView, {
    id: 'loc-1',
    name: 'Gudang Cikarang',
    status: 'Aktif',
    destinationId: 'destination-1',
  });
  assert.equal('address' in salesView, false);
  assert.equal('googleMapsUrl' in salesView, false);

  const opsView = toLocationApiItem(row, { includeSensitive: true });
  assert.deepEqual(opsView, {
    id: 'loc-1',
    name: 'Gudang Cikarang',
    status: 'Aktif',
    destinationId: 'destination-1',
    address: 'Jl. Industri No. 1',
    googleMapsUrl: 'https://maps.google.com/?q=-6.2,106.8',
    latitude: -6.2,
    longitude: 106.8,
  });
});

test('toLocationApiItem tanpa tujuan/maps tetap valid (data lama)', () => {
  const row = {
    id: 'loc-2',
    name: 'Gudang Lama',
    address: null,
    operational_status: 'Aktif',
    destination_id: null,
    google_maps_url: null,
    latitude: null,
    longitude: null,
  };

  const opsView = toLocationApiItem(row, { includeSensitive: true });
  assert.equal(opsView.destinationId, null);
  assert.equal(opsView.address, '');
  assert.equal(opsView.googleMapsUrl, '');
  assert.equal(opsView.latitude, null);
  assert.equal(opsView.longitude, null);
});
