import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import { utilizationChassisJoinsSql, utilizationChassisSizeSql, utilizationChassisSourceSql } from './utilization-chassis.sql.js';

process.env.AUTH_TOKEN_SECRET ||= 'chassis-report-test-secret-at-least-32-characters';
const { applyUtilizationChassisCorrectionsToRows: correct } = await import('./reports.repository.js');

test('manual correction uses WIB, is idempotent and preserves truck identity', () => {
  const row = { id: 'job', vehicleId: 'truck', chassisSize: '20FT', completedAt: new Date('2026-09-21T18:00:00Z') };
  const corrections = [{ sourceVehicleId: 'truck', targetVehicleId: 'other', targetChassisSize: '40FT', effectiveFrom: '2026-09-22', effectiveTo: '2026-09-22' }];
  const [result] = correct([row], corrections);
  assert.equal(result.chassisSize, '40FT');
  assert.equal(result.vehicleId, 'truck');
  assert.equal(result.chassisSource, 'manual');
  assert.deepEqual(correct([result], corrections), [result]);
  for (const at of ['2026-09-21T16:59:59Z', '2026-09-22T17:00:00Z']) {
    assert.equal(correct([{ ...row, completedAt: at }], corrections)[0].chassisSize, '20FT');
  }
  assert.equal(correct([row], [{ ...corrections[0], targetChassisSize: '' }])[0], row);
});

test('manual correction chooses the most specific valid overlap without duplicating rows', () => {
  const row = {
    id: 'job-overlap',
    vehicleId: 'truck-specific',
    plateNumber: 'B 9103 BEL',
    unitCode: '03',
    chassisSize: '20FT',
    completedAt: '2026-09-23T08:00:00+07:00',
  };
  const corrections = [
    {
      id: 'plate-wide',
      sourcePlateNumber: 'B 9103 BEL',
      targetVehicleId: 'truck-wide',
      targetChassisSize: '40FT',
      effectiveFrom: '2026-09-01',
      effectiveTo: '2026-09-30',
      createdAt: '2026-09-01T00:00:00Z',
    },
    {
      id: 'vehicle-specific',
      sourceVehicleId: 'truck-specific',
      sourcePlateNumber: 'B 9103 BEL',
      targetVehicleId: 'truck-specific-target',
      targetChassisSize: '20FT',
      effectiveFrom: '2026-09-22',
      effectiveTo: '2026-09-24',
      createdAt: '2026-09-02T00:00:00Z',
    },
  ];

  const rows = correct([row], corrections);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].chassisSize, '20FT');
  assert.equal(rows[0].chassisSource, 'manual');
  assert.equal(rows[0].utilizationChassisCorrection.id, 'vehicle-specific');
  assert.deepEqual(correct(rows, corrections), rows);
});

test('manual correction prefers narrower and newer correction for the same source', () => {
  const row = { id: 'job-narrow', vehicleId: 'truck', chassisSize: '20FT', completedAt: '2026-09-23T08:00:00+07:00' };
  const [result] = correct([row], [
    {
      id: 'wide',
      sourceVehicleId: 'truck',
      targetVehicleId: 'target',
      targetChassisSize: '40FT',
      effectiveFrom: '2026-09-01',
      effectiveTo: '2026-09-30',
      createdAt: '2026-09-10T00:00:00Z',
    },
    {
      id: 'narrow',
      sourceVehicleId: 'truck',
      targetVehicleId: 'target',
      targetChassisSize: '20FT',
      effectiveFrom: '2026-09-22',
      effectiveTo: '2026-09-24',
      createdAt: '2026-09-01T00:00:00Z',
    },
  ]);
  assert.equal(result.utilizationChassisCorrection.id, 'narrow');
  assert.equal(result.chassisSize, '20FT');

  const [newer] = correct([row], [
    {
      id: 'older',
      sourceVehicleId: 'truck',
      targetVehicleId: 'target',
      targetChassisSize: '40FT',
      effectiveFrom: '2026-09-22',
      effectiveTo: '2026-09-24',
      createdAt: '2026-09-01T00:00:00Z',
    },
    {
      id: 'newer',
      sourceVehicleId: 'truck',
      targetVehicleId: 'target',
      targetChassisSize: '20FT',
      effectiveFrom: '2026-09-22',
      effectiveTo: '2026-09-24',
      createdAt: '2026-09-02T00:00:00Z',
    },
  ]);
  assert.equal(newer.utilizationChassisCorrection.id, 'newer');
  assert.equal(newer.chassisSize, '20FT');
});

// Opt-in only. Use a disposable local PostgreSQL instance, never DATABASE_URL.
const testUrl = process.env.CHASSIS_TEST_DATABASE_URL;
test('historical chassis SQL against isolated PostgreSQL', { skip: !testUrl }, async (t) => {
  const url = new URL(testUrl);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
  assert.ok(url.pathname.startsWith('/test_chassis_'));
  const db = new pg.Client({ connectionString: testUrl });
  await db.connect();
  t.after(() => db.end());
  await db.query(`
    create temporary table vehicles (id text primary key, plate_number text, current_chassis_id text, archived_at timestamptz, created_at timestamptz default now());
    create temporary table kir_chassis (id text primary key, container_size text);
    create temporary table sales_orders (id text primary key, trip_date date);
    create temporary table container_jobs (id text primary key, sales_order_id text, vehicle_id text, completed_at timestamptz, assignment_snapshot jsonb);
    create temporary table vehicle_assignment_history (id text primary key, vehicle_id text, change_type text, previous_chassis_id text, next_chassis_id text, created_at timestamptz);
    insert into kir_chassis values ('ch20','20FT'), ('ch40','40FT');
    insert into vehicles (id,plate_number,current_chassis_id) values ('truck','B 9103 BEL','ch40');
    insert into sales_orders values ('so','2026-09-22');
    insert into container_jobs values
      ('before','so','truck','2026-09-21T16:59:59Z','{}'),
      ('after','so','truck','2026-09-21T17:00:00Z','{}'),
      ('date-only','so','truck',null,'{}'),
      ('snapshot','so','truck','2026-09-22T04:00:00Z','{"chassisId":"ch20","chassisSize":"20FT"}'),
      ('snapshot-id','so','truck','2026-09-22T04:00:00Z','{"chassisId":"ch20"}'),
      ('snapshot-empty','so','truck','2026-09-22T04:00:00Z','{"chassisId":null,"chassisSize":null,"chassisCode":null}');
    insert into vehicle_assignment_history values
      ('swap','truck','chassis','ch20','ch40','2026-09-21T17:00:00Z'),
      ('driver','truck','default_driver',null,null,'2026-09-22T01:00:00Z');
  `);
  const read = async () => (await db.query(`
    select cj.id, ${utilizationChassisSizeSql} as size, ${utilizationChassisSourceSql} as source
    from container_jobs cj join sales_orders so on so.id = cj.sales_order_id
    ${utilizationChassisJoinsSql} order by cj.id
  `)).rows;
  await t.test('WIB boundary, previous/next history, trip_date and snapshots', async () => {
    const rows = await read();
    assert.equal(rows.length, 6);
    const byId = Object.fromEntries(rows.map(row => [row.id, row]));
    assert.deepEqual(byId.before, { id: 'before', size: '20FT', source: 'history_after' });
    assert.deepEqual(byId.after, { id: 'after', size: '40FT', source: 'history_before' });
    assert.equal(byId['date-only'].size, '40FT');
    assert.equal(byId.snapshot.size, '20FT');
    assert.equal(byId['snapshot-id'].size, '20FT');
    assert.equal(byId['snapshot-empty'].size, null);
  });
  await t.test('changing current chassis and session timezone does not rewrite history', async () => {
    const before = await read();
    await db.query("update vehicles set current_chassis_id = 'ch20'; set time zone 'America/New_York'");
    assert.deepEqual(await read(), before);
  });
  await t.test('detach is authoritative until a later attach', async () => {
    await db.query(`
      insert into vehicle_assignment_history values ('detach','truck','chassis','ch40',null,'2026-09-23T00:00:00+07'),
        ('attach','truck','chassis',null,'ch20','2026-09-25T00:00:00+07');
      insert into container_jobs values ('detached','so','truck','2026-09-24T08:00:00+07','{}');
    `);
    const row = (await read()).find(row => row.id === 'detached');
    assert.equal(row.size, null);
    assert.equal(row.source, 'history_before');
  });
  await t.test('snapshot plate lookup cannot multiply rows, even for duplicate master plates', async () => {
    await db.query(`
      insert into vehicles (id,plate_number,current_chassis_id,archived_at) values ('archived','B 9103 BEL','ch20',now());
      insert into container_jobs values ('plate-only','so',null,'2026-09-22T08:00:00+07','{"plateNumber":"B 9103 BEL"}');
    `);
    const rows = await read();
    assert.equal(rows.length, 8);
    assert.equal(new Set(rows.map(row => row.id)).size, 8);
    assert.equal(rows.find(row => row.id === 'plate-only').size, '40FT');
  });
  await t.test('no history falls back to current, first attach with null previous does not', async () => {
    await db.query(`
      insert into vehicles (id,plate_number,current_chassis_id) values ('legacy','LEGACY','ch40'), ('new','NEW','ch40');
      insert into container_jobs values ('legacy','so','legacy','2026-09-21T08:00:00+07','{}'), ('pre-attach','so','new','2026-09-21T08:00:00+07','{}');
      insert into vehicle_assignment_history values ('first','new','chassis',null,'ch40','2026-09-22T00:00:00+07');
    `);
    const rows = await read();
    assert.deepEqual(rows.find(row => row.id === 'legacy'), { id: 'legacy', size: '40FT', source: 'current' });
    assert.deepEqual(rows.find(row => row.id === 'pre-attach'), { id: 'pre-attach', size: null, source: 'history_after' });
  });
});
