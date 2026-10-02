import assert from 'node:assert/strict';
import test from 'node:test';

// No real database is reachable: all pool access is replaced before invoking application code.
process.env.DATABASE_URL = 'postgres://test:test@127.0.0.1:1/chassis_unit_test';
process.env.AUTH_TOKEN_SECRET ||= 'chassis-unit-test-secret-at-least-32-characters';
const { pool } = await import('../../db/client.js');
const { updateFleetChassisController } = await import('../operations/fleet-assignment/fleet-assignment.controller.js');
const { createMasterController, updateMasterController } = await import('./master.controller.js');

function mockDatabase(t, { failHistoryAt = 0, failMasterUpdate = false } = {}) {
  const chassis = [
    { id: 'ch20', chassis_code: 'CH20', container_size: '20FT', operational_status: 'Aktif' },
    { id: 'ch40', chassis_code: 'CH40', container_size: '40FT', operational_status: 'Aktif' },
  ];
  const initial = {
    vehicles: [
      { id: 'a', plate_number: 'B 9103 BEL', current_chassis_id: 'ch20', current_chassis_code: 'CH20', kir_chassis_number: 'CH20', operational_status: 'Aktif' },
      { id: 'b', plate_number: 'B 9104 BEL', current_chassis_id: 'ch40', current_chassis_code: 'CH40', kir_chassis_number: 'CH40', operational_status: 'Aktif' },
    ],
    history: [],
  };
  let committed = structuredClone(initial);
  let pending = null;
  let historyAttempts = 0;
  const commands = [];
  const execute = async (text, params = [], transactional = false) => {
    const sql = text.replace(/\s+/g, ' ').trim();
    commands.push(sql);
    if (sql === 'begin') { assert.equal(pending, null); pending = structuredClone(committed); return { rows: [] }; }
    if (sql === 'commit') { committed = pending; pending = null; return { rows: [] }; }
    if (sql === 'rollback') { pending = null; return { rows: [] }; }
    const state = transactional ? pending : committed;
    assert.ok(state);
    const result = (rows = []) => ({ rows: structuredClone(rows), rowCount: rows.length });
    if (sql.startsWith('insert into activity_logs')) return result([{ id: 'log' }]);
    if (sql.startsWith('select * from kir_chassis')) {
      return result(params.length ? chassis.filter(c => c.id === params[0] || c.chassis_code === params[0]) : chassis);
    }
    if (sql.startsWith('select * from vehicles')) return result(state.vehicles.filter(v => v.id === params[0]));
    if (sql.startsWith('select id, current_chassis_id')) {
      return result(state.vehicles.filter(v => v.current_chassis_id === params[0] && v.id !== params[1]));
    }
    assert.equal(transactional, true, `Write outside transaction: ${sql}`);
    if (sql.startsWith('insert into vehicle_assignment_history')) {
      historyAttempts += 1;
      if (historyAttempts === failHistoryAt) throw new Error('History write failed');
      const columns = sql.match(/\(([^)]+)\) values/)[1].split(',').map(c => c.trim());
      state.history.push(Object.fromEntries(columns.map((c, i) => [c, params[i]])));
      return result();
    }
    if (sql.startsWith('insert into vehicles')) {
      const columns = sql.match(/\(([^)]+)\) values/)[1].split(',').map(c => c.trim());
      const created = { id: 'new', ...Object.fromEntries(columns.map((c, i) => [c, params[i]])) };
      state.vehicles.push(created);
      return result([created]);
    }
    if (sql.startsWith('update vehicles set current_chassis_id = null')) {
      const affected = sql.includes('where current_chassis_id')
        ? state.vehicles.filter(v => v.current_chassis_id === params[0] && v.id !== params[1])
        : state.vehicles.filter(v => v.id === params[0]);
      affected.forEach(v => Object.assign(v, { current_chassis_id: null, current_chassis_code: null, kir_chassis_number: null }));
      return result(affected);
    }
    if (sql.startsWith('update vehicles set current_chassis_id = $2')) {
      const v = state.vehicles.find(v => v.id === params[0]);
      Object.assign(v, { current_chassis_id: params[1], current_chassis_code: params[2], kir_chassis_number: params[2] });
      return result([v]);
    }
    if (sql.startsWith('update vehicles set')) {
      if (failMasterUpdate) throw new Error('Master write failed');
      const v = state.vehicles.find(v => v.id === params.at(-1));
      for (const [, column, position] of sql.split(' where ')[0].matchAll(/(\w+) = \$(\d+)/g)) v[column] = params[Number(position) - 1];
      return result([v]);
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  const client = { query: (sql, params) => execute(sql, params, true), release() { commands.push('release'); } };
  t.mock.method(pool, 'connect', async () => client);
  t.mock.method(pool, 'query', (sql, params) => execute(sql, params));
  return { initial, commands, get state() { return committed; } };
}

const actor = { name: 'Operator Test', role: 'admin' };
async function change(source, { chassisId = 'ch40', id = 'a', create = false } = {}) {
  const response = { writeHead(code) { this.code = code; }, end(body) { this.body = JSON.parse(body); } };
  const request = {
    params: { vehicleId: id, resource: 'trucks', id }, user: actor,
    body: source === 'fleet_assignment'
      ? { chassisId, reason: 'Tukar ukuran chassis', note: 'Audit test' }
      : { plateNumber: 'B 9103 BEL', kirChassisNumber: chassisId ? chassisId.toUpperCase() : '', status: 'Aktif' },
  };
  if (source === 'fleet_assignment') await updateFleetChassisController(request, response);
  else if (create) await createMasterController(request, response);
  else await updateMasterController(request, response);
  assert.equal(response.code, create ? 201 : 200);
  return response.body.data;
}

for (const source of ['fleet_assignment', 'master_truck']) {
  test(`${source}: transfer records both trucks once, with actor and source`, async (t) => {
    const db = mockDatabase(t);
    await change(source);
    assert.equal(db.state.vehicles[0].current_chassis_id, 'ch40');
    assert.equal(db.state.vehicles[1].current_chassis_id, null);
    assert.equal(db.state.history.length, 2);
    const detached = db.state.history.find(h => h.vehicle_id === 'b');
    const attached = db.state.history.find(h => h.vehicle_id === 'a');
    assert.equal(detached.previous_chassis_id, 'ch40');
    assert.equal(detached.next_chassis_id, null);
    assert.equal(attached.previous_chassis_id, 'ch20');
    assert.equal(attached.next_chassis_id, 'ch40');
    for (const row of db.state.history) {
      assert.equal(row.change_type, 'chassis');
      assert.equal(row.source, source);
      assert.equal(row.changed_by_name, actor.name);
      assert.equal(row.changed_by_role, actor.role);
      if (source === 'fleet_assignment') {
        assert.equal(row.reason, 'Tukar ukuran chassis');
        assert.equal(row.note, 'Audit test');
      }
    }
    assert.equal(db.commands.filter(c => c === 'begin').length, 1);
    assert.ok(db.commands.includes('commit'));
  });

  for (const failHistoryAt of [1, 2]) {
    test(`${source}: history failure ${failHistoryAt} rolls back transfer and all history`, async (t) => {
      const db = mockDatabase(t, { failHistoryAt });
      await assert.rejects(change(source), /History write failed/);
      assert.deepEqual(db.state, db.initial);
      assert.ok(db.commands.includes('rollback'));
      assert.ok(!db.commands.includes('commit'));
    });
  }

  test(`${source}: unchanged chassis creates no history`, async (t) => {
    const db = mockDatabase(t);
    await change(source, { chassisId: 'ch20' });
    assert.equal(db.state.history.length, 0);
  });
}

test('Master Truck: explicit detach writes previous chassis and null next chassis', async (t) => {
  const db = mockDatabase(t);
  await change('master_truck', { chassisId: '' });
  assert.equal(db.state.history.length, 1);
  assert.equal(db.state.history[0].previous_chassis_id, 'ch20');
  assert.equal(db.state.history[0].next_chassis_id, null);
  assert.equal(db.state.vehicles[0].current_chassis_id, null);
});

test('Master Truck: detach history failure rolls back', async (t) => {
  const db = mockDatabase(t, { failHistoryAt: 1 });
  await assert.rejects(change('master_truck', { chassisId: '' }), /History write failed/);
  assert.deepEqual(db.state, db.initial);
});

test('Master Truck: failure saving other fields rolls back chassis and history', async (t) => {
  const db = mockDatabase(t, { failMasterUpdate: true });
  await assert.rejects(change('master_truck'), /Master write failed/);
  assert.deepEqual(db.state, db.initial);
});

test('Master Truck: creation captures initial assignment history', async (t) => {
  const db = mockDatabase(t);
  await change('master_truck', { create: true });
  const initial = db.state.history.find(h => h.vehicle_id === 'new');
  assert.equal(initial.previous_chassis_id, null);
  assert.equal(initial.next_chassis_id, 'ch40');
  assert.equal(initial.source, 'master_truck');
  assert.equal(db.state.history.length, 2);
});

test('Master Truck: history failure also rolls back truck creation', async (t) => {
  const db = mockDatabase(t, { failHistoryAt: 2 });
  await assert.rejects(change('master_truck', { create: true }), /History write failed/);
  assert.deepEqual(db.state, db.initial);
});
