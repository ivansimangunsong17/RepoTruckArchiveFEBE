# System Requirement Specification (SRS)

## Armada Truck Management System (ATMS)

### Phase 1 — Operational Archive System

| Informasi | Nilai |
|---|---|
| Version | 1.0 |
| Status | Approved Baseline |
| Baseline Date | 20 Juni 2026 |
| Document Owner | System Analyst / Project Management |
| Purpose | Single Source of Truth pengembangan ATMS Phase 1 |

> Dokumen ini menjadi landasan utama untuk desain UI/UX, database, API, pengembangan fitur, pengujian, dan penerimaan sistem ATMS. Setiap perubahan requirement harus melalui proses review dan dicatat pada bagian Change Log.

---

## 1. Background

Saat ini proses pengelolaan pekerjaan trucking masih melibatkan berbagai dokumen dan pencatatan manual, seperti:

- Informasi order dari customer.
- Sales Order.
- Penentuan truck dan driver.
- Dokumen perjalanan.
- Monitoring status pekerjaan.
- Rekap pekerjaan yang telah selesai.

Kondisi tersebut menyebabkan informasi tersebar di berbagai media dan menyulitkan proses monitoring.

ATMS dikembangkan sebagai sistem terpusat untuk mendigitalisasi proses pekerjaan trucking dari order customer diterima sampai pekerjaan selesai dan siap untuk proses invoice.

---

## 2. Objective

Tujuan utama ATMS adalah:

- Menyatukan data customer, truck, driver, dan pengguna dalam satu sistem.
- Mengubah informasi order customer menjadi Sales Order internal.
- Mengatur proses pekerjaan Operational berdasarkan container.
- Menentukan truck dan driver untuk setiap pekerjaan.
- Menyimpan seluruh dokumen operasional secara digital.
- Memantau perkembangan pekerjaan secara real-time.
- Menyediakan data historis untuk kebutuhan audit dan laporan.
- Menjadi pondasi pengembangan Fleet Management dan Finance System di masa depan.

---

## 3. Scope System

### 3.1 Included in Phase 1

#### Master Data Management

- Customer Management.
- Truck Management.
- Driver Management.
- User Management.
- System Configuration.

#### Sales Management

- Pembuatan Sales Order.
- Penyimpanan dokumen referensi customer.
- Input data container.
- Monitoring status Sales Order.

#### Operational Management

- Penerimaan pekerjaan dari Sales Order.
- Assignment truck dan driver.
- Pengisian informasi operasional.
- Penyimpanan dokumen perjalanan.
- Monitoring progress container.

#### Monitoring & Reporting

- Dashboard berdasarkan role.
- Monitoring Sales Order.
- Monitoring Container Job.
- Report operasional.
- Activity Log.

### 3.2 Excluded from Phase 1

#### Fleet Management — Phase 2

- Integrasi GPS Hino Connect.
- Real-time tracking.
- Riwayat perjalanan.
- Monitoring titik berhenti.
- Fuel Management.
- Maintenance Management.
- Cost Analysis.

#### Finance — Phase 3

- Invoice Management.
- Payment Tracking.
- Revenue Analysis.
- Cost Profitability Analysis.
- Customer Billing Report.

---

## 4. User Roles

Sistem memiliki empat jenis pengguna:

1. Admin.
2. Sales.
3. Operational.
4. Pengamat / Management.

---

## 5. Business Process

### 5.1 Level 1 Process

```text
Customer
    ↓
Memberikan informasi pekerjaan
(DO / SPK / Email / WhatsApp)
    ↓
Sales
    ↓
Membuat Sales Order (SO)
    ↓
Container Job
    ↓
Operational Process
    ↓
Assignment Truck & Driver
    ↓
Dokumen Operasional
    ↓
Pekerjaan Selesai
    ↓
Ready to Invoice
```

---

## 6. Master Data Requirement

### 6.1 Customer

Informasi:

- Customer Name.
- Customer Address.
- PIC Customer.
- Phone Number.
- Email.
- NPWP.
- Umbrella Contract Number.
- Contract Period.
- Contract Status.
- Attachment Document.

### 6.2 Truck

Informasi:

- Unit Code.
- License Plate.
- Brand.
- Type.
- Vehicle Identification Number (VIN).
- Engine Number.
- Truck Status:
  - Active.
  - Maintenance.
  - Inactive.
- STNK Document.
- KIR Document.

### 6.3 Driver

Informasi:

- Driver Name.
- Phone Number.
- SIM Type.
- SIM Expiry Date.
- Driver Status:
  - Available.
  - On Duty.
  - Inactive.
- KTP Document.
- SIM Document.

### 6.4 User

Informasi:

- Full Name.
- Email.
- Role.
- Account Status.

Role:

- Admin.
- Sales.
- Operational.
- Management.

---

## 7. Sales Order Requirement

Sales Order merupakan dokumen internal perusahaan yang dibuat berdasarkan informasi pekerjaan dari customer.

### 7.1 Customer Information

Data menggunakan Master Customer:

- Customer.
- PIC Customer.

Ditampilkan otomatis:

- Customer address.
- PIC contact.

### 7.2 Order Information

- Sales Order Number.
- Sales Order Date.
- Order Received Date.
- Shipment Type:
  - Import.
  - Export.
  - Domestic.
- Job Type.
- Origin Location.
- Destination Location.
- Job Description.

### 7.3 Commercial Information

- Price.
- Quantity.
- Unit:
  - Container.
  - Trip.
  - Ton.
- Total Amount — dihitung otomatis.

### 7.4 Container Detail

Satu Sales Order dapat memiliki lebih dari satu container.

Informasi container:

- Container Number.
- Container Size:
  - 20 FT.
  - 40 FT.
- Container Type.
- Container Notes.

### 7.5 Customer Reference Documents

Dokumen yang dapat diunggah:

- Delivery Order (DO).
- Customer SPK.
- Email Instruction.
- WhatsApp Instruction.
- Other Documents.

Informasi dokumen:

- Document Type.
- Reference Number.
- Document Date.
- Attachment File.
- Notes.

---

## 8. Sales Order Status

### 8.1 Pending

Sales Order sudah dibuat tetapi belum diproses oleh Operational.

### 8.2 Active

Minimal satu container sedang dalam proses Operational.

### 8.3 Completed

Semua container telah selesai.

### 8.4 Cancelled

Pekerjaan dibatalkan.

---

## 9. Operational Requirement

Operational bekerja berdasarkan Container Job. Setiap container merupakan satu unit pekerjaan.

### 9.1 Assignment

Operational dapat menentukan:

- Driver.
- Truck.

Driver dan truck dipilih dari master data.

### 9.2 Operational Information

#### RPUJ

- Status RPUJ.
- Information / Notes.

#### SPK

- SPK Number.
- SPK Document.

#### Operational Documents

- Loading Receipt — Bon Muat.
- Unloading Receipt — Bon Bongkar.
- Delivery Note — Surat Jalan.
- Weight Ticket — Surat Timbang.
- Other Documents.

#### Timeline

- Start Date Time.
- Finish Date Time.

---

## 10. Container Job Status

### 10.1 Not Processed

Belum ada aktivitas Operational.

### 10.2 On Progress

Container sedang berjalan.

### 10.3 Completed

Pekerjaan telah selesai.

### 10.4 Delayed / Hold

Pekerjaan tertunda karena kondisi tertentu.

---

## 11. Dashboard Requirement

### 11.1 Admin Dashboard

Menampilkan:

- Total Customer.
- Total Truck.
- Total Driver.
- Total User.
- Total Active Sales Order.
- Operational Progress Summary.

### 11.2 Sales Dashboard

Menampilkan:

- Total Sales Order.
- Pending.
- Active.
- Completed.
- Recent Sales Orders.

### 11.3 Operational Dashboard

Menampilkan:

- Waiting Container.
- On Progress Container.
- Completed Today.
- Missing Documents.
- Recent Assignment.

### 11.4 Management Dashboard

Menampilkan:

- Overall Operational Progress.
- Sales Order Summary.
- Container Status.
- Recent Activities.

---

## 12. Reporting Requirement

### 12.1 Sales Report

Informasi:

- Sales Order List.
- Customer.
- Status.
- Date Range.

### 12.2 Operational Report

Informasi:

- Container.
- Truck.
- Driver.
- Operational Status.
- Timeline.

### 12.3 Activity Log

Mencatat:

- User.
- Activity.
- Module.
- Date & Time.

Contoh:

```text
20/06/2026 08:20
Sales - Sarah
Created Sales Order SO-2026-001
```

---

## 13. Security Requirement

### 13.1 Authentication

- Login menggunakan email dan password.
- Password tidak disimpan secara plain text.
- Password dikelola menggunakan authentication service.

### 13.2 Authorization

Setiap role memiliki menu dan akses berbeda.

User yang tidak memiliki akses:

- Tidak dapat melihat menu yang tidak diizinkan.
- Tidak dapat melakukan action yang tidak memiliki izin.

---

## 14. Audit Requirement

### 14.1 Transaction Audit

Setiap data penting menyimpan:

- Created By.
- Created Date.
- Updated By.
- Updated Date.

### 14.2 Activity Audit

Mencatat aktivitas seperti:

- Login.
- Membuat Sales Order.
- Mengubah data.
- Menghapus data, jika diperbolehkan.
- Perubahan status pekerjaan.

---

## 15. Non-Functional Requirement

### 15.1 Performance

- Halaman utama harus terbuka dengan cepat.
- Pencarian dan filter harus tersedia pada data besar.
- Sistem mendukung pagination.

### 15.2 User Experience

- Desktop-first design.
- Responsive untuk tablet dan mobile.
- Konsisten menggunakan design system ATMS.

### 15.3 Scalability

Sistem harus dapat dikembangkan untuk:

- Fleet Management.
- Hino Connect API.
- Fuel Management.
- Maintenance.
- Cost Analysis.
- Finance System.

---

## 16. Future Roadmap

### 16.1 Phase 1 — Operational Archive

```text
Sales Order
       ↓
Container Job
       ↓
Operational Process
       ↓
Ready Invoice
```

### 16.2 Phase 2 — Fleet Management

```text
Truck
  ↓
Hino Connect API
  ↓
GPS Tracking
  ↓
Fuel Management
  ↓
Maintenance
  ↓
Cost Analysis
```

### 16.3 Phase 3 — Finance & Business Intelligence

```text
Invoice
       ↓
Payment Tracking
       ↓
Revenue Analysis
       ↓
Profitability Report
```

---

## 17. Final Summary

ATMS Phase 1 berfungsi sebagai **digital operational archive system** yang menghubungkan seluruh proses:

```text
Admin
(Master Data)
      ↓
Sales
(Create Sales Order)
      ↓
Container Job
      ↓
Operational
(Execution & Documents)
      ↓
Completed
      ↓
Ready for Invoice
      ↓
Management Monitoring
```

Dokumen ini merupakan baseline project. Pengembangan UI, database, API, dan fitur berikutnya harus mengacu pada dokumen ini. Perubahan tetap dimungkinkan melalui proses review agar tidak mengubah alur utama sistem tanpa persetujuan.

---

## 18. Requirement Governance

### 18.1 Change Procedure

Setiap perubahan requirement harus:

1. Menjelaskan kebutuhan atau masalah yang ingin diselesaikan.
2. Menyebutkan bagian SRS yang terdampak.
3. Menjelaskan dampak terhadap UI, proses bisnis, data, API, dan pengujian.
4. Mendapat persetujuan dari pihak yang berwenang.
5. Dicatat dalam Change Log.
6. Menaikkan versi dokumen jika perubahan disetujui.

### 18.2 Status Definition

- **Draft:** Masih dalam proses review.
- **Approved:** Telah disetujui sebagai baseline.
- **Revised:** Mengalami perubahan setelah baseline.
- **Deprecated:** Tidak lagi digunakan.

---

## 19. Change Log

| Version | Date | Description | Author | Approval |
|---|---|---|---|---|
| 1.0 | 20 Juni 2026 | Initial SRS baseline untuk ATMS Phase 1 | System Analyst | Approved |
