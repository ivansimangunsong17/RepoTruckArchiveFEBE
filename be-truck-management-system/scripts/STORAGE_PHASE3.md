# Migrasi Storage Phase 3

Phase ini menyalin file lama dari `uploads` ke struktur storage baru, memverifikasi
checksum SHA-256, lalu memperbarui path relatif di database.

## Menjalankan

Simulasi tanpa perubahan:

```powershell
npm run storage:migrate:phase3
```

Migrasi ke target tertentu:

```powershell
node scripts/migrate-storage-phase3.js --apply --target "D:\Armada Ivan\ARMADA_SYSTEM\storage"
```

## Pengamanan

- File sumber tidak dihapus atau dipindahkan.
- Database baru diperbarui setelah seluruh file valid selesai disalin dan diverifikasi.
- File tanpa referensi database masuk ke `File Karantina/File tanpa referensi database`.
- Referensi database yang file fisiknya sudah hilang dicatat sebagai `missing` dan tidak diubah.
- Manifest lengkap tersedia di `File Karantina/Migration Logs/phase3-latest.json`.
- Perintah dapat dijalankan ulang; file dengan checksum yang sama tidak digandakan.

Setelah migrasi berhasil, arahkan `UPLOAD_DIR` di `.env` ke target storage yang sama
dan mulai ulang backend.
