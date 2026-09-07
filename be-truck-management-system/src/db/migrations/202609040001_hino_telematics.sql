create table if not exists hino_api_tokens (
  provider text primary key,
  access_token text not null,
  token_type text,
  expires_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists hino_vehicle_links (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  hino_vehicle_id text not null,
  hino_plate_number text,
  is_active boolean not null default true,
  linked_by_name text,
  linked_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vehicle_id),
  unique (hino_vehicle_id)
);

create table if not exists hino_vehicle_positions (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references vehicles(id) on delete set null,
  hino_vehicle_id text not null,
  plate_number text,
  latitude numeric(11, 7),
  longitude numeric(11, 7),
  speed_kph numeric(8, 2),
  heading numeric(8, 2),
  ignition_status text,
  engine_status text,
  address text,
  gps_time timestamptz,
  synced_at timestamptz not null default now(),
  raw_payload jsonb not null default '{}'::jsonb
);

create index if not exists idx_hino_vehicle_positions_vehicle_synced
  on hino_vehicle_positions(vehicle_id, synced_at desc);

create index if not exists idx_hino_vehicle_positions_hino_synced
  on hino_vehicle_positions(hino_vehicle_id, synced_at desc);

create table if not exists hino_api_usage_logs (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null,
  status text not null check (status in ('success', 'error', 'skipped')),
  http_status integer,
  request_count integer not null default 1 check (request_count > 0),
  vehicle_count integer not null default 0 check (vehicle_count >= 0),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_hino_api_usage_logs_created
  on hino_api_usage_logs(created_at desc);
