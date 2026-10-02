import { query } from '../../db/client.js';

// Sumber data lokasi tetap tabel end_users (Master Lokasi) -- endpoint ini murni query read-only
// terpisah dari CRUD generik /api/master/end-users supaya bisa dipanggil Sales/OPS tanpa
// mengekspos field admin lain (pic/phone/email/notes/code) yang tidak relevan untuk pemilihan
// lokasi di form transaksi.
//
// Dipisah dari findLocations() (Phase 8) supaya jaminan filter -- isolasi antar tujuan, status
// aktif hanya untuk transaksi baru, dan pencarian nama/alamat -- bisa diuji langsung sebagai unit
// test murni tanpa database (lihat locations.repository.test.js), sama seperti buildWhere() di
// master.repository.js.
export function buildLocationWhere({ destinationId, status, query: keyword } = {}) {
  const clauses = ['archived_at is null'];
  const params = [];

  if (destinationId) {
    params.push(destinationId);
    clauses.push(`destination_id = $${params.length}`);
  }

  if (status === 'active') {
    clauses.push(`operational_status = 'Aktif'`);
  }

  const cleanKeyword = String(keyword || '').trim();
  if (cleanKeyword) {
    params.push(`%${cleanKeyword}%`);
    clauses.push(`(name ilike $${params.length} or address ilike $${params.length})`);
  }

  return {
    whereSql: `where ${clauses.join(' and ')}`,
    params,
  };
}

export async function findLocations(filters = {}) {
  const { whereSql, params } = buildLocationWhere(filters);
  const result = await query(
    `
      select id, name, address, operational_status, destination_id, google_maps_url, latitude, longitude
      from end_users
      ${whereSql}
      order by name asc
    `,
    params,
  );
  return result.rows;
}
