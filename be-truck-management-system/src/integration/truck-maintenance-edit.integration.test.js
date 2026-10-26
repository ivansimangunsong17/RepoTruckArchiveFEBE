// Regresi P0-2: truck Maintenance/Tidak Aktif bisa diedit dan diaktifkan kembali dari Master Truck bila
// chassis tidak berubah; penggantian chassis pada status itu tetap ditolak tanpa data parsial.
// Opt-in: hanya jalan kalau ATMS_SCRATCH_DATABASE_URL diisi DAN lolos scratch-db-guard. Fixture dihapus di akhir.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { prepareScratchDatabase } from '../test-support/scratch-db-guard.js';

const scratch = await prepareScratchDatabase();

if (scratch.skip) {
  test('truck maintenance edit integration skipped without ATMS_SCRATCH_DATABASE_URL', { skip: scratch.skip }, () => {});
} else {
  process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';
  const { query, closePool } = await import('../db/client.js');
  const { saveMasterRow } = await import('../modules/master/master.service.js');

  const tag = crypto.randomBytes(3).toString('hex').toUpperCase();
  const admin = { name: `Admin MT ${tag}`, role: 'admin' };
  const vehicleIds = [];
  const chassisIds = [];

  async function createChassis(suffix) {
    const result = await query(
      "insert into kir_chassis (chassis_code, container_size, operational_status) values ($1, '20FT', 'Aktif') returning id, chassis_code",
      [`CHS-${tag}-${suffix}`],
    );
    chassisIds.push(result.rows[0].id);
    return result.rows[0];
  }

  async function createTruck(status, chassis) {
    const result = await query(
      `insert into vehicles (unit_code, plate_number, container_size, operational_status, current_chassis_id, current_chassis_code, kir_chassis_number)
       values ($1, $2, '20FT', $3, $4, $5, $5) returning *`,
      [`MT-${tag}-${vehicleIds.length + 1}`, `B ${tag}${vehicleIds.length + 1} MT`, status, chassis.id, chassis.chassis_code],
    );
    vehicleIds.push(result.rows[0].id);
    return result.rows[0];
  }

  function payloadFrom(row, overrides = {}) {
    return {
      unitCode: row.unit_code,
      plateNumber: row.plate_number,
      capacity: row.container_size,
      status: row.operational_status,
      kirChassisNumber: row.kir_chassis_number || '',
      defaultDriverId: row.default_driver_id,
      defaultDriver: row.default_driver_name || '',
      ...overrides,
    };
  }

  async function vehicle(id) {
    return (await query('select operational_status, stnk_number, current_chassis_id, kir_chassis_number from vehicles where id = $1', [id])).rows[0];
  }

  test.after(async () => {
    try {
      if (vehicleIds.length) await query('delete from vehicles where id = any($1::uuid[])', [vehicleIds]);
      if (chassisIds.length) await query('delete from kir_chassis where id = any($1::uuid[])', [chassisIds]);
    } finally {
      await closePool();
    }
  });

  test('truck Maintenance dengan chassis sama bisa diedit lalu diaktifkan kembali', async () => {
    const chassis = await createChassis('A');
    const truck = await createTruck('Maintenance', chassis);

    await saveMasterRow('trucks', payloadFrom(truck, { stnkNumber: `STNK-${tag}` }), truck.id, admin);
    assert.deepEqual(await vehicle(truck.id), {
      operational_status: 'Maintenance', stnk_number: `STNK-${tag}`, current_chassis_id: chassis.id, kir_chassis_number: chassis.chassis_code,
    });

    await saveMasterRow('trucks', payloadFrom(truck, { status: 'Aktif', stnkNumber: `STNK-${tag}` }), truck.id, admin);
    assert.equal((await vehicle(truck.id)).operational_status, 'Aktif');
    assert.equal((await vehicle(truck.id)).current_chassis_id, chassis.id);
  });

  test('ganti chassis pada truck Tidak Aktif tetap ditolak tanpa perubahan parsial', async () => {
    const chassisA = await createChassis('B');
    const chassisB = await createChassis('C');
    const truck = await createTruck('Tidak Aktif', chassisA);
    const before = await vehicle(truck.id);
    await assert.rejects(
      saveMasterRow('trucks', payloadFrom(truck, { status: 'Aktif', kirChassisNumber: chassisB.chassis_code, stnkNumber: `X-${tag}` }), truck.id, admin),
      { code: 'FLEET_ASSIGNMENT_VEHICLE_NOT_ELIGIBLE' },
    );
    assert.deepEqual(await vehicle(truck.id), before);
  });
}
