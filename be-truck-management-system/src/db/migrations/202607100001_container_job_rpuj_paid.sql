alter table container_jobs
  drop constraint if exists container_jobs_rpuj_status_check;

alter table container_jobs
  add constraint container_jobs_rpuj_status_check
  check (rpuj_status in ('pending', 'submitted', 'approved', 'paid', 'rejected'));
