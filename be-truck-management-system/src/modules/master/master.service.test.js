import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeMasterResultForActor, shouldDetachDriverFromUnit } from './master.service.js';

test('driver dilepas dari unit saat status cuti atau tidak aktif', () => {
  assert.equal(shouldDetachDriverFromUnit('Cuti'), true);
  assert.equal(shouldDetachDriverFromUnit('Tidak Aktif'), true);
  assert.equal(shouldDetachDriverFromUnit('Aktif'), false);
  assert.equal(shouldDetachDriverFromUnit('Bertugas'), false);
});

test('master lokasi generik menyembunyikan alamat dan maps untuk Sales', () => {
  const row = {
    id: 'loc-1',
    name: 'Gudang A',
    address: 'Jl. Industri',
    googleMapsUrl: 'https://maps.google.com/example',
    latitude: -6.2,
    longitude: 106.8,
    destinationId: 'dest-1',
  };
  const [salesRow] = sanitizeMasterResultForActor('end-users', [row], { role: 'sales' });
  assert.deepEqual(salesRow, { id: 'loc-1', name: 'Gudang A', destinationId: 'dest-1' });
  assert.deepEqual(sanitizeMasterResultForActor('end-users', [row], { role: 'operational' }), [row]);
  assert.deepEqual(
    sanitizeMasterResultForActor('end-users', { data: [row], total: 1 }, { role: 'sales' }),
    { data: [{ id: 'loc-1', name: 'Gudang A', destinationId: 'dest-1' }], total: 1 },
  );
});
