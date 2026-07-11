# ATMS — Excel Replacement MVP

## Minimum Requirement Baseline

| Informasi | Nilai |
|---|---|
| Dokumen | ATMS Excel Replacement MVP |
| Versi | 0.1 |
| Status | Draft for Review |
| Tanggal | 20 Juni 2026 |
| Acuan | `docs/ATMS-SRS-Phase-1.md` |
| Tujuan | Menetapkan kemampuan minimum agar ATMS dapat menggantikan Excel untuk pencatatan dan pengarsipan pekerjaan trucking |

> Dokumen ini tidak memperluas ATMS menjadi sistem fleet management yang kompleks. Fokusnya adalah pencatatan terpusat, pengarsipan dokumen, monitoring status, pencarian data, audit perubahan, dan laporan dasar.

---

## 1. Tujuan MVP

ATMS dinyatakan memenuhi Excel Replacement MVP apabila perusahaan dapat menggunakan sistem sebagai sumber data utama untuk:

- Mengelola master customer, truck, driver, dan user.
- Mencatat Sales Order customer.
- Membentuk pekerjaan per container.
- Mengarsipkan assignment, status, waktu, dan dokumen Operational.
- Mencari dan memfilter data historis.
- Menghasilkan laporan yang dapat diekspor.
- Mengetahui siapa yang membuat dan mengubah data.
- Mengakses data yang sama dari beberapa perangkat dan pengguna.

Penggunaan Excel masih diperbolehkan untuk masa transisi, tetapi tidak menjadi sumber data utama setelah MVP diterima.

---

## 2. Batasan Scope

### 2.1 Termasuk dalam MVP

- Authentication dan role-based access.
- Master Customer.
- Master Truck.
- Master Driver.
- User Management.
- Sales Order.
- Container Job.
- Pengarsipan dokumen.
- Status dan timeline sederhana.
- Dashboard ringkas.
- Sales Report.
- Operational Report.
- Export CSV/XLSX.
- Activity Log.
- Database dan file storage terpusat.
- Backup dasar.

### 2.2 Tidak termasuk dalam MVP

- GPS dan live tracking.
- Optimasi jadwal atau dispatch otomatis.
- Deteksi konflik truck/driver tingkat lanjut.
- Fuel management.
- Maintenance workshop.
- Integrasi pelabuhan, shipping line, atau NLE.
- Invoice dan payment tracking.
- Perhitungan profitabilitas.
- Mobile application native.
- Notifikasi WhatsApp atau email otomatis.

---

## 3. Alur Bisnis Minimum

```text
Admin menyiapkan Master Data
        ↓
Sales membuat Sales Order
        ↓
Sistem membuat Container Job
        ↓
Operational memilih Driver dan Truck
        ↓
Operational mengisi status, waktu, dan dokumen
        ↓
Container Job dinyatakan Selesai
        ↓
Data tersimpan sebagai arsip
        ↓
Admin/Management mencari dan mengekspor laporan
```

---

## 4. Role dan Hak Akses

| Modul/Aksi | Admin | Sales | Operational | Pengamat |
|---|---|---|---|---|
| Master Customer | Kelola | Lihat melalui pilihan form | Tidak | Tidak |
| Master Truck | Kelola | Tidak | Pilih pada assignment | Tidak |
| Master Driver | Kelola | Tidak | Pilih pada assignment | Tidak |
| User Management | Kelola | Tidak | Tidak | Tidak |
| Sales Order | Lihat + komersial | Kelola + komersial | Lihat tanpa komersial | Lihat tanpa komersial |
| Container Job | Lihat + dokumen | Tidak | Kelola + dokumen | Lihat tanpa file internal |
| Reports | Lihat/export | Tidak | Tidak | Lihat/export |
| Activity Log | Lihat | Tidak | Tidak | Tidak |
| Pengaturan Sistem | Kelola | Tidak | Tidak | Tidak |

Hak akses harus diterapkan di backend. Menyembunyikan menu atau tombol pada frontend saja tidak dianggap cukup.

---

## 5. Kebutuhan Fungsional Wajib

### 5.1 Authentication dan User

| ID | Requirement |
|---|---|
| AUTH-01 | User dapat login menggunakan email dan password. |
| AUTH-02 | User nonaktif tidak dapat login. |
| AUTH-03 | Sistem mengarahkan user ke menu sesuai role. |
| AUTH-04 | User dapat logout. |
| AUTH-05 | Admin dapat membuat, mengubah, mengaktifkan, dan menonaktifkan user. |
| AUTH-06 | Admin dapat menjalankan reset password. |
| AUTH-07 | Password tidak disimpan dalam bentuk teks biasa. |

### 5.2 Master Customer

| ID | Requirement |
|---|---|
| CUS-01 | Admin dapat menambah, melihat, dan mengubah customer. |
| CUS-02 | Data mencakup nama, alamat, PIC, telepon, email, dan NPWP. |
| CUS-03 | Data dapat menyimpan nomor, periode, dan status umbrella contract. |
| CUS-04 | Dokumen NPWP dan contract dapat diunggah dan diunduh. |
| CUS-05 | Nama atau kode customer tidak boleh duplikat sesuai aturan yang disepakati. |
| CUS-06 | Customer dapat dicari dan difilter berdasarkan status contract. |

### 5.3 Master Truck

| ID | Requirement |
|---|---|
| TRK-01 | Admin dapat menambah, melihat, dan mengubah truck. |
| TRK-02 | Data mencakup kode unit, nomor polisi, merek, tipe, VIN, dan nomor mesin. |
| TRK-03 | Status truck minimal terdiri dari Aktif, Maintenance, dan Tidak Aktif. |
| TRK-04 | Dokumen STNK dan KIR dapat diunggah dan diunduh. |
| TRK-05 | Kode unit, nomor polisi, VIN, dan nomor mesin tidak boleh duplikat. |
| TRK-06 | Truck Maintenance atau Tidak Aktif tidak tersedia sebagai pilihan assignment baru. |

### 5.4 Master Driver

| ID | Requirement |
|---|---|
| DRV-01 | Admin dapat menambah, melihat, dan mengubah driver. |
| DRV-02 | Data mencakup nama, kontak, jenis SIM, masa berlaku SIM, dan status. |
| DRV-03 | Dokumen KTP dan SIM dapat diunggah dan diunduh. |
| DRV-04 | Status minimal terdiri dari Tersedia, Bertugas, dan Tidak Aktif. |
| DRV-05 | Driver Tidak Aktif tidak tersedia sebagai pilihan assignment baru. |
| DRV-06 | Sistem menampilkan masa berlaku SIM dalam daftar/detail driver. |

### 5.5 Sales Order

| ID | Requirement |
|---|---|
| SO-01 | Sales dapat membuat, melihat, dan mengubah Sales Order. |
| SO-02 | Nomor Sales Order wajib unik. |
| SO-03 | Customer dipilih dari Master Customer aktif. |
| SO-04 | PIC, kontak, dan alamat customer ditampilkan otomatis. |
| SO-05 | Data order mencakup tanggal SO, tanggal diterima, shipment, job type, asal, tujuan, dan deskripsi. |
| SO-06 | Data komersial mencakup harga, jumlah, satuan, dan total otomatis. |
| SO-07 | Satu Sales Order dapat memiliki satu atau lebih container. |
| SO-08 | Nomor container wajib diisi dan tidak boleh duplikat pada pekerjaan aktif/arsip sesuai kebijakan perusahaan. |
| SO-09 | Sales dapat mengunggah dokumen referensi customer. |
| SO-10 | Sales dapat membatalkan Sales Order yang belum selesai. |
| SO-11 | Status SO dihitung berdasarkan status container: Pending, Aktif, Selesai, atau Dibatalkan. |
| SO-12 | Operational dan Pengamat tidak dapat melihat nilai komersial. |

### 5.6 Container Job

| ID | Requirement |
|---|---|
| JOB-01 | Sistem membuat satu Container Job untuk setiap container pada Sales Order. |
| JOB-02 | Operational dapat memilih driver dan truck dari master data yang valid. |
| JOB-03 | Operational dapat mengisi status dan catatan RPUJ. |
| JOB-04 | Operational dapat mengisi nomor dan dokumen SPK. |
| JOB-05 | Operational dapat mengisi nomor serta dokumen bon muat, bon bongkar, surat jalan, dan surat timbang. |
| JOB-06 | Operational dapat mengunggah dokumen tambahan. |
| JOB-07 | Operational dapat mengisi waktu mulai dan selesai. |
| JOB-08 | Status minimal terdiri dari Belum Diproses, Berjalan, Delayed/Hold, dan Selesai. |
| JOB-09 | Alasan wajib diisi untuk status Delayed/Hold. |
| JOB-10 | Pekerjaan hanya dapat diselesaikan setelah field dan dokumen wajib terpenuhi. |
| JOB-11 | Perubahan status menyimpan user dan waktu perubahan. |
| JOB-12 | Admin dapat melihat detail dan dokumen tanpa mengubah pekerjaan. |
| JOB-13 | Pengamat dapat melihat progress tanpa mengakses file dokumen internal. |

### 5.7 Dokumen

| ID | Requirement |
|---|---|
| DOC-01 | File disimpan pada storage terpusat, bukan hanya di perangkat user. |
| DOC-02 | Metadata file menyimpan nama, tipe, ukuran, uploader, dan waktu upload. |
| DOC-03 | File dapat diunduh oleh role yang memiliki izin. |
| DOC-04 | Sistem memvalidasi tipe dan ukuran file. |
| DOC-05 | Mengganti dokumen tidak menghilangkan jejak user dan waktu perubahan. |
| DOC-06 | Dokumen tetap dapat dibuka dari perangkat lain. |
| DOC-07 | Dokumen transaksi tidak dapat dihapus permanen oleh user operasional biasa. |

### 5.8 Pencarian dan Arsip

| ID | Requirement |
|---|---|
| ARC-01 | Data dapat dicari berdasarkan nomor SO, nomor DO, customer, atau nomor container. |
| ARC-02 | Container Job dapat dicari berdasarkan driver dan nomor polisi. |
| ARC-03 | Data dapat difilter berdasarkan tanggal dan status. |
| ARC-04 | Daftar data menggunakan pagination. |
| ARC-05 | Arsip selesai tetap dapat dibuka beserta dokumennya. |
| ARC-06 | Pencarian hanya mengembalikan data yang boleh dilihat oleh role tersebut. |

### 5.9 Reports dan Export

| ID | Requirement |
|---|---|
| RPT-01 | Sales Report menampilkan SO, customer, tanggal, jumlah container, dan status. |
| RPT-02 | Operational Report menampilkan container, customer, truck, driver, status, dan timeline. |
| RPT-03 | Report dapat difilter berdasarkan rentang tanggal, customer, status, dan kata kunci. |
| RPT-04 | Hasil report dapat diekspor ke CSV atau XLSX. |
| RPT-05 | Data export mengikuti filter yang sedang aktif. |
| RPT-06 | Hanya Admin dan Pengamat yang dapat membuka dan mengekspor report. |

### 5.10 Audit

| ID | Requirement |
|---|---|
| AUD-01 | Data utama menyimpan Created By, Created At, Updated By, dan Updated At. |
| AUD-02 | Activity Log mencatat login, create, update, cancel, perubahan status, dan upload dokumen. |
| AUD-03 | Activity Log tidak dapat diubah oleh user biasa. |
| AUD-04 | Admin dapat mencari log berdasarkan user, modul, aktivitas, dan tanggal. |

---

## 6. Aturan Data Minimum

- Data transaksi tidak dihapus permanen; gunakan status batal/nonaktif.
- Nomor SO harus unik.
- Nomor container wajib memiliki format yang konsisten.
- Relasi SO dan Container Job tidak boleh terputus.
- Customer yang sudah digunakan transaksi tidak boleh dihapus permanen.
- Truck dan driver yang pernah digunakan tetap muncul pada arsip historis walaupun kemudian dinonaktifkan.
- Semua waktu disimpan konsisten dan ditampilkan dalam zona waktu Asia/Jakarta.
- Dokumen wajib ditentukan melalui konfigurasi atau aturan bisnis yang disepakati.

---

## 7. Kebutuhan Non-Fungsional Minimum

### 7.1 Keandalan

- Data tersimpan permanen setelah sistem menyatakan berhasil.
- Sistem dapat digunakan beberapa user secara bersamaan.
- Kegagalan simpan menampilkan pesan yang jelas dan tidak menghasilkan data ganda.
- Tersedia backup database dan metadata dokumen secara terjadwal.

### 7.2 Keamanan

- Seluruh halaman transaksi membutuhkan login.
- Backend memvalidasi role untuk setiap operasi.
- File dokumen tidak dapat diakses tanpa otorisasi.
- Password dan token tidak dicatat pada Activity Log.

### 7.3 Performa

- Daftar menggunakan pagination dari backend.
- Pencarian umum dapat digunakan pada volume data operasional normal.
- Halaman daftar pertama ditargetkan tampil dalam maksimal 3 detik pada koneksi kantor yang normal.

### 7.4 Usability

- Desktop menjadi perangkat utama.
- Tablet dan mobile mendukung monitoring serta pekerjaan dasar.
- Form memberikan validasi field wajib.
- Tindakan penting memiliki konfirmasi dan feedback keberhasilan/kegagalan.

---

## 8. Migrasi dari Excel

Sebelum go-live, perusahaan harus menyiapkan:

1. Template import Master Customer.
2. Template import Master Truck.
3. Template import Master Driver.
4. Pembersihan data duplikat dan format yang tidak konsisten.
5. Penentuan tanggal awal transaksi yang akan dimigrasikan.
6. Mapping kolom Excel lama ke field ATMS.
7. Validasi jumlah record sebelum dan sesudah import.
8. Penanggung jawab persetujuan hasil migrasi.

Import transaksi historis bersifat opsional. Minimal, master data harus tersedia sebelum pilot dimulai.

---

## 9. Acceptance Criteria MVP

ATMS layak menggantikan Excel apabila seluruh kondisi berikut terpenuhi:

- [ ] Empat role dapat login dan hanya mengakses fungsi yang diizinkan.
- [ ] Admin dapat mengelola seluruh master data dan user.
- [ ] Sales dapat membuat SO dengan beberapa container dan dokumen.
- [ ] SO baru otomatis tersedia sebagai Container Job untuk Operational.
- [ ] Operational dapat menyelesaikan pekerjaan setelah assignment dan dokumen wajib lengkap.
- [ ] Data yang dibuat satu user dapat dilihat user lain dari perangkat berbeda.
- [ ] Refresh atau logout tidak menghilangkan data.
- [ ] Dokumen dapat diunggah dan diunduh kembali dari perangkat lain.
- [ ] Nomor SO dan data unik tidak dapat tersimpan ganda.
- [ ] Arsip dapat dicari menggunakan SO, customer, container, driver, truck, status, dan tanggal.
- [ ] Sales Report dan Operational Report menghasilkan data sesuai filter.
- [ ] Report dapat diekspor ke CSV/XLSX.
- [ ] Perubahan penting tercatat di Activity Log.
- [ ] Backup dan prosedur pemulihan telah diuji.
- [ ] UAT untuk Admin, Sales, Operational, dan Pengamat telah disetujui.

---

## 10. Strategi Implementasi

### Tahap A — Backend Foundation

- Authentication.
- Database.
- Role authorization.
- File storage.
- Audit service.

### Tahap B — Master Data

- Customer.
- Truck.
- Driver.
- User.
- Import master dari Excel.

### Tahap C — Transaction Flow

- Sales Order.
- Container Job.
- Dokumen.
- Status dan timeline.

### Tahap D — Reports dan Migration

- Pencarian arsip.
- Sales Report.
- Operational Report.
- Export CSV/XLSX.
- Migrasi data awal.

### Tahap E — Pilot dan UAT

- Uji per role.
- Parallel run dengan Excel.
- Perbaikan temuan.
- Persetujuan go-live.
- Penghentian input baru di Excel setelah cutover disetujui.

---

## 11. Definition of Done

Sebuah modul dianggap selesai apabila:

- UI terhubung ke backend nyata.
- Data tersimpan pada database terpusat.
- Authorization backend diterapkan.
- Validasi frontend dan backend tersedia.
- Loading, empty, error, dan success state tersedia.
- Audit perubahan tersimpan.
- Pengujian utama lulus.
- UAT role terkait disetujui.
- Dokumentasi penggunaan tersedia.

---

## 12. Keputusan yang Perlu Dikunci

Sebelum desain database dimulai, stakeholder perlu menyetujui:

1. Dokumen wajib untuk menyelesaikan Container Job.
2. Apakah nomor container boleh digunakan kembali pada transaksi berbeda.
3. Format nomor Sales Order.
4. Batas ukuran dan tipe file.
5. Masa penyimpanan dokumen.
6. Data historis Excel yang akan dimigrasikan.
7. Format export laporan.
8. Jadwal backup dan periode retensi.
9. Siapa yang berwenang membatalkan transaksi.
10. Kapan Excel resmi berhenti digunakan untuk input baru.

---

## 13. Change Log

| Versi | Tanggal | Perubahan | Status |
|---|---|---|---|
| 0.1 | 20 Juni 2026 | Dokumen awal Excel Replacement MVP | Draft for Review |
