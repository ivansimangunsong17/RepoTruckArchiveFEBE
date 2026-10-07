import assert from 'node:assert/strict';
import test from 'node:test';

process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';
const { getUtilizationTripRows } = await import('./utilization-trips.repository.js');

test('utilization query reads one original leg and one row per pickup movement', async () => {
  let sql = '';
  let params = [];
  const rows = await getUtilizationTripRows({
    dateFrom: '2026-10-01', dateTo: '2026-10-31', entrySource: 'realtime',
  }, {
    query: async (statement, values) => {
      sql = statement;
      params = values;
      return { rows: [
        {
          id: 'job:job-1', job_id: 'job-1', trip_source: 'container_job',
          trip_date: '2026-10-01', vehicle_id: 'truck-a', driver_id: 'driver-a',
          plate_number: 'A', driver: 'Original Driver', container_number: 'CONT-A',
        },
        {
          id: 'repo:movement-1', movement_id: 'movement-1', trip_source: 'repo_pickup', status: 'completed',
          trip_date: '2026-10-02', vehicle_id: 'truck-c', driver_id: 'driver-c',
          plate_number: 'C', driver: 'Repo Driver', container_number: 'CONT-A, CONT-B',
        },
      ] };
    },
  });

  assert.deepEqual(params, ['2026-10-01', '2026-10-31', 'realtime']);
  assert.match(sql, /coalesce\(cj\.repo_released_vehicle_id, history\.previous_vehicle_id, cj\.vehicle_id\)/);
  assert.match(sql, /coalesce\(cj\.repo_released_driver_id, history\.previous_driver_id, cj\.driver_id\)/);
  assert.match(sql, /from container_pickup_movements cpm/);
  assert.match(sql, /join lateral \([\s\S]*from container_pickup_items cpi/);
  assert.match(sql, /where cpm\.status <> 'cancelled' and cpm\.started_at is not null/);
  assert.deepEqual(rows.map((row) => [row.id, row.vehicleId, row.driverId]), [
    ['job:job-1', 'truck-a', 'driver-a'],
    ['repo:movement-1', 'truck-c', 'driver-c'],
  ]);
  assert.equal(rows[1].containerNumber, 'CONT-A, CONT-B');
  assert.equal(rows[1].status, 'completed');
});
