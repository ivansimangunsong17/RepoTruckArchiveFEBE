update container_job_expenses
set input_source = lower(input_source)
where input_source is not null
  and input_source <> lower(input_source);

update container_job_expenses
set input_source = 'operational'
where lower(coalesce(input_source, '')) in ('operations', 'operation', 'admin', '');

alter table container_job_expenses
  drop constraint if exists chk_container_job_expenses_input_source;

alter table container_job_expenses
  add constraint chk_container_job_expenses_input_source
  check (
    input_source is null
    or lower(input_source) in (
      'operational',
      'operations',
      'operation',
      'finance',
      'system',
      'admin'
    )
  );
