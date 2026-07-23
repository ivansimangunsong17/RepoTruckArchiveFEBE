alter table container_jobs
  add column if not exists repo_location text,
  add column if not exists repo_stored_at timestamptz,
  add column if not exists repo_reason text,
  add column if not exists repo_notes text,
  add column if not exists repo_released_driver_id uuid references drivers(id) on delete set null,
  add column if not exists repo_released_vehicle_id uuid references vehicles(id) on delete set null,
  add column if not exists repo_created_by_name text;

alter table container_jobs drop constraint if exists container_jobs_status_check;

alter table container_jobs
  add constraint container_jobs_status_check
  check (status in ('received', 'running', 'repo_stored', 'completed', 'cancelled'));
