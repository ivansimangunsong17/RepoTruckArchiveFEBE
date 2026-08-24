alter table container_job_expenses
  add column if not exists expense_group text;

do $$
begin
  alter table container_job_expenses
    add constraint chk_container_job_expenses_expense_group
    check (expense_group is null or expense_group in ('operational', 'reimbursement'));
exception
  when duplicate_object then null;
end $$;

update container_job_expenses
set expense_group = 'operational'
where category = 'uj_awal'
  and expense_group is null;
