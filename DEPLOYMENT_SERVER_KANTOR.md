# Truck Management System - Deployment Server Kantor Windows

Panduan ini menyiapkan deployment production ke server Windows kantor dengan root:

```txt
D:\ARMADA_SYSTEM\
```

## 1. Struktur Folder Production

```txt
D:\ARMADA_SYSTEM\
|-- apps\
|   |-- frontend\
|   `-- backend\
|-- storage\
|-- backups\
|   |-- database\
|   `-- storage\
|-- logs\
|   `-- backend\
`-- deploy\
    |-- scripts\
    `-- env\
```

Jalankan dari root repository di mesin development atau server:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\scripts\setup-production-folders.ps1 -Root "D:\ARMADA_SYSTEM"
```

## 2. Prasyarat Server

- Windows Server atau Windows Pro yang stabil sebagai server kantor.
- Node.js 20 atau lebih baru.
- PostgreSQL 14 atau lebih baru.
- Git atau mekanisme copy artifact yang jelas.
- `pg_dump` tersedia dari instalasi PostgreSQL.
- Web server untuk frontend static, direkomendasikan IIS.
- Process manager backend, pilih salah satu:
  - PM2 untuk setup cepat.
  - NSSM Windows Service untuk service Windows native.

## 3. Contoh Env Production

Template tersedia di:

```txt
deploy\env\backend.env.production.example
deploy\env\frontend.env.production.example
```

Backend production, simpan sebagai:

```txt
D:\ARMADA_SYSTEM\apps\backend\.env
```

```env
NODE_ENV=production
PORT=3000
CORS_ORIGIN=http://IP-SERVER-ATAU-DOMAIN
DATABASE_URL=postgres://atms_app:GANTI_PASSWORD_DB@localhost:5432/truck_management
AUTH_TOKEN_SECRET=GANTI_DENGAN_RANDOM_SECRET_MINIMAL_32_KARAKTER
PASSWORD_HASH_COST=12
UPLOAD_DIR=D:\ARMADA_SYSTEM\storage
MAX_UPLOAD_SIZE_MB=5
ALLOWED_UPLOAD_EXTENSIONS=pdf,jpg,jpeg,png
ALLOWED_UPLOAD_MIME_TYPES=application/pdf,image/jpeg,image/png
```

Frontend production, simpan sebagai `.env.production` sebelum build:

```env
VITE_DATA_SOURCE=api
VITE_AUTH_SOURCE=api
VITE_API_BASE_URL=http://IP-SERVER-ATAU-DOMAIN/api
```

Jika backend diakses langsung tanpa reverse proxy, gunakan:

```env
VITE_API_BASE_URL=http://IP-SERVER-ATAU-DOMAIN:3000/api
```

`CORS_ORIGIN` backend harus sama dengan origin yang dibuka user di browser, misalnya `http://192.168.1.10` atau `http://armada-server`.

## 4. Setup PostgreSQL

Di PostgreSQL, buat database dan user aplikasi:

```sql
create database truck_management;
create user atms_app with encrypted password 'GANTI_PASSWORD_DB';
grant all privileges on database truck_management to atms_app;
```

Masuk ke database lalu berikan akses schema:

```sql
\c truck_management
grant all on schema public to atms_app;
alter default privileges in schema public grant all on tables to atms_app;
alter default privileges in schema public grant all on sequences to atms_app;
```

Jika migration dijalankan memakai user `postgres`, pastikan user aplikasi tetap punya akses table:

```sql
grant all privileges on all tables in schema public to atms_app;
grant all privileges on all sequences in schema public to atms_app;
```

## 5. Deploy Backend

Di mesin build/server:

```powershell
cd C:\path\to\repo\be-truck-management-system
npm ci --omit=dev
```

Copy backend ke server:

```txt
D:\ARMADA_SYSTEM\apps\backend
```

Pastikan folder backend berisi minimal:

```txt
src\
scripts\
package.json
package-lock.json
node_modules\
.env
```

Jalankan migration production dari folder backend server:

```powershell
cd D:\ARMADA_SYSTEM\apps\backend
npm run db:migrate
```

Seed hanya untuk inisialisasi awal, bukan setiap deploy:

```powershell
npm run db:seed
```

Setelah seed awal, segera ganti password akun demo dan buat akun admin kantor.

Smoke backend:

```powershell
node src\server.js
```

Buka:

```txt
http://IP-SERVER-ATAU-DOMAIN:3000/health
```

## 6. Deploy Frontend

Di folder frontend:

```powershell
cd C:\path\to\repo\fe-truck-management-system
copy ..\deploy\env\frontend.env.production.example .env.production
notepad .env.production
npm ci
npm run build
```

Copy isi folder:

```txt
fe-truck-management-system\dist\
```

ke:

```txt
D:\ARMADA_SYSTEM\apps\frontend\
```

Untuk IIS:

- Buat site baru dengan physical path `D:\ARMADA_SYSTEM\apps\frontend`.
- Binding contoh: `http`, port `80`, host name kosong atau domain lokal.
- Aktifkan fallback React Router ke `index.html` memakai URL Rewrite jika tersedia.

Contoh `web.config` untuk IIS di folder frontend:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="React Router Fallback" stopProcessing="true">
          <match url=".*" />
          <conditions logicalGrouping="MatchAll">
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
            <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
          </conditions>
          <action type="Rewrite" url="/index.html" />
        </rule>
      </rules>
    </rewrite>
  </system.webServer>
</configuration>
```

## 7. Setup Service Backend

### Opsi A: PM2

Install:

```powershell
npm install -g pm2
npm install -g pm2-windows-startup
pm2-startup install
```

Start backend:

```powershell
cd D:\ARMADA_SYSTEM\apps\backend
pm2 start src\server.js --name atms-backend --output D:\ARMADA_SYSTEM\logs\backend\out.log --error D:\ARMADA_SYSTEM\logs\backend\error.log
pm2 save
```

Operasional:

```powershell
pm2 status
pm2 logs atms-backend
pm2 restart atms-backend
```

### Opsi B: NSSM Windows Service

Install NSSM lalu jalankan:

```powershell
nssm install ATMSBackend
```

Isi:

```txt
Path: C:\Program Files\nodejs\node.exe
Startup directory: D:\ARMADA_SYSTEM\apps\backend
Arguments: src\server.js
```

Set log:

```txt
I/O > Output: D:\ARMADA_SYSTEM\logs\backend\out.log
I/O > Error:  D:\ARMADA_SYSTEM\logs\backend\error.log
```

Start:

```powershell
nssm start ATMSBackend
```

## 8. Setup Backup Otomatis

Copy script backup backend ke:

```txt
D:\ARMADA_SYSTEM\apps\backend\scripts\
```

Script yang sudah tersedia:

```txt
be-truck-management-system\scripts\backup-database.ps1
be-truck-management-system\scripts\backup-storage.ps1
deploy\scripts\register-backup-tasks.ps1
```

Register scheduled task:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\scripts\register-backup-tasks.ps1 `
  -Root "D:\ARMADA_SYSTEM" `
  -DatabaseUrl "postgres://atms_app:GANTI_PASSWORD_DB@localhost:5432/truck_management" `
  -PgDumpPath "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe"
```

Output:

```txt
D:\ARMADA_SYSTEM\backups\database\atms_db_YYYYMMDD_HHMM.sql
D:\ARMADA_SYSTEM\backups\storage\atms_storage_YYYYMMDD_HHMM.zip
```

Test manual:

```powershell
powershell -ExecutionPolicy Bypass -File D:\ARMADA_SYSTEM\apps\backend\scripts\backup-database.ps1 `
  -DatabaseUrl "postgres://atms_app:GANTI_PASSWORD_DB@localhost:5432/truck_management"

powershell -ExecutionPolicy Bypass -File D:\ARMADA_SYSTEM\apps\backend\scripts\backup-storage.ps1 `
  -StorageDir "D:\ARMADA_SYSTEM\storage"
```

## 9. Akses Dari Komputer Kantor

Gunakan IP server:

```txt
http://192.168.x.x
```

Atau domain lokal:

```txt
http://armada-server
```

Pastikan:

- Windows Firewall membuka port frontend, biasanya `80`.
- Jika backend langsung diakses browser, buka port `3000`.
- Jika memakai reverse proxy `/api`, backend port `3000` cukup internal di server.
- `VITE_API_BASE_URL` sesuai alamat API.
- `CORS_ORIGIN` sesuai origin frontend.

## 10. Smoke Test Checklist

Backend:

- `GET /health` return `database.status = ok`.
- Login admin berhasil.
- Login gagal tetap return error dan tercatat activity log.
- `/api/auth/me` dengan token return user.
- `/api/reports/dashboard` return `trucks`, `activeJobs`, `upcomingJobs`.

Frontend:

- Buka halaman login dari komputer client kantor.
- Login admin.
- Dashboard tampil.
- Reports tampil dari API.
- Activity Log tampil.
- Buat Sales Order test.
- Update Container Job test.
- Upload PDF kecil, buka/download ulang attachment.
- Cek file masuk ke `D:\ARMADA_SYSTEM\storage\trips\...`.

Backup:

- Jalankan backup database manual, file `.sql` terbentuk.
- Jalankan backup storage manual, file `.zip` terbentuk.
- Jalankan Task Scheduler manual dengan `Run`.

Security/env:

- `AUTH_TOKEN_SECRET` bukan placeholder dan minimal 32 karakter.
- `.env` tidak berada di folder frontend public.
- PostgreSQL tidak dibuka ke jaringan publik.
- User database aplikasi bukan superuser jika memungkinkan.

## 11. Rollback Checklist

Sebelum deploy:

- Backup database manual.
- Backup storage manual.
- Simpan build frontend lama.
- Simpan folder backend lama atau zip release sebelumnya.
- Catat versi commit/release yang sedang jalan.

Jika deploy gagal:

1. Stop backend service:

```powershell
pm2 stop atms-backend
```

atau:

```powershell
nssm stop ATMSBackend
```

2. Kembalikan folder backend lama ke:

```txt
D:\ARMADA_SYSTEM\apps\backend
```

3. Kembalikan folder frontend lama ke:

```txt
D:\ARMADA_SYSTEM\apps\frontend
```

4. Jika migration sudah mengubah database dan perlu rollback data, restore dari backup `.sql` terakhir ke database baru lalu arahkan `DATABASE_URL` ke database tersebut.

5. Start service lagi:

```powershell
pm2 start atms-backend
```

atau:

```powershell
nssm start ATMSBackend
```

6. Ulang smoke test.

## 12. Catatan Operasional

- Jangan jalankan backend production dari terminal manual.
- Jangan commit file `.env`.
- Jangan menjalankan `npm run db:seed` berulang di production kecuali memang diperlukan.
- Jadwalkan backup harian dan cek restore minimal berkala.
- Simpan backup di disk berbeda atau copy berkala ke NAS/drive eksternal kantor.
