create extension if not exists pgcrypto;

create table if not exists schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

create table if not exists system_settings (
  setting_key text primary key,
  setting_value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  address text,
  pic_name text,
  phone text,
  contract_status text not null default 'Aktif',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists drivers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  license_type text,
  license_expiry_date date,
  operational_status text not null default 'Aktif',
  health_status text not null default 'Aman',
  notes text,
  documents jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists vehicles (
  id uuid primary key default gen_random_uuid(),
  unit_code text not null unique,
  plate_number text not null unique,
  brand text,
  vehicle_type text,
  container_size text not null check (container_size in ('20FT', '40FT')),
  production_year integer,
  stnk_expiry_date date,
  kir_expiry_date date,
  operational_status text not null default 'Aktif',
  default_driver_name text,
  notes text,
  documents jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists sales_orders (
  id uuid primary key default gen_random_uuid(),
  so_number text not null unique,
  do_number text,
  so_date date not null default current_date,
  trip_date date not null default current_date,
  received_at timestamptz not null default now(),
  customer_id uuid references customers(id) on delete set null,
  customer_name text not null,
  customer_pic text,
  customer_phone text,
  customer_address text,
  shipment_type text not null,
  job_type text not null default 'Trucking Container',
  vessel_name text,
  job_description text,
  invoice_number text,
  billing_status text not null default 'pending_invoice',
  container_summary text,
  line_items jsonb not null default '[]'::jsonb,
  terminal text,
  service_name text,
  do20_quantity integer not null default 0,
  do40_quantity integer not null default 0,
  cargo_type text,
  price numeric(14, 2) not null default 0,
  quantity integer not null default 1,
  unit text not null default 'Container',
  total_amount numeric(14, 2) not null default 0,
  origin text not null,
  destination text not null,
  status text not null default 'waiting_operational'
    check (status in ('waiting_operational', 'running', 'completed', 'cancelled')),
  sales_name text,
  created_by_name text,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  notes text,
  reference_documents jsonb not null default '[]'::jsonb
);

create table if not exists container_jobs (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references sales_orders(id) on delete cascade,
  container_number text not null unique,
  container_size text not null check (container_size in ('20FT', '40FT')),
  container_type text not null default 'Dry',
  container_notes text,
  rpuj_status text not null default 'pending'
    check (rpuj_status in ('pending', 'submitted', 'approved', 'rejected')),
  rpuj_notes text,
  spk_number text,
  eir_number text,
  loading_voucher_number text,
  unloading_voucher_number text,
  travel_document_number text,
  weighing_document_number text,
  driver_id uuid references drivers(id) on delete set null,
  vehicle_id uuid references vehicles(id) on delete set null,
  assignment_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'received'
    check (status in ('received', 'running', 'completed')),
  received_at timestamptz not null default now(),
  running_at timestamptz,
  completed_at timestamptz,
  created_by_name text,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists attachments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  category text not null,
  reference_number text,
  document_date date,
  file_name text not null,
  storage_path text,
  mime_type text,
  file_size bigint,
  notes text,
  uploaded_by_name text,
  created_at timestamptz not null default now()
);

create table if not exists activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_name text,
  actor_role text,
  action text not null,
  target text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_sales_orders_status on sales_orders(status);
create index if not exists idx_sales_orders_trip_date on sales_orders(trip_date);
create index if not exists idx_container_jobs_sales_order_id on container_jobs(sales_order_id);
create index if not exists idx_container_jobs_status on container_jobs(status);
create index if not exists idx_container_jobs_vehicle_id on container_jobs(vehicle_id);
create index if not exists idx_container_jobs_driver_id on container_jobs(driver_id);
create index if not exists idx_attachments_entity on attachments(entity_type, entity_id);
create index if not exists idx_activity_logs_created_at on activity_logs(created_at desc);
