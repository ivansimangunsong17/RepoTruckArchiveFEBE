import assert from 'node:assert/strict';
import test from 'node:test';

process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';
const { getUtilizationTripRows } = await import('./utilization-trips.repository.js');

test('utilization counts only original legs (released assignment); Repo pickup movements add no trips', async () => {
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
      ] };
    },
  });

  assert.deepEqual(params, ['2026-10-01', '2026-10-31', 'realtime']);
  assert.match(sql, /coalesce\(cj\.repo_released_vehicle_id, history\.previous_vehicle_id, cj\.vehicle_id\)/);
  assert.match(sql, /coalesce\(cj\.repo_released_driver_id, history\.previous_driver_id, cj\.driver_id\)/);
  // Repo pickup (single atau combo 2x20) tidak menambah utilisasi truck/sopir.
  assert.doesNotMatch(sql, /container_pickup_movements/);
  assert.doesNotMatch(sql, /container_pickup_items/);
  assert.deepEqual(rows.map((row) => [row.id, row.vehicleId, row.driverId]), [
    ['job:job-1', 'truck-a', 'driver-a'],
  ]);
});
