alter table container_job_expenses
  add column if not exists admin_fee_amount numeric(14, 0) not null default 0,
  add column if not exists adjustment_note text;

do $$
begin
  alter table container_job_expenses
    add constraint chk_container_job_expenses_admin_fee_non_negative
    check (admin_fee_amount >= 0);
exception
  when duplicate_object then null;
end $$;

create table if not exists container_job_expense_transfer_proofs (
  id uuid primary key default gen_random_uuid(),
  container_job_expense_id uuid not null references container_job_expenses(id) on delete cascade,
  attachment_id uuid not null unique references attachments(id) on delete cascade,
  amount numeric(14, 0) not null,
  transfer_date date not null,
  note text,
  created_by_name text,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_container_job_expense_transfer_proofs_amount_positive check (amount > 0)
);

create index if not exists idx_container_job_expense_transfer_proofs_expense
  on container_job_expense_transfer_proofs(container_job_expense_id, transfer_date asc, created_at asc);

-- Preserve existing single-proof records as the first proof entry. Finance can
-- correct the amount later while its rekening dropping batch is still open.
insert into container_job_expense_transfer_proofs (
  container_job_expense_id,
  attachment_id,
  amount,
  transfer_date,
  note,
  created_by_name,
  updated_by_name,
  created_at,
  updated_at
)
select
  expense.id,
  expense.proof_attachment_id,
  expense.amount,
  coalesce(expense.paid_at::date, expense.created_at::date),
  expense.finance_note,
  coalesce(expense.paid_by_name, expense.finance_checked_by_name, expense.created_by_name, 'System Backfill'),
  coalesce(expense.updated_by_name, expense.paid_by_name, expense.created_by_name, 'System Backfill'),
  coalesce(expense.paid_at, expense.created_at, now()),
  coalesce(expense.updated_at, expense.paid_at, expense.created_at, now())
from container_job_expenses expense
where expense.proof_attachment_id is not null
on conflict (attachment_id) do nothing;
