alter table container_jobs
  add column if not exists cancel_request_status text not null default 'none',
  add column if not exists cancel_request_note text,
  add column if not exists cancel_requested_by_name text,
  add column if not exists cancel_requested_by_role text,
  add column if not exists cancel_requested_at timestamptz,
  add column if not exists cancel_reviewed_by_name text,
  add column if not exists cancel_reviewed_at timestamptz,
  add column if not exists cancel_review_note text,
  add column if not exists cancelled_at timestamptz;

alter table container_jobs
  drop constraint if exists container_jobs_cancel_request_status_check;

alter table container_jobs
  add constraint container_jobs_cancel_request_status_check
  check (cancel_request_status in ('none', 'submitted', 'approved', 'rejected'));
