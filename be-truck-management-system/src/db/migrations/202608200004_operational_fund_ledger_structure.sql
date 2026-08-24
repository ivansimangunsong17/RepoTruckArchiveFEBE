alter table operational_fund_transactions
  add column if not exists top_name text,
  add column if not exists driver_name text,
  add column if not exists do_number text,
  add column if not exists customer_name text,
  add column if not exists source text not null default 'manual',
  add column if not exists source_ref_id text;

alter table operational_fund_transactions
  drop constraint if exists chk_operational_fund_transactions_category;

alter table operational_fund_transactions
  add constraint chk_operational_fund_transactions_category
  check (category in (
    'deposit_saldo',
    'uj_order',
    'biaya_lainnya',
    'top_up_uj',
    'kasbon',
    'potongan',
    'koreksi',
    'void',
    'dropping_in',
    'container_job_expense',
    'driver_uj_balance',
    'correction',
    'lainnya'
  ));

create unique index if not exists uq_operational_fund_transactions_request_deposit
  on operational_fund_transactions(fund_request_id)
  where fund_request_id is not null
    and category in ('dropping_in', 'deposit_saldo')
    and status = 'posted';

create index if not exists idx_operational_fund_transactions_daily_ledger
  on operational_fund_transactions(transaction_date asc, created_at asc, id asc)
  where status = 'posted';

create index if not exists idx_operational_fund_transactions_source_ref
  on operational_fund_transactions(source, source_ref_id)
  where source_ref_id is not null;

update operational_fund_transactions oft
set
  top_name = coalesce(oft.top_name, oft.created_by_name),
  driver_name = coalesce(oft.driver_name, expense.recipient_name, cj.assignment_snapshot->>'driver'),
  do_number = coalesce(oft.do_number, so.do_number, so.destination),
  customer_name = coalesce(oft.customer_name, so.customer_name),
  source = case when oft.source is null or oft.source in ('', 'manual') then 'container_job_expense' else oft.source end,
  source_ref_id = coalesce(oft.source_ref_id, oft.container_job_expense_id::text)
from container_job_expenses expense
join container_jobs cj on cj.id = expense.container_job_id
join sales_orders so on so.id = cj.sales_order_id
where expense.id = oft.container_job_expense_id;

update operational_fund_transactions oft
set
  top_name = coalesce(oft.top_name, oft.created_by_name),
  source = case when oft.source is null or oft.source in ('', 'manual') then 'finance_deposit' else oft.source end,
  source_ref_id = coalesce(oft.source_ref_id, oft.fund_request_id::text)
from operational_fund_requests ofr
where ofr.id = oft.fund_request_id
  and oft.container_job_expense_id is null;

update operational_fund_transactions oft
set
  top_name = coalesce(oft.top_name, oft.created_by_name),
  driver_name = coalesce(oft.driver_name, cj.assignment_snapshot->>'driver'),
  do_number = coalesce(oft.do_number, so.do_number, so.destination),
  customer_name = coalesce(oft.customer_name, so.customer_name),
  source = case when oft.source is null or oft.source in ('', 'manual') then 'container_job' else oft.source end,
  source_ref_id = coalesce(oft.source_ref_id, oft.container_job_id::text)
from container_jobs cj
join sales_orders so on so.id = cj.sales_order_id
where cj.id = oft.container_job_id
  and oft.container_job_expense_id is null
  and oft.fund_request_id is null;

create or replace view operational_fund_daily_ledger as
select
  oft.id,
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
  ) over (order by oft.transaction_date asc, oft.created_at asc, oft.id asc rows unbounded preceding) as running_balance,
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
left join operational_fund_requests ofr on ofr.id = oft.fund_request_id
left join container_job_expenses expense on expense.id = oft.container_job_expense_id
left join container_jobs cj on cj.id = coalesce(oft.container_job_id, expense.container_job_id)
left join sales_orders so on so.id = cj.sales_order_id
where oft.status = 'posted';
