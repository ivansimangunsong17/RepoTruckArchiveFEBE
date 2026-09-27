create table if not exists container_pickup_movements (
  id uuid primary key default gen_random_uuid(),
  pickup_type text not null default 'single',
  vehicle_id uuid references vehicles(id) on delete set null,
  driver_id uuid references drivers(id) on delete set null,
  assignment_snapshot jsonb not null default '{}'::jsonb,
  pickup_location text,
  status text not null default 'running',
  started_at timestamptz,
  completed_at timestamptz,
  created_by_name text,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  alter table container_pickup_movements
    add constraint chk_container_pickup_movements_type
    check (pickup_type in ('single', 'combo_2x20'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table container_pickup_movements
    add constraint chk_container_pickup_movements_status
    check (status in ('running', 'completed', 'cancelled'));
exception
  when duplicate_object then null;
end $$;

create table if not exists container_pickup_items (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid not null references container_pickup_movements(id) on delete cascade,
  container_job_id uuid not null references container_jobs(id) on delete cascade,
  sequence_no int not null default 1,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_container_pickup_items_movement_job
  on container_pickup_items(movement_id, container_job_id);

create index if not exists idx_container_pickup_movements_vehicle
  on container_pickup_movements(vehicle_id, started_at desc);

create index if not exists idx_container_pickup_items_job
  on container_pickup_items(container_job_id);
