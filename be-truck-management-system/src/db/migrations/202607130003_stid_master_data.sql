create table if not exists stid_masters (
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

create unique index if not exists idx_stid_masters_name_unique
  on stid_masters(name)
  where archived_at is null;

create unique index if not exists idx_stid_masters_code_unique
  on stid_masters(code)
  where code is not null and archived_at is null;
