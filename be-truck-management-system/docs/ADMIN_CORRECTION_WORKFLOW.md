# Admin Correction Workflow

Dokumen ini menjelaskan flow koreksi admin untuk memperbaiki human error pada data operasional tanpa membuka lock untuk semua perubahan secara diam-diam.

## Tujuan

Mode koreksi admin dipakai ketika data Container Job sudah melewati batas edit normal, tetapi perlu diperbaiki karena salah input atau kebutuhan rekonsiliasi. Contoh:

- Salah tanggal mulai atau tanggal selesai.
- Salah assign truck atau sopir pada job yang sudah selesai.
- Salah nomor container setelah job berjalan.
- Salah catatan biaya lainnya setelah RPUJ terkunci.
- Salah flag atau nominal komisi sopir setelah RPUJ disetujui/dibayar.

## Flow Penggunaan

1. Admin buka halaman Operational lalu pilih Container Job.
2. Admin klik Update Proses.
3. Admin aktifkan Mode koreksi admin.
4. Admin isi Alasan koreksi.
5. Field yang sebelumnya terkunci akan terbuka sesuai kebutuhan koreksi.
6. Admin simpan perubahan.
7. Sistem mencatat audit log khusus ADMIN_CORRECTION_CONTAINER_JOB.

## Kontrak Backend

Payload koreksi wajib membawa:

```json
{
  "adminCorrectionMode": true,
  "adminCorrectionReason": "Koreksi salah input tanggal selesai"
}
```

Aturan validasi:

- Hanya role admin yang boleh menggunakan adminCorrectionMode.
- adminCorrectionReason wajib diisi minimal 8 karakter.
- Admin tanpa adminCorrectionMode tetap mengikuti lock operational.
- Role non-admin yang mengirim adminCorrectionMode akan ditolak.

## Audit Log

Setiap koreksi admin mencatat:

- action: ADMIN_CORRECTION_CONTAINER_JOB
- alasan koreksi
- salesOrderId
- soNumber
- containerNumber
- changedFields
- beforeData dan afterData untuk field penting yang berubah

Field yang diaudit:

- Status
- No. Container
- Truck
- Sopir
- Waktu Mulai
- Waktu Selesai
- Status RPUJ
- Biaya Lainnya
- Komisi Sopir
- Nominal Komisi
- No. EIR
- Bon Muat/Bongkar
- TILA/Gatepass
- Surat Jalan

## Catatan Operasional

Mode ini bukan jalur kerja harian. Operational tetap mengikuti lock normal. Admin memakai mode ini hanya untuk memperbaiki data yang sudah terlanjur terkunci, dan alasan koreksi harus cukup jelas agar bisa diaudit kembali.
