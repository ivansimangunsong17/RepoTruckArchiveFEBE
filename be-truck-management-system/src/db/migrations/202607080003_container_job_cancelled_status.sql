alter table container_jobs drop constraint if exists container_jobs_status_check;

alter table container_jobs
  add constraint container_jobs_status_check
  check (status in ('received', 'running', 'completed', 'cancelled'));
