-- Phase 2: Integrasi Lokasi Gudang <-> Tujuan. Menghubungkan Master Lokasi (end_users) ke
-- Master Tujuan (destination_locations) secara opsional, plus field Google Maps/koordinat.
-- Semua kolom nullable -- data lama tanpa tujuan/maps tetap valid tanpa backfill apapun.
alter table end_users
  add column if not exists destination_id uuid references destination_locations(id) on delete set null,
  add column if not exists google_maps_url text,
  add column if not exists latitude numeric(10, 6),
  add column if not exists longitude numeric(10, 6);

create index if not exists idx_end_users_destination_id
  on end_users(destination_id)
  where destination_id is not null;
