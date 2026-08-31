create table if not exists manual_revenue_lines (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references sales_orders(id) on delete cascade,
  container_job_id uuid references container_jobs(id) on delete set null,
  charge_type text not null default 'inap',
  description text not null,
  quantity numeric(10, 2) not null default 1,
  unit text not null default 'malam',
  unit_price numeric(14, 0) not null,
  total_amount numeric(14, 0) not null,
  note text,
  status text not null default 'active',
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_by_name text,
  updated_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by_name text,
  void_reason text
);

do $$
begin
  alter table manual_revenue_lines
    add constraint chk_manual_revenue_lines_charge_type
    check (charge_type in ('inap', 'waiting_charge', 'extra_trip', 'storage', 'other'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table manual_revenue_lines
    add constraint chk_manual_revenue_lines_status
    check (status in ('draft', 'active', 'void'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table manual_revenue_lines
    add constraint chk_manual_revenue_lines_quantity_positive
    check (quantity > 0);
exception
  when duplicate_object then null;
end $$;

create index if not exists idx_manual_revenue_lines_sales_order_id
  on manual_revenue_lines(sales_order_id);
