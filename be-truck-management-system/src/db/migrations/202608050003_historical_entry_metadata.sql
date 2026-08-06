alter table sales_orders add column if not exists entry_source text not null default 'realtime';
alter table sales_orders add column if not exists historical_period text;
alter table sales_orders add column if not exists historical_notes text;

alter table container_jobs add column if not exists entry_source text not null default 'realtime';
alter table container_jobs add column if not exists historical_period text;
alter table container_jobs add column if not exists historical_notes text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sales_orders_entry_source_check'
  ) then
    alter table sales_orders
      add constraint sales_orders_entry_source_check
      check (entry_source in ('realtime', 'historical'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'container_jobs_entry_source_check'
  ) then
    alter table container_jobs
      add constraint container_jobs_entry_source_check
      check (entry_source in ('realtime', 'historical'));
  end if;
end $$;

create index if not exists idx_sales_orders_entry_source
  on sales_orders(entry_source);

create index if not exists idx_sales_orders_historical_period
  on sales_orders(historical_period)
  where entry_source = 'historical';

create index if not exists idx_container_jobs_entry_source
  on container_jobs(entry_source);

create index if not exists idx_container_jobs_historical_period
  on container_jobs(historical_period)
  where entry_source = 'historical';
