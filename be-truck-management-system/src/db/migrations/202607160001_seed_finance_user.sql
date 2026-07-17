insert into users (name, email, password_hash, role, status)
values
  ('Fitri Finance', 'finance@demo.com', encode(digest('password', 'sha256'), 'hex'), 'finance', 'Aktif')
on conflict (email) do update
set name = excluded.name,
    role = excluded.role,
    status = excluded.status,
    updated_at = now();
