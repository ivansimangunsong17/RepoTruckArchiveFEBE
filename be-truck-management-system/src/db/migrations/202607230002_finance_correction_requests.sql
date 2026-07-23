create table if not exists finance_correction_requests (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references sales_orders(id) on delete cascade,
  correction_type text not null,
  current_value text,
  requested_value text not null,
  reason text not null,
  status text not null default 'pending',
  requires_admin_approval boolean not null default true,
  requested_by_name text,
  requested_by_role text,
  requested_at timestamptz not null default now(),
  reviewed_by_name text,
  reviewed_by_role text,
  reviewed_at timestamptz,
  review_note text,
  applied_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_correction_requests_type_check
    check (correction_type in ('so_number', 'invoice_number')),
  constraint finance_correction_requests_status_check
    check (status in ('pending', 'approved', 'rejected', 'applied')),
  constraint finance_correction_requests_reason_check
    check (length(btrim(reason)) > 0),
  constraint finance_correction_requests_requested_value_check
    check (length(btrim(requested_value)) > 0)
);

create unique index if not exists idx_finance_correction_requests_pending_unique
  on finance_correction_requests(sales_order_id, correction_type)
  where status = 'pending';

create index if not exists idx_finance_correction_requests_sales_order
  on finance_correction_requests(sales_order_id, created_at desc);

create index if not exists idx_finance_correction_requests_status
  on finance_correction_requests(status, created_at desc);

create index if not exists idx_finance_correction_requests_type
  on finance_correction_requests(correction_type, created_at desc);
