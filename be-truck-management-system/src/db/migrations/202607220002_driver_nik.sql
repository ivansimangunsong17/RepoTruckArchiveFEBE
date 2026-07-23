alter table drivers add column if not exists nik text;

create unique index if not exists idx_drivers_nik_unique
  on drivers(nik)
  where nik is not null and archived_at is null;
