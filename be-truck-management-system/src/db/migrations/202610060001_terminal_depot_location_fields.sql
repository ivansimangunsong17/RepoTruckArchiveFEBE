-- Link Google Maps + koordinat untuk Master Terminal dan Master Depo, mengikuti pola Master Lokasi
-- (end_users, 202609180001). Semua kolom nullable dan tanpa backfill: data lama tetap valid dengan
-- nilai kosong sampai diisi manual.
alter table terminals
  add column if not exists google_maps_url text,
  add column if not exists latitude numeric(10, 6),
  add column if not exists longitude numeric(10, 6);

alter table depots
  add column if not exists google_maps_url text,
  add column if not exists latitude numeric(10, 6),
  add column if not exists longitude numeric(10, 6);
