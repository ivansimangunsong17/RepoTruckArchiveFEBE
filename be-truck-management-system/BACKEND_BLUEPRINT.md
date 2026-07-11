# Backend Blueprint Sistem Arsip

Dokumen ini menjadi rancangan awal sebelum sistem dipindahkan dari pola React/Vite + Supabase menuju arsitektur:

```txt
Frontend React.js -> Backend Node.js API -> Database PostgreSQL
```

Catatan penting:

- Jangan langsung coding backend.
- Jangan langsung migrasi database.
- Jangan langsung melepas Supabase.
- Gunakan blueprint ini sebagai acuan kontrak, struktur, schema, permission, dan strategi transisi.

## 1. Tujuan Blueprint

Tujuan utama blueprint ini adalah memastikan UI React yang sudah mulai dipisahkan lewat service layer memiliki arah backend yang jelas.

Backend baru harus mampu:

- Menggantikan query langsung ke Supabase secara bertahap.
- Menyediakan API yang stabil untuk frontend.
- Menyimpan data utama di PostgreSQL.
- Mengatur role dan permission dengan lebih jelas.
- Menjaga sistem tetap berjalan selama masa transisi.

## 2. Modul Backend

### 2.1 Auth & User

Modul ini mengatur identitas pengguna dan akses sistem.

Tanggung jawab:

- Login dan logout.
- Validasi sesi pengguna.
- Profile pengguna.
- Role pengguna.
- Permission pengguna.
- Reset password.
- Aktivasi dan nonaktivasi user.

### 2.2 Sales Order

Modul ini mengelola data awal order atau DO/SO.

Tanggung jawab:

- Membuat sales order.
- Mengubah sales order.
- Membatalkan sales order.
- Melihat daftar dan detail sales order.
- Menghubungkan sales order ke customer.
- Menyimpan data container, rute, tarif, dan status order.

### 2.3 Operational Job

Modul ini mengelola pekerjaan operasional yang berjalan dari sales order.

Tanggung jawab:

- Membuat atau membaca container job.
- Assign truck.
- Assign driver.
- Update status pekerjaan.
- Menandai job running, hold, atau completed.
- Menyimpan waktu mulai dan selesai.
- Menyimpan alasan hold.
- Validasi dokumen operasional wajib.

### 2.4 Master Data

Modul ini mengatur data referensi utama sistem.

Data yang masuk master:

- Customer.
- Driver.
- Vehicle atau truck.
- Profile atau user pendukung.
- Referensi lain jika nanti dibutuhkan.

Tanggung jawab:

- List data master.
- Create data master.
- Update data master.
- Archive atau delete data master.
- Search, filter, dan pagination.

### 2.5 Document / Attachment

Modul ini mengelola dokumen arsip.

Tanggung jawab:

- Upload file.
- Download file.
- Preview file.
- Hapus file jika role mengizinkan.
- Menyimpan metadata file.
- Menghubungkan file ke entity tertentu.

Contoh entity:

- Sales order.
- Container job.
- Customer.
- Driver.
- Vehicle.

### 2.6 Activity Log

Modul ini mencatat aktivitas penting di sistem.

Aktivitas yang perlu dicatat:

- Login.
- Membuat data.
- Mengubah data.
- Membatalkan sales order.
- Update status job.
- Upload dokumen.
- Hapus dokumen.
- Perubahan settings.
- Perubahan user atau role.

### 2.7 System Settings

Modul ini menyimpan konfigurasi kebutuhan sistem.

Konfigurasi yang perlu disimpan:

- Nama perusahaan.
- Zona waktu.
- Prefix dokumen.
- Modul aktif.
- Dokumen wajib.
- Mode approval.
- Durasi sesi.
- Kebijakan password.
- Target arsitektur sistem.

### 2.8 Dashboard / Reports

Modul ini menyediakan data ringkasan.

Tanggung jawab:

- Statistik dashboard.
- Ringkasan sales order.
- Ringkasan operational job.
- Ringkasan status dokumen.
- Laporan operasional.
- Laporan arsip.

## 3. API Contract

API contract ini adalah rancangan awal endpoint yang nanti akan dipakai frontend.

### 3.1 Auth

```txt
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

Contoh response `GET /api/auth/me`:

```json
{
  "data": {
    "id": "user-id",
    "name": "Admin",
    "email": "admin@example.com",
    "role": "admin",
    "permissions": [
      "sales_order.read",
      "sales_order.create",
      "container_job.update_status"
    ]
  }
}
```

### 3.2 Users

```txt
GET   /api/users
POST  /api/users
GET   /api/users/:id
PATCH /api/users/:id
PATCH /api/users/:id/status
POST  /api/users/:id/reset-password
```

### 3.3 Sales Orders

```txt
GET   /api/sales-orders
POST  /api/sales-orders
GET   /api/sales-orders/:id
PATCH /api/sales-orders/:id
PATCH /api/sales-orders/:id/cancel
```

Query list:

```txt
GET /api/sales-orders?page=1&limit=20&search=ABC&status=open
```

Contoh request create:

```json
{
  "customerId": "customer-id",
  "orderNumber": "SO-0001",
  "containerNumber": "CONT123456",
  "routeOrigin": "Jakarta",
  "routeDestination": "Surabaya",
  "price": 7500000,
  "notes": "Order reguler"
}
```

### 3.4 Container Jobs

```txt
GET   /api/container-jobs
GET   /api/container-jobs/:id
PATCH /api/container-jobs/:id
PATCH /api/container-jobs/:id/assignment
PATCH /api/container-jobs/:id/status
```

Contoh request assignment:

```json
{
  "vehicleId": "vehicle-id",
  "driverId": "driver-id"
}
```

Contoh request update status:

```json
{
  "status": "completed",
  "completedAt": "2026-07-01T10:00:00.000Z",
  "notes": "Job selesai"
}
```

### 3.5 Master Data

Customer:

```txt
GET    /api/master/customers
POST   /api/master/customers
GET    /api/master/customers/:id
PATCH  /api/master/customers/:id
DELETE /api/master/customers/:id
```

Driver:

```txt
GET    /api/master/drivers
POST   /api/master/drivers
GET    /api/master/drivers/:id
PATCH  /api/master/drivers/:id
DELETE /api/master/drivers/:id
```

Vehicle:

```txt
GET    /api/master/vehicles
POST   /api/master/vehicles
GET    /api/master/vehicles/:id
PATCH  /api/master/vehicles/:id
DELETE /api/master/vehicles/:id
```

### 3.6 Documents

```txt
POST   /api/documents/upload
GET    /api/documents/:id
GET    /api/documents/:id/download
DELETE /api/documents/:id
```

Contoh metadata upload:

```json
{
  "entityType": "container_job",
  "entityId": "job-id",
  "documentType": "travel_document"
}
```

### 3.7 Settings

```txt
GET /api/settings
PUT /api/settings
```

### 3.8 Activity Logs

```txt
GET /api/activity-logs
```

Query list:

```txt
GET /api/activity-logs?page=1&limit=20&module=sales_order&userId=user-id
```

### 3.9 Reports

```txt
GET /api/reports/dashboard
GET /api/reports/sales-orders
GET /api/reports/operations
GET /api/reports/documents
```

## 4. Format Response API

Gunakan format response yang konsisten.

Success:

```json
{
  "data": {},
  "message": "Success"
}
```

List dengan pagination:

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

Error:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Field customerId wajib diisi",
    "details": []
  }
}
```

## 5. Schema PostgreSQL

Schema berikut masih blueprint. Detail tipe data bisa difinalisasi saat tahap database design.

### 5.1 users

```sql
users
- id uuid primary key
- role_id uuid references roles(id)
- name varchar
- email varchar unique
- password_hash text
- status varchar
- last_login_at timestamp
- created_at timestamp
- updated_at timestamp
```

### 5.2 roles

```sql
roles
- id uuid primary key
- name varchar unique
- description text
- created_at timestamp
- updated_at timestamp
```

### 5.3 permissions

```sql
permissions
- id uuid primary key
- code varchar unique
- description text
- created_at timestamp
```

### 5.4 role_permissions

```sql
role_permissions
- role_id uuid references roles(id)
- permission_id uuid references permissions(id)
- created_at timestamp
```

### 5.5 customers

```sql
customers
- id uuid primary key
- customer_code varchar unique
- name varchar
- phone varchar
- email varchar
- address text
- status varchar
- created_at timestamp
- updated_at timestamp
```

### 5.6 drivers

```sql
drivers
- id uuid primary key
- driver_code varchar unique
- name varchar
- phone varchar
- license_number varchar
- license_expired_at date
- status varchar
- created_at timestamp
- updated_at timestamp
```

### 5.7 vehicles

```sql
vehicles
- id uuid primary key
- vehicle_code varchar unique
- plate_number varchar unique
- type varchar
- brand varchar
- year integer
- stnk_expired_at date
- kir_expired_at date
- status varchar
- created_at timestamp
- updated_at timestamp
```

### 5.8 sales_orders

```sql
sales_orders
- id uuid primary key
- order_number varchar unique
- customer_id uuid references customers(id)
- container_number varchar
- route_origin varchar
- route_destination varchar
- price numeric
- status varchar
- notes text
- created_by uuid references users(id)
- cancelled_by uuid references users(id)
- cancel_reason text
- cancelled_at timestamp
- created_at timestamp
- updated_at timestamp
```

### 5.9 container_jobs

```sql
container_jobs
- id uuid primary key
- job_number varchar unique
- sales_order_id uuid references sales_orders(id)
- vehicle_id uuid references vehicles(id)
- driver_id uuid references drivers(id)
- status varchar
- running_at timestamp
- completed_at timestamp
- hold_reason text
- notes text
- created_at timestamp
- updated_at timestamp
```

### 5.10 attachments

```sql
attachments
- id uuid primary key
- entity_type varchar
- entity_id uuid
- document_type varchar
- file_name varchar
- file_path text
- mime_type varchar
- file_size integer
- uploaded_by uuid references users(id)
- created_at timestamp
```

### 5.11 activity_logs

```sql
activity_logs
- id uuid primary key
- user_id uuid references users(id)
- module varchar
- action varchar
- entity_type varchar
- entity_id uuid
- description text
- metadata jsonb
- created_at timestamp
```

### 5.12 system_settings

```sql
system_settings
- id uuid primary key
- setting_key varchar unique
- setting_value jsonb
- updated_by uuid references users(id)
- created_at timestamp
- updated_at timestamp
```

## 6. Relasi Utama

```txt
users.role_id -> roles.id
role_permissions.role_id -> roles.id
role_permissions.permission_id -> permissions.id

sales_orders.customer_id -> customers.id
sales_orders.created_by -> users.id

container_jobs.sales_order_id -> sales_orders.id
container_jobs.vehicle_id -> vehicles.id
container_jobs.driver_id -> drivers.id

attachments.entity_type + attachments.entity_id -> polymorphic relation
activity_logs.user_id -> users.id
system_settings.updated_by -> users.id
```

## 7. Struktur Backend

Struktur backend yang disarankan:

```txt
backend/
  package.json
  .env.example
  src/
    app.js
    server.js

    config/
      env.js
      database.js

    db/
      pool.js
      migrations/
      seeds/

    modules/
      auth/
        auth.routes.js
        auth.controller.js
        auth.service.js
        auth.repository.js

      users/
        users.routes.js
        users.controller.js
        users.service.js
        users.repository.js

      sales-orders/
        salesOrders.routes.js
        salesOrders.controller.js
        salesOrders.service.js
        salesOrders.repository.js

      container-jobs/
        containerJobs.routes.js
        containerJobs.controller.js
        containerJobs.service.js
        containerJobs.repository.js

      master-data/
        masterData.routes.js
        masterData.controller.js
        masterData.service.js
        masterData.repository.js

      documents/
        documents.routes.js
        documents.controller.js
        documents.service.js
        documents.repository.js

      settings/
        settings.routes.js
        settings.controller.js
        settings.service.js
        settings.repository.js

      activity-logs/
        activityLogs.routes.js
        activityLogs.controller.js
        activityLogs.service.js
        activityLogs.repository.js

      reports/
        reports.routes.js
        reports.controller.js
        reports.service.js
        reports.repository.js

    middlewares/
      auth.middleware.js
      permission.middleware.js
      error.middleware.js
      validation.middleware.js

    utils/
      apiResponse.js
      pagination.js
      fileStorage.js
      logger.js
```

Pembagian tanggung jawab:

```txt
routes      -> mendefinisikan endpoint
controller  -> membaca request dan mengirim response
service     -> menjalankan aturan bisnis
repository  -> menjalankan query PostgreSQL
middleware  -> auth, permission, error handling, validation
utils       -> helper umum
```

## 8. Role Permission

### 8.1 Role Awal

```txt
Super Admin
- Semua akses.
- Kelola user, role, permission, settings, dan semua data.

Admin
- Kelola sales order, operational job, master data, dokumen, dan laporan.
- Bisa melihat activity log.
- Tidak wajib bisa mengubah permission.

Sales
- Membuat dan mengubah sales order.
- Melihat customer.
- Upload dokumen sales order.
- Tidak bisa assign truck atau driver.

Operational
- Melihat sales order yang masuk operasi.
- Assign truck dan driver.
- Update status container job.
- Upload dokumen jalan.
- Tidak bisa mengubah harga atau membatalkan order.

Finance / Report
- Melihat laporan dan data transaksi.
- Tidak bisa mengubah data operasional.

Observer
- Read-only dashboard, laporan, dan arsip.
```

### 8.2 Permission Code

```txt
sales_order.read
sales_order.create
sales_order.update
sales_order.cancel

container_job.read
container_job.assign
container_job.update
container_job.update_status
container_job.complete

master_data.read
master_data.create
master_data.update
master_data.delete

document.read
document.upload
document.delete

settings.read
settings.update

user.read
user.create
user.update
user.disable
user.reset_password

activity_log.read

report.read
```

## 9. Strategi Transisi

Transisi harus bertahap agar sistem lama tetap berjalan.

### Tahap 1: Service Layer Frontend

Status: sedang berjalan.

Tujuan:

- Halaman React tidak lagi langsung memanggil Supabase.
- Semua akses data masuk lewat file service.
- Supabase masih boleh digunakan di balik service.

Contoh:

```txt
UI Page -> frontend service -> Supabase
```

### Tahap 2: API Contract

Status: blueprint ini.

Tujuan:

- Menentukan endpoint.
- Menentukan bentuk request dan response.
- Menentukan permission.
- Menentukan schema PostgreSQL.

### Tahap 3: Backend Skeleton

Tujuan:

- Membuat project Node.js.
- Menyiapkan route kosong.
- Menyiapkan error handler.
- Menyiapkan koneksi PostgreSQL.
- Menyiapkan health check.

Belum wajib dipakai frontend.

### Tahap 4: Dual Adapter

Frontend service dibuat bisa memilih sumber data:

```txt
UI Page -> frontend service -> Supabase adapter
UI Page -> frontend service -> API adapter
```

Mode bisa dikontrol melalui environment variable.

Contoh:

```txt
VITE_DATA_SOURCE=supabase
VITE_DATA_SOURCE=api
```

### Tahap 5: Migrasi Modul per Modul

Urutan migrasi yang disarankan:

1. Settings.
2. Master Data.
3. Sales Order.
4. Container Job.
5. Documents.
6. Activity Log.
7. User/Auth.
8. Reports.

Alasan urutan ini:

- Settings paling kecil dan risikonya rendah.
- Master data menjadi fondasi sales order dan job.
- Sales order dan operational job adalah inti sistem arsip.
- Auth dipindah lebih akhir karena risikonya tinggi.

### Tahap 6: Cutover

Cutover dilakukan setelah:

- Semua endpoint utama stabil.
- Test frontend lolos.
- Test backend lolos.
- Data penting sudah dimigrasikan.
- Role permission sudah tervalidasi.
- Supabase tidak lagi dipakai oleh frontend production.

## 10. Risiko dan Catatan

Risiko utama:

- Perbedaan bentuk data Supabase dan PostgreSQL baru.
- File storage perlu keputusan khusus.
- Auth tidak boleh dipindah terlalu cepat.
- Permission harus jelas sebelum backend production.
- Migrasi data harus punya backup.

Catatan keputusan yang belum final:

- File akan disimpan di local storage backend, object storage, atau provider lain.
- Auth akan memakai JWT internal, session database, atau integrasi provider lain.
- Migration tool PostgreSQL akan memakai SQL manual, Knex, Prisma, atau node-pg-migrate.
- Validasi request akan memakai library khusus atau helper internal.

## 11. Kesimpulan

Blueprint ini menjadi pegangan awal untuk membangun sistem arsip dengan arsitektur:

```txt
React.js -> Node.js -> PostgreSQL
```

Supabase tidak langsung dilepas. Supabase tetap menjadi sumber data sementara sampai backend Node.js dan PostgreSQL siap menggantikan modul demi modul.
