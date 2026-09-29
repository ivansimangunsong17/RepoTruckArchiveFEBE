alter table driver_commission_batches
  add column if not exists revision_count integer not null default 0,
  add column if not exists last_revised_at timestamptz,
  add column if not exists last_revised_by_name text,
  add column if not exists last_revision_reason text,
  add column if not exists last_revision_job_id uuid references container_jobs(id) on delete set null,
  add column if not exists last_revision_previous_driver_name text,
  add column if not exists last_revision_next_driver_name text;

do $$
begin
  alter table driver_commission_batches
    add constraint chk_driver_commission_batches_revision_count
    check (revision_count >= 0);
exception
  when duplicate_object then null;
end $$;
