import assert from 'node:assert/strict';
import test from 'node:test';

process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';
const { getDriverPerformanceReport } = await import('./reports.repository.js');

const revenueJob = (id, driverId, driver, price) => ({
  id, driver_id: driverId, driver_master_name: driver, driver,
  price, total_amount: price, total_containers: 1, container_size: '20FT',
});
const trip = (id, driverId, driver, date, source = 'container_job') => ({
  id, trip_source: source, status: 'completed', trip_date: date,
  vehicle_id: 'truck-1', driver_id: driverId, driver,
});

function reportDb({ revenue = {}, commissions = {}, trips = {} } = {}) {
  const statements = [];
  return {
    statements,
    async query(sql, params = []) {
      statements.push(sql);
      const period = params.find((value) => /^\d{4}-\d{2}(?:-\d{2})?$/.test(String(value)));
      const month = period ? String(period).slice(0, 7) : 'all';
      if (sql.includes('from transport_jobs cj')) return { rows: revenue[month] || [] };
      if (sql.includes('from completed_jobs cj')) return { rows: commissions[month] || [] };
      if (sql.includes('with physical_trips as')) return { rows: trips[month] || [] };
      if (sql.includes('select distinct value from')) return { rows: [] };
      throw new Error('Unexpected Driver Performance query');
    },
  };
}

test('normal completed transport revenue keeps its current driver and completed month', async () => {
  const db = reportDb({
    revenue: { '2026-10': [revenueJob('normal', 'driver-a', 'Driver A', 1000000)] },
    commissions: { '2026-10': [{ ...revenueJob('normal', 'driver-a', 'Driver A', 1000000), has_driver_commission: true, driver_commission_amount: 50000 }] },
    trips: { '2026-10': [trip('job:normal', 'driver-a', 'Driver A', '2026-10-03')] },
  });
  const result = await getDriverPerformanceReport({ month: '2026-10' }, db);
  assert.deepEqual([result.rows[0].driverId, result.rows[0].totalTrips, result.rows[0].totalRevenue,
    result.rows[0].totalDriverCommission], ['driver-a', 1, 1000000, 50000]);
});

test('Repo transport stays with original drivers in storage month; Repo trip has no inherited revenue', async () => {
  const db = reportDb({
    revenue: { '2026-09': [
      revenueJob('single', 'driver-a', 'Driver A', 1000000),
      revenueJob('combo-1', 'driver-x', 'Driver X', 1200000),
      revenueJob('combo-2', 'driver-y', 'Driver Y', 1300000),
    ] },
    commissions: { '2026-10': [
      { ...revenueJob('single', 'driver-b', 'Driver B', 1000000), has_driver_commission: true, driver_commission_amount: 50000 },
    ] },
    trips: {
      '2026-09': [trip('job:single', 'driver-a', 'Driver A', '2026-09-30'),
        trip('job:combo-1', 'driver-x', 'Driver X', '2026-09-30'),
        trip('job:combo-2', 'driver-y', 'Driver Y', '2026-09-30')],
      '2026-10': [trip('repo:single', 'driver-b', 'Driver B', '2026-10-02', 'repo_pickup'),
        trip('repo:combo', 'driver-c', 'Driver C', '2026-10-02', 'repo_pickup')],
    },
  });
  const september = await getDriverPerformanceReport({ month: '2026-09' }, db);
  const october = await getDriverPerformanceReport({ month: '2026-10' }, db);
  assert.deepEqual(september.rows.map((row) => [row.driverId, row.totalRevenue]).sort(), [
    ['driver-a', 1000000], ['driver-x', 1200000], ['driver-y', 1300000],
  ]);
  assert.equal(september.summary.totalRevenue, 3500000);
  assert.equal(october.summary.totalRevenue, 0);
  assert.deepEqual(october.rows.map((row) => [row.driverId, row.totalTrips, row.totalRevenue]).sort(), [
    ['driver-b', 1, 0], ['driver-c', 1, 0],
  ]);
  assert.equal(october.rows.find((row) => row.driverId === 'driver-b').totalDriverCommission, 50000);
  // Rp300,000/container Repo revenue is never part of this transport-only result.
  assert.equal(september.summary.totalRevenue + october.summary.totalRevenue, 3500000);
});

test('one driver doing original and Repo legs receives transport revenue once and two trips', async () => {
  const db = reportDb({
    revenue: { '2026-09': [revenueJob('same', 'driver-a', 'Driver A', 1000000)] },
    trips: { '2026-09': [trip('job:same', 'driver-a', 'Driver A', '2026-09-30'),
      trip('repo:same', 'driver-a', 'Driver A', '2026-09-30', 'repo_pickup')] },
  });
  const result = await getDriverPerformanceReport({ month: '2026-09' }, db);
  assert.deepEqual([result.rows[0].totalTrips, result.rows[0].totalRevenue], [2, 1000000]);
});

test('Driver Performance revenue query reuses transport eligibility, date and released-driver priority', async () => {
  const db = reportDb();
  await getDriverPerformanceReport({ month: '2026-09' }, db);
  const revenueSql = db.statements.find((sql) => sql.includes('from transport_jobs cj'));
  assert.match(revenueSql, /cj\.status = 'completed' or \(cj\.repo_stored_at is not null and cj\.status <> 'cancelled'\)/);
  assert.match(revenueSql, /coalesce\(cj\.repo_stored_at, cj\.completed_at\)/);
  assert.match(revenueSql, /coalesce\(cj\.repo_stored_at, cj\.completed_at\)[\s\S]*is not null/);
  assert.doesNotMatch(revenueSql, /so\.trip_date/);
  assert.match(revenueSql, /coalesce\(cj\.repo_released_driver_id, repo_history\.previous_driver_id, cj\.driver_id\)/);
  assert.match(revenueSql, /h\.change_source in \('repo_pickup', 'repo_combo_pickup'\)/);
  assert.match(revenueSql, /so\.status <> 'cancelled'/);
  assert.match(revenueSql, /to_char\(completed_date, 'YYYY-MM'\)/);
  assert.doesNotMatch(revenueSql, /repo_revenue|300000/i);
  const commissionSql = db.statements.find((sql) => sql.includes('from completed_jobs cj'));
  assert.match(commissionSql, /where cj\.status = 'completed'/);
  assert.match(commissionSql, /dcp\.status as commission_payment_status/);
});
