with proof_totals as (
  select
    container_job_expense_id,
    sum(amount)::numeric as total_actual_transfer
  from container_job_expense_transfer_proofs
  group by container_job_expense_id
)
insert into operational_fund_transactions (
  batch_id,
  container_job_id,
  container_job_expense_id,
  transaction_date,
  transaction_type,
  category,
  amount,
  description,
  top_name,
  driver_name,
  customer_name,
  source,
  source_ref_id,
  created_by_name,
  updated_by_name
)
select
  batch.id,
  expense.container_job_id,
  expense.id,
  batch.batch_date,
  'debit',
  expense.category,
  proof_totals.total_actual_transfer,
  coalesce(expense.description, 'Biaya rekening dropping'),
  coalesce(expense.finance_checked_by_name, expense.updated_by_name, 'Finance'),
  expense.recipient_name,
  so.customer_name,
  expense.source,
  expense.source_ref_id,
  coalesce(expense.finance_checked_by_name, expense.updated_by_name, 'Finance'),
  coalesce(expense.finance_checked_by_name, expense.updated_by_name, 'Finance')
from container_job_expenses expense
join proof_totals on proof_totals.container_job_expense_id = expense.id
join container_jobs job on job.id = expense.container_job_id
join sales_orders so on so.id = coalesce(expense.sales_order_id, job.sales_order_id)
join operational_fund_batches batch
  on batch.batch_date = coalesce(expense.paid_at::date, expense.created_at::date)
where expense.finance_check_status = 'sudah_dicek'
  and not exists (
    select 1
    from operational_fund_transactions existing
    where existing.container_job_expense_id = expense.id
      and existing.transaction_type = 'debit'
      and existing.status = 'posted'
  )
on conflict (container_job_expense_id)
  where container_job_expense_id is not null
    and transaction_type = 'debit'
    and status = 'posted'
do update set
  amount = excluded.amount,
  updated_by_name = excluded.updated_by_name,
  updated_at = now();
