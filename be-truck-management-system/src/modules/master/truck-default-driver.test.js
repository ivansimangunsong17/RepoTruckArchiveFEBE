// Regresi sinkronisasi sopir default Master Truck <-> Master Sopir.
// Tanpa database: query dijalankan lewat client palsu yang meniru tabel vehicles/drivers di memori.
import assert from 'node:assert/strict';
import test from 'node:test';

process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';
const {
  clearVehicleDefaultDriver,
  releaseDriverDefaultAssignments,
  syncVehicleDefaultDriverName,
  updateVehicleDefaultDriver,
} = await import('./master.repository.js');
const { resolveDefaultDriverChange, shouldDetachDriverFromUnit } = await import('./master.service.js');
const { resourceConfig } = await import('./master.mapper.js');

const ids = {
  truckA: '00000000-0000-4000-8000-00000000000a',
  truckB: '00000000-0000-4000-8000-00000000000b',
  legacy: '00000000-0000-4000-8000-00000000000c',
  suwito: '10000000-0000-4000-8000-000000000001',
  tisman: '10000000-0000-4000-8000-000000000002',
  cuti: '10000000-0000-4000-8000-000000000003',
  blacklist: '10000000-0000-4000-8000-000000000004',
};

function createFleetClient() {
  const vehicles = new Map([
    [ids.truckA, { id: ids.truckA, unit_code: '01', plate_number: 'B 1 AAA', operational_status: 'Aktif', default_driver_id: ids.suwito, default_driver_name: 'SUWITO', archived_at: null }],
    [ids.truckB, { id: ids.truckB, unit_code: '04', plate_number: 'B 4 BBB', operational_status: 'Aktif', default_driver_id: null, default_driver_name: null, archived_at: null }],
    [ids.legacy, { id: ids.legacy, unit_code: '07', plate_number: 'B 7 CCC', operational_status: 'Aktif', default_driver_id: null, default_driver_name: 'TISMAN', archived_at: null }],
  ]);
  const drivers = new Map([
    [ids.suwito, { id: ids.suwito, name: 'SUWITO', operational_status: 'Aktif', archived_at: null }],
    [ids.tisman, { id: ids.tisman, name: 'TISMAN', operational_status: 'Aktif', archived_at: null }],
    [ids.cuti, { id: ids.cuti, name: 'DEDE RAPLY', operational_status: 'Cuti', archived_at: null }],
    [ids.blacklist, { id: ids.blacklist, name: 'AMDANI', operational_status: 'Blacklist', archived_at: null }],
  ]);
  const statements = [];
  const lower = (value) => String(value || '').trim().toLowerCase();

  async function query(sql, params = []) {
    const text = sql.replace(/\s+/g, ' ').trim();
    statements.push(text);
    if (text.startsWith('select * from vehicles where id = $1')) {
      const row = vehicles.get(params[0]);
      return { rows: row && !row.archived_at ? [{ ...row }] : [] };
    }
    if (text.startsWith('select * from drivers where id = $1')) {
      const row = drivers.get(params[0]);
      return { rows: row && !row.archived_at ? [{ ...row }] : [] };
    }
    if (text.startsWith('select id, unit_code, plate_number, default_driver_id, default_driver_name from vehicles where id <> $2')) {
      const [driverId, vehicleId, driverName] = params;
      const rows = [...vehicles.values()].filter((row) => row.id !== vehicleId && (
        row.default_driver_id === driverId
        || (!row.default_driver_id && lower(row.default_driver_name) === lower(driverName))
      ));
      return { rows: rows.map((row) => ({ ...row })) };
    }
    if (text.startsWith('select id, default_driver_id, default_driver_name from vehicles where ($1::uuid is not null')) {
      const [driverId, names] = params;
      const rows = [...vehicles.values()].filter((row) => (
        (driverId && row.default_driver_id === driverId)
        || (!row.default_driver_id && row.default_driver_name && names.includes(lower(row.default_driver_name)))
      ));
      return { rows: rows.map((row) => ({ ...row })) };
    }
    if (text.startsWith('update vehicles set default_driver_id = null, default_driver_name = null, updated_at = now() where id = any($1::uuid[])')) {
      params[0].forEach((id) => Object.assign(vehicles.get(id), { default_driver_id: null, default_driver_name: null }));
      return { rows: [], rowCount: params[0].length };
    }
    if (text.startsWith('update vehicles set default_driver_id = null, default_driver_name = null, updated_at = now() where id = $1 returning *')) {
      Object.assign(vehicles.get(params[0]), { default_driver_id: null, default_driver_name: null });
      return { rows: [{ ...vehicles.get(params[0]) }] };
    }
    if (text.startsWith('update vehicles set default_driver_id = $2, default_driver_name = $3')) {
      Object.assign(vehicles.get(params[0]), { default_driver_id: params[1], default_driver_name: params[2] });
      return { rows: [{ ...vehicles.get(params[0]) }] };
    }
    if (text.startsWith('update vehicles set default_driver_name = $2, updated_at = now() where default_driver_id = $1')) {
      let count = 0;
      vehicles.forEach((row) => {
        if (row.default_driver_id === params[0] && row.default_driver_name !== params[1]) {
          row.default_driver_name = params[1];
          count += 1;
        }
      });
      return { rows: [], rowCount: count };
    }
    throw new Error(`Query tidak terduga di test: ${text}`);
  }

  return { query, vehicles, drivers, statements };
}

// Tampilan kedua halaman: Master Truck membaca pasangan dari default_driver_id (fallback nama legacy),
// Master Sopir mencari truck lewat id dulu lalu nama legacy. Keduanya harus menghasilkan pasangan sama.
function truckPairs(client) {
  return [...client.vehicles.values()].map((row) => {
    const driver = row.default_driver_id ? client.drivers.get(row.default_driver_id) : null;
    return [row.unit_code, driver ? driver.name : row.default_driver_name || null];
  });
}

function driverPairs(client) {
  return [...client.drivers.values()].map((driver) => {
    const byId = [...client.vehicles.values()].find((row) => row.default_driver_id === driver.id);
    const byLegacyName = [...client.vehicles.values()].find((row) => !row.default_driver_id
      && String(row.default_driver_name || '').trim().toLowerCase() === driver.name.toLowerCase());
    return [driver.name, (byId || byLegacyName)?.unit_code || null];
  });
}

function assertPagesAgree(client) {
  const fromTrucks = truckPairs(client).filter(([, driver]) => driver).map(([unit, driver]) => `${driver}@${unit}`).sort();
  const fromDrivers = driverPairs(client).filter(([, unit]) => unit).map(([driver, unit]) => `${driver}@${unit}`).sort();
  assert.deepEqual(fromTrucks, fromDrivers);
}

test('update Master Truck generik tidak lagi menulis nama sopir tanpa ID', () => {
  const databaseRow = resourceConfig.trucks.toDb({ plateNumber: 'B 1 AAA', defaultDriver: 'NAMA BEBAS', defaultDriverId: ids.tisman });
  assert.equal(Object.hasOwn(databaseRow, 'default_driver_name'), false);
  assert.equal(Object.hasOwn(databaseRow, 'default_driver_id'), false);
});

test('mengganti sopir default dari Master Truck menyimpan ID dan nama bersamaan', async () => {
  const change = resolveDefaultDriverChange({ defaultDriverId: ids.tisman, defaultDriver: 'TISMAN' }, { defaultDriverId: ids.suwito, defaultDriver: 'SUWITO' });
  assert.deepEqual(change, { type: 'set', driverId: ids.tisman });

  const client = createFleetClient();
  const result = await updateVehicleDefaultDriver(ids.truckA, change.driverId, client);
  assert.equal(result.after.defaultDriverId, ids.tisman);
  assert.equal(result.after.defaultDriver, 'TISMAN');
  assert.equal(result.before.defaultDriverId, ids.suwito);
  assertPagesAgree(client);
});

test('endpoint assignment khusus memakai mekanisme yang sama dan menolak id tidak valid', async () => {
  const client = createFleetClient();
  const result = await updateVehicleDefaultDriver(ids.truckB, ids.tisman, client);
  assert.equal(result.after.defaultDriverId, ids.tisman);
  assert.equal(result.after.defaultDriver, 'TISMAN');
  await assert.rejects(updateVehicleDefaultDriver(ids.truckB, 'TISMAN', client), { code: 'TRUCK_DEFAULT_DRIVER_DRIVER_INVALID' });
});

test('sopir dipindahkan dari unit A ke unit B melepas unit A sekaligus', async () => {
  const client = createFleetClient();
  const result = await updateVehicleDefaultDriver(ids.truckB, ids.suwito, client);
  assert.equal(client.vehicles.get(ids.truckA).default_driver_id, null);
  assert.equal(client.vehicles.get(ids.truckA).default_driver_name, null);
  assert.equal(client.vehicles.get(ids.truckB).default_driver_id, ids.suwito);
  assert.deepEqual(result.detached.map((row) => [row.id, row.previousDriverId, row.previousDriverName]), [[ids.truckA, ids.suwito, 'SUWITO']]);
  assertPagesAgree(client);
});

test('memasang sopir ber-ID ikut melepas unit legacy yang masih menyimpan nama sopir yang sama', async () => {
  const client = createFleetClient();
  await updateVehicleDefaultDriver(ids.truckB, ids.tisman, client);
  assert.equal(client.vehicles.get(ids.legacy).default_driver_name, null);
  assertPagesAgree(client);
});

test('sopir Cuti/Tidak Aktif melepas ID dan nama di semua unit tanpa menyentuh tabel lain', async () => {
  assert.equal(shouldDetachDriverFromUnit('Cuti'), true);
  assert.equal(shouldDetachDriverFromUnit('Tidak Aktif'), true);

  const client = createFleetClient();
  const released = await releaseDriverDefaultAssignments(ids.suwito, ['SUWITO'], client);
  assert.deepEqual(released, [{ id: ids.truckA, previousDriverId: ids.suwito, previousDriverName: 'SUWITO' }]);
  assert.equal(client.vehicles.get(ids.truckA).default_driver_id, null);
  assert.equal(client.vehicles.get(ids.truckA).default_driver_name, null);
  assert.ok(client.statements.every((sql) => !/container_jobs|job_status_history|assignment_snapshot/i.test(sql)));
  assertPagesAgree(client);
});

test('pelepasan berbasis nama hanya berlaku untuk unit legacy tanpa ID', async () => {
  const client = createFleetClient();
  // Sopir lain bernama "SUWITO" (id berbeda) tidak boleh melepas unit A yang terhubung lewat ID.
  const released = await releaseDriverDefaultAssignments(ids.tisman, ['SUWITO', 'TISMAN'], client);
  assert.deepEqual(released.map((row) => row.id), [ids.legacy]);
  assert.equal(client.vehicles.get(ids.truckA).default_driver_id, ids.suwito);
});

test('mengubah data kendaraan tanpa mengganti sopir tidak menyentuh sopir default', () => {
  const current = { defaultDriverId: ids.suwito, defaultDriver: 'SUWITO' };
  assert.equal(resolveDefaultDriverChange({ plateNumber: 'B 1 AAA', defaultDriverId: ids.suwito, defaultDriver: 'SUWITO' }, current), null);
  assert.equal(resolveDefaultDriverChange({ plateNumber: 'B 1 AAA' }, current), null);
  // Nama teks yang berbeda tanpa ID baru tidak mengubah apa pun (nama bukan sumber identitas).
  assert.equal(resolveDefaultDriverChange({ defaultDriverId: ids.suwito, defaultDriver: 'NAMA LAIN' }, current), null);
});

test('data legacy tanpa default_driver_id dipertahankan kecuali dikosongkan eksplisit', () => {
  const legacy = { defaultDriverId: null, defaultDriver: 'TISMAN' };
  assert.equal(resolveDefaultDriverChange({ defaultDriverId: null, defaultDriver: 'TISMAN' }, legacy), null);
  assert.equal(resolveDefaultDriverChange({ defaultDriverId: '' }, legacy), null);
  assert.deepEqual(resolveDefaultDriverChange({ defaultDriverId: '', defaultDriver: '' }, legacy), { type: 'clear' });
  assert.deepEqual(resolveDefaultDriverChange({ defaultDriverId: ids.tisman }, legacy), { type: 'set', driverId: ids.tisman });
  assert.deepEqual(resolveDefaultDriverChange({ defaultDriverId: '' }, { defaultDriverId: ids.suwito, defaultDriver: 'SUWITO' }), { type: 'clear' });
});

test('mengosongkan sopir dari Master Truck membersihkan ID dan nama sekaligus', async () => {
  const client = createFleetClient();
  const result = await clearVehicleDefaultDriver(ids.truckA, client);
  assert.equal(result.after.defaultDriverId, null);
  assert.equal(result.after.defaultDriver, '');
  assertPagesAgree(client);
});

test('sopir yang tidak eligible ditolak tanpa mengubah data', async () => {
  for (const driverId of [ids.cuti, ids.blacklist]) {
    const client = createFleetClient();
    await assert.rejects(updateVehicleDefaultDriver(ids.truckB, driverId, client), { code: 'TRUCK_DEFAULT_DRIVER_DRIVER_NOT_ELIGIBLE' });
    assert.ok(client.statements.every((sql) => !sql.startsWith('update')), 'tidak boleh ada update sebelum validasi lolos');
  }
  const client = createFleetClient();
  client.vehicles.get(ids.truckB).operational_status = 'Maintenance';
  await assert.rejects(updateVehicleDefaultDriver(ids.truckB, ids.tisman, client), { code: 'TRUCK_DEFAULT_DRIVER_TRUCK_NOT_ELIGIBLE' });
});

test('nama sopir yang berubah di Master Sopir ikut tersinkron ke truck ber-ID', async () => {
  const client = createFleetClient();
  assert.equal(await syncVehicleDefaultDriverName(ids.suwito, 'SUWITO BARU', client), 1);
  client.drivers.get(ids.suwito).name = 'SUWITO BARU';
  assert.equal(client.vehicles.get(ids.truckA).default_driver_name, 'SUWITO BARU');
  assertPagesAgree(client);
});
