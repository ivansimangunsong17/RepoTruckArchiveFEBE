# Catatan Fitur Customer OTS / Outstanding

## 1. Latar Belakang

Saat ini sistem trucking sudah memiliki data Customer, Sales Order, Invoice, metode/payment term customer, serta status pembayaran customer.

Saya ingin menambahkan fitur **Customer OTS / Outstanding** untuk membantu Finance dan Management mengetahui jumlah tagihan trucking customer yang masih belum dibayar.

Fitur ini harus memanfaatkan data transaksi yang sudah ada di sistem dan sebisa mungkin tidak membuat proses input baru yang sebenarnya tidak diperlukan.

Fokus utama tahap awal adalah:

**Outstanding dari Invoice Biaya Trucking saja.**

Untuk sementara jangan mencampurkan:

* Debit Note
* reimbursement
* biaya operasional tambahan
* claim
* Credit Note
* Credit Limit
* blocking Sales Order

Fitur-fitur tersebut dapat dikembangkan setelah OTS Invoice Trucking sudah stabil.

---

# 2. Tujuan Fitur

Fitur Customer OTS dibuat agar sistem dapat:

1. Mengetahui total tagihan trucking setiap customer yang belum dibayar.
2. Mengetahui invoice mana saja yang masih outstanding.
3. Mengetahui berapa nilai yang sudah dibayar customer.
4. Mengetahui sisa tagihan per invoice.
5. Mendukung pembayaran sebagian / partial payment.
6. Mengetahui invoice yang masih dalam tempo.
7. Mengetahui invoice yang sudah overdue.
8. Mengetahui umur piutang / aging.
9. Mempermudah Finance melakukan monitoring piutang.
10. Memberikan informasi kondisi pembayaran customer kepada Sales.
11. Mengurangi kebutuhan rekap OTS manual di Excel.
12. Menjadi dasar untuk fitur Credit Control di kemudian hari.

---

# 3. Prinsip Utama

## OTS tidak dihitung dari Sales Order

Sales Order bukan merupakan piutang.

Sales Order hanya merupakan order yang dibuat oleh Sales.

Piutang baru dianggap terbentuk ketika:

**Invoice Trucking resmi diterbitkan.**

Flow utamanya:

**Sales Order
→ Job Trucking
→ Job Selesai
→ Invoice diterbitkan
→ Piutang terbentuk
→ Customer melakukan pembayaran
→ Outstanding berkurang
→ Lunas**

---

# 4. Sumber Data Utama

Sumber utama Customer OTS adalah:

**Invoice Trucking + Payment Customer**

Jangan membuat angka OTS yang diinput manual oleh user.

OTS harus merupakan hasil kalkulasi sistem.

Rumus utama:

**Outstanding Invoice = Invoice Amount - Total Payment**

Sedangkan:

**Customer OTS = Total seluruh Remaining Outstanding Invoice customer tersebut**

Contoh:

PT ABC mempunyai:

Invoice A = Rp20 juta
Sudah dibayar = Rp10 juta
OTS = Rp10 juta

Invoice B = Rp30 juta
Sudah dibayar = Rp0
OTS = Rp30 juta

Invoice C = Rp15 juta
Sudah dibayar = Rp15 juta
OTS = Rp0

Maka:

**Total OTS PT ABC = Rp40 juta**

Invoice C tidak lagi menambah OTS karena sudah lunas.

---

# 5. Flow Bisnis Lengkap

## STEP 1 — Sales Membuat Sales Order

Sales membuat Sales Order seperti flow existing.

Sales memilih:

* Customer
* shipment/order
* rute
* quantity
* harga
* metode pembayaran / payment term jika memang sudah tersedia
* data lainnya sesuai flow existing

Pada tahap ini:

**belum ada OTS baru.**

Sales Order belum dianggap piutang.

---

# 6. STEP 2 — Operational Menjalankan Order

Sales Order kemudian diproses oleh Operational.

Operational melakukan proses seperti existing:

* assign truck
* assign driver
* container job
* UJ
* perjalanan
* dokumen
* status job
* penyelesaian pekerjaan

Fitur OTS tidak perlu mengubah proses operational.

OTS hanya perlu mengetahui bahwa pekerjaan/order tersebut nantinya dapat menjadi dasar pembuatan invoice.

---

# 7. STEP 3 — Finance Membuat Invoice Trucking

Setelah pekerjaan trucking sudah dapat ditagihkan, Finance membuat atau mencatat Invoice.

Invoice minimal harus mempunyai informasi:

* Customer
* Invoice Number
* Invoice Date
* Invoice Amount
* Sales Order terkait jika tersedia
* Payment Term
* Due Date
* Payment Status

Setelah invoice resmi diterbitkan:

**Invoice tersebut mulai menjadi piutang customer.**

Contoh:

Invoice:

INV-001
Customer: PT ABC
Nilai: Rp25.000.000

Belum ada pembayaran.

Maka:

Paid = Rp0

Outstanding = Rp25.000.000

Status:

**Unpaid**

---

# 8. STEP 4 — Invoice Masuk Customer Outstanding

Ketika invoice aktif dan belum lunas, invoice masuk ke perhitungan Customer OTS.

Contoh:

PT ABC mempunyai:

INV-001 = Rp25 juta

Maka:

**Customer OTS PT ABC = Rp25 juta**

Jika kemudian Finance menerbitkan:

INV-002 = Rp15 juta

Maka:

**Customer OTS PT ABC = Rp40 juta**

Sistem harus menghitung ini otomatis.

Finance tidak perlu mengetik:

"OTS PT ABC = Rp40 juta."

---

# 9. STEP 5 — Customer Melakukan Pembayaran

Ketika customer melakukan pembayaran, Finance mencatat pembayaran tersebut.

Idealnya pembayaran mempunyai informasi seperti:

* Invoice
* Customer
* Payment Date
* Payment Amount
* Reference / nomor bukti pembayaran jika tersedia
* bukti pembayaran jika memang diperlukan

Pembayaran akan mengurangi Outstanding Invoice.

---

# 10. Status Pembayaran

Status pembayaran jangan hanya:

**Sudah Bayar / Belum Bayar**

Karena ada kemungkinan customer membayar sebagian.

Gunakan konsep:

### Unpaid

Belum ada pembayaran.

Contoh:

Invoice = Rp20 juta
Paid = Rp0
Outstanding = Rp20 juta

Status:

**Unpaid**

---

### Partially Paid

Customer sudah membayar sebagian.

Contoh:

Invoice = Rp20 juta
Paid = Rp8 juta

Outstanding:

Rp20 juta - Rp8 juta = Rp12 juta

Status:

**Partially Paid**

---

### Paid

Customer sudah membayar seluruh invoice.

Invoice = Rp20 juta
Paid = Rp20 juta

Outstanding:

Rp0

Status:

**Paid**

Invoice tersebut tidak lagi masuk ke Customer OTS.

---

# 11. Multiple Payment

Sistem harus mempertimbangkan kemungkinan satu invoice dibayar beberapa kali.

Contoh:

Invoice:

Rp30 juta

Payment 1:

Rp10 juta

Outstanding:

Rp20 juta

Kemudian:

Payment 2:

Rp5 juta

Outstanding:

Rp15 juta

Kemudian:

Payment 3:

Rp15 juta

Outstanding:

Rp0

Status:

**Paid**

Karena itu desain sistem jangan hanya berasumsi:

**1 Invoice = 1 Payment**

Satu invoice dapat mempunyai beberapa payment.

---

# 12. Payment Term

Customer dapat mempunyai term pembayaran.

Contoh:

* Cash
* COD
* TOP 7
* TOP 14
* TOP 30
* TOP 45
* TOP 60

Payment Term digunakan untuk menentukan kapan invoice jatuh tempo.

---

# 13. Due Date

Contoh:

Invoice Date:

1 Agustus 2026

Payment Term:

TOP 30

Maka:

Due Date:

31 Agustus 2026

Sistem harus mengetahui Due Date setiap invoice.

Due Date sebaiknya dapat menjadi snapshot pada invoice agar jika Payment Term Customer berubah di kemudian hari, invoice lama tidak ikut berubah.

Contoh:

Saat Invoice A dibuat:

Customer TOP 30.

Bulan berikutnya kontrak customer berubah menjadi TOP 45.

Invoice lama tetap mempunyai Due Date berdasarkan TOP 30 saat invoice dibuat.

Invoice baru dapat menggunakan TOP 45.

---

# 14. Current / Belum Jatuh Tempo

Jika invoice masih mempunyai Outstanding tetapi belum melewati Due Date:

Status aging:

**Current / Not Due**

Contoh:

Invoice:

Rp20 juta

Due Date:

31 Agustus

Hari ini:

20 Agustus

Outstanding:

Rp20 juta

Maka invoice masih:

**Current**

Bukan overdue.

---

# 15. Overdue

Jika Due Date sudah lewat dan invoice masih mempunyai Outstanding:

Invoice menjadi:

**Overdue**

Contoh:

Due Date:

31 Juli

Hari ini:

20 Agustus

Outstanding:

Rp10 juta

Maka invoice overdue.

Yang dihitung sebagai overdue adalah:

**remaining outstanding**

Bukan nilai awal invoice.

---

# 16. Aging

Invoice overdue kemudian dikelompokkan berdasarkan umur overdue.

Kategori awal:

* Current / Not Due
* Overdue 1–30 hari
* Overdue 31–60 hari
* Overdue 61–90 hari
* Overdue >90 hari

Contoh:

PT ABC:

Current = Rp40 juta

Overdue 1–30 = Rp20 juta

Overdue 31–60 = Rp10 juta

Overdue >90 = Rp5 juta

Maka:

Total OTS:

Rp75 juta

Total Overdue:

Rp35 juta

---

# 17. Oldest Overdue

Sistem juga sebaiknya mengetahui invoice outstanding tertua.

Contoh:

PT ABC:

Total OTS:

Rp75 juta

Total Overdue:

Rp35 juta

Oldest Overdue:

63 hari

Informasi ini berguna untuk Finance dan Sales karena dapat menggambarkan kondisi pembayaran customer dengan cepat.

---

# 18. Navigasi Finance

Setelah fondasi OTS berjalan, buat halaman khusus:

**Finance → Customer Outstanding**

Tidak perlu membuat menu utama baru bernama OTS apabila halaman tersebut dapat ditempatkan secara clean di Finance.

---

# 19. Customer Outstanding Dashboard

Halaman utama Customer Outstanding berfungsi sebagai pusat monitoring piutang trucking.

Bagian atas dapat mempunyai summary seperti:

* Total Outstanding
* Total Current
* Total Overdue
* Total Customer Outstanding
* Total Invoice Outstanding

Jangan membuat terlalu banyak card jika tidak diperlukan.

UI harus tetap:

* clean
* compact
* profesional
* mudah dibaca
* tidak terlalu ramai

---

# 20. Tabel Customer Outstanding

Tabel utama dapat mempunyai informasi:

| Customer | Total OTS | Current | Overdue | Invoice Outstanding | Oldest Overdue |
| -------- | --------: | ------: | ------: | ------------------: | -------------: |
| PT ABC   |   Rp75 jt | Rp40 jt | Rp35 jt |                   4 |        63 hari |
| PT XYZ   |   Rp20 jt | Rp20 jt |     Rp0 |                   1 |              - |

Customer tanpa outstanding tidak perlu memenuhi tabel utama jika memang tidak relevan.

Tetapi sistem tetap harus dapat dicari berdasarkan customer.

---

# 21. Detail Customer

Ketika customer diklik, user dapat melihat invoice yang membentuk OTS tersebut.

Contoh:

PT ABC

Total OTS:

Rp75 juta

Kemudian detail:

| Invoice | Invoice Date | Due Date | Invoice Amount |  Paid | Outstanding | Status  |
| ------- | ------------ | -------- | -------------: | ----: | ----------: | ------- |
| INV-001 | 01/06        | 01/07    |          20 jt | 10 jt |       10 jt | Overdue |
| INV-002 | 01/07        | 31/07    |          25 jt |     0 |       25 jt | Overdue |
| INV-003 | 10/08        | 09/09    |          40 jt |     0 |       40 jt | Current |

Total:

Rp75 juta.

---

# 22. Flow Payment Finance

Finance harus menjadi role utama yang mengelola pembayaran.

Flow sederhana:

Finance membuka Invoice

↓

Klik:

**Record Payment / Catat Pembayaran**

↓

Input:

Payment Date
Payment Amount
Reference

↓

Sistem validasi

↓

Payment tersimpan

↓

Outstanding Invoice otomatis dihitung ulang

↓

Customer OTS otomatis berubah

Finance tidak boleh menginput nilai OTS secara manual.

---

# 23. Sales Visibility

Setelah Customer OTS stabil, informasi tersebut dapat digunakan Sales.

Ketika Sales membuat Sales Order:

Sales memilih Customer.

↓

Sistem mengambil informasi OTS customer.

↓

Tampilkan ringkasan kecil.

Contoh:

**PT ABC**

Total OTS: Rp75 juta
Current: Rp40 juta
Overdue: Rp35 juta
Oldest Overdue: 63 hari
Outstanding Invoice: 4

Informasi ini hanya untuk visibility.

Pada tahap awal:

**jangan block Sales Order.**

Sales tetap dapat membuat SO.

---

# 24. Permission

## Finance

Finance dapat:

* melihat seluruh OTS
* melihat detail invoice
* mencatat pembayaran
* melihat payment history
* melihat overdue
* melihat aging

Finance merupakan owner dari data pembayaran.

---

## Sales

Sales dapat:

* melihat summary OTS customer
* melihat kondisi Current/Overdue
* melihat warning pembayaran customer

Sales tidak boleh:

* mengubah payment
* mengubah status Paid
* mengubah Outstanding
* mengubah Due Date Finance
* menghapus payment

---

## Operational

Operational pada dasarnya tidak perlu terlibat dalam fitur OTS.

Operational tetap menjalankan proses trucking seperti existing.

---

## Admin / Management

Dapat diberikan read access sesuai permission system existing.

---

# 25. Invoice Cancel / Void

Invoice yang sudah:

**Cancelled / Void**

tidak boleh masuk ke perhitungan OTS.

Contoh:

Invoice Rp20 juta

Status:

VOID

Maka:

Invoice tersebut tidak menjadi Customer OTS.

Tetapi histori invoice sebaiknya tetap ada untuk audit.

---

# 26. Overpayment

Sistem harus mempertimbangkan kondisi:

Invoice:

Rp20 juta

Payment:

Rp22 juta

Jangan langsung membiarkan:

Outstanding = -Rp2 juta

Sistem harus mempunyai validasi.

Untuk tahap awal paling sederhana:

Payment tidak boleh melebihi remaining outstanding invoice.

Handling advance payment/customer credit dapat dibuat sebagai fitur terpisah jika memang dibutuhkan.

---

# 27. Data Lama

Sistem existing kemungkinan sudah mempunyai invoice yang:

* sudah dibayar
* belum dibayar
* tidak mempunyai payment history
* hanya mempunyai status bayar boolean
* tidak mempunyai Due Date

Agent harus melakukan audit sebelum melakukan migration.

Jangan menganggap semua invoice lama dapat langsung dikonversi sempurna.

Jika data tidak cukup, tandai sebagai legacy/incomplete daripada membuat data pembayaran palsu.

---

# 28. Jangan Double Counting

Customer OTS harus mempunyai satu sumber perhitungan yang jelas.

Contoh:

Invoice Rp20 juta.

Jangan sampai sistem menghitung:

Invoice Amount Rp20 juta

*

Outstanding field Rp20 juta

sehingga menjadi:

Rp40 juta.

Outstanding adalah hasil dari:

**Invoice - Payment**

Pastikan aggregation tidak melakukan duplicate join terhadap payment.

---

# 29. Reimbursement dan Debit Note

Pada pengembangan awal:

**JANGAN masukkan reimbursement atau Debit Note ke Trucking OTS.**

Contoh:

PT ABC

Invoice Trucking Outstanding:

Rp100 juta

Reimbursement:

Rp20 juta

Trucking OTS harus tetap:

Rp100 juta

Bukan:

Rp120 juta.

---

# 30. Future Total Customer Receivable

Setelah fitur Trucking OTS stabil, sistem dapat dikembangkan menjadi:

### Trucking OTS

Rp100 juta

### Other Receivable

Rp20 juta

### Total Customer Receivable

Rp120 juta

Dengan begitu angka tetap dapat dibedakan.

---

# 31. Future Credit Control

Customer OTS nantinya dapat menjadi dasar fitur Credit Control.

Contoh:

Customer:

PT ABC

Credit Limit:

Rp500 juta

Current OTS:

Rp300 juta

Order Baru:

Rp100 juta

Potential Exposure:

Rp400 juta

Remaining Limit:

Rp100 juta

Tetapi fitur ini **belum perlu dibuat sekarang**.

---

# 32. Future Warning

Nantinya sistem dapat memberikan warning seperti:

Normal:

Tidak ada overdue.

Warning:

Customer mempunyai overdue.

Critical:

Customer mempunyai overdue lama.

Tetapi threshold seperti 30/60/90 hari atau batas nominal jangan ditentukan sembarangan.

Harus berdasarkan business rule perusahaan.

---

# 33. Prinsip Arsitektur

Agent harus mempertahankan prinsip berikut:

1. Jangan menghitung OTS dari Sales Order.
2. Invoice adalah sumber piutang.
3. Payment mengurangi piutang.
4. Jangan input OTS secara manual.
5. Support partial payment.
6. Support multiple payment.
7. Cancelled/void invoice tidak masuk OTS.
8. Payment history harus tetap dapat diaudit.
9. Jangan double counting.
10. Jangan mencampurkan reimbursement ke Trucking OTS.
11. Payment Term historis invoice harus aman.
12. Finance menjadi owner payment.
13. Sales hanya mempunyai visibility.
14. Jangan melakukan over-engineering.
15. Gunakan struktur existing jika masih layak.

---

# 34. Gambaran Flow Keseluruhan

**SALES**

Create Sales Order
↓
Pilih Customer
↓
Order dikirim ke proses berikutnya

**OPERATIONAL**

Order diproses
↓
Truck/Driver/Container Job
↓
Pekerjaan selesai

**FINANCE**

Invoice Trucking diterbitkan
↓
Piutang Customer terbentuk
↓
Invoice masuk Customer OTS
↓
Customer melakukan pembayaran
↓
Finance mencatat payment
↓
Outstanding otomatis berkurang

**SYSTEM**

Hitung:

Invoice - Payment
↓
Outstanding Invoice
↓
Total Outstanding Customer
↓
Due Date
↓
Current / Overdue
↓
Aging
↓
Customer Outstanding Dashboard

**SALES**

Saat membuat order berikutnya
↓
Pilih Customer
↓
Sistem tampilkan ringkasan OTS
↓
Sales mengetahui kondisi pembayaran customer
↓
Order tetap dapat dibuat pada tahap awal.

---

# 35. Scope Pengembangan Awal

Pengembangan sebaiknya dilakukan bertahap:

### Phase 1

Foundation Invoice + Payment + Outstanding.

### Phase 2

Finance → Customer Outstanding Dashboard.

### Phase 3

Due Date + Overdue + Aging.

### Phase 4

OTS Visibility pada Sales Order.

### Phase 5

Evaluasi Debit Note, Reimbursement, dan Total Customer Receivable.

Setiap phase harus:

**Audit existing → Buat Planning → Review → Approval → Baru Implementasi.**

Agent tidak boleh langsung melakukan refactor besar atau mengubah arsitektur sebelum memahami struktur existing.

---

# 36. Expected Result

Jika fitur sudah selesai, sistem minimal harus bisa menjawab pertanyaan berikut dengan cepat:

**"Berapa OTS PT ABC sekarang?"**

**"OTS tersebut berasal dari invoice apa saja?"**

**"Berapa yang sudah dibayar?"**

**"Berapa sisanya?"**

**"Berapa yang belum jatuh tempo?"**

**"Berapa yang sudah overdue?"**

**"Invoice paling lama belum dibayar sudah berapa hari?"**

**"Apakah customer ini masih mempunyai tunggakan ketika Sales menerima order baru?"**

Jawaban tersebut harus berasal dari transaksi yang tercatat di sistem, bukan dari angka yang diketik manual.
