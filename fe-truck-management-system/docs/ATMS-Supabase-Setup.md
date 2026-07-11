# ATMS Supabase Setup

Panduan ini menyalakan Archive MVP menggunakan Supabase tanpa mencampurkan domain Fleet Management dan Finance.

## 1. Buat Project Supabase

Gunakan satu project Supabase untuk environment testing. Simpan URL dan anon key dari:

`Project Settings → API`

Salin `.env.example` menjadi `.env`:

```env
VITE_SUPABASE_URL=https://PROJECT-ID.supabase.co
VITE_SUPABASE_ANON_KEY=ANON-KEY
```

Jangan memasukkan `service_role` key ke file frontend.

## 2. Jalankan Migration

Pilihan termudah:

1. Buka Supabase SQL Editor.
2. Salin seluruh isi:
   `supabase/migrations/202606220001_archive_mvp.sql`
3. Jalankan sekali pada project testing.
4. Jalankan migration hardening:
   `supabase/migrations/202606220002_auth_hardening.sql`
5. Jalankan migration authorization Archive:
   `supabase/migrations/202606230001_archive_authorization_hardening.sql`
6. Jalankan migration pagination Activity Log:
   `supabase/migrations/202606230002_archive_activity_pagination.sql`
7. Jalankan migration pagination transaksi:
   `supabase/migrations/202606230003_archive_transaction_pagination.sql`

Migration membuat:

- Profiles dan role.
- Master Customer, Vehicle, dan Driver.
- Sales Order dan Container Job.
- Attachment dan bucket dokumen privat.
- Status history dan activity log.
- RLS berbasis role.
- Proteksi nilai komersial berdasarkan role.
- Proteksi file storage berdasarkan jenis dokumen.
- Boundary schema kosong `fleet` dan `finance`.

## 3. Buat User Testing

Buat empat user melalui `Authentication → Users`.

User baru selalu dibuat sebagai `observer` untuk mencegah privilege escalation.
Setelah user dibuat, atur role melalui SQL Editor:

```sql
update public.profiles
set full_name = 'Admin ATMS', role = 'admin'
where email = 'admin@armada.com';
```

Buat dan atur empat akun:

```sql
update public.profiles set full_name = 'Admin ATMS', role = 'admin'
where email = 'admin@armada.com';

update public.profiles set full_name = 'Sales ATMS', role = 'sales'
where email = 'sales@armada.com';

update public.profiles set full_name = 'Operational ATMS', role = 'operational'
where email = 'ops@armada.com';

update public.profiles set full_name = 'Management ATMS', role = 'observer'
where email = 'management@armada.com';
```

Jika user dibuat sebelum migration, jalankan kembali bagian `insert into public.profiles ... select from auth.users` dari migration atau tambahkan profile secara manual.

## 4. Deploy Edge Function User Management

Supabase CLI:

```bash
supabase login
supabase link --project-ref PROJECT-ID
supabase functions deploy admin-users
```

Function menggunakan secret bawaan Supabase:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Service role hanya berjalan di Edge Function dan tidak dikirim ke browser.

## 5. Tambahkan Data Awal

Setelah user Admin tersedia, jalankan:

`supabase/seed.sql`

Seed menambahkan customer, truck, dan driver untuk testing.

## 6. Jalankan Aplikasi

```bash
npm install
npm run dev
```

Saat `.env` valid, label halaman Master Data berubah menjadi `Terhubung Supabase`.

Urutan test:

1. Admin login dan memeriksa master data.
2. Sales login dan membuat Sales Order.
3. Operational login dan memperbarui Container Job.
4. Admin/Pengamat membuka laporan.
5. Admin memeriksa Activity Log.
6. Refresh browser dan login dari perangkat lain untuk memastikan data tetap tersedia.

## 7. Struktur yang Dapat Dikembangkan

Archive MVP menggunakan UUID stabil:

```text
customers
sales_orders
container_jobs
vehicles
drivers
attachments
```

Phase berikutnya menambahkan referensi tanpa mengubah tabel archive:

```text
fleet.trips → container_jobs.id
fleet.vehicle_positions → vehicles.id
fleet.maintenance_orders → vehicles.id

finance.invoices → sales_orders.id
finance.invoice_lines → container_jobs.id
finance.operational_costs → container_jobs.id
```

Jangan menambahkan field GPS, maintenance, invoice, atau payment langsung ke tabel Archive.

## 8. Catatan Testing

- File maksimal 5 MB.
- Tipe file: PDF, JPG, PNG.
- Bucket `archive-documents` bersifat privat.
- Pengamat tidak mendapat akses file internal.
- Sales mengubah Sales Order miliknya.
- Operational mengubah Container Job.
- Admin mengelola master dan melihat transaksi.
- Pengelolaan user memerlukan Edge Function `admin-users`.
