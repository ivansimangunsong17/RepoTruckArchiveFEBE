// Koreksi Admin (ganti sopir job selesai + "Pindahkan komisi") pada job Ambil Titip: komisi tidak
// boleh dipindahkan ke sopir pickup (B); sopir lain dan aksi "tetap" tidak terpengaruh. Tanpa database.
import assert from 'node:assert/strict';
import test from 'node:test';

process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';
const { resolveCompletedCommissionDriverCorrection } = await import('./container-jobs.repository.js');

function fakeClient() {
  return {
    async query(sql) {
      if (sql.includes('from container_job_assignment_history')) {
        return { rows: [{ previous_driver_id: 'drv-a', previous_plate_number: 'B 1 AA', next_driver_id: 'drv-b' }] };
      }
      if (sql.includes('from container_pickup_items')) return { rows: [{ driver_id: 'drv-b' }] };
      if (sql.includes('from vehicles')) return { rows: [{ plate_number: 'B 1 AA' }] };
      if (sql.includes('from driver_commission_items')) return { rows: [] };
      throw new Error(`Query tidak terduga: ${sql}`);
    },
  };
}

const pickedUpJob = {
  id: 'job-1',
  repo_picked_up_at: '2026-10-20T02:00:00.000Z',
  repo_released_driver_id: 'drv-a',
  repo_released_vehicle_id: 'veh-a',
  driver_id: 'drv-b',
  commission_driver_id: 'drv-a',
  commission_driver_name: 'Sopir A',
  commission_driver_snapshot: { driver: 'Sopir A' },
  assignment_snapshot: { driver: 'Sopir B', plateNumber: 'B 2 BB' },
};

test('job Ambil Titip: komisi tidak bisa dipindahkan ke sopir pickup B', async () => {
  await assert.rejects(
    resolveCompletedCommissionDriverCorrection(fakeClient(), {
      job: pickedUpJob, action: 'move', driverId: 'drv-b', assignment: { driver: 'Sopir B' }, actorName: 'Admin',
    }),
    { code: 'COMMISSION_RECIPIENT_IS_REPO_PICKUP_DRIVER' },
  );
});

test('job Ambil Titip: pindah ke sopir lain dan aksi tetap tidak terhalang', async () => {
  const moved = await resolveCompletedCommissionDriverCorrection(fakeClient(), {
    job: pickedUpJob, action: 'move', driverId: 'drv-c', assignment: { driver: 'Sopir C' }, actorName: 'Admin',
  });
  assert.equal(moved.driverId, 'drv-c');
  const kept = await resolveCompletedCommissionDriverCorrection(fakeClient(), {
    job: pickedUpJob, action: 'keep', driverId: 'drv-c', assignment: { driver: 'Sopir C' }, actorName: 'Admin',
  });
  assert.deepEqual([kept.driverId, kept.driverName], ['drv-a', 'Sopir A']);
});

test('job tanpa Ambil Titip: perilaku koreksi lama tidak berubah', async () => {
  const moved = await resolveCompletedCommissionDriverCorrection(fakeClient(), {
    job: { ...pickedUpJob, repo_picked_up_at: null }, action: 'move', driverId: 'drv-b', assignment: { driver: 'Sopir B' }, actorName: 'Admin',
  });
  assert.equal(moved.driverId, 'drv-b');
});
