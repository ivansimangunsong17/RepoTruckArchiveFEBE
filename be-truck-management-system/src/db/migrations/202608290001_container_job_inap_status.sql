alter table container_jobs
  add column if not exists inap_started_at timestamptz,
  add column if not exists inap_ended_at timestamptz,
  add column if not exists inap_reason text,
  add column if not exists inap_notes text,
  add column if not exists inap_created_by_name text;

-- Kolom inap_* sengaja tidak pernah dikosongkan lagi setelah job lanjut ke running/completed
-- (persis pola repo_reason/repo_notes) -- histori bahwa ritasi pernah inap harus tetap terlihat.
alter table container_jobs
  drop constraint if exists container_jobs_status_check;

alter table container_jobs
  add constraint container_jobs_status_check
  check (status in ('received', 'running', 'repo_stored', 'completed', 'cancelled', 'inap'));
