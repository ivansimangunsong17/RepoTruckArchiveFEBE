# ATMS Module 2 — Fleet Management System Analysis

Dokumen ini menjadi landasan awal untuk **Modul 2: Fleet Management System** setelah Archive MVP stabil.

Status saat ini:

- Modul Archive MVP sudah menjadi fondasi data master, Sales Order, Container Job, dokumen, report, dan role access.
- Modul Fleet belum membuat backend baru.
- Routing dan navigation placeholder sudah disiapkan agar struktur aplikasi siap dikembangkan bertahap.

## 1. Tujuan Modul Fleet Management

Modul Fleet Management bertujuan untuk memantau dan mengelola kondisi armada truck secara operasional.

Fokus utama:

- monitoring unit truck;
- status kesiapan armada;
- maintenance dan service;
- inspeksi kendaraan;
- fuel/BBM;
- utilisasi armada;
- riwayat aktivitas unit.

Modul ini berbeda dengan Archive MVP:

| Area | Archive MVP | Fleet Management |
|---|---|---|
| Fokus | Arsip data dan dokumen | Kondisi dan aktivitas armada |
| Data utama | Customer, SO, Container Job | Truck, maintenance, fuel, inspection |
| Tujuan | Menggantikan Excel archive | Mengontrol kesiapan dan utilisasi unit |
| Output | Data archive dan report | Monitoring fleet dan operational readiness |

## 2. Prinsip Pengembangan

Modul Fleet sebaiknya dikembangkan setelah Archive MVP selesai UAT dasar.

Prinsip:

- jangan mengubah flow Archive yang sudah stabil;
- gunakan Master Truck sebagai sumber utama unit;
- jangan membuat data truck duplikat;
- setiap fitur Fleet harus mengacu ke `vehicle_id`;
- mulai dari pencatatan sederhana sebelum tracking real-time;
- hindari fitur GPS/IoT dulu jika belum ada device/source data.

## 3. Role Access Awal

| Role | Akses Fleet |
|---|---|
| Admin | Full access untuk konfigurasi dan koreksi data |
| Operational | Input/update data fleet harian |
| Pengamat | View-only dashboard/report |
| Sales | Tidak perlu akses Fleet pada tahap awal |

Catatan:

- Sales cukup melihat data operational yang relevan melalui Sales Order/Container Job.
- Fleet adalah domain Operational/Admin/Pengamat.

## 4. Struktur Routing Modul Fleet

Routing awal yang sudah disiapkan:

| Route | Nama Menu | Fungsi Awal |
|---|---|---|
| `/fleet` | Redirect | Redirect ke `/fleet/overview` |
| `/fleet/overview` | Fleet Overview | Ringkasan kondisi armada |
| `/fleet/units` | Unit Monitoring | Monitoring status unit |
| `/fleet/maintenance` | Maintenance | Jadwal dan riwayat service |
| `/fleet/fuel` | Fuel Management | Pencatatan BBM |
| `/fleet/inspections` | Inspection Checklist | Checklist inspeksi kendaraan |

Semua route saat ini masih placeholder.

## 5. Rekomendasi Sub-Modul

### 5.1 Fleet Overview

Tujuan:

- melihat kondisi umum armada.

Data yang ditampilkan:

- total unit;
- unit aktif;
- unit bertugas;
- unit maintenance;
- unit tidak aktif;
- service due;
- dokumen kendaraan mendekati expired;
- utilisasi sederhana.

Komponen UI:

- KPI card;
- daftar unit perlu perhatian;
- ringkasan maintenance;
- ringkasan fuel bulan berjalan.

### 5.2 Unit Monitoring

Tujuan:

- melihat status setiap truck.

Data minimal:

- nomor polisi;
- kode unit;
- brand/type;
- status unit;
- driver terakhir;
- job terakhir;
- lokasi terakhir manual;
- odometer terakhir;
- catatan kondisi.

Status sederhana MVP:

- Aktif;
- Bertugas;
- Maintenance;
- Tidak Aktif.

Catatan:

- Untuk MVP, lokasi bisa manual, tidak perlu GPS.
- GPS tracking bisa menjadi fase berikutnya.

### 5.3 Maintenance Management

Tujuan:

- mencatat service dan perbaikan kendaraan.

Data minimal:

- truck;
- tanggal service;
- jenis maintenance;
- odometer;
- vendor/bengkel;
- biaya;
- catatan;
- dokumen invoice/nota;
- next service date;
- next service odometer.

Status:

- Planned;
- In Progress;
- Completed;
- Cancelled.

### 5.4 Fuel Management

Tujuan:

- mencatat BBM dan membantu membaca efisiensi armada.

Data minimal:

- truck;
- tanggal isi BBM;
- liter;
- harga per liter;
- total biaya;
- odometer;
- lokasi SPBU;
- driver;
- nomor struk;
- dokumen struk.

Output awal:

- total liter;
- total biaya;
- rata-rata biaya/unit;
- estimasi konsumsi per kilometer jika odometer lengkap.

### 5.5 Inspection Checklist

Tujuan:

- checklist kondisi kendaraan sebelum/sesudah jalan.

Data minimal:

- truck;
- tanggal inspeksi;
- petugas/driver;
- ban;
- rem;
- lampu;
- oli;
- air radiator;
- surat kendaraan;
- body/kabin;
- catatan kerusakan;
- foto/dokumen.

Status:

- Layak Jalan;
- Perlu Perbaikan;
- Tidak Layak Jalan.

## 6. Dependency Data dari Archive MVP

Modul Fleet sebaiknya menggunakan data yang sudah ada:

| Sumber Archive | Digunakan di Fleet |
|---|---|
| `vehicles` | master unit fleet |
| `drivers` | driver assignment/inspection/fuel |
| `container_jobs` | histori pemakaian unit |
| `attachments` | dokumen maintenance/fuel/inspection |
| `activity_logs` | audit perubahan |

## 7. Rekomendasi Tahapan Implementasi

### Tahap 2.1 — Fleet UI Foundation

- Buat halaman Fleet Overview.
- Buat halaman Unit Monitoring.
- Gunakan data Master Truck yang sudah ada.
- Dummy/derived data dulu.
- Tidak membuat schema baru dulu.

### Tahap 2.2 — Maintenance Archive

- Tambah pencatatan maintenance.
- Tambah upload dokumen maintenance.
- Tambah report maintenance.

### Tahap 2.3 — Fuel Archive

- Tambah pencatatan BBM.
- Tambah upload struk BBM.
- Tambah report fuel.

### Tahap 2.4 — Inspection Checklist

- Tambah form checklist kendaraan.
- Tambah status layak jalan.
- Tambah report inspeksi.

### Tahap 2.5 — Fleet Metrics

- Utilisasi unit.
- Biaya maintenance.
- Biaya fuel.
- Unit downtime.
- Unit yang sering bermasalah.

## 8. Batasan Awal

Untuk menjaga scope tetap realistis:

- belum perlu GPS real-time;
- belum perlu IoT integration;
- belum perlu predictive maintenance;
- belum perlu integrasi finance penuh;
- belum perlu mobile app khusus driver;
- belum perlu approval workflow kompleks.

## 9. Route yang Sudah Disiapkan

Kode routing dan sidebar sudah disiapkan untuk:

- `/fleet/overview`
- `/fleet/units`
- `/fleet/maintenance`
- `/fleet/fuel`
- `/fleet/inspections`

Role yang dapat melihat:

- Admin;
- Operational;
- Pengamat.

Sales tidak melihat menu Fleet pada tahap awal.

## 10. Rekomendasi Next Step

Setelah Archive MVP selesai UAT:

1. Implementasikan Fleet Overview menggunakan data truck yang sudah ada.
2. Buat Unit Monitoring read-only.
3. Tambahkan maintenance archive.
4. Baru lanjut fuel dan inspection.

Rekomendasi pertama:

**Tahap 2.1 — Fleet UI Foundation**

Alasannya:

- paling aman;
- tidak mengganggu Archive MVP;
- langsung memberi gambaran kondisi armada;
- menjadi jembatan ke maintenance/fuel/inspection.
