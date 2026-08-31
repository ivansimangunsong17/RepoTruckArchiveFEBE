create table if not exists container_job_assignment_history (
  id uuid primary key default gen_random_uuid(),
  container_job_id uuid not null references container_jobs(id) on delete cascade,
  change_source text not null default 'operational'
    check (change_source in ('operational', 'admin_correction')),
  previous_driver_id uuid references drivers(id) on delete set null,
  previous_driver_name text,
  next_driver_id uuid references drivers(id) on delete set null,
  next_driver_name text,
  previous_vehicle_id uuid references vehicles(id) on delete set null,
  previous_plate_number text,
  next_vehicle_id uuid references vehicles(id) on delete set null,
  next_plate_number text,
  reason text,
  note text,
  changed_by_name text,
  changed_by_role text,
  created_at timestamptz not null default now()
);

create index if not exists idx_container_job_assignment_history_job
  on container_job_assignment_history(container_job_id, created_at desc);
