insert into operational_fund_transactions (
  container_job_id,
  container_job_expense_id,
  transaction_date,
  transaction_type,
  category,
  amount,
  description,
  proof_attachment_id,
  top_name,
  driver_name,
  do_number,
  customer_name,
  source,
  source_ref_id,
  created_by_name,
  updated_by_name,
  created_at,
  updated_at
)
select
  expense.container_job_id,
  expense.id,
  coalesce(expense.paid_at::date, expense.created_at::date, current_date),
  'debit',
  case
    when expense.category = 'uj_awal' then 'uj_order'
    when expense.category = 'top_up_uj' then 'top_up_uj'
    else 'biaya_lainnya'
  end,
  expense.amount,
  coalesce(
    nullif(expense.description, ''),
    concat(coalesce(so.so_number, '-'), ' ', coalesce(cj.container_number, ''))
  ),
  expense.proof_attachment_id,
  coalesce(expense.paid_by_name, expense.updated_by_name, expense.created_by_name, 'Operational'),
  coalesce(nullif(expense.recipient_name, ''), cj.assignment_snapshot->>'driver', ''),
  coalesce(so.do_number, so.destination, ''),
  coalesce(so.customer_name, ''),
  case
    when expense.source = 'legacy_rpuj' then 'legacy_rpuj'
    when expense.source = 'auto_uj_order' then 'auto_uj_order'
    else 'container_job_expense_backfill'
  end,
  coalesce(expense.source_ref_id, expense.id::text),
  coalesce(expense.created_by_name, expense.paid_by_name, 'Operational'),
  coalesce(expense.updated_by_name, expense.paid_by_name, 'Operational'),
  coalesce(expense.paid_at, expense.created_at, now()),
  coalesce(expense.updated_at, expense.paid_at, expense.created_at, now())
from container_job_expenses expense
join container_jobs cj on cj.id = expense.container_job_id
join sales_orders so on so.id = coalesce(expense.sales_order_id, cj.sales_order_id)
where expense.payment_status = 'sudah_dibayar'
  and coalesce(expense.amount, 0) > 0
  and not exists (
    select 1
    from operational_fund_transactions existing
    where existing.container_job_expense_id = expense.id
      and existing.transaction_type = 'debit'
      and existing.status = 'posted'
  );
