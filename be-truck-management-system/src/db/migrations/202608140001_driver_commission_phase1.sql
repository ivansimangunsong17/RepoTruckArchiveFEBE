alter table destination_locations
  add column if not exists driver_commission_amount numeric(14, 0) not null default 0;

alter table container_jobs
  add column if not exists has_driver_commission boolean not null default false,
  add column if not exists driver_commission_amount numeric(14, 0) not null default 0,
  add column if not exists driver_commission_source_destination_id uuid references destination_locations(id) on delete set null,
  add column if not exists driver_commission_note text;

do $$
begin
  alter table destination_locations
    add constraint chk_destination_locations_driver_commission_amount_non_negative
    check (driver_commission_amount >= 0);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table container_jobs
    add constraint chk_container_jobs_driver_commission_amount_non_negative
    check (driver_commission_amount >= 0);
exception
  when duplicate_object then null;
end $$;

create index if not exists idx_container_jobs_driver_commission_source_destination
  on container_jobs(driver_commission_source_destination_id)
  where driver_commission_source_destination_id is not null;
