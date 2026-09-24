with proof_totals as (
  select
    container_job_expense_id,
    sum(amount)::numeric as total_actual_transfer
  from container_job_expense_transfer_proofs
  group by container_job_expense_id
), reconciled_expenses as (
  select
    expense.id,
    expense.source,
    expense.source_ref_id,
    proof_totals.total_actual_transfer
  from container_job_expenses expense
  join proof_totals on proof_totals.container_job_expense_id = expense.id
  where expense.finance_check_status = 'sudah_dicek'
)
update operational_fund_transactions transaction
set container_job_expense_id = expense.id,
    amount = expense.total_actual_transfer,
    updated_by_name = 'System Migration',
    updated_at = now()
from reconciled_expenses expense
where transaction.transaction_type = 'debit'
  and transaction.status = 'posted'
  and (
    transaction.container_job_expense_id = expense.id
    or (
      transaction.container_job_expense_id is null
      and transaction.source = expense.source
      and transaction.source_ref_id = expense.source_ref_id
      and expense.source_ref_id is not null
      and not exists (
        select 1
        from operational_fund_transactions linked
        where linked.container_job_expense_id = expense.id
          and linked.transaction_type = 'debit'
          and linked.status = 'posted'
      )
    )
  );
