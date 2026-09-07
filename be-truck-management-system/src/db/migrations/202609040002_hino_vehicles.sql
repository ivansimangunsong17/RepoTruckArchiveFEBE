create table if not exists hino_vehicles (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references vehicles(id) on delete set null,
  hino_vehicle_id text not null unique,
  vin text,
  plate_number text,
  display_name text,
  vehicle_status text,
  synced_at timestamptz not null default now(),
  raw_payload jsonb not null default '{}'::jsonb
);

create index if not exists idx_hino_vehicles_vehicle_id
  on hino_vehicles(vehicle_id);

create index if not exists idx_hino_vehicles_plate_number
  on hino_vehicles(lower(replace(coalesce(plate_number, ''), ' ', '')));
