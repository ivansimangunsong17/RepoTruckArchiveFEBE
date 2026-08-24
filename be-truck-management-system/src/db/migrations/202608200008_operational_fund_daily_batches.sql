create table if not exists operational_fund_batches (
  id uuid primary key default gen_random_uuid(),
  batch_date date not null unique,
  status text not null default 'open',
  closed_by_name text,
  closed_at timestamptz,
  close_note text,
  created_by_name text,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  alter table operational_fund_batches
    add constraint chk_operational_fund_batches_status
    check (status in ('open', 'under_review', 'closed'));
exception
  when duplicate_object then null;
end $$;

alter table operational_fund_transactions
  add column if not exists batch_id uuid references operational_fund_batches(id) on delete set null;

create index if not exists idx_operational_fund_batches_status_date
  on operational_fund_batches(status, batch_date desc);

create index if not exists idx_operational_fund_transactions_batch
  on operational_fund_transactions(batch_id, transaction_date asc, created_at asc, id asc);

insert into operational_fund_batches (
  batch_date,
  status,
  created_by_name,
  updated_by_name,
  created_at,
  updated_at
)
select
  oft.transaction_date,
  'open',
  'System Backfill',
  'System Backfill',
  min(oft.created_at),
  max(oft.updated_at)
from operational_fund_transactions oft
where oft.transaction_date is not null
group by oft.transaction_date
on conflict (batch_date) do nothing;

update operational_fund_transactions oft
set batch_id = batch.id
from operational_fund_batches batch
where batch.batch_date = oft.transaction_date
  and oft.batch_id is null;

drop view if exists operational_fund_daily_ledger;

create or replace view operational_fund_daily_ledger as
select
  oft.id,
  oft.batch_id,
  batch.batch_date,
  batch.status as batch_status,
  oft.transaction_date,
  oft.transaction_type,
  oft.category,
  oft.amount,
  oft.description,
  coalesce(oft.top_name, oft.created_by_name, '') as top_name,
  coalesce(oft.driver_name, expense.recipient_name, cj.assignment_snapshot->>'driver', '') as driver_name,
  coalesce(oft.do_number, so.do_number, so.destination, '') as do_number,
  coalesce(oft.customer_name, so.customer_name, '') as customer_name,
  case when oft.transaction_type = 'credit' then oft.amount else 0 end as money_in,
  case when oft.transaction_type = 'debit' then oft.amount else 0 end as money_out,
  sum(
    case
      when oft.transaction_type = 'credit' then oft.amount
      when oft.transaction_type = 'debit' then -oft.amount
      when oft.transaction_type = 'adjustment' then oft.amount
      else 0
    end
  ) over (partition by oft.batch_id order by oft.transaction_date asc, oft.created_at asc, oft.id asc rows unbounded preceding) as running_balance,
  oft.status,
  oft.proof_attachment_id,
  oft.fund_request_id,
  oft.container_job_id,
  oft.container_job_expense_id,
  oft.source,
  oft.source_ref_id,
  oft.created_by_name,
  oft.updated_by_name,
  oft.created_at,
  oft.updated_at
from operational_fund_transactions oft
left join operational_fund_batches batch on batch.id = oft.batch_id
left join operational_fund_requests ofr on ofr.id = oft.fund_request_id
left join container_job_expenses expense on expense.id = oft.container_job_expense_id
left join container_jobs cj on cj.id = coalesce(oft.container_job_id, expense.container_job_id)
left join sales_orders so on so.id = cj.sales_order_id
where oft.status = 'posted';
