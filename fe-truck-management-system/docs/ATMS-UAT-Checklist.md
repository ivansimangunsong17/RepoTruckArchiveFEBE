# ATMS Archive MVP — UAT Checklist

Dokumen ini digunakan untuk mengetes kesiapan **Armada Truck Management System (ATMS) Archive MVP** sebelum dipakai internal di lapangan.

Fokus UAT:

- memastikan sistem dapat menggantikan pencatatan Excel dasar;
- memastikan role berjalan sesuai hak akses;
- memastikan data dan dokumen archive tersimpan;
- memastikan laporan dapat diekspor dan dibaca.

## 1. Persiapan UAT

### Data login role

| Role | Email | Catatan |
|---|---|---|
| Admin | admin@armada.com | Mengelola master data dan user |
| Sales | sales@armada.com | Membuat dan mengelola Sales Order |
| Operational | ops@armada.com | Update proses Container Job |
| Pengamat | management@armada.com | Melihat data dan laporan |

### Data uji minimum

Siapkan data berikut:

- 5 customer aktif;
- 2 customer tidak aktif/review;
- 5 driver aktif;
- 2 driver tidak aktif/cuti/bertugas;
- 5 truck aktif;
- 2 truck maintenance/tidak aktif/bertugas;
- 10 Sales Order;
- 20 Container Job;
- beberapa file PDF/JPG/PNG maksimal 5 MB.

## 2. UAT Role Admin

### 2.1 Login Admin

- [ ] Admin bisa login.
- [ ] Sidebar menampilkan menu Admin/Master Data/System yang sesuai.
- [ ] Admin tidak diarahkan ke halaman restricted.

### 2.2 Master Client

- [ ] Admin bisa membuka menu Data Customer.
- [ ] Admin bisa input customer baru.
- [ ] Sistem menolak customer tanpa field wajib.
- [ ] Sistem menolak data unik yang duplikat, seperti nama customer/NPWP/contract number.
- [ ] Admin bisa upload dokumen NPWP.
- [ ] Admin bisa upload dokumen umbrella contract.
- [ ] File selain PDF/JPG/PNG ditolak.
- [ ] File lebih dari 5 MB ditolak.
- [ ] Admin bisa edit customer.
- [ ] Admin bisa melihat detail customer.
- [ ] Admin bisa arsip/nonaktifkan customer.
- [ ] Customer tidak aktif tidak bisa dipilih untuk Sales Order baru.

### 2.3 Master Driver

- [ ] Admin bisa input driver baru.
- [ ] Sistem menolak driver tanpa nama/kontak/SIM.
- [ ] Sistem menolak kontak driver duplikat.
- [ ] Admin bisa upload KTP/SIM.
- [ ] Admin bisa edit driver.
- [ ] Admin bisa arsip/nonaktifkan driver.
- [ ] Driver nonaktif/cuti/bertugas tidak muncul sebagai pilihan assignment baru.

### 2.4 Master Truck

- [ ] Admin bisa input truck baru.
- [ ] Sistem menolak nomor polisi/kode unit/VIN/nomor mesin duplikat.
- [ ] Admin bisa upload dokumen STNK/KIR.
- [ ] Admin bisa edit truck.
- [ ] Admin bisa arsip/nonaktifkan truck.
- [ ] Truck nonaktif/maintenance/bertugas tidak muncul sebagai pilihan assignment baru.

### 2.5 User Management

- [ ] Admin bisa membuka User Management.
- [ ] Admin bisa membuat user baru.
- [ ] Sistem meminta password dan konfirmasi password.
- [ ] Sistem menolak password dan konfirmasi yang tidak sama.
- [ ] Admin bisa mengubah role user.
- [ ] Admin bisa menonaktifkan user.
- [ ] User nonaktif tidak bisa reset password.
- [ ] User aktif bisa dibuatkan link reset password.

### 2.6 Activity Log

- [ ] Admin bisa membuka Activity Log.
- [ ] Activity Log tampil dengan pagination.
- [ ] Filter/search Activity Log berjalan.
- [ ] Aktivitas create/update/archive muncul setelah aksi dilakukan.

## 3. UAT Role Sales

### 3.1 Login Sales

- [ ] Sales bisa login.
- [ ] Sales melihat menu Sales Order.
- [ ] Sales tidak bisa membuka menu khusus Admin seperti User Management.

### 3.2 Buat Sales Order

- [ ] Sales bisa membuka Daftar Sales Order.
- [ ] Sales bisa klik Input Sales Order.
- [ ] Customer dropdown hanya menampilkan customer aktif.
- [ ] PIC/kontak/alamat customer otomatis terisi dari Master Customer.
- [ ] Sales bisa mengisi nomor SO.
- [ ] Sales bisa mengisi nomor DO customer.
- [ ] Sales bisa mengisi shipment/job type/rute.
- [ ] Sales bisa mengisi harga/quantity/unit.
- [ ] Total nilai otomatis dihitung.
- [ ] Sales bisa menambahkan lebih dari satu container.
- [ ] Sistem menolak nomor SO duplikat.
- [ ] Sistem menolak nomor container kosong.
- [ ] Sistem menolak nomor container duplikat.
- [ ] Sales bisa upload dokumen referensi customer.
- [ ] Sales Order berhasil tersimpan.
- [ ] Container Job otomatis muncul untuk Operational.

### 3.3 Edit Sales Order

- [ ] Sales bisa edit Sales Order yang masih belum diproses.
- [ ] Sales bisa tambah container baru pada Sales Order.
- [ ] Sales bisa menghapus container yang belum diproses.
- [ ] Container yang sudah diproses Operational terkunci.
- [ ] Container yang sudah berjalan/selesai tidak bisa dihapus.
- [ ] Edit header Sales Order tidak merusak Container Job.
- [ ] Dokumen referensi lama tetap bisa dilihat.
- [ ] Upload dokumen referensi yang sama tidak membuat data dobel yang membingungkan.

### 3.4 Cancel Sales Order

- [ ] Sales bisa membatalkan Sales Order yang belum diproses.
- [ ] Sales Order yang sudah punya container berjalan/hold/selesai tidak bisa dibatalkan.
- [ ] Sales Order dibatalkan tidak masuk antrean Operational aktif.

## 4. UAT Role Operational

### 4.1 Login Operational

- [ ] Operational bisa login.
- [ ] Operational bisa membuka Container Job.
- [ ] Operational bisa melihat Daftar Sales Order.
- [ ] Operational tidak bisa membuat Sales Order.
- [ ] Operational tidak bisa mengubah Master Data.

### 4.2 Container Job List

- [ ] Container Job tampil dari Sales Order yang dibuat Sales.
- [ ] Search SO/container/driver/truck berjalan.
- [ ] Tab status Container Job berjalan:
  - [ ] Semua
  - [ ] Belum Diproses
  - [ ] Berjalan
  - [ ] Delayed / Hold
  - [ ] Selesai
- [ ] Pagination berjalan.
- [ ] Tombol Detail tidak keluar dari card.
- [ ] Tombol Update Proses tampil untuk role Operational.

### 4.3 Update Container Job — Berjalan

- [ ] Operational bisa memilih driver aktif.
- [ ] Driver tidak aktif/cuti/bertugas tidak tersedia untuk assignment baru.
- [ ] Operational bisa memilih truck aktif.
- [ ] Truck tidak aktif/maintenance/bertugas tidak tersedia untuk assignment baru.
- [ ] Detail truck otomatis terisi.
- [ ] Saat status diubah ke Berjalan, waktu mulai otomatis terisi jika kosong.
- [ ] Sistem menolak status Berjalan tanpa driver/truck/waktu mulai.
- [ ] Update berhasil tersimpan.

### 4.4 Update Container Job — Hold

- [ ] Operational bisa mengubah status ke Delayed / Hold.
- [ ] Sistem meminta alasan hold.
- [ ] Sistem menolak hold tanpa alasan.
- [ ] Alasan hold tampil di detail/list.

### 4.5 Update Container Job — Selesai

- [ ] Saat status diubah ke Selesai, waktu selesai otomatis terisi jika kosong.
- [ ] Sistem menolak selesai tanpa driver.
- [ ] Sistem menolak selesai tanpa truck.
- [ ] Sistem menolak selesai tanpa waktu mulai.
- [ ] Sistem menolak selesai tanpa waktu selesai.
- [ ] Sistem menolak selesai jika waktu selesai lebih awal dari waktu mulai.
- [ ] Sistem menolak selesai tanpa nomor SPK.
- [ ] Sistem menolak selesai tanpa dokumen SPK.
- [ ] Sistem menolak selesai tanpa nomor/dokumen bon muat.
- [ ] Sistem menolak selesai tanpa nomor/dokumen bon bongkar.
- [ ] Sistem menolak selesai tanpa nomor/dokumen surat jalan.
- [ ] Sistem menolak selesai tanpa nomor/dokumen surat timbang.
- [ ] Jika semua lengkap, Container Job berhasil menjadi Selesai.
- [ ] Status Sales Order ikut berubah sesuai progress container.

### 4.6 Dokumen Operational

- [ ] Operational bisa upload PDF/JPG/PNG.
- [ ] File selain PDF/JPG/PNG ditolak.
- [ ] File lebih dari 5 MB ditolak.
- [ ] Dokumen lama tetap terlihat setelah update.
- [ ] Dokumen bisa dibuka/download dari detail.

## 5. UAT Role Pengamat

### 5.1 Login Pengamat

- [ ] Pengamat bisa login.
- [ ] Pengamat hanya bisa melihat menu yang sesuai.
- [ ] Pengamat tidak bisa input/edit/archive data.

### 5.2 Akses Data

- [ ] Pengamat bisa melihat Dashboard.
- [ ] Pengamat bisa melihat Sales Order.
- [ ] Pengamat bisa melihat Container Job.
- [ ] Pengamat tidak melihat tombol input/update yang tidak sesuai.
- [ ] Pengamat tidak bisa upload dokumen.

### 5.3 Report

- [ ] Pengamat bisa membuka Laporan.
- [ ] Filter report berjalan.
- [ ] Export Excel berhasil.
- [ ] Data komersial mengikuti aturan akses yang ditentukan.

## 6. UAT Report & Export

### Sales Report

- [ ] Filter keyword berjalan.
- [ ] Filter customer berjalan.
- [ ] Filter status berjalan.
- [ ] Filter tanggal berjalan.
- [ ] Export Excel menghasilkan file `.xls`.
- [ ] File Excel bisa dibuka.
- [ ] Header laporan rapi.
- [ ] Tanggal tidak tampil `#######`.
- [ ] Kolom penting terbaca.
- [ ] Role tanpa akses komersial tidak melihat nilai komersial.

### Operational Report

- [ ] Data Container Job tampil.
- [ ] Filter status berjalan.
- [ ] Export Excel berhasil.
- [ ] Dokumen/status/timeline masuk ke report.
- [ ] File Excel bisa dipakai sebagai arsip.

## 7. UAT Security & Role Access

- [ ] Sales tidak bisa membuat Master Customer.
- [ ] Operational tidak bisa membuat Master Customer.
- [ ] Pengamat tidak bisa membuat Master Customer.
- [ ] Admin tidak bisa membuat Sales Order dari flow Sales.
- [ ] Operational tidak bisa membuat Sales Order.
- [ ] Pengamat tidak bisa membuat Sales Order.
- [ ] Sales tidak bisa membaca Activity Log.
- [ ] Operational tidak bisa membaca Activity Log.
- [ ] Pengamat tidak bisa membaca Activity Log.
- [ ] Admin bisa membaca Activity Log.
- [ ] Pengamat tidak bisa upload file ke bucket archive.
- [ ] Dokumen hanya bisa dibuka oleh role yang berhak.

## 8. Kriteria Lulus UAT

Sistem dianggap lulus UAT Archive MVP jika:

- seluruh flow utama Admin, Sales, Operational, dan Pengamat berjalan;
- tidak ada data penting yang hilang saat edit/archive;
- upload dan download dokumen berjalan;
- report bisa diekspor dan dibaca;
- role access sesuai;
- tidak ada error kritikal saat menggunakan data uji lapangan;
- tester menyetujui sistem layak dipakai untuk archive internal.

## 9. Catatan Temuan UAT

Gunakan tabel berikut saat testing.

| No | Role | Halaman | Temuan | Severity | Status | Catatan Perbaikan |
|---:|---|---|---|---|---|---|
| 1 |  |  |  | Low / Medium / High | Open / Fixed / Retest |  |
| 2 |  |  |  | Low / Medium / High | Open / Fixed / Retest |  |
| 3 |  |  |  | Low / Medium / High | Open / Fixed / Retest |  |

## 10. Sign-Off

| Nama | Role | Keputusan | Tanggal | Catatan |
|---|---|---|---|---|
|  | Admin | Approve / Reject |  |  |
|  | Sales | Approve / Reject |  |  |
|  | Operational | Approve / Reject |  |  |
|  | Pengamat | Approve / Reject |  |  |
