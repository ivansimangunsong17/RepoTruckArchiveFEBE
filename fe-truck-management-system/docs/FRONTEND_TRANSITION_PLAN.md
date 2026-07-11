# Frontend Transition Plan

Dokumen ini menjelaskan rencana transisi frontend dari pola React yang masih memakai Supabase di balik service menuju pola React -> Node.js API -> PostgreSQL.

Catatan penting:

- Jangan langsung melepas Supabase dari frontend.
- Jangan langsung mengubah semua service ke API backend.
- Jangan langsung mengubah UI besar-besaran.
- Fokus frontend saat ini adalah menjaga UI tetap stabil sambil menyiapkan jalur transisi.

## 1. Tujuan

Tujuan dokumen ini adalah memastikan frontend punya arah yang jelas sebelum backend Node.js dan PostgreSQL benar-benar digunakan.

Frontend harus disiapkan agar:

- Halaman React tidak memanggil Supabase langsung.
- Semua akses data lewat service layer.
- Service layer bisa diganti sumber datanya dari Supabase ke HTTP API.
- UI tetap berjalan selama masa transisi.
- Perubahan backend tidak memaksa rewrite besar di halaman React.

## 2. Kondisi Saat Ini

Status saat ini:

- Area UI utama sudah bersih dari akses Supabase langsung.
- Folder `pages`, `components`, `contexts`, dan `routes` sudah diarahkan lewat service.
- Supabase masih digunakan di dalam `src/services`.
- Ini sesuai strategi transisi karena Supabase belum dilepas, hanya dipindahkan ke balik service layer.

Pola saat ini:

```txt
React Page / Component -> Frontend Service -> Supabase
```

Pola tujuan:

```txt
React Page / Component -> Frontend Service -> API Adapter -> Node.js API -> PostgreSQL
```

## 3. Service Frontend yang Sudah Ada

Service yang menjadi fondasi transisi:

```txt
src/services/authService.js
src/services/userService.js
src/services/masterDataService.js
src/services/salesOrderService.js
src/services/containerJobService.js
src/services/settingsService.js
src/services/fileService.js
src/services/activityLogService.js
```

Service pendukung atau legacy yang masih perlu diaudit:

```txt
src/services/archiveService.js
src/services/clientService.js
src/services/driverService.js
src/services/truckService.js
src/services/documentService.js
src/services/deliveryOrderService.js
src/services/assignmentService.js
src/services/monitoringService.js
src/services/maintenanceService.js
src/services/fuelService.js
src/services/tripService.js
src/services/fleetService.js
```

## 4. Target Struktur Service

Struktur ideal frontend service ke depan:

```txt
src/services/
  api/
    httpClient.js
    apiConfig.js

  adapters/
    supabase/
      authAdapter.js
      masterDataAdapter.js
      salesOrderAdapter.js
      containerJobAdapter.js
      settingsAdapter.js
      fileAdapter.js
      activityLogAdapter.js

    api/
      authAdapter.js
      masterDataAdapter.js
      salesOrderAdapter.js
      containerJobAdapter.js
      settingsAdapter.js
      fileAdapter.js
      activityLogAdapter.js

  authService.js
  userService.js
  masterDataService.js
  salesOrderService.js
  containerJobService.js
  settingsService.js
  fileService.js
  activityLogService.js
```

Dengan pola ini, halaman tetap memanggil service yang sama.

Contoh:

```txt
SalesOrdersPage -> salesOrderService -> selected adapter
```

Yang berubah hanya adapter di belakang service.

## 5. Environment Variable

Frontend perlu mendukung pilihan sumber data.

```txt
VITE_DATA_SOURCE=supabase
VITE_API_BASE_URL=http://localhost:3000/api
```

Nilai `VITE_DATA_SOURCE`:

```txt
supabase -> gunakan Supabase adapter
api      -> gunakan Node.js API adapter
```

Selama backend belum siap, default tetap:

```txt
VITE_DATA_SOURCE=supabase
```

## 6. Adapter Strategy

### 6.1 Supabase Adapter

Supabase adapter adalah implementasi sementara yang memakai Supabase.

Tanggung jawab:

- Memanggil `supabase.from`.
- Memanggil `supabase.rpc`.
- Memanggil `supabase.auth`.
- Memanggil `supabase.storage`.
- Menormalkan error Supabase.

### 6.2 API Adapter

API adapter adalah implementasi baru yang nanti memanggil backend Node.js.

Tanggung jawab:

- Memanggil endpoint REST backend.
- Mengirim token auth jika dibutuhkan.
- Menangani response JSON.
- Menangani error HTTP.
- Menyamakan bentuk data agar UI tidak berubah besar.

## 7. Modul Prioritas Transisi FE

Urutan transisi frontend yang disarankan:

1. Settings.
2. Master Data.
3. Sales Order.
4. Container Job.
5. File / Document.
6. Activity Log.
7. User / Auth.
8. Reports / Dashboard.

Alasan:

- Settings paling kecil dan risikonya rendah.
- Master Data menjadi fondasi modul lain.
- Sales Order dan Container Job adalah inti sistem arsip.
- Auth dipindah belakangan karena risikonya paling tinggi.

## 8. API Mapping Awal

### 8.1 Settings

Frontend service:

```txt
settingsService.js
```

Target endpoint:

```txt
GET /api/settings
PUT /api/settings
```

### 8.2 Master Data

Frontend service:

```txt
masterDataService.js
```

Target endpoint:

```txt
GET    /api/master/customers
POST   /api/master/customers
PATCH  /api/master/customers/:id
DELETE /api/master/customers/:id

GET    /api/master/drivers
POST   /api/master/drivers
PATCH  /api/master/drivers/:id
DELETE /api/master/drivers/:id

GET    /api/master/vehicles
POST   /api/master/vehicles
PATCH  /api/master/vehicles/:id
DELETE /api/master/vehicles/:id
```

### 8.3 Sales Order

Frontend service:

```txt
salesOrderService.js
```

Target endpoint:

```txt
GET   /api/sales-orders
GET   /api/sales-orders/:id
POST  /api/sales-orders
PATCH /api/sales-orders/:id
PATCH /api/sales-orders/:id/cancel
```

### 8.4 Container Job

Frontend service:

```txt
containerJobService.js
```

Target endpoint:

```txt
GET   /api/container-jobs
GET   /api/container-jobs/:id
PATCH /api/container-jobs/:id
PATCH /api/container-jobs/:id/assignment
PATCH /api/container-jobs/:id/status
```

### 8.5 File / Document

Frontend service:

```txt
fileService.js
```

Target endpoint:

```txt
POST   /api/documents/upload
GET    /api/documents/:id
GET    /api/documents/:id/download
DELETE /api/documents/:id
```

### 8.6 Activity Log

Frontend service:

```txt
activityLogService.js
```

Target endpoint:

```txt
GET /api/activity-logs
```

### 8.7 Auth / User

Frontend service:

```txt
authService.js
userService.js
```

Target endpoint:

```txt
POST  /api/auth/login
POST  /api/auth/logout
GET   /api/auth/me
GET   /api/users
POST  /api/users
PATCH /api/users/:id
POST  /api/users/:id/reset-password
```

## 9. UI Rules Selama Transisi

Aturan untuk menjaga frontend tetap stabil:

- Page dan component tidak boleh import Supabase client langsung.
- Page dan component harus memanggil service.
- Mapping data dari backend ke bentuk UI dilakukan di service atau adapter.
- Jangan ubah bentuk props component tanpa kebutuhan jelas.
- Jangan pindahkan Auth lebih awal sebelum API auth siap.
- Jangan hapus Supabase service lama sebelum API adapter stabil.

## 10. Testing Plan

Test yang perlu dijaga:

```txt
AuthContext.test.jsx
SettingsPage.test.jsx
MasterDataPage.test.jsx
ActivityLogPage.test.jsx
masterDataService.test.js
salesOrderService.test.js
containerJobService.test.js
settingsService.test.js
```

Saat API adapter dibuat, test tambahan yang perlu ada:

```txt
apiClient.test.js
settingsApiAdapter.test.js
masterDataApiAdapter.test.js
salesOrderApiAdapter.test.js
containerJobApiAdapter.test.js
```

## 11. Checklist Transisi FE

```txt
[ ] Semua page tidak import Supabase langsung.
[ ] Semua context tidak import Supabase langsung, kecuali lewat service auth.
[ ] Semua akses data utama lewat service.
[ ] Environment VITE_DATA_SOURCE disiapkan.
[ ] API client frontend dibuat.
[ ] Supabase adapter dipisah dari service utama.
[ ] API adapter dibuat modul per modul.
[ ] Settings berhasil berjalan via API adapter.
[ ] Master Data berhasil berjalan via API adapter.
[ ] Sales Order berhasil berjalan via API adapter.
[ ] Container Job berhasil berjalan via API adapter.
[ ] File upload berhasil berjalan via API adapter.
[ ] Activity Log berhasil berjalan via API adapter.
[ ] Auth/User berhasil berjalan via API adapter.
[ ] Supabase dependency dilepas setelah semua modul stabil.
```

## 12. Kesimpulan

Frontend saat ini sudah berada di jalur yang benar karena UI utama sudah tidak memanggil Supabase langsung.

Langkah berikutnya bukan langsung mengganti semua service, tetapi menyiapkan adapter dan environment switching agar transisi bisa dilakukan modul per modul.

Target akhirnya:

```txt
React UI -> Frontend Service -> API Adapter -> Node.js Backend -> PostgreSQL
```
