import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPendingJobLocationPatch,
  validateLocationSelection,
} from './sales-orders.repository.js';

test('lokasi transaksi wajib aktif dan terhubung ke tujuan yang dipilih', () => {
  assert.doesNotThrow(() => validateLocationSelection(
    { id: 'loc-1', operational_status: 'Aktif', destination_id: 'dest-1' },
    { id: 'dest-1' },
    'loc-1',
  ));
  assert.throws(
    () => validateLocationSelection(
      { id: 'loc-1', operational_status: 'Tidak Aktif', destination_id: 'dest-1' },
      { id: 'dest-1' },
      'loc-1',
    ),
    { code: 'WAREHOUSE_LOCATION_INACTIVE' },
  );
  assert.throws(
    () => validateLocationSelection(
      { id: 'loc-1', operational_status: 'Aktif', destination_id: 'dest-2' },
      { id: 'dest-1' },
      'loc-1',
    ),
    { code: 'WAREHOUSE_LOCATION_DESTINATION_MISMATCH' },
  );
});

test('perubahan lokasi SO hanya diteruskan ke job yang masih received', () => {
  const payload = {
    warehouse_location_id: 'loc-1',
    warehouse_location_name_snapshot: 'Gudang A',
    warehouse_location_address_snapshot: 'Jl. Industri',
    destination_id: 'dest-1',
  };
  assert.deepEqual(buildPendingJobLocationPatch('received', true, payload), payload);
  assert.deepEqual(buildPendingJobLocationPatch('running', true, payload), {});
  assert.deepEqual(buildPendingJobLocationPatch('completed', true, payload), {});
  assert.deepEqual(buildPendingJobLocationPatch('received', false, payload), {});
});
