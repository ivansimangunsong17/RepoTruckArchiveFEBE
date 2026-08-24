alter table container_job_expenses
  add column if not exists idempotency_key text;

create unique index if not exists uq_container_job_expenses_idempotency_key
  on container_job_expenses(idempotency_key)
  where idempotency_key is not null;
