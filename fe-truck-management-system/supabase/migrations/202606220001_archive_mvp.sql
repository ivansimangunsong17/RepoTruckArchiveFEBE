-- ATMS Archive MVP. Future Fleet and Finance modules reference these UUIDs.
create extension if not exists pgcrypto;

create type public.app_role as enum ('admin', 'sales', 'operational', 'observer');
create type public.record_status as enum ('active', 'inactive');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  role public.app_role not null default 'observer',
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  npwp text unique,
  address text not null,
  pic_name text not null,
  phone text not null,
  email text,
  contract_number text unique,
  contract_start date,
  contract_end date,
  contract_status text not null default 'Aktif',
  archived_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  unit_code text not null unique,
  plate_number text not null unique,
  brand text not null,
  vehicle_type text not null,
  vin text not null unique,
  engine_number text not null unique,
  operational_status text not null default 'Aktif',
  archived_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null unique,
  license_type text not null,
  license_expiry date not null,
  operational_status text not null default 'Aktif',
  archived_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  so_number text not null unique,
  do_number text,
  so_date date not null,
  received_at timestamptz not null,
  customer_id uuid not null references public.customers(id),
  customer_snapshot jsonb not null default '{}'::jsonb,
  shipment_type text not null,
  job_type text not null,
  job_description text,
  origin text not null,
  destination text not null,
  price numeric(18,2) not null default 0,
  quantity numeric(12,2) not null default 1,
  unit text not null default 'Container',
  total_amount numeric(18,2) generated always as (price * quantity) stored,
  status text not null default 'waiting_operational',
  notes text,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id),
  created_by uuid not null references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.container_jobs (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references public.sales_orders(id) on delete restrict,
  container_number text not null unique,
  container_size text not null,
  container_type text,
  container_notes text,
  driver_id uuid references public.drivers(id),
  vehicle_id uuid references public.vehicles(id),
  assignment_snapshot jsonb not null default '{}'::jsonb,
  rpuj_status text not null default 'pending',
  rpuj_notes text,
  spk_number text,
  loading_voucher_number text,
  unloading_voucher_number text,
  travel_document_number text,
  weighing_document_number text,
  status text not null default 'received',
  hold_reason text,
  received_at timestamptz not null,
  running_at timestamptz,
  completed_at timestamptz,
  created_by uuid not null references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('customer', 'vehicle', 'driver', 'sales_order', 'container_job')),
  entity_id uuid not null,
  category text not null,
  reference_number text,
  document_date date,
  notes text,
  file_name text not null,
  storage_path text not null unique,
  mime_type text,
  file_size bigint,
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.job_status_history (
  id uuid primary key default gen_random_uuid(),
  container_job_id uuid not null references public.container_jobs(id) on delete cascade,
  from_status text,
  to_status text not null,
  notes text,
  changed_by uuid not null references public.profiles(id),
  changed_at timestamptz not null default now()
);

create table public.activity_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  action text not null,
  module text not null,
  entity_type text,
  entity_id uuid,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.system_settings (
  setting_key text primary key,
  setting_value jsonb not null,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create index sales_orders_customer_idx on public.sales_orders(customer_id);
create index sales_orders_status_date_idx on public.sales_orders(status, so_date desc);
create index container_jobs_order_idx on public.container_jobs(sales_order_id);
create index container_jobs_status_idx on public.container_jobs(status);
create index attachments_entity_idx on public.attachments(entity_type, entity_id);
create index activity_logs_created_idx on public.activity_logs(created_at desc);

create or replace function public.current_user_role()
returns public.app_role language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() and status = 'active'; $$;

create or replace function public.set_audit_fields()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  new.updated_at = now();
  if tg_op = 'INSERT' then new.created_by = coalesce(new.created_by, auth.uid()); end if;
  new.updated_by = auth.uid();
  return new;
end; $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email,
    coalesce((new.raw_user_meta_data ->> 'role')::public.app_role, 'observer')
  ) on conflict (id) do nothing;
  return new;
end; $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.profiles (id, full_name, email, role)
select
  id,
  coalesce(raw_user_meta_data ->> 'full_name', split_part(email, '@', 1)),
  email,
  case
    when raw_user_meta_data ->> 'role' in ('admin','sales','operational','observer')
      then (raw_user_meta_data ->> 'role')::public.app_role
    else 'observer'::public.app_role
  end
from auth.users
on conflict (id) do nothing;
create trigger customers_audit before insert or update on public.customers
for each row execute function public.set_audit_fields();
create trigger vehicles_audit before insert or update on public.vehicles
for each row execute function public.set_audit_fields();
create trigger drivers_audit before insert or update on public.drivers
for each row execute function public.set_audit_fields();
create trigger sales_orders_audit before insert or update on public.sales_orders
for each row execute function public.set_audit_fields();
create trigger container_jobs_audit before insert or update on public.container_jobs
for each row execute function public.set_audit_fields();

create or replace function public.log_job_status_change()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if old.status is distinct from new.status then
    insert into public.job_status_history (container_job_id, from_status, to_status, notes, changed_by)
    values (new.id, old.status, new.status, new.hold_reason, auth.uid());
  end if;
  return new;
end; $$;
create trigger container_job_status_audit after update on public.container_jobs
for each row execute function public.log_job_status_change();

create or replace function public.sync_sales_order_status()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  parent_id uuid;
  next_status text;
begin
  if tg_op = 'DELETE' then parent_id := old.sales_order_id;
  else parent_id := new.sales_order_id;
  end if;
  select case
    when bool_and(status = 'completed') then 'completed'
    when bool_or(status in ('running','hold','completed')) then 'running'
    else 'waiting_operational'
  end into next_status
  from public.container_jobs
  where sales_order_id = parent_id;

  update public.sales_orders
  set status = coalesce(next_status, 'waiting_operational')
  where id = parent_id and status <> 'cancelled';
  return null;
end; $$;

create trigger sync_order_after_job
after insert or update or delete on public.container_jobs
for each row execute function public.sync_sales_order_status();

create or replace function public.log_archive_activity()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  row_id uuid;
begin
  row_id := case when tg_op = 'DELETE' then old.id else new.id end;
  insert into public.activity_logs (actor_id, action, module, entity_type, entity_id, description)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    tg_table_name,
    row_id,
    tg_op || ' pada ' || tg_table_name
  );
  return case when tg_op = 'DELETE' then old else new end;
end; $$;

create trigger customers_activity after insert or update on public.customers
for each row execute function public.log_archive_activity();
create trigger vehicles_activity after insert or update on public.vehicles
for each row execute function public.log_archive_activity();
create trigger drivers_activity after insert or update on public.drivers
for each row execute function public.log_archive_activity();
create trigger sales_orders_activity after insert or update on public.sales_orders
for each row execute function public.log_archive_activity();
create trigger container_jobs_activity after insert or update on public.container_jobs
for each row execute function public.log_archive_activity();
create trigger attachments_activity after insert on public.attachments
for each row execute function public.log_archive_activity();

alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.vehicles enable row level security;
alter table public.drivers enable row level security;
alter table public.sales_orders enable row level security;
alter table public.container_jobs enable row level security;
alter table public.attachments enable row level security;
alter table public.job_status_history enable row level security;
alter table public.activity_logs enable row level security;
alter table public.system_settings enable row level security;

create policy profiles_read on public.profiles for select using (auth.uid() is not null);
create policy profiles_admin_update on public.profiles for update
using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');

create policy customers_read on public.customers for select using (auth.uid() is not null);
create policy customers_admin_insert on public.customers for insert with check (public.current_user_role() = 'admin');
create policy customers_admin_update on public.customers for update
using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy vehicles_read on public.vehicles for select using (auth.uid() is not null);
create policy vehicles_admin_insert on public.vehicles for insert with check (public.current_user_role() = 'admin');
create policy vehicles_admin_update on public.vehicles for update
using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy drivers_read on public.drivers for select using (auth.uid() is not null);
create policy drivers_admin_insert on public.drivers for insert with check (public.current_user_role() = 'admin');
create policy drivers_admin_update on public.drivers for update
using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');

create policy orders_read on public.sales_orders for select using (auth.uid() is not null);
create policy orders_sales_insert on public.sales_orders for insert
with check (public.current_user_role() = 'sales' and created_by = auth.uid());
create policy orders_sales_update on public.sales_orders for update
using (public.current_user_role() = 'sales' and created_by = auth.uid())
with check (public.current_user_role() = 'sales' and created_by = auth.uid());

create policy jobs_read on public.container_jobs for select using (auth.uid() is not null);
create policy jobs_sales_insert on public.container_jobs for insert
with check (
  public.current_user_role() = 'sales' and exists (
    select 1 from public.sales_orders so where so.id = sales_order_id and so.created_by = auth.uid()
  )
);
create policy jobs_sales_update on public.container_jobs for update
using (
  public.current_user_role() = 'sales' and status = 'received' and exists (
    select 1 from public.sales_orders so where so.id = sales_order_id and so.created_by = auth.uid()
  )
) with check (public.current_user_role() = 'sales');
create policy jobs_operational_update on public.container_jobs for update
using (public.current_user_role() = 'operational')
with check (public.current_user_role() = 'operational');
create policy jobs_sales_delete_initial on public.container_jobs for delete
using (
  public.current_user_role() = 'sales' and status = 'received' and exists (
    select 1 from public.sales_orders so where so.id = sales_order_id and so.created_by = auth.uid()
  )
);

create policy attachments_read on public.attachments for select
using (
  public.current_user_role() = 'admin'
  or (public.current_user_role() = 'sales' and entity_type in ('customer', 'sales_order'))
  or (public.current_user_role() = 'operational' and entity_type in ('vehicle', 'driver', 'container_job'))
);
create policy attachments_insert on public.attachments for insert
with check (
  uploaded_by = auth.uid() and (
    public.current_user_role() = 'admin'
    or (public.current_user_role() = 'sales' and entity_type = 'sales_order')
    or (public.current_user_role() = 'operational' and entity_type = 'container_job')
  )
);
create policy status_history_read on public.job_status_history for select using (auth.uid() is not null);
create policy activity_admin_read on public.activity_logs for select using (public.current_user_role() = 'admin');
create policy settings_admin_all on public.system_settings for all
using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('archive-documents', 'archive-documents', false, 5242880, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
allowed_mime_types = array['application/pdf','image/jpeg','image/png'];

create policy archive_storage_read on storage.objects for select
using (bucket_id = 'archive-documents' and public.current_user_role() in ('admin','sales','operational'));
create policy archive_storage_insert on storage.objects for insert
with check (
  bucket_id = 'archive-documents'
  and public.current_user_role() in ('admin','sales','operational')
  and (storage.foldername(name))[1] = auth.uid()::text
);

create schema if not exists fleet;
create schema if not exists finance;
comment on schema fleet is 'Phase 2: trips, GPS, fuel, maintenance, inspections';
comment on schema finance is 'Phase 3: invoices, payments, operational costs, profitability';
