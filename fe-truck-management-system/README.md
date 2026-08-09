# Transportation Management System

Fondasi frontend modular untuk operasional trucking, arsip dokumen, dan
monitoring armada. Dibangun dengan React, Vite, React Router, Supabase, dan
Lucide React.

## Menjalankan Project

1. Install dependency:

   ```bash
   npm install
   ```

2. Salin `.env.example` menjadi `.env`, lalu isi kredensial Supabase:

   ```bash
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

3. Jalankan development server:

   ```bash
   npm run dev
   ```

Tanpa `.env`, aplikasi berjalan dalam mode demo. Gunakan:

```text
Email: admin@demo.com
Password: password
```

Akun role lain menggunakan password yang sama:

- `sales@demo.com`
- `operational@demo.com`
- `pengamat@demo.com`

## Alur Order

1. Admin mengelola pengguna, customer, supir, dan truck.
2. Sales mencatat Sales Order, nomor DO customer, rute, waktu diterima,
   serta satu atau beberapa container.
3. Operational memproses masing-masing container: RPUJ, SPK, bon
   muat/bongkar, supir, chassis, nopol, surat jalan, surat timbang, dan invoice.
4. Setiap container memiliki waktu diterima, running, dan complete sendiri.
5. Status Sales Order dihitung dari progres seluruh container.
6. Audit dapat membaca order, laporan, dan riwayat aktivitas tanpa mengubah data.

## Struktur Utama

- `src/components`: komponen reusable dan layout
- `src/pages`: halaman per modul
- `src/routes`: konfigurasi route dan access guard
- `src/contexts`: state autentikasi
- `src/services`: seluruh akses data Supabase
- `src/constants`: role, status, dan navigasi
- `src/utils`: formatter dan business helper ringan

## Setup Supabase

Schema Archive MVP, RLS, Storage, seed, dan pembuatan user dijelaskan di:

[`docs/ATMS-Supabase-Setup.md`](docs/ATMS-Supabase-Setup.md)

Migration utama:

```text
supabase/migrations/202606220001_archive_mvp.sql
```

Jangan pernah menaruh `service_role` key atau credential integrasi eksternal di frontend.
