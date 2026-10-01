-- Keep legacy/manual SQL writers compatible while new API writes explicit values.
alter table container_job_expenses
  alter column expense_group set default 'operational',
  alter column input_source set default 'operational';

alter table container_job_expenses
  alter column expense_group drop not null,
  alter column input_source drop not null;
