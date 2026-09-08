-- UJ otomatis tetap dianggap sudah dibayar dan memotong saldo saat ritasi berjalan,
-- tetapi pengecekan Finance harus dilakukan terpisah.
update container_job_expenses
set finance_check_status = 'belum_dicek',
    finance_checked_by_name = null,
    finance_checked_at = null,
    updated_at = now()
where source = 'auto_uj_order'
  and finance_check_status = 'sudah_dicek'
  and coalesce(finance_checked_by_name, '') = coalesce(created_by_name, '');
