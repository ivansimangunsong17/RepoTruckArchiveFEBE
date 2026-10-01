alter table container_job_expenses
  drop constraint if exists chk_container_job_expenses_input_source;

update container_job_expenses
set input_source = 'operational'
where input_source is null
   or trim(input_source) = '';
