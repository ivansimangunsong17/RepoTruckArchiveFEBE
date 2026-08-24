alter table operational_fund_transactions
  drop constraint if exists chk_operational_fund_transactions_category;

alter table operational_fund_transactions
  add constraint chk_operational_fund_transactions_category
  check (category in (
    'saldo_awal',
    'deposit_saldo',
    'uj_order',
    'biaya_lainnya',
    'top_up_uj',
    'kasbon',
    'potongan',
    'koreksi',
    'void',
    'dropping_in',
    'container_job_expense',
    'driver_uj_balance',
    'correction',
    'lainnya'
  ));

create unique index if not exists uq_operational_fund_transactions_batch_carry_forward
  on operational_fund_transactions(source_ref_id)
  where source = 'batch_carry_forward'
    and status = 'posted';
