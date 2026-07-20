do $$
declare
  unique_constraint record;
begin
  for unique_constraint in
    select constraint_row.conname
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'container_jobs'::regclass
      and constraint_row.contype = 'u'
      and array_length(constraint_row.conkey, 1) = 1
      and exists (
        select 1
        from pg_attribute attribute_row
        where attribute_row.attrelid = constraint_row.conrelid
          and attribute_row.attnum = constraint_row.conkey[1]
          and attribute_row.attname = 'container_number'
      )
  loop
    execute format('alter table container_jobs drop constraint %I', unique_constraint.conname);
  end loop;
end $$;

create index if not exists container_jobs_container_number_idx
  on container_jobs (container_number);
