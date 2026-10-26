<#
Deploy release ATMS ke server production Windows (PM2 backend + frontend statis).

Tahap:
  -Phase Preflight  (default) Tidak mengubah layanan, database, atau frontend yang sedang disajikan.
                    Memeriksa alat, proses PM2, versi yang berjalan, health/DB, lokasi frontend,
                    SHA release di GitHub, lalu menyiapkan folder release baru (clone + npm ci) dan
                    menjalankan laporan read-only (migration tertunda + data Titip).
  -Phase Deploy     Menjalankan Preflight lagi, lalu setiap langkah mutasi meminta konfirmasi "YA":
                    backup DB + frontend + config, build frontend, pindah PM2 ke folder release baru,
                    publikasi frontend, verifikasi. Gagal health check -> backend otomatis kembali.
  -Phase Rollback   Mengembalikan PM2 ke folder backend sebelumnya dan frontend dari backup, memakai
                    file state dari Deploy. Database TIDAK dikembalikan otomatis.

Contoh:
  .\deploy-release.ps1 -Phase Preflight -ReleaseRef release/atms-20261027 -ExpectedSha <sha40> `
      -FrontendServeDir <folder root Nginx> -FrontendEnvFile D:\ARMADA_SYSTEM\deploy\env\frontend.env.production
#>
param(
  [ValidateSet('Preflight', 'Deploy', 'Rollback')]
  [string]$Phase = 'Preflight',
  [string]$ReleaseRef = '',
  [string]$ExpectedSha = '',
  [string]$RepoUrl = 'https://github.com/ivansimangunsong17/RepoTruckArchiveFEBE.git',
  [string]$Root = 'D:\ARMADA_SYSTEM',
  [string]$BackendReleasesDir = '',
  [string]$FrontendServeDir = '',
  [string]$FrontendEnvFile = '',
  [string]$Pm2Name = 'armada-backend',
  [string]$HealthUrl = 'http://127.0.0.1:3000/health',
  [string]$FrontendUrl = '',
  [string]$PgDumpPath = '',
  [string]$StateFile = '',
  [switch]$AllowMigrations
)

$ErrorActionPreference = 'Stop'
if (-not $BackendReleasesDir) { $BackendReleasesDir = Join-Path $Root 'apps\backend' }
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$logDir = Join-Path $Root "logs\deploy"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir "deploy-$timestamp.log"

function Write-Step([string]$message) {
  $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $message
  Write-Host $line
  Add-Content -LiteralPath $logFile -Value $line
}
function Stop-Deploy([string]$message) {
  Write-Step "BERHENTI: $message"
  throw $message
}
function Confirm-Step([string]$message) {
  Write-Host ''
  Write-Host ">>> $message" -ForegroundColor Yellow
  $answer = Read-Host 'Ketik YA untuk lanjut (selain itu = batal)'
  if ($answer -ne 'YA') { Stop-Deploy "Dibatalkan pengguna sebelum: $message" }
}
function Invoke-Checked([string]$label, [scriptblock]$block) {
  & $block
  if ($LASTEXITCODE -ne 0) { Stop-Deploy "$label gagal (exit $LASTEXITCODE)." }
}
function Get-Health {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $HealthUrl -TimeoutSec 10
    $json = $response.Content | ConvertFrom-Json
    return [pscustomobject]@{ Ok = ($json.data.status -eq 'ok' -and $json.data.database.status -eq 'ok'); Raw = $response.Content }
  } catch {
    return [pscustomobject]@{ Ok = $false; Raw = $_.Exception.Message }
  }
}
function Wait-Health([int]$seconds = 60) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) {
    $health = Get-Health
    if ($health.Ok) { return $true }
    Start-Sleep -Seconds 3
  }
  return $false
}
function Get-Pm2Process {
  $json = & pm2.cmd jlist 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $json) { return $null }
  $list = $json | ConvertFrom-Json
  return $list | Where-Object { $_.name -eq $Pm2Name } | Select-Object -First 1
}
function Get-DotEnvValue([string]$file, [string]$name) {
  $line = Get-Content -LiteralPath $file | Where-Object { $_ -match "^\s*$([regex]::Escape($name))\s*=" } | Select-Object -Last 1
  if (-not $line) { return '' }
  return (($line -split '=', 2)[1]).Trim().Trim('"').Trim("'")
}
function Copy-Mirror([string]$source, [string]$target) {
  New-Item -ItemType Directory -Force -Path $target | Out-Null
  & robocopy.exe $source $target /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { Stop-Deploy "robocopy $source -> $target gagal (exit $LASTEXITCODE)." }
  $global:LASTEXITCODE = 0
}

function Invoke-Preflight {
  Write-Step "=== PREFLIGHT (tidak mengubah layanan/DB/frontend aktif) ==="
  if (-not $ReleaseRef -or $ExpectedSha -notmatch '^[0-9a-f]{40}$') { Stop-Deploy 'Wajib -ReleaseRef dan -ExpectedSha (40 karakter hex).' }
  if (-not $FrontendServeDir) { Stop-Deploy 'Wajib -FrontendServeDir (folder root yang disajikan Nginx/static hosting).' }
  if (-not $FrontendEnvFile -or -not (Test-Path -LiteralPath $FrontendEnvFile)) { Stop-Deploy 'Wajib -FrontendEnvFile yang ada (env build frontend production, VITE_API_BASE_URL dll).' }
  $apiBase = Get-DotEnvValue $FrontendEnvFile 'VITE_API_BASE_URL'
  if (-not $apiBase -or $apiBase -match 'localhost|127\.0\.0\.1|IP-SERVER') { Stop-Deploy "VITE_API_BASE_URL di $FrontendEnvFile belum diisi alamat production ($apiBase)." }

  foreach ($tool in 'git', 'node', 'npm', 'pm2.cmd', 'robocopy.exe') {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { Stop-Deploy "Perintah $tool tidak ditemukan." }
  }
  $nodeVersion = (& node --version).Trim()
  if ([int]($nodeVersion.TrimStart('v').Split('.')[0]) -lt 20) { Stop-Deploy "Node.js $nodeVersion; minimal v20." }
  Write-Step "Node.js $nodeVersion"
  if (-not $script:PgDumpPath) { $script:PgDumpPath = (Get-Command pg_dump.exe -ErrorAction SilentlyContinue).Source }
  if (-not $script:PgDumpPath -or -not (Test-Path -LiteralPath $script:PgDumpPath)) { Stop-Deploy 'pg_dump tidak ditemukan; isi -PgDumpPath.' }
  Write-Step "pg_dump: $script:PgDumpPath"

  $proc = Get-Pm2Process
  if (-not $proc) { Stop-Deploy "Proses PM2 '$Pm2Name' tidak ditemukan." }
  if ($proc.pm2_env.status -ne 'online') { Stop-Deploy "Proses PM2 '$Pm2Name' berstatus $($proc.pm2_env.status)." }
  $script:CurrentBackendDir = $proc.pm2_env.pm_cwd
  Write-Step "Backend aktif (PM2 cwd): $script:CurrentBackendDir"
  foreach ($file in '.env', 'ecosystem.config.cjs') {
    if (-not (Test-Path -LiteralPath (Join-Path $script:CurrentBackendDir $file))) { Stop-Deploy "$file tidak ada di folder backend aktif." }
  }
  $script:CurrentSha = ''
  $releaseJson = Join-Path $script:CurrentBackendDir 'RELEASE.json'
  if (Test-Path -LiteralPath $releaseJson) { $script:CurrentSha = (Get-Content -LiteralPath $releaseJson -Raw | ConvertFrom-Json).sha }
  if (-not $script:CurrentSha) {
    $gitSha = & git -C $script:CurrentBackendDir rev-parse HEAD 2>$null
    if ($LASTEXITCODE -eq 0) {
      $script:CurrentSha = $gitSha.Trim()
      $dirty = & git -C $script:CurrentBackendDir status --porcelain 2>$null
      if ($dirty) { Stop-Deploy "Worktree backend aktif tidak bersih (ada perubahan lokal di server). Selidiki dulu; jangan deploy di atasnya." }
    }
  }
  $global:LASTEXITCODE = 0
  if ($script:CurrentSha) { Write-Step "SHA backend aktif: $script:CurrentSha" } else { Write-Step "SHA backend aktif tidak terbaca (nama folder: $(Split-Path -Leaf $script:CurrentBackendDir)). Catat manual sebelum lanjut." }

  $health = Get-Health
  if (-not $health.Ok) { Stop-Deploy "Health check gagal sebelum deploy: $($health.Raw)" }
  Write-Step 'Health check + koneksi database: OK'

  if (-not (Test-Path -LiteralPath (Join-Path $FrontendServeDir 'index.html'))) { Stop-Deploy "index.html tidak ada di $FrontendServeDir; pastikan ini folder yang disajikan Nginx." }
  $entry = Select-String -LiteralPath (Join-Path $FrontendServeDir 'index.html') -Pattern 'assets/index-[^"]+\.js' | Select-Object -First 1
  Write-Step "Frontend aktif: $FrontendServeDir (entry: $($entry.Matches.Value))"
  $frontendRelease = Join-Path $FrontendServeDir 'release.json'
  if (Test-Path -LiteralPath $frontendRelease) { Write-Step "release.json frontend aktif: $(Get-Content -LiteralPath $frontendRelease -Raw)" }

  $remote = & git ls-remote $RepoUrl $ReleaseRef
  if ($LASTEXITCODE -ne 0 -or -not $remote) { Stop-Deploy "Ref $ReleaseRef tidak ditemukan di $RepoUrl." }
  $remoteSha = ($remote | Select-Object -First 1).Split("`t")[0]
  if ($remoteSha -ne $ExpectedSha) { Stop-Deploy "SHA $ReleaseRef di GitHub ($remoteSha) berbeda dari -ExpectedSha ($ExpectedSha)." }
  Write-Step "Release $ReleaseRef = $ExpectedSha (cocok dengan GitHub)"

  $drive = (Split-Path -Qualifier $Root).TrimEnd(':')
  $freeGb = [math]::Round((Get-PSDrive -Name $drive).Free / 1GB, 1)
  if ($freeGb -lt 3) { Stop-Deploy "Ruang disk $drive`: tersisa $freeGb GB (minimal 3 GB)." }
  Write-Step "Ruang disk $drive`: $freeGb GB"

  # Folder release baru: belum dipakai layanan apa pun sampai tahap Deploy memindahkan PM2.
  $script:ReleaseDir = Join-Path $BackendReleasesDir ("atms-{0}-{1}" -f (Get-Date -Format 'yyyyMMdd'), $ExpectedSha.Substring(0, 8))
  if (-not (Test-Path -LiteralPath $script:ReleaseDir)) {
    Write-Step "Menyiapkan folder release: $script:ReleaseDir"
    Invoke-Checked 'git clone' { & git clone --quiet --branch $ReleaseRef $RepoUrl $script:ReleaseDir }
  }
  $releaseSha = (& git -C $script:ReleaseDir rev-parse HEAD).Trim()
  if ($releaseSha -ne $ExpectedSha) { Stop-Deploy "Folder release berisi $releaseSha, bukan $ExpectedSha. Hapus folder itu secara manual lalu ulangi." }
  $dirtyRelease = & git -C $script:ReleaseDir status --porcelain --untracked-files=no
  if ($dirtyRelease) { Stop-Deploy 'Folder release punya perubahan pada file yang dilacak git.' }
  $script:NewBackendDir = Join-Path $script:ReleaseDir 'be-truck-management-system'
  $script:NewFrontendDir = Join-Path $script:ReleaseDir 'fe-truck-management-system'
  Push-Location $script:NewBackendDir
  try {
    Invoke-Checked 'npm ci backend' { & npm ci --omit=dev --no-audit --no-fund }
    Invoke-Checked 'node --check backend' { & node --check src/server.js }
    $reportFile = Join-Path $logDir "preflight-report-$timestamp.json"
    & node scripts/release-preflight-report.js --env (Join-Path $script:CurrentBackendDir '.env') | Set-Content -LiteralPath $reportFile -Encoding utf8
    if ($LASTEXITCODE -ne 0) { Stop-Deploy 'Laporan preflight (read-only) gagal.' }
  } finally {
    Pop-Location
  }
  $script:Report = (Get-Content -LiteralPath $reportFile -Raw | ConvertFrom-Json)
  Write-Step "Laporan preflight: $reportFile"
  Write-Step ("Migration tertunda: {0}" -f (($script:Report.summary.pendingMigrations) -join ', '))
  Write-Step ("Container dititip tanpa Biaya Titip (butuh keputusan Finance): {0}" -f $script:Report.summary.storedWithoutStorageFee)
  Write-Step ("Revenue Repo lama masih draft: {0} baris" -f $script:Report.summary.legacyRepoRevenueDraft.lines)
  Write-Step ("Nomor container aktif ganda (data lama): {0}" -f $script:Report.summary.activeDuplicateContainers)
  Write-Step ("Komisi Ambil Titip tercatat ke sopir pickup (akan ditahan review): {0}" -f $script:Report.summary.commissionHeldPickupDriver)
  if (@($script:Report.summary.pendingMigrations).Count -gt 0 -and -not $AllowMigrations) {
    Stop-Deploy 'Ada migration tertunda. Release ini tidak menambah migration; audit dulu, lalu ulangi dengan -AllowMigrations bila memang disetujui.'
  }
  Write-Step '=== PREFLIGHT LULUS ==='
}

function Invoke-Deploy {
  Invoke-Preflight
  $backupRoot = Join-Path $Root "backups\release-$timestamp"
  $state = [ordered]@{
    createdAt = (Get-Date).ToString('o'); releaseRef = $ReleaseRef; releaseSha = $ExpectedSha
    previousBackendDir = $script:CurrentBackendDir; previousSha = $script:CurrentSha
    newBackendDir = $script:NewBackendDir; frontendServeDir = $FrontendServeDir
    frontendBackupDir = (Join-Path $backupRoot 'frontend'); databaseDump = (Join-Path $backupRoot 'database.dump')
    configBackupDir = (Join-Path $backupRoot 'config'); migrationsApplied = $false
  }
  $stateFile = Join-Path $backupRoot 'deploy-state.json'

  Confirm-Step "Backup database (pg_dump), frontend aktif, dan config backend ke $backupRoot"
  New-Item -ItemType Directory -Force -Path $state.configBackupDir | Out-Null
  Copy-Item -LiteralPath (Join-Path $script:CurrentBackendDir '.env') -Destination $state.configBackupDir
  Copy-Item -LiteralPath (Join-Path $script:CurrentBackendDir 'ecosystem.config.cjs') -Destination $state.configBackupDir
  Copy-Mirror $FrontendServeDir $state.frontendBackupDir
  $databaseUrl = Get-DotEnvValue (Join-Path $script:CurrentBackendDir '.env') 'DATABASE_URL'
  & $script:PgDumpPath --format=custom --no-owner --file=$($state.databaseDump) --dbname=$databaseUrl
  if ($LASTEXITCODE -ne 0) { Stop-Deploy 'pg_dump gagal; deploy dihentikan sebelum perubahan apa pun.' }
  $databaseUrl = $null
  $state | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding utf8
  Write-Step "Backup selesai. State rollback: $stateFile"
  Write-Step 'Catatan: folder UPLOAD_DIR/storage tidak diubah oleh release ini; pastikan backup storage terjadwal harian sudah berjalan.'

  Confirm-Step "Siapkan backend release ($script:NewBackendDir): salin .env + ecosystem.config.cjs dari backend aktif"
  Copy-Item -LiteralPath (Join-Path $script:CurrentBackendDir '.env') -Destination $script:NewBackendDir -Force
  Copy-Item -LiteralPath (Join-Path $script:CurrentBackendDir 'ecosystem.config.cjs') -Destination $script:NewBackendDir -Force
  [ordered]@{ sha = $ExpectedSha; ref = $ReleaseRef; deployedAt = (Get-Date).ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $script:NewBackendDir 'RELEASE.json') -Encoding utf8

  if (@($script:Report.summary.pendingMigrations).Count -gt 0) {
    Confirm-Step ("Jalankan migration: {0}" -f (($script:Report.summary.pendingMigrations) -join ', '))
    Push-Location $script:NewBackendDir
    try { Invoke-Checked 'npm run db:migrate' { & npm run db:migrate } } finally { Pop-Location }
    $state.migrationsApplied = $true
    $state | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding utf8
  } else {
    Write-Step 'Tidak ada migration tertunda; database tidak diubah.'
  }

  Confirm-Step "Build frontend production di $script:NewFrontendDir (env: $FrontendEnvFile)"
  Copy-Item -LiteralPath $FrontendEnvFile -Destination (Join-Path $script:NewFrontendDir '.env.production') -Force
  Push-Location $script:NewFrontendDir
  try {
    Invoke-Checked 'npm ci frontend' { & npm ci --no-audit --no-fund }
    Invoke-Checked 'vite build' { & npm run build }
  } finally { Pop-Location }
  $newDist = Join-Path $script:NewFrontendDir 'dist'
  [ordered]@{ sha = $ExpectedSha; ref = $ReleaseRef; builtAt = (Get-Date).ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $newDist 'release.json') -Encoding utf8
  if (-not (Test-Path -LiteralPath (Join-Path $newDist 'index.html'))) { Stop-Deploy 'Build frontend tidak menghasilkan index.html.' }

  Confirm-Step "Pindahkan PM2 '$Pm2Name' ke backend release baru (downtime singkat)"
  & pm2.cmd delete $Pm2Name | Out-Null
  & pm2.cmd start (Join-Path $script:NewBackendDir 'ecosystem.config.cjs') | Out-Null
  if (-not (Wait-Health 90)) {
    Write-Step 'Health check backend baru GAGAL -> kembali ke backend sebelumnya.'
    & pm2.cmd delete $Pm2Name | Out-Null
    & pm2.cmd start (Join-Path $script:CurrentBackendDir 'ecosystem.config.cjs') | Out-Null
    if (Wait-Health 90) { Write-Step 'Backend sebelumnya kembali online.' } else { Write-Step 'PERINGATAN: backend sebelumnya juga belum sehat; periksa pm2 logs.' }
    Stop-Deploy 'Deploy backend gagal dan sudah dikembalikan. Frontend belum diubah.'
  }
  Write-Step 'Backend release baru online dan sehat.'

  Confirm-Step "Publikasikan frontend baru ke $FrontendServeDir (backup sudah ada)"
  Copy-Mirror $newDist $FrontendServeDir
  & pm2.cmd save | Out-Null

  $health = Get-Health
  Write-Step "Health akhir: $($health.Raw)"
  if ($FrontendUrl) {
    try {
      $served = Invoke-WebRequest -UseBasicParsing -Uri ($FrontendUrl.TrimEnd('/') + '/release.json') -TimeoutSec 10
      Write-Step "release.json yang disajikan: $($served.Content)"
    } catch { Write-Step "PERINGATAN: release.json tidak terbaca dari $FrontendUrl ($($_.Exception.Message))." }
  }
  Write-Step "=== DEPLOY SELESAI: $ReleaseRef @ $ExpectedSha. Lanjutkan verifikasi manual sesuai prosedur. State rollback: $stateFile ==="
}

function Invoke-Rollback {
  if (-not $StateFile -or -not (Test-Path -LiteralPath $StateFile)) { Stop-Deploy 'Wajib -StateFile (deploy-state.json dari tahap Deploy).' }
  $state = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
  Write-Step "Rollback ke backend $($state.previousBackendDir) (SHA $($state.previousSha)) dan frontend dari $($state.frontendBackupDir)"
  if ($state.migrationsApplied) {
    Write-Step "PERINGATAN: deploy ini menjalankan migration. Kode lama mungkin tidak cocok dengan skema baru; pemulihan database butuh pg_restore dari $($state.databaseDump) (manual, menghapus data sejak backup)."
  }
  Confirm-Step 'Kembalikan PM2 ke backend sebelumnya'
  & pm2.cmd delete $Pm2Name | Out-Null
  & pm2.cmd start (Join-Path $state.previousBackendDir 'ecosystem.config.cjs') | Out-Null
  if (-not (Wait-Health 90)) { Stop-Deploy 'Backend sebelumnya belum sehat; periksa pm2.cmd logs.' }
  Confirm-Step "Kembalikan frontend dari backup ke $($state.frontendServeDir)"
  Copy-Mirror $state.frontendBackupDir $state.frontendServeDir
  & pm2.cmd save | Out-Null
  Write-Step '=== ROLLBACK SELESAI (database tidak diubah) ==='
}

try {
  Write-Step "Log: $logFile"
  switch ($Phase) {
    'Preflight' { Invoke-Preflight }
    'Deploy' { Invoke-Deploy }
    'Rollback' { Invoke-Rollback }
  }
} catch {
  Write-Step "GAGAL: $($_.Exception.Message)"
  exit 1
}
