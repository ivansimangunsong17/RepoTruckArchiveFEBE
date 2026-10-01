-- Phase 1: make Container Job expense ownership and input source explicit.
alter table container_job_expenses
  add column if not exists input_source text not null default 'operational';

update container_job_expenses
set expense_group = 'operational'
where expense_group is null;

update container_job_expenses
set input_source = 'system'
where source = 'auto_uj_order';

alter table container_job_expenses
  alter column expense_group set not null;

do $$
begin
  alter table container_job_expenses
    add constraint chk_container_job_expenses_group
    check (expense_group in ('operational', 'reimbursement'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table container_job_expenses
    add constraint chk_container_job_expenses_input_source
    check (input_source in ('operational', 'finance', 'system'));
exception
  when duplicate_object then null;
end $$;

create index if not exists idx_container_job_expenses_input_source
  on container_job_expenses(input_source, created_at desc);

create index if not exists idx_container_job_expenses_job_group
  on container_job_expenses(container_job_id, expense_group, created_at desc);
