# Migrations

Folder ini berisi migration PostgreSQL untuk ATMS.

## Rekening Dropping

Migrasi `202608200001` sampai `202608200008` membentuk flow Rekening Dropping tanpa menghapus data RPUJ lama.

Urutan aman:

1. `202608200001_container_job_expenses.sql` membuat tabel biaya ritasi dan menyalin data legacy RPUJ ke `container_job_expenses`.
2. `202608200002_operational_fund_requests.sql` membuat tabel deposit/request saldo dan ledger rekening dropping.
3. `202608200003_operational_fund_expense_links.sql` menambahkan link ledger ke biaya ritasi.
4. `202608200004_operational_fund_ledger_structure.sql` menambahkan kolom buku kas harian, index, dan view ledger.
5. `202608200005_auto_uj_order_ledger.sql` menambahkan guard unik untuk auto UJ dari order berjalan.
6. `202608200006_backfill_operational_fund_expense_ledger.sql` membuat transaksi debit ledger dari biaya yang sudah dibayar dan belum punya ledger.
7. `202608200007_allow_multiple_operational_fund_deposits.sql` menghapus unique index tanggal deposit agar setiap top up Finance menjadi transaksi uang masuk baru.
8. `202608200008_operational_fund_daily_batches.sql` membuat batch harian, menghubungkan transaksi lama berdasarkan tanggal, dan menyiapkan status close batch.

Semua backfill memakai pola `if not exists` atau `on conflict do nothing`, sehingga aman dijalankan ulang. Data lama tetap berada di tabel asal; ledger baru hanya menjadi pencatatan mutasi saldo. Deposit saldo bersifat append-only: jika Finance melakukan dua kali deposit di tanggal yang sama, keduanya dicatat sebagai dua uang masuk dan saldo bertambah kumulatif.

Validasi setelah migrasi:

```sql
select count(*) from container_job_expenses;
select count(*) from operational_fund_transactions;

select
  coalesce(sum(amount) filter (where transaction_type = 'credit' and status = 'posted'), 0) as uang_masuk,
  coalesce(sum(amount) filter (where transaction_type = 'debit' and status = 'posted'), 0) as uang_keluar
from operational_fund_transactions;
```
