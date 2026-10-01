update container_job_expenses
set
  input_source = idempotency_key,
  idempotency_key = nullif(substring(source_ref_id from '^manual:(.+)$'), '')
where idempotency_key in ('operational', 'finance', 'system')
  and input_source ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and source = 'manual';
