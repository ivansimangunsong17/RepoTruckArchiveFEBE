alter table destination_locations
  add column if not exists uj_20ft numeric(14, 0),
  add column if not exists uj_40ft numeric(14, 0),
  add column if not exists uj_notes text;

