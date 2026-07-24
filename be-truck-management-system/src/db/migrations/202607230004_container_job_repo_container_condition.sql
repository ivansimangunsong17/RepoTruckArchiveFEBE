alter table container_jobs
  add column if not exists repo_container_condition text;

alter table container_jobs drop constraint if exists container_jobs_repo_container_condition_check;

alter table container_jobs
  add constraint container_jobs_repo_container_condition_check
  check (
    repo_container_condition is null
    or repo_container_condition in ('empty', 'loaded')
  );
