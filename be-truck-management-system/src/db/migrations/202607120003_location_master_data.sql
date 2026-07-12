create table if not exists depots (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  address text,
  operational_status text not null default 'Aktif',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists terminals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  port_area text,
  operational_status text not null default 'Aktif',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists destination_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  area text,
  address text,
  operational_status text not null default 'Aktif',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create unique index if not exists idx_depots_name_unique
  on depots(name)
  where archived_at is null;

create unique index if not exists idx_depots_code_unique
  on depots(code)
  where code is not null and archived_at is null;

create unique index if not exists idx_terminals_name_unique
  on terminals(name)
  where archived_at is null;

create unique index if not exists idx_terminals_code_unique
  on terminals(code)
  where code is not null and archived_at is null;

create unique index if not exists idx_destination_locations_name_unique
  on destination_locations(name)
  where archived_at is null;
