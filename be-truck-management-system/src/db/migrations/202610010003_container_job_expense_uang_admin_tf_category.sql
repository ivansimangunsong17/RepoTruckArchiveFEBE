alter table container_job_expenses
  drop constraint if exists chk_container_job_expenses_category;

alter table container_job_expenses
  add constraint chk_container_job_expenses_category
  check (category in (
    'uj_awal',
    'top_up_uj',
    'tol',
    'parkir',
    'bongkar',
    'muat',
    'lolo',
    'inap',
    'terminal_depo',
    'tunggu',
    'uang_admin_tf',
    'reimbursement',
    'lainnya'
  ));
