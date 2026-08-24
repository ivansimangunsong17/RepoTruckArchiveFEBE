alter table operational_fund_transactions
  add column if not exists container_job_id uuid references container_jobs(id) on delete set null,
  add column if not exists container_job_expense_id uuid references container_job_expenses(id) on delete set null;

create unique index if not exists uq_operational_fund_transactions_expense_debit
  on operational_fund_transactions(container_job_expense_id)
  where container_job_expense_id is not null
    and transaction_type = 'debit'
    and status = 'posted';

create index if not exists idx_operational_fund_transactions_container_job
  on operational_fund_transactions(container_job_id, transaction_date desc);

