# Deploy release `release/atms-20261027`

Release ini menggabungkan `sync-production-development` (`4feadff`) dengan Location Performance destinations dan perbaikan Sales Order, Container Job, Titip → Ambil Titip, komisi sopir, Biaya Titip (Reimbursement/Debit Note), dan pemilihan sopir. Ringkasan perubahan dan aturan: `docs/CURRENT_STATUS.md`, `docs/BUSINESS_RULES.md`.

- Satu SHA untuk backend dan frontend (monorepo). Ambil SHA lengkap dengan `git ls-remote https://github.com/ivansimangunsong17/RepoTruckArchiveFEBE.git release/atms-20261027`.
- **Tidak ada migration baru** sejak baseline production `aebb256`. Preflight tetap memeriksa `schema_migrations` dan berhenti bila ada migration tertunda.
- Baseline production terakhir yang tercatat (19 Okt 2026): backend `aebb256` dari folder rilis `operational-date-final-ritasi-20261010-aebb256b`; versi frontend belum terverifikasi. Preflight membaca versi yang benar-benar berjalan.

## Sebelum hari deploy (wajib)

1. **Keputusan Finance (GO-LIVE gate):**
   - Biaya Titip Rp300.000 untuk SO yang Debit Note-nya **sudah terbit** sebelum container dititip: sistem tidak mengubah Debit Note dan mencatat baris `batal` berstatus cek **Perlu Klarifikasi** (Rekonsiliasi Biaya / panel Rekening Dropping Finance). Prosedur manual yang disarankan: Finance memfilter "Perlu Klarifikasi", memutuskan (tagih lewat dokumen susulan di luar sistem atau tidak ditagih), menulis keputusan di catatan Finance, lalu menandai "Sudah Dicek".
   - Container yang **sudah berstatus Titip saat deploy**: tidak mendapat Biaya Titip otomatis, dan setelah deploy Ambil Titip tidak lagi membuat Revenue Repo. Daftar persisnya muncul di laporan preflight (`storedWithoutStorageFee`). Finance memutuskan untuk tiap container: catat reimbursement Rp300.000 manual atau tidak ditagih.
2. **Konfirmasi scope:** release membawa tampilan Container Job read-only untuk Finance (`a5e5a31`, sudah ada di branch kerja sejak 16 Okt tetapi belum pernah di-deploy).
3. Siapkan file env build frontend production (mis. `D:\ARMADA_SYSTEM\deploy\env\frontend.env.production`) dengan `VITE_API_BASE_URL` alamat production. Jangan memakai `.env` development.
4. Pastikan folder yang disajikan Nginx/static hosting diketahui (lihat `root` di konfigurasi Nginx). Script tidak menebak lokasi ini.

## Langkah di server production

Jalankan PowerShell sebagai user yang memiliki proses PM2. Ganti `<SHA>` dengan SHA lengkap release dan `<NGINX_ROOT>` dengan folder frontend yang disajikan.

```powershell
cd D:\ARMADA_SYSTEM\deploy\scripts
# Ambil script dari release (sekali):
git clone --branch release/atms-20261027 https://github.com/ivansimangunsong17/RepoTruckArchiveFEBE.git D:\ARMADA_SYSTEM\deploy\release-atms-20261027
Copy-Item D:\ARMADA_SYSTEM\deploy\release-atms-20261027\deploy\scripts\deploy-release.ps1 .

# 1. Preflight (tidak mengubah layanan, database, atau frontend aktif)
.\deploy-release.ps1 -Phase Preflight -ReleaseRef release/atms-20261027 -ExpectedSha <SHA> `
  -FrontendServeDir <NGINX_ROOT> -FrontendEnvFile D:\ARMADA_SYSTEM\deploy\env\frontend.env.production

# 2. Baca laporan preflight (D:\ARMADA_SYSTEM\logs\deploy\preflight-report-*.json) dan selesaikan keputusan Finance.

# 3. Deploy (setiap langkah meminta ketik YA)
.\deploy-release.ps1 -Phase Deploy -ReleaseRef release/atms-20261027 -ExpectedSha <SHA> `
  -FrontendServeDir <NGINX_ROOT> -FrontendEnvFile D:\ARMADA_SYSTEM\deploy\env\frontend.env.production `
  -FrontendUrl http://<alamat-production>
```

Yang dilakukan tahap Deploy, berurutan:

1. Preflight ulang. Berhenti bila: PM2 `armada-backend` tidak online, health/DB gagal, worktree backend aktif kotor, SHA GitHub tidak cocok, ruang disk < 3 GB, env frontend masih localhost, atau ada migration tertunda (tanpa `-AllowMigrations`).
2. Backup ke `D:\ARMADA_SYSTEM\backups\release-<waktu>\`: `pg_dump` (format custom), salinan folder frontend aktif, `.env` dan `ecosystem.config.cjs` backend aktif. Folder `storage` tidak diubah oleh release ini; pastikan backup storage harian berjalan.
3. Folder release baru `D:\ARMADA_SYSTEM\apps\backend\atms-<tanggal>-<sha8>` (clone release, `npm ci --omit=dev`), `.env` dan `ecosystem.config.cjs` disalin dari backend aktif, `RELEASE.json` ditulis.
4. Build frontend dengan env production; `release.json` (SHA) ditulis di `dist`.
5. PM2 dipindah ke folder release baru (`pm2 delete` + `pm2 start ecosystem.config.cjs`). Bila health gagal dalam 90 detik, PM2 otomatis kembali ke folder lama dan deploy berhenti sebelum frontend diubah.
6. Frontend dipublikasikan ke `<NGINX_ROOT>` (mirror), `pm2 save`.

Backend dan frontend berasal dari satu clone pada SHA yang sama. Folder backend lama tidak dihapus.

## Verifikasi setelah deploy

- `Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000/health` → `status ok`, `database ok`.
- `http://<alamat-production>/release.json` dan `D:\ARMADA_SYSTEM\apps\backend\atms-*\be-truck-management-system\RELEASE.json` menunjukkan `<SHA>` yang sama.
- Login per role: admin, sales, operational, finance, pengamat.
- Sales Order: buat SO, daftar SO, pembatalan SO yang berisi container batal.
- Container Job: jalan → Inap → lanjut (waktu mulai tidak hilang); ganti truck mengikuti sopir default; pilih sopir manual tidak ditimpa.
- Assignment Armada / Master Truck & Sopir: ubah sopir default, cek Daftar Truck dan Sopir.
- Titip → Ambil Titip: titip (toast normal, item "Biaya Titip/Repo" Rp300.000 di biaya job), Ambil Titip sopir lain (UJ Repo atas nama sopir pickup), riwayat "Ambil Titip: A > B", selesai dengan EIR + EIR Titip.
- Nomor container: memakai container yang masih dititip di job lain harus ditolak.
- Finance: detail invoice (invoice utama tanpa Biaya Titip; Debit Note berisi Biaya Titip), Rekonsiliasi Biaya "Perlu Klarifikasi".
- Komisi: laporan komisi periode titip atas nama sopir A dengan plat A; panel "Ritasi Perlu Cek" dan tombol "Koreksi penerima" (Admin).
- `pm2.cmd logs armada-backend --lines 80 --nostream` tanpa error baru.

## Rollback

```powershell
.\deploy-release.ps1 -Phase Rollback -StateFile D:\ARMADA_SYSTEM\backups\release-<waktu>\deploy-state.json
```

- Mengembalikan PM2 ke folder backend sebelumnya dan frontend dari backup. Database tidak disentuh.
- Release ini tidak menjalankan migration, sehingga kode lama tetap cocok dengan skema. Data yang dibuat setelah deploy (mis. baris Biaya Titip, koreksi penerima komisi) tetap ada setelah rollback; kode lama mengabaikannya, tetapi Biaya Titip yang sudah tercatat tetap ikut nominal Debit Note.
- Bila suatu saat deploy menjalankan migration (`-AllowMigrations`), rollback kode tidak mengembalikan skema. Pemulihan penuh: hentikan backend, `pg_restore --clean --if-exists --no-owner --dbname=<DATABASE_URL> database.dump` dari folder backup (menghapus data sejak backup), lalu rollback kode.
