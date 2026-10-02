import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLocationWhere } from './locations.repository.js';

test('Phase 8: filter destinationId mengisolasi lokasi ke satu tujuan saja (tidak bocor ke tujuan lain)', () => {
  const { whereSql, params } = buildLocationWhere({ destinationId: 'destination-1' });

  assert.match(whereSql, /destination_id = \$1/);
  assert.deepEqual(params, ['destination-1']);
  // Tanpa destinationId, klausa ini TIDAK boleh muncul sama sekali -- membuktikan filter murni
  // ditentukan oleh parameter, bukan selalu aktif secara diam-diam.
  assert.doesNotMatch(buildLocationWhere({}).whereSql, /destination_id/);
});

test('Phase 8: status=active hanya menampilkan lokasi Aktif untuk transaksi baru, status kosong tampilkan semua (transaksi lama)', () => {
  const activeOnly = buildLocationWhere({ status: 'active' });
  assert.match(activeOnly.whereSql, /operational_status = 'Aktif'/);

  const noStatusFilter = buildLocationWhere({});
  assert.doesNotMatch(noStatusFilter.whereSql, /operational_status/);

  const otherStatusValue = buildLocationWhere({ status: 'all' });
  assert.doesNotMatch(otherStatusValue.whereSql, /operational_status/);
});

test('Phase 8: query pencarian mencocokkan nama ATAU alamat lewat parameter yang sama', () => {
  const { whereSql, params } = buildLocationWhere({ query: 'Cikarang' });

  assert.match(whereSql, /name ilike \$1 or address ilike \$1/);
  assert.deepEqual(params, ['%Cikarang%']);
});

test('Phase 8: lokasi yang sudah diarsipkan selalu dikecualikan, apa pun kombinasi filternya', () => {
  for (const filters of [{}, { destinationId: 'destination-1' }, { status: 'active' }, { query: 'gudang' }]) {
    assert.match(buildLocationWhere(filters).whereSql, /archived_at is null/);
  }
});

test('Phase 8: ketiga filter bisa digabung sekaligus dengan parameter berurutan yang benar', () => {
  const { whereSql, params } = buildLocationWhere({
    destinationId: 'destination-1',
    status: 'active',
    query: 'gudang',
  });

  assert.match(whereSql, /destination_id = \$1/);
  assert.match(whereSql, /operational_status = 'Aktif'/);
  assert.match(whereSql, /name ilike \$2 or address ilike \$2/);
  assert.deepEqual(params, ['destination-1', '%gudang%']);
});
