alter table vehicles
  add column if not exists default_driver_id uuid references drivers(id) on delete set null;
