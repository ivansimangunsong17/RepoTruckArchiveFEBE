alter table container_job_assignment_history
  drop constraint if exists container_job_assignment_history_change_source_check;

alter table container_job_assignment_history
  add constraint container_job_assignment_history_change_source_check
  check (change_source in ('operational', 'admin_correction', 'repo_pickup', 'repo_combo_pickup'));
