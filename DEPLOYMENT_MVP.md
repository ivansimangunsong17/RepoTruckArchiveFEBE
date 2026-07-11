# MVP Production Deployment Checklist

Panduan singkat untuk menaikkan Trucking Management System ke server kantor.

## 1. Prasyarat Server

- Node.js 20 atau lebih baru.
- PostgreSQL 14 atau lebih baru.
- Akses folder permanen untuk upload dokumen, contoh `D:\trucking\uploads` atau `/var/trucking/uploads`.
- Process manager untuk backend: PM2, Windows Service/NSSM, Docker, atau service manager lain.
- Web server untuk frontend static build: Nginx, Apache, IIS, atau static hosting internal.

## 2. Backend Environment

Buat file `be-truck-management-system/.env` di server:

```env
NODE_ENV=production
PORT=3000
CORS_ORIGIN=http://IP-SERVER-KANTOR
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/truck_management
AUTH_TOKEN_SECRET=ganti-dengan-random-panjang-minimal-32-karakter
UPLOAD_DIR=uploads
MAX_UPLOAD_BYTES=5242880
ALLOWED_UPLOAD_MIME_TYPES=application/pdf,image/jpeg,image/png
```

Catatan:
- `AUTH_TOKEN_SECRET` wajib unik dan panjang.
- `CORS_ORIGIN` harus sama dengan alamat frontend yang dibuka user.
- `UPLOAD_DIR` harus berada di storage yang dibackup.

## 3. Frontend Environment

Buat file `fe-truck-management-system/.env.production`:

```env
VITE_DATA_SOURCE=api
VITE_AUTH_SOURCE=api
VITE_API_BASE_URL=http://IP-SERVER-KANTOR:3000/api
```

Jika frontend dan backend berada di domain yang sama lewat reverse proxy, gunakan URL API sesuai proxy, contoh:

```env
VITE_API_BASE_URL=http://IP-SERVER-KANTOR/api
```

## 4. Database Setup

Di PostgreSQL:

```sql
create database truck_management;
```

Di folder backend:

```bash
npm install
npm run db:migrate
npm run db:seed
```

Setelah seed:
- Login awal: `admin@demo.com / password`.
- Segera ganti password user demo melalui User Management.
- Buat akun admin kantor yang sebenarnya.

## 5. Menjalankan Backend

Opsi PM2:

```bash
npm install -g pm2
cd be-truck-management-system
pm2 start src/server.js --name trucking-api
pm2 save
```

Smoke endpoint:

```txt
GET http://IP-SERVER-KANTOR:3000/health
POST http://IP-SERVER-KANTOR:3000/api/auth/login
```

## 6. Build Frontend

Di folder frontend:

```bash
npm install
npm run build
```

Deploy isi folder `dist` ke web server.

Pastikan React Router fallback diarahkan ke `index.html`.

Contoh Nginx:

```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

## 7. UAT MVP

Minimal test manual:

- Login admin.
- Buat customer, driver, dan truck.
- Buat Sales Order sebagai sales/admin.
- Update Container Job sebagai operational/admin.
- Upload dan buka dokumen PDF/JPG/PNG.
- Buka Activity Log.
- Buka Reports.
- Login sebagai pengamat dan pastikan read-only.
- Pastikan sales tidak bisa update operational.
- Pastikan operational tidak bisa cancel Sales Order.

## 8. Backup

Backup harian:

- Database PostgreSQL.
- Folder `UPLOAD_DIR`.
- File `.env` backend dan frontend production disimpan aman di admin server, bukan di repository.

## 9. Hal Yang Tidak Boleh Dipakai Production

- Jangan memakai `AUTH_TOKEN_SECRET=development-auth-token-secret`.
- Jangan expose PostgreSQL ke jaringan publik.
- Jangan commit file `.env`.
- Jangan menjalankan backend dari terminal manual tanpa process manager.
