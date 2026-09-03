create table if not exists vehicle_assignment_history (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  change_type text not null check (change_type in ('default_driver', 'chassis')),
  previous_driver_id uuid references drivers(id) on delete set null,
  previous_driver_name text,
  next_driver_id uuid references drivers(id) on delete set null,
  next_driver_name text,
  previous_chassis_id uuid references kir_chassis(id) on delete set null,
  previous_chassis_code text,
  next_chassis_id uuid references kir_chassis(id) on delete set null,
  next_chassis_code text,
  reason text,
  note text,
  changed_by_name text,
  changed_by_role text,
  created_at timestamptz not null default now()
);

create index if not exists idx_vehicle_assignment_history_vehicle
  on vehicle_assignment_history(vehicle_id, created_at desc);
