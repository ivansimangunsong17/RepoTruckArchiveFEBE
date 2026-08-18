create table if not exists driver_commission_batches (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  status text not null default 'submitted',
  submitted_by_user_id uuid,
  submitted_by_name text,
  submitted_at timestamptz,
  reviewed_by_user_id uuid,
  reviewed_by_name text,
  reviewed_at timestamptz,
  rejection_note text,
  total_items integer not null default 0,
  total_amount numeric(14, 0) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  alter table driver_commission_batches
    add constraint chk_driver_commission_batches_period_order
    check (period_end >= period_start);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table driver_commission_batches
    add constraint chk_driver_commission_batches_status
    check (status in ('draft', 'submitted', 'approved', 'rejected', 'paid'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table driver_commission_batches
    add constraint chk_driver_commission_batches_totals_non_negative
    check (total_items >= 0 and total_amount >= 0);
exception
  when duplicate_object then null;
end $$;

create unique index if not exists uq_driver_commission_batches_active_period
  on driver_commission_batches(period_start, period_end)
  where status in ('draft', 'submitted', 'approved', 'paid');

create index if not exists idx_driver_commission_batches_status_period
  on driver_commission_batches(status, period_start desc, period_end desc);

create table if not exists driver_commission_payments (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references driver_commission_batches(id) on delete cascade,
  driver_id uuid references drivers(id) on delete set null,
  driver_name text not null,
  payment_method text not null default 'bank',
  bank_name text,
  bank_account_number text,
  bank_account_holder text,
  emoney_provider text,
  emoney_number text,
  emoney_account_holder text,
  total_items integer not null default 0,
  total_amount numeric(14, 0) not null default 0,
  status text not null default 'pending',
  paid_by_user_id uuid,
  paid_by_name text,
  paid_at timestamptz,
  payment_proof_attachment_id uuid references attachments(id) on delete set null,
  payment_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  alter table driver_commission_payments
    add constraint chk_driver_commission_payments_payment_method
    check (payment_method in ('bank', 'emoney'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table driver_commission_payments
    add constraint chk_driver_commission_payments_status
    check (status in ('pending', 'paid'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table driver_commission_payments
    add constraint chk_driver_commission_payments_totals_non_negative
    check (total_items >= 0 and total_amount >= 0);
exception
  when duplicate_object then null;
end $$;

create unique index if not exists uq_driver_commission_payments_batch_driver
  on driver_commission_payments(batch_id, driver_id)
  where driver_id is not null;

create index if not exists idx_driver_commission_payments_batch
  on driver_commission_payments(batch_id);

create index if not exists idx_driver_commission_payments_status
  on driver_commission_payments(status);

create table if not exists driver_commission_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references driver_commission_batches(id) on delete cascade,
  payment_id uuid not null references driver_commission_payments(id) on delete cascade,
  container_job_id uuid not null references container_jobs(id) on delete restrict,
  sales_order_id uuid references sales_orders(id) on delete set null,
  so_number text,
  accurate_so_number text,
  container_number text,
  container_size text,
  customer_name text,
  destination text,
  completed_date date not null,
  completed_at timestamptz not null,
  driver_id uuid references drivers(id) on delete set null,
  driver_name text not null,
  amount numeric(14, 0) not null,
  source_destination_id uuid references destination_locations(id) on delete set null,
  commission_note text,
  voided_at timestamptz,
  voided_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  alter table driver_commission_items
    add constraint chk_driver_commission_items_amount_positive
    check (amount > 0);
exception
  when duplicate_object then null;
end $$;

create unique index if not exists uq_driver_commission_items_active_job
  on driver_commission_items(container_job_id)
  where voided_at is null;

create index if not exists idx_driver_commission_items_batch
  on driver_commission_items(batch_id);

create index if not exists idx_driver_commission_items_payment
  on driver_commission_items(payment_id);

create index if not exists idx_driver_commission_items_driver_date
  on driver_commission_items(driver_id, completed_date);

create index if not exists idx_driver_commission_items_completed_date
  on driver_commission_items(completed_date);
