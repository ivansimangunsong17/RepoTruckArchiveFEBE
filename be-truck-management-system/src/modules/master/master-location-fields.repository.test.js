import assert from 'node:assert/strict';
import test from 'node:test';

// Tidak ada database sungguhan: query dijalankan lewat client palsu yang dikirim ke upsertMasterRow.
process.env.DATABASE_URL = 'postgres://test:test@127.0.0.1:1/master_location_unit_test';
process.env.AUTH_TOKEN_SECRET ||= 'master-location-unit-test-secret-at-least-32-characters';
const { upsertMasterRow } = await import('./master.repository.js');

function fakeClient(returnedRow) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [returnedRow] };
    },
  };
}

for (const resource of ['terminals', 'depots']) {
  test(`${resource}: create menyimpan link Maps dan koordinat lalu mengembalikannya`, async () => {
    const client = fakeClient({
      id: `${resource}-1`,
      name: 'Lokasi Contoh',
      google_maps_url: 'https://maps.google.com/?q=-6.1,106.88',
      latitude: '-6.100000',
      longitude: '106.880000',
    });
    const saved = await upsertMasterRow(resource, {
      name: 'Lokasi Contoh',
      googleMapsUrl: 'https://maps.google.com/?q=-6.1,106.88',
      latitude: '-6.1',
      longitude: '106.88',
    }, null, client);

    const [{ sql, params }] = client.calls;
    assert.ok(sql.includes(`insert into ${resource} (`));
    assert.match(sql, /google_maps_url, latitude, longitude/);
    assert.ok(params.includes('https://maps.google.com/?q=-6.1,106.88'));
    assert.ok(params.includes(-6.1));
    assert.ok(params.includes(106.88));
    assert.equal(saved.googleMapsUrl, 'https://maps.google.com/?q=-6.1,106.88');
    assert.equal(saved.latitude, -6.1);
    assert.equal(saved.longitude, 106.88);
  });

  test(`${resource}: update tanpa field Maps tidak mengosongkan kolom Maps`, async () => {
    const client = fakeClient({ id: `${resource}-2`, name: 'Data Lama', google_maps_url: null, latitude: null, longitude: null });
    const saved = await upsertMasterRow(resource, { name: 'Data Lama', status: 'Aktif' }, `${resource}-2`, client);

    const [{ sql }] = client.calls;
    assert.ok(sql.includes(`update ${resource}`));
    assert.doesNotMatch(sql, /google_maps_url|latitude|longitude/);
    assert.equal(saved.googleMapsUrl, '');
    assert.equal(saved.latitude, null);
  });
}
