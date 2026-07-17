alter table container_jobs
  add column if not exists cancel_reason text,
  add column if not exists cancel_source text,
  add column if not exists cancelled_by_name text;

