# Storage Lifecycle Phase 4

Phase ini mengaktifkan folder pendukung dan perlindungan lifecycle file:

- upload atomic melalui `File Sementara/File yang sedang diproses`;
- file gagal tersambung ke database dipindahkan ke `File Karantina`;
- delete menjadi recycle bin di `File Terhapus`;
- restore dan purge permanen hanya dapat dilakukan role Admin;
- audit storage dan retensi dijalankan eksplisit melalui command;
- folder `Export Laporan` disiapkan per divisi.

## Command

```powershell
npm run storage:init:phase4
npm run storage:audit
npm run storage:audit:apply
npm run backup:local
npm run backup:storage
npm run backup:database
```

Gunakan `backup:local` sebagai alur utama karena database, storage, checksum, dan
manifest disimpan sebagai satu paket. Dua command backup lainnya tetap tersedia
untuk backup komponen secara manual.

`storage:audit` hanya membaca dan melaporkan. `storage:audit:apply` dapat:

- memindahkan file yatim dan temporary stale ke karantina;
- purge recycle bin yang melewati `FILE_TRASH_RETENTION_DAYS`;
- purge file revisi lama yang melewati masa retensi.

Folder sumber transaksi dan master data tidak pernah dipindahkan oleh audit jika masih
memiliki referensi database aktif.
