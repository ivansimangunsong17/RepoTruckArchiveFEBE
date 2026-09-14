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
    'admin_transfer',
    'correction',
    'lainnya'
  ));

