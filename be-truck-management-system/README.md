# BE Truck Management System

Backend awal untuk transisi sistem dari Supabase data menuju Node.js API dan PostgreSQL.
Supabase tetap dipakai untuk auth pada fase ini.

## Status Saat Ini

- Skeleton Node.js tersedia.
- PostgreSQL sudah disiapkan lewat SQL migration manual.
- Modul awal yang memakai database adalah Settings.
- Schema MVP mencakup master customer, sopir, truck, sales order, container job, attachment, activity log, dan system settings.
- Invoice belum dimasukkan sesuai scope MVP.

## Setup

1. Install dependency:

```bash
npm install
```

2. Buat database PostgreSQL lokal:

```sql
create database truck_management;
```

3. Siapkan `.env`:

```bash
DATABASE_URL=postgres://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/truck_management
PORT=3000
CORS_ORIGIN=http://localhost:5173
```

4. Jalankan migration dan seed:

```bash
npm run db:migrate
npm run db:seed
```

5. Jalankan backend:

```bash
npm run dev
```

## Scripts

```bash
npm run dev
npm start
npm run check
npm run db:migrate
npm run db:seed
```

## Endpoint Awal

```txt
GET /health
GET /api/settings
PUT /api/settings
```

`GET /health` akan menampilkan status database:

```json
{
  "status": "ok",
  "database": {
    "configured": true,
    "status": "ok"
  }
}
```

Contoh payload `PUT /api/settings`:

```json
{
  "companyName": "PT Armada Baru",
  "frontendHost": "React.js / Vite",
  "backendHost": "Node.js API",
  "databaseHost": "PostgreSQL"
}
```

## Tahap Berikutnya

1. Tambahkan endpoint API untuk master data.
2. Tambahkan endpoint API untuk Sales Order dan Container Job.
3. Arahkan frontend `VITE_DATA_SOURCE=api`.
4. Kirim token Supabase auth dari frontend ke backend untuk validasi role.
