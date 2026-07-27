# Compress Data

Fitur ini membuat paket kompresi data secara non-destruktif. File aktif tidak
dihapus, path database tidak diubah, dan hasil kompresi disimpan di luar root
storage aktif.

## Strategi Aman

1. Jalankan plan terlebih dahulu.
2. Pastikan `OutputRoot` tidak berada di dalam `UPLOAD_DIR`.
3. Untuk paket produksi, gunakan mode `Complete` karena sudah memakai lock,
   database dump, `storage.zip`, manifest, dan checksum.
4. Gunakan mode `Storage` hanya untuk kebutuhan transfer storage cepat.
5. Jangan menghapus file asli setelah kompresi kecuali ada proses arsip yang
   memperbarui referensi database.

## Command

```powershell
npm run data:compress:plan
npm run data:compress
```

Mode default adalah `Complete`.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/compress-data.ps1 -Mode Complete
powershell -ExecutionPolicy Bypass -File scripts/compress-data.ps1 -Mode Storage
```

Parameter opsional:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/compress-data.ps1 `
  -Mode Complete `
  -StorageDir "\\SYNOLOGY-NAS\ATMS_STORAGE" `
  -OutputRoot "D:\ATMS_COMPRESSED_DATA" `
  -KeepSuccessful 14
```

## Output

Default output:

```text
{parent UPLOAD_DIR}\compressed-data\{tahun}\{bulan}\...
```

Mode `Complete` menghasilkan struktur dari `backup-local.ps1`:

```text
BACKUP-yyyyMMdd-HHmmss
├─ database.sql
├─ storage.zip
└─ manifest.json
```

Mode `Storage` menghasilkan:

```text
COMPRESS-STORAGE-yyyyMMdd-HHmmss
├─ storage.zip
└─ manifest.json
```

`File Sementara` selalu dikecualikan dari ZIP.
