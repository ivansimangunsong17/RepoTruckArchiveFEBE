// Sinkronisasi sopir default Master Truck <-> Master Sopir terhadap PostgreSQL sungguhan.
// Opt-in: hanya jalan kalau ATMS_SCRATCH_DATABASE_URL diisi DAN lolos scratch-db-guard. Tidak pernah
// fallback ke DATABASE_URL/.env. Data test (truck/sopir bertag) dihapus di akhir.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { prepareScratchDatabase } from '../test-support/scratch-db-guard.js';

const scratch = await prepareScratchDatabase();

if (scratch.skip) {
  test('truck default driver integration skipped without ATMS_SCRATCH_DATABASE_URL', { skip: scratch.skip }, () => {});
} else {
  process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';
  const { query, closePool } = await import('../db/client.js');
  const { saveMasterRow, setVehicleDefaultDriver } = await import('../modules/master/master.service.js');
  const { setFleetVehicleDefaultDriver } = await import('../modules/operations/fleet-assignment/fleet-assignment.service.js');

  const tag = crypto.randomBytes(3).toString('hex').toUpperCase();
  let seq = 0;
  const nextTag = () => `${tag}${String(++seq).padStart(3, '0')}`;
  const admin = { name: `Admin Sopir ${tag}`, role: 'admin' };
  const vehicleIds = [];
  const driverIds = [];

  async function createDriver(status = 'Aktif') {
    const result = await query(
      'insert into drivers (name, operational_status) values ($1, $2) returning id, name',
      [`SOPIR ${nextTag()}`, status],
    );
    driverIds.push(result.rows[0].id);
    return result.rows[0];
  }

  async function createTruck(extra = {}) {
    const code = nextTag();
    const result = await query(
      `insert into vehicles (unit_code, plate_number, container_size, operational_status, default_driver_id, default_driver_name)
       values ($1, $2, '20FT', 'Aktif', $3, $4) returning id`,
      [`DD-${code}`, `B ${code} DD`, extra.driverId || null, extra.driverName || null],
    );
    vehicleIds.push(result.rows[0].id);
    return result.rows[0];
  }

  async function vehicle(id) {
    const result = await query('select plate_number, default_driver_id, default_driver_name from vehicles where id = $1', [id]);
    return result.rows[0];
  }

  async function truckPayload(id, overrides = {}) {
    const row = await query('select * from vehicles where id = $1', [id]);
    const current = row.rows[0];
    return {
      unitCode: current.unit_code,
      plateNumber: current.plate_number,
      capacity: current.container_size,
      status: current.operational_status,
      defaultDriverId: current.default_driver_id,
      defaultDriver: current.default_driver_name || '',
      ...overrides,
    };
  }

  test.after(async () => {
    try {
      if (vehicleIds.length) await query('delete from vehicles where id = any($1::uuid[])', [vehicleIds]);
      if (driverIds.length) await query('delete from drivers where id = any($1::uuid[])', [driverIds]);
      const remaining = await query(
        `select
           (select count(*)::int from vehicles where id = any($1::uuid[])) as vehicles,
           (select count(*)::int from drivers where id = any($2::uuid[])) as drivers`,
        [vehicleIds, driverIds],
      );
      assert.deepEqual(remaining.rows[0], { vehicles: 0, drivers: 0 }, 'fixture scratch harus terhapus');
    } finally {
      await closePool();
    }
  });

  test('Master Truck: ganti sopir menyimpan ID+nama, memindahkan dari unit lain, dan mencatat histori', async () => {
    const driver = await createDriver();
    const unitA = await createTruck({ driverId: driver.id, driverName: driver.name });
    const unitB = await createTruck();

    const saved = await saveMasterRow('trucks', await truckPayload(unitB.id, { defaultDriverId: driver.id }), unitB.id, admin);
    assert.equal(saved.defaultDriverId, driver.id);
    assert.equal(saved.defaultDriver, driver.name);
    const unitAAfter = await vehicle(unitA.id);
    assert.equal(unitAAfter.default_driver_id, null);
    assert.equal(unitAAfter.default_driver_name, null);

    const history = await query(
      "select vehicle_id, source from vehicle_assignment_history where change_type = 'default_driver' and vehicle_id = any($1::uuid[])",
      [[unitA.id, unitB.id]],
    );
    assert.deepEqual(new Set(history.rows.map((row) => row.vehicle_id)), new Set([unitA.id, unitB.id]));
    assert.ok(history.rows.every((row) => row.source === 'master_truck'));
  });

  test('Master Truck: sopir tidak eligible ditolak dan field truck lain tidak tersimpan parsial', async () => {
    const cuti = await createDriver('Cuti');
    const unit = await createTruck();
    const before = await vehicle(unit.id);
    await assert.rejects(
      saveMasterRow('trucks', await truckPayload(unit.id, { plateNumber: `B ${nextTag()} XX`, defaultDriverId: cuti.id }), unit.id, admin),
      { code: 'TRUCK_DEFAULT_DRIVER_DRIVER_NOT_ELIGIBLE' },
    );
    assert.deepEqual(await vehicle(unit.id), before);
  });

  test('Master Truck: ubah data tanpa ganti sopir dan unit legacy tidak menyentuh sopir default', async () => {
    const driver = await createDriver();
    const unit = await createTruck({ driverId: driver.id, driverName: driver.name });
    const plate = `B ${nextTag()} YY`;
    await saveMasterRow('trucks', await truckPayload(unit.id, { plateNumber: plate, defaultDriver: 'TEKS LAIN' }), unit.id, admin);
    assert.deepEqual(await vehicle(unit.id), { plate_number: plate, default_driver_id: driver.id, default_driver_name: driver.name });

    const legacy = await createTruck({ driverName: `LEGACY ${tag}` });
    await saveMasterRow('trucks', await truckPayload(legacy.id), legacy.id, admin);
    assert.equal((await vehicle(legacy.id)).default_driver_name, `LEGACY ${tag}`);
  });

  test('endpoint khusus Master Truck dan Assignment Armada memakai aturan yang sama', async () => {
    const driver = await createDriver();
    const unit = await createTruck();
    const viaMaster = await setVehicleDefaultDriver(unit.id, { defaultDriverId: driver.id, reason: 'Regresi sinkron sopir' });
    assert.equal(viaMaster.after.defaultDriverId, driver.id);
    const other = await createTruck();
    const viaFleet = await setFleetVehicleDefaultDriver(other.id, { defaultDriverId: driver.id });
    assert.equal(viaFleet.after.defaultDriver, driver.name);
    assert.equal((await vehicle(unit.id)).default_driver_id, null);
  });

  test('Master Sopir: status Cuti melepas ID dan nama di unit tanpa menyentuh container_jobs', async () => {
    const driver = await createDriver();
    const unit = await createTruck({ driverId: driver.id, driverName: driver.name });
    const jobsBefore = await query('select count(*)::int as total, max(updated_at) as last from container_jobs');
    await saveMasterRow('drivers', { name: driver.name, status: 'Cuti' }, driver.id, admin);
    const unitAfter = await vehicle(unit.id);
    assert.equal(unitAfter.default_driver_id, null);
    assert.equal(unitAfter.default_driver_name, null);
    const history = await query(
      "select source, reason from vehicle_assignment_history where vehicle_id = $1 and change_type = 'default_driver' order by created_at desc limit 1",
      [unit.id],
    );
    assert.equal(history.rows[0]?.source, 'master_truck');
    assert.equal(history.rows[0]?.reason, 'Sopir berstatus Cuti');
    const jobsAfter = await query('select count(*)::int as total, max(updated_at) as last from container_jobs');
    assert.deepEqual(jobsAfter.rows[0], jobsBefore.rows[0]);
  });
}
