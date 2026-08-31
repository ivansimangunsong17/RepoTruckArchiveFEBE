# SOP dan Dokumentasi Flow Besar

Dokumen ini menjadi panduan kerja harian untuk Sales, Operational, Finance, dan Admin agar pencatatan aman, tidak mengganggu operasional, dan human error tetap bisa dikoreksi dengan jejak audit.

## Prinsip Utama

1. Master data hanya menjadi default untuk transaksi baru.
2. Transaksi lama harus memakai snapshot, bukan membaca master secara live.
3. Operational fokus pada ritasi dan fakta lapangan.
4. Finance fokus pada invoice, debit note, payment, RPUJ/UJ, dan komisi.
5. Status lunas hanya boleh otomatis dari payment, bukan dipilih manual.
6. Data yang sudah completed, approved, paid, atau lunas tidak boleh diedit bebas.
7. Salah input diperbaiki melalui void, correction, atau admin correction.
8. Semua perubahan penting wajib punya alasan, user, waktu, dan audit trail.

## Role dan Tanggung Jawab

### Sales

Tugas utama:

- Membuat Sales Order.
- Mengisi customer, detail pekerjaan, container, harga, dan dokumen referensi.
- Melihat status order dan status pembayaran secara read-only.
- Follow up customer jika invoice/outstanding belum lunas.

Sales tidak boleh:

- Mengubah invoice status.
- Mencatat payment.
- Mengubah status lunas.
- Mengubah potongan komisi.
- Mengubah data operational setelah ritasi berjalan tanpa flow yang benar.

### Operational

Tugas utama:

- Melihat order/container job yang harus dikerjakan.
- Assign sopir dan truck.
- Update status ritasi.
- Mencatat status inap jika terjadi.
- Upload/isi data lapangan yang diperlukan.
- Complete ritasi jika pekerjaan selesai.
- Mengajukan komisi sopir ke Finance.

Operational tidak perlu:

- Mengatur invoice.
- Mengatur debit note.
- Mengatur payment.
- Mengatur nominal biaya inap.
- Mengatur potongan hutang sopir.

### Finance

Tugas utama:

- Mengecek order completed sebelum invoice.
- Mengatur status dokumen invoice.
- Menambahkan manual revenue seperti biaya inap.
- Mengelola debit note dan reimbursement.
- Mencatat payment invoice dan debit note.
- Void payment jika ada salah input.
- Review RPUJ/UJ.
- Review, approve, bayar, dan memberi potongan komisi sopir.

Finance tidak boleh:

- Mengubah fakta ritasi lapangan tanpa flow koreksi.
- Mengubah komisi asli diam-diam.
- Menandai lunas secara manual tanpa payment.

### Admin

Tugas utama:

- Mengelola master data dan user.
- Melakukan admin correction untuk data yang sudah terkunci.
- Memastikan audit log dan data historis tetap rapi.

Admin correction bukan jalur harian. Dipakai hanya untuk koreksi data terkunci.

## Flow 1 - Master Data

Tujuan:

Master data dipakai sebagai referensi awal, bukan sumber kebenaran untuk transaksi lama.

Data master utama:

- Customer.
- Destination.
- Driver.
- Truck.
- UJ destination.
- Komisi default.
- Rekening/e-money driver.

SOP:

1. Admin membuat atau memperbarui master data.
2. User memakai master data saat membuat transaksi baru.
3. Saat transaksi dibuat, sistem menyimpan snapshot nilai penting.
4. Perubahan master berikutnya hanya berlaku untuk transaksi baru.

Contoh:

- Hari ini UJ Cikarang Rp500.000.
- Job A dibuat hari ini dan menyimpan snapshot Rp500.000.
- Besok master UJ Cikarang diubah menjadi Rp600.000.
- Job A tetap Rp500.000.
- Job baru setelah perubahan memakai Rp600.000.

Risiko yang harus dicegah:

- Order lama berubah karena master customer diedit.
- UJ lama berubah karena master destination diubah.
- Rekening komisi lama berubah karena driver mengganti rekening.

## Flow 2 - Sales Order

Tujuan:

Sales Order menjadi awal transaksi yang rapi untuk Operational dan Finance.

SOP:

1. Sales membuat Sales Order.
2. Pilih customer dari master.
3. Isi detail pekerjaan, destination, container, harga, line item, dan dokumen referensi.
4. Sistem menyimpan snapshot customer, destination, harga, line item, dan total.
5. Container Job otomatis muncul untuk Operational.
6. Sales dapat memantau status order dan outstanding.

Aturan penting:

- Sales Order lama tidak boleh ikut berubah jika master customer berubah.
- Harga dan line item lama tidak boleh ikut berubah karena master berubah.
- Jika order sudah diproses Operational, perubahan harus dibatasi.
- Jika order sudah completed/invoice/payment, koreksi harus lewat flow koreksi.

Output yang harus terlihat:

- Nomor SO.
- Customer snapshot.
- Destination snapshot.
- Harga/line item.
- Status order.
- Status invoice read-only.
- Outstanding read-only.

## Flow 3 - Operational Ritasi

Tujuan:

Operational bisa bekerja cepat tanpa dibebani urusan Finance.

SOP:

1. Operational membuka daftar Container Job.
2. Pilih job yang akan diproses.
3. Assign sopir dan truck.
4. Update status ritasi sesuai kondisi lapangan.
5. Isi dokumen/catatan lapangan jika diperlukan.
6. Jika terjadi inap, ubah status menjadi inap dan isi catatan.
7. Jika pekerjaan selesai, ubah status menjadi completed.

Status umum:

- received: job baru diterima.
- running: job sedang berjalan.
- inap: job sedang inap/menunggu.
- completed: job selesai.
- cancelled: job dibatalkan.

Aturan penting:

- Tidak boleh completed jika sopir/truck wajib belum lengkap.
- Completed dan cancelled terkunci dari edit biasa.
- Jika sudah RPUJ/komisi/payment, perubahan biasa harus ditolak.
- Koreksi setelah terkunci harus lewat admin correction.

## Flow 4 - Assignment Sopir dan Truck

Tujuan:

Pergantian sopir/truck di lapangan bisa dicatat tanpa merusak master dan histori.

SOP:

1. Saat job pertama kali diproses, Operational pilih sopir dan truck.
2. Sistem menyimpan assignment snapshot.
3. Jika sopir/truck diganti sebelum job jalan, Operational boleh ubah.
4. Jika job sudah running/inap/dst, alasan perubahan wajib diisi.
5. Sistem menyimpan riwayat perubahan assignment.

Riwayat assignment harus mencatat:

- Sopir lama.
- Sopir baru.
- Truck lama.
- Truck baru.
- Alasan perubahan.
- Catatan.
- User yang mengubah.
- Waktu perubahan.
- Jenis perubahan: Operational atau Koreksi Admin.

Aturan penting:

- Mengubah sopir/truck di ritasi tidak mengubah master.
- Jika sopir dipilih manual, perubahan truck tidak boleh diam-diam mengganti sopir.
- Completed/cancelled terkunci kecuali admin correction.

Contoh jawaban ke sopir:

"Di ritasi ini sopir diganti karena unit awal bermasalah. Perubahan tercatat oleh Operational pada tanggal dan jam tersebut."

## Flow 5 - Inap

Tujuan:

Operational mencatat fakta inap, Finance menentukan apakah inap ditagihkan.

SOP Operational:

1. Jika ritasi mengalami inap, ubah status job menjadi inap.
2. Isi alasan dan catatan inap.
3. Jangan isi nominal biaya inap.
4. Setelah pekerjaan lanjut dan selesai, ubah status menjadi completed.

SOP Finance:

1. Finance membuka order completed.
2. Finance melihat indikator/catatan bahwa ritasi pernah inap.
3. Jika inap ditagihkan ke customer, Finance menambahkan manual revenue line.
4. Biaya inap masuk invoice/revenue.
5. Biaya inap tidak masuk debit note.

Aturan penting:

- Inap adalah fakta operational.
- Nominal inap adalah tanggung jawab Finance.
- Manual revenue harus menyimpan qty, harga, total, deskripsi, dan catatan.
- Jika invoice sudah lunas, perubahan nominal harus lewat koreksi/void yang benar.

## Flow 6 - Invoice dan Payment

Tujuan:

Finance mengelola invoice sampai lunas dengan outstanding yang akurat.

SOP:

1. Operational menyelesaikan ritasi.
2. Finance membuka order completed.
3. Finance cek komponen tagihan:
   - jasa angkut/order revenue;
   - manual revenue seperti inap;
   - biaya yang masuk debit note;
   - internal cost seperti UJ/RPUJ dan komisi.
4. Finance menerbitkan/mengirim invoice.
5. Finance mencatat payment dengan bukti.
6. Sistem menghitung outstanding.
7. Jika outstanding menjadi 0, sistem otomatis menandai lunas.

Aturan penting:

- Sales hanya melihat invoice/outstanding read-only.
- Lunas tidak boleh dipilih dari dropdown.
- Payment wajib bukti.
- Overpayment harus ditolak.
- Payment void tidak dihitung dalam outstanding.
- Jika payment lunas di-void, status harus kembali menjadi menunggu pembayaran.

Status invoice yang disarankan:

- belum_invoice.
- invoice_diproses.
- invoice_dikirim.
- menunggu_pembayaran.
- partial_paid.
- lunas.

Catatan:

Status lunas tetap otomatis dari payment, bukan status manual.

## Flow 7 - Debit Note

Tujuan:

Debit note dipakai untuk reimbursement/tagihan pengganti, bukan revenue utama.

Masuk invoice/revenue:

- Jasa angkut.
- Biaya inap yang ditagihkan.
- Waiting charge.
- Extra trip.
- Storage/manual revenue lain.

Masuk debit note/reimbursement:

- Bon muat/bongkar yang diganti customer.
- TILA/gatepass jika sifatnya reimbursement.
- Biaya pihak ketiga yang ditagihkan kembali.
- Biaya lapangan yang bukan revenue jasa.

SOP:

1. Finance review biaya yang muncul dari operational.
2. Tentukan biaya masuk invoice atau debit note.
3. Buat/isi debit note jika biaya adalah reimbursement.
4. Catat payment debit note dengan bukti.
5. Void payment debit note jika salah input.

Aturan penting:

- Debit note harus terpisah dari invoice revenue.
- Payment debit note tidak boleh membuat invoice utama lunas.
- Void debit note payment harus membuka outstanding debit note kembali.

## Flow 8 - RPUJ dan UJ

Tujuan:

UJ historis aman dan tidak berubah saat master destination diubah.

SOP:

1. Saat job dibuat/diproses, sistem menyimpan snapshot UJ.
2. Finance/RPUJ membaca UJ dari snapshot.
3. Master destination hanya menjadi fallback untuk job lama yang belum punya snapshot.
4. Jika source masih master_current, data harus ditandai perlu review.
5. Koreksi UJ historis hanya melalui admin correction dengan alasan.

Aturan penting:

- UJ lama tidak boleh berubah karena master UJ diubah.
- Job baru boleh memakai UJ master terbaru.
- Koreksi UJ harus tercatat di audit log.

Label yang harus dipahami:

- Snapshot: nilai aman, sudah dibekukan di transaksi.
- Perlu Review: data lama masih memakai fallback master dan perlu dicek.

## Flow 9 - Komisi Sopir

Tujuan:

Komisi sopir diajukan Operational, direview dan dibayar Finance, dengan potongan yang transparan.

SOP Operational:

1. Operational membuka Report Komisi Sopir.
2. Cek komisi per sopir dan per job.
3. Ajukan batch komisi periode Kamis-Rabu.
4. Setelah diajukan, perubahan pembayaran dilanjutkan Finance.
5. Operational dapat melihat status, potongan, net dibayar, dan catatan Finance secara read-only.

SOP Finance:

1. Finance membuka Pembayaran Komisi Sopir.
2. Review batch yang diajukan Operational.
3. Jika sesuai, approve batch.
4. Jika ada kesalahan besar, reject batch dengan catatan.
5. Jika ada hutang/kasbon/penalti, tambah Potongan Finance per sopir.
6. Upload bukti transfer sesuai Net Dibayar.
7. Jika salah payment, void payment dengan alasan.

Istilah:

- Komisi Bruto: total komisi asli dari job.
- Potongan Finance: potongan hutang/kasbon/penalti/lainnya.
- Net Dibayar: komisi bruto dikurangi potongan.

Contoh:

- Komisi Bruto: Rp500.000.
- Potongan Finance: Rp100.000.
- Net Dibayar: Rp400.000.
- Alasan: Potongan kasbon sopir.

Aturan penting:

- Nominal komisi asli tidak boleh diubah diam-diam.
- Potongan dicatat terpisah.
- Potongan wajib alasan minimal jelas.
- Potongan tidak boleh melebihi komisi bruto.
- Setelah payment paid, potongan tidak boleh diubah kecuali payment di-void/koreksi.
- Operational tidak boleh mengubah potongan.

Contoh jawaban Operational ke sopir:

"Komisi bruto periode ini Rp500.000. Ada potongan Finance Rp100.000 karena kasbon/hutang aktif. Net yang ditransfer Rp400.000. Detail hutang bisa dikonfirmasi ke Finance."

## Flow 10 - Correction dan Void

Tujuan:

Human error bisa diperbaiki tanpa merusak audit trail.

Gunakan edit normal jika:

- Data belum berjalan.
- Belum completed.
- Belum approved.
- Belum paid.
- Belum lunas.

Gunakan void jika:

- Payment salah input.
- Bukti transfer salah.
- Deduction/potongan salah sebelum paid.
- Data pembayaran perlu dibatalkan dari perhitungan.

Gunakan admin correction jika:

- Job sudah completed/cancelled.
- RPUJ sudah approved/paid.
- Assignment historis perlu dikoreksi.
- UJ historis perlu dikoreksi.
- Data terkunci perlu diperbaiki karena human error.

Setiap correction/void wajib mencatat:

- alasan;
- user;
- waktu;
- data sebelum;
- data sesudah;
- dampak ke status/outstanding/payment.

SOP jika salah input:

1. Jangan hapus data permanen.
2. Tentukan jenis salah input.
3. Jika payment salah, lakukan void payment lalu input ulang.
4. Jika nominal invoice/payment mempengaruhi lunas, pastikan outstanding berubah otomatis.
5. Jika data operational terkunci, gunakan admin correction.
6. Pastikan audit log terbentuk.

## Flow 11 - Dashboard Monitoring Harian

Tujuan:

Masalah data cepat terlihat tanpa mengganggu kerja harian.

Operational perlu cek:

- Job belum punya sopir.
- Job belum punya truck.
- Job running terlalu lama.
- Job inap yang belum selesai.
- Job completed yang belum masuk proses Finance.
- Assignment yang berubah dan butuh review.

Finance perlu cek:

- Order completed belum invoice.
- Invoice dikirim tapi belum dibayar.
- Invoice jatuh tempo.
- Outstanding customer.
- Payment yang baru diinput.
- Debit note outstanding.
- UJ yang perlu review.
- Komisi diajukan belum diapprove.
- Komisi approved belum dibayar.
- Komisi dengan potongan.

Admin perlu cek:

- Activity log.
- Admin correction.
- Data master tidak aktif/duplikat.
- User dan permission.
- Data fallback master yang perlu dibersihkan.

## SOP Harian Singkat

### Pagi

1. Operational cek job hari ini dan job running.
2. Operational pastikan sopir/truck terisi.
3. Finance cek order completed yang siap invoice.
4. Finance cek outstanding dan payment masuk.
5. Admin cek alert data bermasalah jika ada.

### Saat Operasional Berjalan

1. Operational update status ritasi sesuai lapangan.
2. Jika sopir/truck berubah saat job sudah jalan, isi alasan.
3. Jika terjadi inap, catat status inap dan alasannya.
4. Jangan input nominal Finance di Operational.

### Sore/Akhir Hari

1. Operational complete job yang sudah selesai.
2. Finance review job completed.
3. Finance update invoice/debit note/payment.
4. Cek outstanding dan status yang belum selesai.
5. Catat issue yang perlu correction.

### Mingguan

1. Operational cek Report Komisi Sopir periode Kamis-Rabu.
2. Operational ajukan batch komisi.
3. Finance review/approve/reject.
4. Finance input potongan jika ada hutang/kasbon.
5. Finance bayar komisi net dan upload bukti.
6. Operational dapat melihat alasan potongan jika sopir bertanya.

## Checklist Siap Pakai 90 Persen

Sistem dianggap siap dipakai operational jika checklist ini aman:

- Sales bisa membuat order dan container job.
- Operational bisa assign sopir/truck.
- Operational bisa update ritasi sampai completed.
- Pergantian sopir/truck tercatat history.
- Status inap bisa dicatat tanpa nominal.
- Finance bisa menambahkan biaya inap ke invoice.
- Finance bisa menerbitkan/mengirim invoice.
- Payment invoice mengurangi outstanding.
- Lunas otomatis saat outstanding 0.
- Void payment membuka outstanding kembali.
- Debit note terpisah dari invoice.
- UJ memakai snapshot.
- Komisi sopir bisa diajukan Operational.
- Finance bisa approve/pay komisi.
- Potongan komisi bisa dicatat dengan alasan.
- Operational bisa melihat alasan potongan read-only.
- Completed/cancelled/paid/lunas terkunci dari edit bebas.
- Admin correction tersedia untuk human error.
- Activity log mencatat perubahan penting.

## Larangan Penting

- Jangan hard delete transaksi.
- Jangan ubah status lunas manual.
- Jangan ubah komisi asli untuk mencatat hutang.
- Jangan masukkan inap ke debit note jika sifatnya revenue.
- Jangan koreksi data paid/lunas tanpa void/correction.
- Jangan ubah master untuk memperbaiki transaksi lama.
- Jangan biarkan perubahan penting tanpa alasan.

## Prioritas Jika Ada Masalah Saat Go-Live

1. Pastikan job operational tetap bisa berjalan.
2. Jangan paksa Finance finalisasi jika data belum jelas.
3. Pakai status/catatan untuk menandai issue.
4. Jika salah payment, void lalu input ulang.
5. Jika salah data terkunci, pakai admin correction.
6. Jika ragu invoice/debit note, tahan dulu finalisasi dan review Finance.
7. Jangan hapus transaksi yang sudah tercatat.

## Ringkasan Flow Besar

Sales membuat order.

Operational menjalankan ritasi.

Operational mencatat fakta lapangan, termasuk sopir, truck, status, dan inap.

Finance mengecek order completed, menyusun invoice/debit note, dan mencatat payment.

Sistem otomatis menghitung outstanding dan lunas.

Operational mengajukan komisi.

Finance review komisi, memberi potongan jika ada hutang, lalu membayar net.

Admin hanya masuk jika ada koreksi data terkunci.

Dengan alur ini, sistem tetap ringan untuk Operational, tetapi pencatatan tetap aman untuk audit Finance.
