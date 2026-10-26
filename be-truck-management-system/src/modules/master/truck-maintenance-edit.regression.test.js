// Regresi P0-2: truck Maintenance/Tidak Aktif tetap bisa diedit dan diaktifkan kembali dari Master Truck
// selama chassis tidak berubah; penggantian chassis pada status itu tetap ditolak. Tanpa database.
import assert from 'node:assert/strict';
import test from 'node:test';

process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';
const { shouldKeepChassisOfIneligibleTruck } = await import('./master.service.js');
const { updateVehicleChassis } = await import('./master.repository.js');

const maintenanceTruck = { id: 'veh-1', status: 'Maintenance', kirChassisNumber: 'CHS-020' };

test('truck Maintenance/Tidak Aktif dengan chassis sama melewati sinkron chassis sehingga bisa diedit/diaktifkan kembali', () => {
  assert.equal(shouldKeepChassisOfIneligibleTruck(maintenanceTruck, { status: 'Aktif', kirChassisNumber: 'CHS-020' }), true);
  assert.equal(shouldKeepChassisOfIneligibleTruck({ ...maintenanceTruck, status: 'Tidak Aktif' }, { kirChassisNumber: ' chs-020 ' }), true);
  // Truck tanpa chassis yang tetap tanpa chassis.
  assert.equal(shouldKeepChassisOfIneligibleTruck({ ...maintenanceTruck, kirChassisNumber: '' }, { kirChassisNumber: '' }), true);
});

test('penggantian/pelepasan chassis pada truck Maintenance tetap lewat validasi (ditolak)', async () => {
  assert.equal(shouldKeepChassisOfIneligibleTruck(maintenanceTruck, { kirChassisNumber: 'CHS-040' }), false);
  assert.equal(shouldKeepChassisOfIneligibleTruck(maintenanceTruck, { kirChassisNumber: '' }), false);

  const client = {
    statements: [],
    async query(sql, params) {
      this.statements.push(sql);
      if (/select \* from vehicles where id = \$1/.test(sql)) {
        return { rows: [{ id: params[0], plate_number: 'B 1 MT', operational_status: 'Maintenance' }] };
      }
      throw new Error(`Query tidak terduga: ${sql}`);
    },
  };
  await assert.rejects(updateVehicleChassis('veh-1', 'CHS-040', {}, client), { code: 'FLEET_ASSIGNMENT_VEHICLE_NOT_ELIGIBLE' });
  assert.ok(client.statements.every((sql) => !/^\s*update/i.test(sql)));
});

test('truck Aktif tetap selalu disinkronkan seperti sebelumnya', () => {
  assert.equal(shouldKeepChassisOfIneligibleTruck({ ...maintenanceTruck, status: 'Aktif' }, { kirChassisNumber: 'CHS-020' }), false);
  assert.equal(shouldKeepChassisOfIneligibleTruck(null, { kirChassisNumber: 'CHS-020' }), false);
});
