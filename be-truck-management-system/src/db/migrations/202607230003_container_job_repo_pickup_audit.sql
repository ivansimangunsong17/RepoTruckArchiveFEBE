alter table container_jobs
  add column if not exists repo_picked_up_at timestamptz,
  add column if not exists repo_picked_up_by_name text;
