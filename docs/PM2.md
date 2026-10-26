# Dokumentasi PM2 Production

Dokumen ini mencatat konfigurasi PM2 yang dipakai untuk menjalankan backend Armada di production lokal.

## Proses Aktif

Saat ini PM2 menjalankan satu proses:

```text
name: armada-backend
mode: fork
instances: 1
watch: false
status normal: online
```

Frontend tidak dijalankan sebagai proses PM2 terpisah. Frontend dibuild dengan Vite ke folder `fe-truck-management-system/dist`, lalu disajikan oleh Nginx/static hosting.

## File Konfigurasi

File PM2 berada di:

```text
be-truck-management-system/ecosystem.config.cjs
```

Isi konfigurasi utama:

```js
module.exports = {
  apps: [
    {
      name: 'armada-backend',
      cwd: __dirname,
      script: 'src/server.js',
      interpreter: 'node',
      exec_mode: 'fork',
      instances: 1,
      watch: false,
      autorestart: true,
      max_memory_restart: '512M',
      time: true,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
```

## Arti Setting Penting

```text
name
```

Nama proses di PM2. Digunakan saat restart, stop, logs, dan status.

```text
cwd
```

Working directory proses. Saat ini mengarah ke folder backend karena `ecosystem.config.cjs` berada di `be-truck-management-system`.

```text
script
```

Entry point backend: `src/server.js`.

```text
exec_mode: fork
instances: 1
```

Backend dijalankan sebagai satu proses Node biasa, bukan cluster.

```text
watch: false
```

PM2 tidak otomatis restart saat file berubah. Ini aman untuk production.

```text
autorestart: true
```

Jika backend crash, PM2 mencoba menyalakan ulang otomatis.

```text
max_memory_restart: 512M
```

Jika memory proses melewati 512 MB, PM2 restart proses.

```text
time: true
```

Log PM2 diberi timestamp.

```text
NODE_ENV=production
```

Backend berjalan dalam mode production.

## Perintah Harian

Cek status proses:

```powershell
pm2.cmd list
```

Cek detail proses:

```powershell
pm2.cmd describe armada-backend
```

Cek log backend:

```powershell
pm2.cmd logs armada-backend --lines 80 --nostream
```

Restart backend:

```powershell
pm2.cmd restart armada-backend
```

Restart dengan environment terbaru jika `.env` berubah:

```powershell
pm2.cmd restart armada-backend --update-env
```

Start dari ecosystem config:

```powershell
cd D:\ARMADA_SYSTEM\Repo\RepoTruckArchiveFEBE\be-truck-management-system
pm2.cmd start ecosystem.config.cjs
```

Simpan daftar proses PM2 agar ikut hidup setelah reboot:

```powershell
pm2.cmd save
```

## Urutan Deploy Umum

Catatan 2026-10-27: pemeriksaan 19 Oktober menemukan backend production berjalan dari folder rilis (`D:\ARMADA_SYSTEM\apps\backend\<rilis>`), bukan dari path repo di bawah. Untuk release `release/atms-20261027` dan sesudahnya, gunakan `deploy/scripts/deploy-release.ps1` (preflight, backup, folder rilis baru, rollback) sesuai `docs/DEPLOY_RELEASE_20261027.md`. Langkah di bawah adalah riwayat cara lama.

Backend berubah:

```powershell
cd D:\ARMADA_SYSTEM\Repo\RepoTruckArchiveFEBE\be-truck-management-system
npm run db:migrate
pm2.cmd restart armada-backend
```

Frontend berubah:

```powershell
cd D:\ARMADA_SYSTEM\Repo\RepoTruckArchiveFEBE\fe-truck-management-system
npm run build
```

Backend dan frontend berubah:

```powershell
cd D:\ARMADA_SYSTEM\Repo\RepoTruckArchiveFEBE\be-truck-management-system
npm run db:migrate
pm2.cmd restart armada-backend

cd D:\ARMADA_SYSTEM\Repo\RepoTruckArchiveFEBE\fe-truck-management-system
npm run build
```

Jika Nginx mengambil file static langsung dari `dist`, restart PM2 tidak diperlukan untuk perubahan frontend saja.

## Health Check

Setelah restart backend, cek endpoint:

```powershell
Invoke-WebRequest -UseBasicParsing -Uri http://127.0.0.1:3000/health | Select-Object -ExpandProperty Content
```

Respons normal:

```json
{
  "data": {
    "status": "ok",
    "service": "be-truck-management-system",
    "database": {
      "configured": true,
      "status": "ok"
    }
  },
  "message": "Success"
}
```

## Lokasi Log

PM2 menyimpan log di profile user:

```text
C:\Users\user\.pm2\logs\armada-backend-out-0.log
C:\Users\user\.pm2\logs\armada-backend-error-0.log
```

Gunakan `pm2.cmd logs` untuk membaca log tanpa membuka file manual.

## Catatan Aman

- Jangan jalankan `pm2 delete` kecuali memang ingin menghapus proses dari PM2.
- Jangan gunakan `watch: true` di production.
- Jika hanya frontend yang berubah, cukup `npm run build`; backend PM2 tidak wajib restart.
- Jika migration atau backend berubah, jalankan migration dahulu, lalu restart `armada-backend`.
- Jika `.env` berubah, restart dengan `--update-env`.
