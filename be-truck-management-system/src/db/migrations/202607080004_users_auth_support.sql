create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  password_hash text not null,
  role text not null default 'pengamat',
  status text not null default 'Aktif',
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into users (name, email, password_hash, role, status)
values
  ('Admin Demo', 'admin@demo.com', encode(digest('password', 'sha256'), 'hex'), 'admin', 'Aktif'),
  ('Sinta Sales', 'sales@demo.com', encode(digest('password', 'sha256'), 'hex'), 'sales', 'Aktif'),
  ('Budi Operational', 'operational@demo.com', encode(digest('password', 'sha256'), 'hex'), 'operational', 'Aktif'),
  ('Rina Pengamat', 'pengamat@demo.com', encode(digest('password', 'sha256'), 'hex'), 'pengamat', 'Aktif')
on conflict (email) do update
set name = excluded.name,
    role = excluded.role,
    status = excluded.status,
    updated_at = now();

create index if not exists idx_users_role on users(role);
create index if not exists idx_users_status on users(status);
