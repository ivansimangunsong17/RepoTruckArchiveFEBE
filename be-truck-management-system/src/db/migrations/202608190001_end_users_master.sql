create table if not exists end_users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  address text,
  pic_name text,
  phone text,
  email text,
  operational_status text not null default 'Aktif',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create unique index if not exists idx_end_users_name_unique
  on end_users(name)
  where archived_at is null;

create unique index if not exists idx_end_users_code_unique
  on end_users(code)
  where code is not null and archived_at is null;
