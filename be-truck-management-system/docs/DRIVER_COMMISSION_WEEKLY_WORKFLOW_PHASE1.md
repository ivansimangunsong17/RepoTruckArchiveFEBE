# Driver Commission Weekly Workflow - Phase 1

Dokumen ini adalah hasil audit dan desain awal untuk flow komisi sopir mingguan. Phase 1 tidak mengubah database runtime, API, atau UI. Tujuannya adalah mengunci aturan data sebelum masuk migration dan implementasi.

## Ringkasan Keputusan

- Komisi sopir tetap dicatat oleh Operational di container job saat update pekerjaan.
- Komisi tidak masuk total pengajuan UJ/RPUJ.
- Pembayaran komisi dibuat sebagai proses terpisah mingguan.
- Periode komisi adalah Kamis sampai Rabu berdasarkan tanggal selesai job.
- Operational mengecek dan mengajukan komisi pada hari Kamis.
- Finance mengecek, menyetujui, dan mencatat transfer pada hari Jumat.
- Data pembayaran harus disimpan sebagai snapshot agar nilai komisi tidak berubah ketika master tujuan atau data job diedit setelah pengajuan.

## Audit Struktur Saat Ini

### Master Tujuan

Tabel `destination_locations` sudah memiliki:

- `driver_commission_amount`

Field ini menjadi nilai default komisi berdasarkan tujuan. Nilainya boleh `0`, artinya tujuan tersebut tidak punya komisi default.

### Container Job

Tabel `container_jobs` sudah memiliki:

- `has_driver_commission`
- `driver_commission_amount`
- `driver_commission_source_destination_id`
- `driver_commission_note`

Field ini adalah snapshot keputusan Operational untuk satu container job. Checkbox komisi di Operational mengisi flag dan amount, tetapi tidak boleh menambah nilai pengajuan UJ.

### Finance

Finance saat ini dapat melihat nilai komisi sebagai informasi, tetapi total RPUJ tetap hanya:

- UJ sopir
- biaya tambahan

Komisi tidak ikut dalam total request RPUJ.

### Report Sopir

Report sopir sudah bisa membaca `has_driver_commission` dan `driver_commission_amount`. Filter awal berdasarkan status komisi dan periode Kamis-Rabu sudah tersedia untuk analisis, tetapi belum menjadi bukti proses pembayaran.

## Masalah Yang Belum Terselesaikan

Saat ini belum ada struktur untuk:

- daftar komisi mingguan yang diajukan Operational,
- status pengajuan komisi,
- validasi agar job yang sama tidak dibayar dua kali,
- total komisi per sopir untuk kebutuhan transfer Finance,
- bukti/catatan pembayaran Finance,
- riwayat approve, reject, dan paid.

Karena itu, laporan dapat menghitung komisi, tetapi belum bisa menjadi ledger pembayaran.

## Sumber Tanggal Perhitungan

Sumber tanggal utama adalah:

- `container_jobs.completed_at` dalam timezone Asia/Jakarta.

Alasannya:

- komisi baru layak dibayar setelah pekerjaan benar-benar selesai,
- tanggal selesai adalah momen operasional yang paling dekat dengan hak komisi,
- menghindari order yang sudah dibuat tetapi belum selesai ikut tertarik ke pembayaran.

Jika ada data lama yang statusnya selesai tetapi `completed_at` kosong, data tersebut tidak otomatis eligible. Pada implementasi berikutnya bisa disediakan panel "butuh perbaikan data" agar Admin/Operational melengkapi tanggal selesai lebih dulu.

## Periode Mingguan

Periode dihitung sebagai:

- mulai: Kamis 00:00:00 WIB
- selesai: Rabu 23:59:59 WIB

Contoh:

- periode `2026-08-06` sampai `2026-08-12`
- Operational submit pada Kamis `2026-08-13`
- Finance cek/transfer pada Jumat `2026-08-14`

Di database sebaiknya disimpan sebagai `date`:

- `period_start`
- `period_end`

## Aturan Eligible Komisi

Satu container job eligible masuk pengajuan komisi jika:

- `container_jobs.status = 'completed'`
- `container_jobs.completed_at` tidak kosong
- tanggal selesai WIB berada dalam periode Kamis-Rabu
- `has_driver_commission = true`
- `driver_commission_amount > 0`
- driver tersedia, minimal dari `driver_id` atau snapshot assignment
- sales order tidak berstatus batal
- job belum pernah masuk item komisi aktif yang belum dibatalkan

Job tidak eligible jika:

- belum selesai,
- selesai tetapi tanggal selesai kosong,
- tidak dicentang komisi,
- amount komisi `0`,
- driver kosong,
- sales order batal,
- sudah masuk batch aktif/sebelumnya.

## Struktur Data Yang Disarankan

Flow pembayaran sebaiknya memakai tiga tabel, bukan hanya satu tabel besar. Ini membuat Operational mudah mengecek detail job, sementara Finance mudah transfer per sopir.

### `driver_commission_batches`

Mewakili satu pengajuan mingguan.

Kolom utama:

- `id`
- `period_start`
- `period_end`
- `status`
- `submitted_by_user_id`
- `submitted_by_name`
- `submitted_at`
- `reviewed_by_user_id`
- `reviewed_by_name`
- `reviewed_at`
- `rejection_note`
- `created_at`
- `updated_at`

Status yang disarankan:

- `draft`
- `submitted`
- `approved`
- `rejected`
- `paid`

Index yang disarankan:

- unique active period untuk mencegah dua batch aktif di periode yang sama.
- partial unique hanya untuk status `draft`, `submitted`, `approved`, dan `paid`.
- batch `rejected` tidak mengunci periode agar Operational bisa submit ulang.

### `driver_commission_payments`

Mewakili total pembayaran per sopir dalam satu batch.

Kolom utama:

- `id`
- `batch_id`
- `driver_id`
- `driver_name`
- `payment_method`
- `bank_name`
- `bank_account_number`
- `bank_account_holder`
- `emoney_provider`
- `emoney_number`
- `emoney_account_holder`
- `total_items`
- `total_amount`
- `status`
- `paid_by_user_id`
- `paid_by_name`
- `paid_at`
- `payment_proof_attachment_id`
- `payment_note`
- `created_at`
- `updated_at`

Status yang disarankan:

- `pending`
- `paid`

Tabel ini membuat Finance bisa melihat daftar transfer per sopir, bukan hanya total besar satu batch.

### `driver_commission_items`

Mewakili detail job/container yang membentuk komisi.

Kolom utama:

- `id`
- `batch_id`
- `payment_id`
- `container_job_id`
- `sales_order_id`
- `so_number`
- `accurate_so_number`
- `container_number`
- `container_size`
- `customer_name`
- `destination`
- `completed_date`
- `completed_at`
- `driver_id`
- `driver_name`
- `amount`
- `source_destination_id`
- `commission_note`
- `voided_at`
- `voided_reason`
- `created_at`
- `updated_at`

Semua informasi penting disimpan sebagai snapshot. Jika nama driver, rekening, tujuan, atau nilai master berubah setelah batch diajukan, isi batch lama tetap konsisten.

Index yang disarankan:

- `container_job_id` unique ketika `voided_at is null`
- `batch_id`
- `payment_id`
- `driver_id`
- `completed_date`

Jika batch direject dan boleh diajukan ulang, item pada batch lama harus dibuat void dengan mengisi `voided_at`. Dengan begitu job yang sama bisa masuk batch baru tanpa risiko double payment aktif.

## Flow Operasional

1. Operational membuka menu komisi sopir.
2. Sistem menampilkan periode berjalan atau periode yang baru selesai.
3. Operational melihat daftar job eligible.
4. Sistem menampilkan warning untuk data bermasalah, misalnya tanggal selesai kosong atau driver kosong.
5. Operational submit pengajuan komisi.
6. Sistem membuat batch, payment per sopir, dan item detail.
7. Setelah submitted, daftar item terkunci.

Operational tidak perlu membuat pengajuan per job satu-satu. Mereka cukup cek satu periode, pastikan data benar, lalu submit.

## Flow Finance

1. Finance membuka daftar batch komisi.
2. Finance memilih batch status `submitted`.
3. Finance melihat total per sopir dan detail job pembentuknya.
4. Finance approve atau reject.
5. Jika reject, Operational bisa memperbaiki data dan submit ulang.
6. Jika approve, Finance mencatat pembayaran Jumat.
7. Payment bisa dicatat per sopir dengan bukti transfer dan catatan.
8. Jika semua payment dalam batch paid, batch menjadi `paid`.

## Permission Yang Disarankan

Operational:

- melihat eligible commission period,
- submit batch,
- melihat status batch miliknya.

Finance:

- melihat semua batch submitted/approved/paid,
- approve/reject batch,
- mencatat payment,
- upload bukti pembayaran.

Admin:

- semua akses,
- koreksi data jika ada data lama/tanggal selesai bermasalah.

Reports:

- membaca batch, payment, dan item untuk laporan.

## Report Dan Filter

Report komisi sopir perlu mendukung filter:

- periode Kamis-Rabu,
- status batch,
- status payment,
- sopir,
- tanggal selesai,
- paid/unpaid,
- sumber data realtime/data lama jika dibutuhkan.

Angka report pembayaran sebaiknya mengambil data dari `driver_commission_items` setelah batch dibuat, bukan menghitung ulang langsung dari `container_jobs`. Perhitungan langsung dari `container_jobs` tetap berguna untuk preview eligible sebelum submit.

## Acceptance Criteria Phase 1

- Struktur existing sudah diaudit.
- Sumber tanggal perhitungan sudah ditetapkan.
- Aturan eligible dan exclusion sudah jelas.
- Struktur batch/payment/item sudah disusun.
- Flow Operational dan Finance sudah dipisah dari RPUJ.
- Belum ada perubahan schema runtime atau API.

## Catatan Untuk Phase 2

Phase 2 sebaiknya membuat migration untuk tiga tabel:

- `driver_commission_batches`
- `driver_commission_payments`
- `driver_commission_items`

Migration juga perlu menambahkan constraint, index, dan mekanisme void item ketika batch rejected agar tidak terjadi double payment.
