# ATMS Testing Guide

## Unit dan Component Test

Menjalankan seluruh unit/component test:

```bash
npm run test:run
```

Mode watch selama pengembangan:

```bash
npm run test
```

Suite ini tidak mengakses atau mengubah database Supabase nyata.

## Integration Test RLS Supabase

Integration test menguji pembatasan nilai komersial pada project Supabase
testing. Test bersifat read-only dan otomatis dilewati jika kredensial belum
tersedia.

Atur environment variable hanya pada terminal lokal. Jangan menyimpan password
akun testing ke repository.

PowerShell:

```powershell
$env:ATMS_TEST_ADMIN_EMAIL="admin@armada.com"
$env:ATMS_TEST_ADMIN_PASSWORD="PASSWORD_TEST"
$env:ATMS_TEST_SALES_EMAIL="sales@armada.com"
$env:ATMS_TEST_SALES_PASSWORD="PASSWORD_TEST"
$env:ATMS_TEST_OPERATIONAL_EMAIL="ops@armada.com"
$env:ATMS_TEST_OPERATIONAL_PASSWORD="PASSWORD_TEST"
$env:ATMS_TEST_OBSERVER_EMAIL="management@armada.com"
$env:ATMS_TEST_OBSERVER_PASSWORD="PASSWORD_TEST"
npm run test:integration
```

`VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` tetap dibaca dari konfigurasi
environment project.

Integration test bersifat non-destruktif: operasi create yang dilakukan adalah
operasi yang memang harus ditolak oleh RLS. Test tidak membuat record permanen.
Suite berjalan berurutan dan menggunakan ulang session setiap role agar tidak
melewati rate limit login Supabase Auth.

Integration test memverifikasi:

- Kolom `price` tidak dapat dibaca langsung melalui endpoint tabel.
- Admin dan Sales menerima data komersial melalui RPC aman.
- Operational dan Pengamat menerima `NULL` untuk harga dan total.
- Metadata dan signed URL dokumen mengikuti role.
- Pengamat tidak dapat upload dokumen.
- Bucket menolak tipe file ilegal dan file lebih dari 5 MB.
- Non-Admin tidak dapat membuat Master Customer.
- Non-Sales tidak dapat membuat Sales Order.
- Activity Log dan Pengaturan Sistem hanya dapat dibaca Admin.

Backend pagination yang diuji pada unit/component suite:

- Master Data memakai exact count dan Supabase `range()`.
- Search dan filter Master Data dikirim ke database.
- Activity Log memakai RPC dengan query, role, limit, dan offset.

## Quality Gate

Sebelum perubahan dianggap siap direview, jalankan:

```bash
npm run test:run
npm run lint
npm run build
```
