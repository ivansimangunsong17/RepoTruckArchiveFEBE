import { findLocations } from './locations.repository.js';

const SALES_ROLE = 'sales';

// Sales cuma boleh lihat nama lokasi (untuk memilih di form SO) -- alamat dan link/koordinat Maps
// itu data operasional yang cuma relevan buat OPS di lapangan, jadi field-nya disembunyikan di sisi
// server (bukan cuma disembunyikan di UI) supaya tidak bocor lewat response API kalau suatu saat
// ada consumer lain selain form Sales.
export function canViewLocationSensitiveFields(role) {
  return role !== SALES_ROLE;
}

export function toLocationApiItem(row, { includeSensitive = false } = {}) {
  const item = {
    id: row.id,
    name: row.name,
    status: row.operational_status || 'Aktif',
    destinationId: row.destination_id || null,
  };
  if (!includeSensitive) return item;

  return {
    ...item,
    address: row.address || '',
    googleMapsUrl: row.google_maps_url || '',
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
  };
}

export async function listLocations(query = {}, actor = {}) {
  const rows = await findLocations({
    destinationId: String(query.destinationId || '').trim() || null,
    status: String(query.status || '').trim().toLowerCase(),
    query: query.query || '',
  });
  const includeSensitive = canViewLocationSensitiveFields(actor.role);
  return rows.map((row) => toLocationApiItem(row, { includeSensitive }));
}
