create table if not exists kir_heads (
  id uuid primary key default gen_random_uuid(),
  unit_code text not null,
  plate_number text not null,
  kir_number text,
  kir_expiry_date date,
  operational_status text not null default 'Aktif',
  notes text,
  kir_document jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists kir_chassis (
  id uuid primary key default gen_random_uuid(),
  chassis_code text not null,
  plate_number text,
  container_size text not null default '20FT' check (container_size in ('20FT', '40FT', 'COMBO')),
  kir_number text,
  kir_expiry_date date,
  operational_status text not null default 'Aktif',
  notes text,
  kir_document jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create unique index if not exists idx_kir_heads_unit_code_unique
  on kir_heads(unit_code)
  where archived_at is null;

create unique index if not exists idx_kir_heads_plate_number_unique
  on kir_heads(plate_number)
  where archived_at is null;

create unique index if not exists idx_kir_heads_kir_number_unique
  on kir_heads(kir_number)
  where kir_number is not null and archived_at is null;

create unique index if not exists idx_kir_chassis_code_unique
  on kir_chassis(chassis_code)
  where archived_at is null;

create unique index if not exists idx_kir_chassis_plate_number_unique
  on kir_chassis(plate_number)
  where plate_number is not null and archived_at is null;

create unique index if not exists idx_kir_chassis_kir_number_unique
  on kir_chassis(kir_number)
  where kir_number is not null and archived_at is null;
