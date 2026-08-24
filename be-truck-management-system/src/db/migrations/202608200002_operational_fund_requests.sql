create table if not exists operational_fund_requests (
  id uuid primary key default gen_random_uuid(),
  request_date date not null,
  amount numeric(14, 0) not null,
  purpose text,
  status text not null default 'submitted',
  requested_by_name text,
  requested_at timestamptz not null default now(),
  reviewed_by_name text,
  reviewed_at timestamptz,
  rejection_note text,
  transfer_uploaded_by_name text,
  transfer_uploaded_at timestamptz,
  transfer_proof_attachment_id uuid references attachments(id) on delete set null,
  created_by_name text,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  alter table operational_fund_requests
    add constraint chk_operational_fund_requests_amount_positive
    check (amount > 0);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table operational_fund_requests
    add constraint chk_operational_fund_requests_status
    check (status in ('submitted', 'approved', 'rejected', 'transferred', 'cancelled'));
exception
  when duplicate_object then null;
end $$;

create index if not exists idx_operational_fund_requests_active_date
  on operational_fund_requests(request_date)
  where status in ('submitted', 'approved', 'transferred');

create index if not exists idx_operational_fund_requests_status_date
  on operational_fund_requests(status, request_date desc);

create table if not exists operational_fund_transactions (
  id uuid primary key default gen_random_uuid(),
  fund_request_id uuid references operational_fund_requests(id) on delete set null,
  transaction_date date not null default current_date,
  transaction_type text not null,
  category text not null,
  amount numeric(14, 0) not null,
  description text,
  proof_attachment_id uuid references attachments(id) on delete set null,
  status text not null default 'posted',
  created_by_name text,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  alter table operational_fund_transactions
    add constraint chk_operational_fund_transactions_type
    check (transaction_type in ('credit', 'debit', 'adjustment'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table operational_fund_transactions
    add constraint chk_operational_fund_transactions_category
    check (category in ('dropping_in', 'container_job_expense', 'driver_uj_balance', 'correction', 'lainnya'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table operational_fund_transactions
    add constraint chk_operational_fund_transactions_status
    check (status in ('posted', 'void'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table operational_fund_transactions
    add constraint chk_operational_fund_transactions_amount_positive
    check (amount > 0);
exception
  when duplicate_object then null;
end $$;

create unique index if not exists uq_operational_fund_transactions_request_credit
  on operational_fund_transactions(fund_request_id, category)
  where category = 'dropping_in' and status = 'posted';

create index if not exists idx_operational_fund_transactions_date
  on operational_fund_transactions(transaction_date desc, created_at desc);
