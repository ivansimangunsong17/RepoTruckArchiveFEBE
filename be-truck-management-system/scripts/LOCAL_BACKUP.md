# Local Backup Set

Gunakan command berikut sebagai alur backup lokal utama:

```powershell
npm run backup:local
```

Satu eksekusi menghasilkan satu folder terverifikasi:

```text
backups/local/{tahun}/{nomor bulan} - {nama bulan}/BACKUP-{timestamp}/
  database.sql
  storage.zip
  manifest.json
```

Alur yang dijalankan:

1. Membuat lock agar API tidak menerima mutasi selama snapshot.
2. Menunggu request mutasi yang sedang berjalan selesai.
3. Membuat dump PostgreSQL dan ZIP storage dalam staging `.in-progress-*`.
4. Memastikan dump memiliki completion marker dan ZIP dapat dibuka.
5. Menghitung SHA-256 kedua file dan menulis `manifest.json`.
6. Mempromosikan staging menjadi folder `BACKUP-*`.
7. Menghapus paket sukses tertua jika jumlahnya melebihi `LOCAL_BACKUP_KEEP`.
8. Membuka kembali mutasi API pada blok `finally`, termasuk ketika backup gagal.

Folder `File Sementara` tidak dimasukkan ke ZIP. Folder `.failed-*` tidak dihitung
sebagai backup sukses dan dipertahankan untuk diagnosis.

Jika proses terputus mendadak, lock dari process yang sudah tidak hidup akan
dipindahkan ke `File Karantina/Storage Audit` pada pemeriksaan berikutnya. Lock dari
komputer lain atau lock yang tidak dapat dibaca tetap diblokir agar tidak dihapus
secara gegabah.

Selama backup berlangsung, halaman baca dan download tetap dapat digunakan. Request
`POST`, `PUT`, `PATCH`, dan `DELETE` akan ditolak sementara dengan status `503`.
Jangan menjalankan migration atau script yang menulis langsung ke database selama
backup, karena lock ini bekerja pada jalur API aplikasi.

Backup lokal pada disk fisik yang sama belum melindungi dari kerusakan disk. Paket
yang sama dapat disalin ke Synology pada tahap berikutnya tanpa membuat ulang backup.
