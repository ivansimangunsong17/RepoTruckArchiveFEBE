# ATMS Frontend UI Gap Analysis

## Acuan

- Dokumen utama: `docs/ATMS-SRS-Phase-1.md`
- Tanggal audit: 20 Juni 2026
- Fokus: Frontend UI/UX dengan data dummy
- Status: Working Document

## Ringkasan

| Area | Estimasi | Status |
|---|---:|---|
| Design System & Layout | 85% | Hampir selesai |
| Authentication & Role UX | 95% | Permission utama tervalidasi |
| Admin / Master Data | 85% | Pola utama selesai |
| Sales Order | 85% | Flow utama selesai |
| Container Job | 90% | Flow utama selesai |
| Dashboard per Role | 90% | Flow utama selesai |
| Reports | 85% | Flow utama selesai |
| Activity Log | 50% | UI dummy tersedia |
| Responsive & Accessibility | 90% | Quality pass utama selesai |

Estimasi kesiapan frontend Phase 1: **sekitar 90%**.

---

## 1. Foundation & Design System

### Sudah tersedia

- Sidebar responsif berbasis role.
- Top navigation, breadcrumb, Global Search, notifikasi, dan profil.
- Tema Armada merah, putih, dan charcoal.
- Button, input, dropdown, card, table, badge, dan modal.
- Responsive desktop, tablet, dan mobile.
- Environment indicator.
- Access Restricted page.

### Gap

- Loading untuk operasi data backend menunggu integrasi API.
- Focus trap penuh di dalam modal masih dapat ditingkatkan.

### Sudah ditutup pada Sprint UI 5

- Confirmation dialog standar menggantikan dialog browser.
- Toast global untuk feedback sukses dan informasi.
- Feedback aksi pada Master Data, Sales Order, Operational, Reports, Settings, Profile, dan reset password.
- Dialog dapat ditutup menggunakan tombol Escape atau backdrop.
- Seluruh tabel aktif berubah menjadi record card pada layar mobile.
- Label kolom tetap terlihat pada setiap record card.
- Focus indicator keyboard distandardisasi.
- Modal utama mengunci scroll halaman dan dapat ditutup dengan Escape.
- Loading skeleton reusable untuk sesi dan seluruh lazy route.
- Error boundary global dan per halaman dengan tindakan Coba Lagi.
- Permission transaksi dikunci: Sales mengelola Sales Order, Operational mengelola Container Job, Admin hanya melihat transaksi.
- Dokumen internal Operational disembunyikan dari role Pengamat.
- Istilah utama halaman dirapikan ke Bahasa Indonesia.

### Prioritas

`P2 — Quality Pass`

---

## 2. Authentication & Role Experience

### Sudah tersedia

- Login dummy untuk empat role.
- Show/hide password.
- Loading dan error login.
- Role selalu terlihat.
- Profile dropdown.
- Profile page dan Change Password dummy.
- Global Search dibatasi berdasarkan role.
- Menu dan aksi disembunyikan berdasarkan permission.

### Gap

- Session timeout warning belum tersedia.
- Unsaved changes warning belum tersedia.
- Multi-device/session management tidak termasuk frontend MVP.

### Audit permission Sprint UI 5

| Role | Sales Order | Container Job | Master Data | Reports |
|---|---|---|---|---|
| Admin | Lihat + komersial | Lihat + dokumen | Kelola | Lihat |
| Sales | Kelola + komersial | Tidak tersedia | Tidak tersedia | Tidak tersedia |
| Operational | Lihat tanpa komersial | Kelola + dokumen | Tidak tersedia | Tidak tersedia |
| Pengamat | Lihat tanpa komersial | Lihat tanpa dokumen internal | Tidak tersedia | Lihat |

### Prioritas

`P3 — Enhancement setelah alur utama selesai`

---

## 3. Admin — Master Data

### Customer

#### Sudah tersedia

- Nama customer.
- Alamat.
- PIC.
- Kontak dan email.
- NPWP.
- Nomor, periode, dan status umbrella contract.
- Dokumen NPWP dan contract.
- Input/edit melalui modal.
- Search dan statistik ringkas.

#### Sudah ditutup pada Sprint UI 1

- Detail record.
- Validasi data unik.
- Filter status contract.
- Pagination.
- Validasi periode contract.
- Validasi ukuran dokumen.

#### Gap tersisa

- Konfirmasi delete yang konsisten.
- Empty state yang lebih kontekstual.

### Truck

#### Sudah tersedia

- Kode unit, nomor polisi, merk, tipe, VIN, nomor mesin, status.
- Dokumen STNK dan KIR.

#### Sudah ditutup pada Sprint UI 1

- Detail record.
- Validasi kode unit, nomor polisi, VIN, dan nomor mesin unik.
- Filter status.
- Pagination.

### Driver

#### Sudah tersedia

- Nama, kontak, jenis SIM, masa berlaku, status.
- Dokumen KTP dan SIM.

#### Sudah ditutup pada Sprint UI 1

- Detail record.
- Filter status.
- Pagination.

#### Gap tersisa

- Penanda SIM mendekati kedaluwarsa.

### User Management

#### Sudah tersedia

- Nama, email, role, status.
- Password dan verifikasi.
- Reset password dummy.

#### Sudah ditutup pada Sprint UI 1

- Detail user.
- Validasi email unik.
- Filter role/status.
- Pagination.

#### Gap tersisa

- Aktivasi/nonaktif langsung dari tabel.
- Konfirmasi reset password.

### Prioritas

`P1 — Diselesaikan sebelum modul transaksi`

---

## 4. Sales Order

### Sudah tersedia

- Daftar order.
- Input Sales Order.
- Customer, shipment, asal, tujuan, waktu diterima, dan catatan.
- Banyak container dalam satu order.
- Status Pending, Aktif, dan Selesai.
- Metadata Created/Updated.
- Tampilan read-only untuk role non-Sales.

### Sudah ditutup pada Sprint UI 2

- Customer dipilih dari Master Customer.
- PIC, kontak, dan alamat tampil otomatis.
- Sales Order Date dan Order Received Date.
- Shipment Import, Export, dan Domestic.
- Job Type dan Job Description.
- Price, Quantity, Unit, dan Total Amount.
- Container Type dan Container Notes.
- Customer Reference Documents.
- Detail dokumen: type, number, date, attachment, notes.
- Edit Sales Order.
- Cancelled status.
- Validasi nomor SO/container unik.
- Tampilan komersial dibatasi untuk Sales/Admin.

### Gap tersisa

- Loading state.
- Confirmation dialog standar.
- Pagination Sales Order.
- Persistensi dummy lintas halaman.

### Prioritas

`P1 — Setelah Master Data dikunci`

---

## 5. Container Job / Operational

### Sudah tersedia

- Antrean per container.
- Tab status.
- Assignment driver/truck dari Master Data.
- RPUJ, SPK, dokumen, status, dan timeline dasar.
- Dashboard Operational.
- Metadata Updated By/Date.

### Sudah ditutup pada Sprint UI 3

- RPUJ notes.
- Upload dokumen SPK.
- Upload Bon Muat, Bon Bongkar, Surat Jalan, Surat Timbang, dan Other Documents.
- Status Delayed/Hold beserta alasan.
- Detail modal khusus Container Job.
- Timeline pekerjaan.
- Progress kelengkapan dokumen.
- Validasi assignment dan dokumen sebelum status Selesai.
- Empty dan validation error state.

### Gap tersisa

- Loading state.
- Confirmation dialog standar untuk perubahan status penting.
- Persistensi dummy lintas halaman.

### Prioritas

`P1 — Setelah Sales Order`

---

## 6. Management / Pengamat

### Sudah tersedia

- Dashboard Management khusus dan read-only.
- Sales Order read-only.
- Container Job read-only.
- Reports menu.
- KPI management yang ringkas.
- Ringkasan progress Container Job.
- Aktivitas container terbaru tanpa menampilkan dokumen internal.

### Gap tersisa

- Final review informasi sensitif pada seluruh halaman detail.
- Loading state dashboard.

### Prioritas

`P2`

---

## 7. Reports & Activity Log

### Sudah tersedia

- Activity Log dummy.
- Sales Report dan Operational Report.
- Tab pemisah jenis laporan.
- Filter tanggal, customer, status, dan pencarian.
- Tabel hasil report.
- Empty state.
- Export button dummy.
- Pagination.
- Route Reports khusus Admin dan Pengamat.

### Gap tersisa

- Export file sebenarnya tidak termasuk frontend dummy.
- Loading dan error state.
- Persistensi filter.

### Prioritas

`P2 — Setelah transaksi utama`

---

## Rencana Pengerjaan Frontend

### Sprint UI 1 — Admin Master Data

1. Pola detail record.
2. Validasi unik dan format.
3. Filter status.
4. Pagination.
5. Konfirmasi tindakan.
6. Terapkan ke Customer, Truck, Driver, dan User.

### Sprint UI 2 — Sales Order

1. Integrasi dropdown dummy Master Customer.
2. Lengkapi field sesuai SRS.
3. Dokumen referensi customer.
4. Detail, edit, dan cancel.
5. Semua UX state.

### Sprint UI 3 — Container Job

1. Lengkapi dokumen Operational.
2. Hold/Delayed flow.
3. Detail dan timeline.
4. Validation dan status feedback.

### Sprint UI 4 — Reports & Management

1. Sales Report.
2. Operational Report.
3. Management Dashboard.
4. Read-only review.

### Sprint UI 5 — Quality Pass

1. Responsive audit.
2. Accessibility.
3. Loading, empty, error, dan success state.
4. Terminology consistency.
5. Final role-permission testing.

---

## Definition of Done per Modul

- Sesuai SRS.
- Semua field requirement tersedia.
- Permission role benar.
- Create, view, edit, dan action terkait memiliki UX yang jelas.
- Search, filter, dan pagination tersedia.
- Empty, loading, error, dan success state tersedia.
- Responsive.
- Tidak ada tombol atau informasi yang tidak relevan.
- ESLint dan production build lulus.
- Telah direview sebelum modul berikutnya dimulai.

---

## Implementation Log

| Date | Sprint | Changes | Status |
|---|---|---|---|
| 20 Juni 2026 | Sprint UI 1 | Gap analysis dibuat dan SRS dikunci sebagai approved baseline | Completed |
| 20 Juni 2026 | Sprint UI 1 | Detail record, filter, pagination, dan unique validation pada Master Data | Completed |
| 20 Juni 2026 | Sprint UI 1 | Validasi periode contract dan batas file 5 MB | Completed |
| 20 Juni 2026 | Sprint UI 2 | Form Sales Order lengkap sesuai SRS | Completed |
| 20 Juni 2026 | Sprint UI 2 | Customer auto-fill, commercial calculation, container detail, dan reference documents | Completed |
| 20 Juni 2026 | Sprint UI 2 | Detail, edit, cancel, role visibility, dan unique validation Sales Order | Completed |
| 20 Juni 2026 | Sprint UI 3 | Form Container Job lengkap, assignment, RPUJ/SPK, dan dokumen Operational | Completed |
| 20 Juni 2026 | Sprint UI 3 | Delayed/Hold flow, completion validation, detail modal, dan timeline | Completed |
| 20 Juni 2026 | Sprint UI 4 | Sales Report, Operational Report, filter, empty state, export dummy, dan pagination | Completed |
| 20 Juni 2026 | Sprint UI 4 | Dashboard Management/Pengamat khusus dengan ringkasan progress read-only | Completed |
| 20 Juni 2026 | Sprint UI 5 | Toast global dan confirmation dialog reusable menggantikan alert/confirm browser | Completed |
| 20 Juni 2026 | Sprint UI 5 | Feedback aksi distandardisasi pada modul utama | Completed |
| 20 Juni 2026 | Sprint UI 5 | Semua tabel aktif menggunakan responsive record-card pada mobile | Completed |
| 20 Juni 2026 | Sprint UI 5 | Focus state dan keyboard dismissal modal distandardisasi | Completed |
| 20 Juni 2026 | Sprint UI 5 | Loading skeleton dan error boundary reusable diterapkan pada routing | Completed |
| 20 Juni 2026 | Sprint UI 5 | Permission empat role diaudit dan aksi transaksi dikunci sesuai pemilik proses | Completed |
| 20 Juni 2026 | Sprint UI 5 | Bundle vendor dipisahkan untuk mengurangi ukuran entry chunk | Completed |
