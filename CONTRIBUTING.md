# Alur kerja branch

Repo ini memakai `sync-production-development` sebagai branch kerja bersama. `main` masih menjadi default GitHub dan berisi baseline lama; jangan memakainya sebagai dasar fitur baru sampai riwayat rilis dan development diselaraskan. Branch `release/*` dan `production/*` dapat menjadi acuan deployment, sehingga penghapusannya perlu pemeriksaan server terlebih dahulu.

## Memulai pekerjaan

```bash
git clone --branch sync-production-development https://github.com/ivansimangunsong17/RepoTruckArchiveFEBE.git
cd RepoTruckArchiveFEBE
git switch -c feature/nama-pekerjaan
```

Sebelum membuat branch fitur baru, tarik perubahan terbaru dengan `git pull --ff-only origin sync-production-development`. Buat satu branch pendek untuk satu pekerjaan, lalu push dengan `git push -u origin feature/nama-pekerjaan`. Buka Pull Request ke `sync-production-development`, minta partner meninjau perubahan, dan jalankan pemeriksaan yang relevan sebelum merge. Hapus branch fitur setelah PR selesai.

Hindari push langsung dan force push ke `main` atau `sync-production-development`. Jangan membuat branch `backup/*` baru untuk setiap perubahan. Gunakan tag bernama jelas untuk titik rilis atau arsip yang memang perlu dipertahankan.

## Rilis dan pembersihan branch

Catat tanggal deployment, hash commit, dan sumber kode backend serta frontend setiap kali merilis. Backend dijalankan melalui PM2, sedangkan frontend disajikan dari hasil build `dist`; hash checkout backend saja tidak membuktikan versi frontend yang sedang aktif. Lihat [dokumentasi PM2](docs/PM2.md).

Sebelum menghapus branch lama:

1. Periksa apakah server, script deployment, atau partner masih menggunakan branch itu.
2. Pastikan tidak ada Pull Request terbuka yang bergantung padanya.
3. Bandingkan commit branch dengan branch kerja: `git log --oneline origin/sync-production-development..origin/nama-branch`.
4. Jika ada commit yang perlu disimpan, gabungkan perubahannya atau buat tag arsip pada commit tersebut sebelum menghapus branch.

Hapus branch remote satu per satu dengan `git push origin --delete nama-branch`, lalu jalankan `git fetch --prune origin` pada clone lokal. Jangan menghapus branch hanya karena usianya lama atau namanya terdengar sementara.
