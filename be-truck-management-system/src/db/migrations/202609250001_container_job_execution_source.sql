alter table container_jobs
  add column if not exists execution_source text;

update container_jobs
set execution_source = 'internal'
where execution_source is null;

alter table container_jobs
  alter column execution_source set default 'internal',
  alter column execution_source set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'container_jobs_execution_source_check'
      and conrelid = 'container_jobs'::regclass
  ) then
    alter table container_jobs
      add constraint container_jobs_execution_source_check
      check (execution_source in ('internal', 'vendor'));
  end if;
end $$;
