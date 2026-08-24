create unique index if not exists uq_container_job_expenses_auto_uj_order
  on container_job_expenses(source, source_ref_id)
  where source = 'auto_uj_order'
    and source_ref_id is not null;

create index if not exists idx_container_job_expenses_auto_uj_order_job
  on container_job_expenses(container_job_id)
  where source = 'auto_uj_order';
