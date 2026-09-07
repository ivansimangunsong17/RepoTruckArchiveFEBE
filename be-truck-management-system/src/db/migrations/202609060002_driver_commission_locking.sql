alter table container_jobs
  add column if not exists commission_driver_id uuid references drivers(id) on delete set null,
  add column if not exists commission_driver_name text,
  add column if not exists commission_driver_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists commission_locked_amount numeric(14, 0),
  add column if not exists commission_locked_at timestamptz,
  add column if not exists commission_status text not null default 'pending';

do $$
begin
  alter table container_jobs
    add constraint chk_container_jobs_commission_locked_amount_non_negative
    check (commission_locked_amount is null or commission_locked_amount >= 0);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table container_jobs
    add constraint chk_container_jobs_commission_status
    check (commission_status in ('pending', 'with_commission', 'without_commission', 'needs_review'));
exception
  when duplicate_object then null;
end $$;

update container_jobs
set commission_driver_id = coalesce(commission_driver_id, driver_id),
    commission_driver_name = coalesce(
      nullif(btrim(commission_driver_name), ''),
      nullif(btrim(assignment_snapshot->>'driver'), '')
    ),
    commission_driver_snapshot = case
      when commission_driver_snapshot = '{}'::jsonb
        and nullif(btrim(assignment_snapshot->>'driver'), '') is not null
      then jsonb_build_object(
        'driver', assignment_snapshot->>'driver',
        'driverPaymentMethod', assignment_snapshot->>'driverPaymentMethod',
        'driverBankName', assignment_snapshot->>'driverBankName',
        'driverBankAccountNumber', assignment_snapshot->>'driverBankAccountNumber',
        'driverBankAccountHolder', assignment_snapshot->>'driverBankAccountHolder',
        'driverEmoneyProvider', assignment_snapshot->>'driverEmoneyProvider',
        'driverEmoneyNumber', assignment_snapshot->>'driverEmoneyNumber'
      )
      else commission_driver_snapshot
    end,
    commission_locked_amount = case
      when status = 'completed'
        and coalesce(has_driver_commission, false)
        and coalesce(driver_commission_amount, 0) > 0
      then coalesce(commission_locked_amount, driver_commission_amount)
      else commission_locked_amount
    end,
    commission_locked_at = case
      when status = 'completed'
        and coalesce(has_driver_commission, false)
        and coalesce(driver_commission_amount, 0) > 0
      then coalesce(commission_locked_at, completed_at, updated_at, now())
      else commission_locked_at
    end,
    commission_status = case
      when not coalesce(has_driver_commission, false) then 'without_commission'
      when coalesce(driver_commission_amount, 0) <= 0 then 'needs_review'
      when coalesce(commission_driver_id, driver_id) is null
        and nullif(btrim(coalesce(commission_driver_name, assignment_snapshot->>'driver', '')), '') is null
      then 'needs_review'
      when status = 'completed' then 'with_commission'
      else coalesce(nullif(commission_status, 'pending'), 'pending')
    end
where commission_driver_id is null
   or nullif(btrim(commission_driver_name), '') is null
   or commission_locked_amount is null
   or commission_locked_at is null
   or commission_status = 'pending';

create index if not exists idx_container_jobs_commission_driver
  on container_jobs(commission_driver_id)
  where commission_driver_id is not null;

create index if not exists idx_container_jobs_commission_status_completed
  on container_jobs(commission_status, completed_at)
  where status = 'completed';
