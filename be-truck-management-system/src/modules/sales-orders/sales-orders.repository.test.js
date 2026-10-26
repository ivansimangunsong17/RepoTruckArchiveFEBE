import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPendingJobLocationPatch,
  refreshOrderStatus,
  validateLocationSelection,
} from './sales-orders.repository.js';

// Client palsu: query pertama mengembalikan hitungan status job, query kedua (update) direkam.
function createStatusClient(jobStatusCounts) {
  const updates = [];
  return {
    updates,
    async query(sql, params) {
      if (/^\s*select status, count\(\*\)/.test(sql)) {
        return { rows: Object.entries(jobStatusCounts).map(([status, total]) => ({ status, total })) };
      }
      if (/^\s*update sales_orders set status/.test(sql)) {
        updates.push({ status: params[0], salesOrderId: params[1] });
        return { rows: [] };
      }
      throw new Error(`Query tidak terduga: ${sql}`);
    },
  };
}

async function resolveOrderStatus(jobStatusCounts) {
  const client = createStatusClient(jobStatusCounts);
  await refreshOrderStatus(client, 'so-1');
  assert.equal(client.updates.length, 1);
  assert.equal(client.updates[0].salesOrderId, 'so-1');
  return client.updates[0].status;
}

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

test('regresi: edit SO running dengan job inap tidak menurunkan status ke waiting_operational', async () => {
  assert.equal(await resolveOrderStatus({ inap: 1 }), 'running');
  assert.equal(await resolveOrderStatus({ inap: 2 }), 'running');
});

test('status SO dari job running, inap, completed, dan cancelled', async () => {
  assert.equal(await resolveOrderStatus({ running: 1 }), 'running');
  assert.equal(await resolveOrderStatus({ running: 1, inap: 1 }), 'running');
  assert.equal(await resolveOrderStatus({ inap: 1, received: 1 }), 'running');
  assert.equal(await resolveOrderStatus({ inap: 1, completed: 1 }), 'running');
  assert.equal(await resolveOrderStatus({ inap: 1, cancelled: 1 }), 'running');
  assert.equal(await resolveOrderStatus({ completed: 2 }), 'completed');
  assert.equal(await resolveOrderStatus({ completed: 1, cancelled: 1 }), 'completed');
  assert.equal(await resolveOrderStatus({ cancelled: 2 }), 'cancelled');
});

test('aturan status SO lain tidak berubah', async () => {
  assert.equal(await resolveOrderStatus({}), 'waiting_operational');
  assert.equal(await resolveOrderStatus({ received: 2 }), 'waiting_operational');
  assert.equal(await resolveOrderStatus({ received: 1, cancelled: 1 }), 'waiting_operational');
  assert.equal(await resolveOrderStatus({ repo_stored: 1 }), 'running');
  assert.equal(await resolveOrderStatus({ received: 1, completed: 1 }), 'running');
});

test('Admin Correction yang menghapus job received tetap mempertahankan SO running dengan job inap', async () => {
  // Setelah koreksi, job received dihapus (reconcileSalesOrderContainers) dan yang tersisa hanya job
  // inap + job cancelled -- order masih berjalan di lapangan.
  assert.equal(await resolveOrderStatus({ inap: 1, cancelled: 1 }), 'running');
  // Koreksi yang membatalkan semua job lain sementara satu job masih inap juga tetap running.
  assert.equal(await resolveOrderStatus({ inap: 1, cancelled: 3 }), 'running');
});
