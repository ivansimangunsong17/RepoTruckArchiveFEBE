alter table container_jobs
  drop constraint if exists container_jobs_rpuj_status_check;

alter table container_jobs
  add constraint container_jobs_rpuj_status_check
  check (rpuj_status in ('pending', 'submitted', 'approved', 'paid', 'rejected'));

alter table container_jobs
  add column if not exists rpuj_requested_by_name text,
  add column if not exists rpuj_requested_at timestamptz,
  add column if not exists rpuj_reviewed_by_name text,
  add column if not exists rpuj_reviewed_at timestamptz,
  add column if not exists rpuj_rejection_note text,
  add column if not exists rpuj_transfer_uploaded_by_name text,
  add column if not exists rpuj_transfer_uploaded_at timestamptz;

update container_jobs
set rpuj_requested_at = coalesce(rpuj_requested_at, updated_at),
    rpuj_requested_by_name = coalesce(rpuj_requested_by_name, updated_by_name)
where rpuj_status in ('submitted', 'approved', 'paid', 'rejected')
  and rpuj_requested_at is null;

update container_jobs
set rpuj_reviewed_at = coalesce(rpuj_reviewed_at, updated_at),
    rpuj_reviewed_by_name = coalesce(rpuj_reviewed_by_name, updated_by_name)
where rpuj_status in ('approved', 'paid', 'rejected')
  and rpuj_reviewed_at is null;

create index if not exists idx_container_jobs_rpuj_status
  on container_jobs(rpuj_status);
