param(
  [ValidateSet("Complete", "Storage")]
  [string]$Mode = "Complete",
  [string]$StorageDir = "",
  [string]$OutputRoot = "",
  [string]$DatabaseUrl = "",
  [string]$PgDumpPath = "",
  [int]$KeepSuccessful = 7,
  [int]$GraceSeconds = 5,
  [switch]$Plan
)

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $ProjectDir ".env"
$monthNames = @(
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
)

function Get-DotEnvValue([string]$Name) {
  if (-not (Test-Path -LiteralPath $EnvFile)) { return "" }
  $line = Get-Content -LiteralPath $EnvFile |
    Where-Object { $_ -match "^\s*$([regex]::Escape($Name))\s*=" } |
    Select-Object -Last 1
  if (-not $line) { return "" }
  return (($line -split "=", 2)[1]).Trim().Trim('"').Trim("'")
}

function Assert-SeparatePath([string]$ActiveStorage, [string]$TargetRoot) {
  $storagePath = [System.IO.Path]::GetFullPath($ActiveStorage).TrimEnd('\')
  $targetPath = [System.IO.Path]::GetFullPath($TargetRoot).TrimEnd('\')
  if (
    $targetPath.Equals($storagePath, [System.StringComparison]::OrdinalIgnoreCase) -or
    $targetPath.StartsWith("$storagePath\", [System.StringComparison]::OrdinalIgnoreCase) -or
    $storagePath.StartsWith("$targetPath\", [System.StringComparison]::OrdinalIgnoreCase)
  ) {
    throw "OutputRoot and active storage must not be inside one another."
  }
}

if ([string]::IsNullOrWhiteSpace($StorageDir)) {
  $StorageDir = if ($env:UPLOAD_DIR) { $env:UPLOAD_DIR } else { Get-DotEnvValue "UPLOAD_DIR" }
}
if ([string]::IsNullOrWhiteSpace($StorageDir) -or -not (Test-Path -LiteralPath $StorageDir)) {
  throw "Active storage was not found. Set UPLOAD_DIR or pass -StorageDir."
}
$StorageDir = (Resolve-Path -LiteralPath $StorageDir).Path.TrimEnd('\')

if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
  $OutputRoot = Join-Path (Split-Path -Parent $StorageDir) "compressed-data"
}
$OutputRoot = [System.IO.Path]::GetFullPath($OutputRoot).TrimEnd('\')
Assert-SeparatePath $StorageDir $OutputRoot

$startedAt = Get-Date
$yearFolder = $startedAt.ToString("yyyy")
$monthFolder = "{0} - {1}" -f $startedAt.ToString("MM"), $monthNames[$startedAt.Month - 1]
$periodFolder = Join-Path (Join-Path $OutputRoot $yearFolder) $monthFolder
$packageId = "COMPRESS-{0}-{1}" -f $Mode.ToUpperInvariant(), $startedAt.ToString("yyyyMMdd-HHmmss")
$packageFolder = Join-Path $periodFolder $packageId

$planPayload = [ordered]@{
  mode = $Mode
  storageRoot = $StorageDir
  outputRoot = $OutputRoot
  packageFolder = $packageFolder
  destructive = $false
  activeDatabasePathsChanged = $false
  temporaryFolderExcluded = $true
  usesBackupLock = $Mode -eq "Complete"
  notes = @(
    "Command ini membuat paket kompresi baru dan tidak menghapus file aktif.",
    "Mode Complete memakai backup-local.ps1 sehingga database dump, storage.zip, manifest, checksum, dan lock mutasi ikut digunakan.",
    "Mode Storage hanya membuat storage.zip dan manifest sederhana; gunakan Complete untuk paket produksi."
  )
}

if ($Plan) {
  $planPayload | ConvertTo-Json -Depth 4
  exit 0
}

New-Item -ItemType Directory -Force -Path $periodFolder | Out-Null

if ($Mode -eq "Complete") {
  & (Join-Path $PSScriptRoot "backup-local.ps1") `
    -StorageDir $StorageDir `
    -BackupRoot $OutputRoot `
    -DatabaseUrl $DatabaseUrl `
    -PgDumpPath $PgDumpPath `
    -KeepSuccessful $KeepSuccessful `
    -GraceSeconds $GraceSeconds
  exit $LASTEXITCODE
}

$stagingFolder = Join-Path $periodFolder ".in-progress-$packageId"
$failedFolder = Join-Path $periodFolder ".failed-$packageId"
$finalFolder = $packageFolder
$storageFile = Join-Path $stagingFolder "storage.zip"
$manifestFile = Join-Path $stagingFolder "manifest.json"

try {
  New-Item -ItemType Directory -Path $stagingFolder | Out-Null
  & (Join-Path $PSScriptRoot "backup-storage.ps1") `
    -StorageDir $StorageDir `
    -OutputFile $storageFile | Out-Null

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [System.IO.Compression.ZipFile]::OpenRead($storageFile)
  try {
    $entryCount = $zip.Entries.Count
    $uncompressedBytes = ($zip.Entries | Measure-Object Length -Sum).Sum
    $temporaryEntryCount = @(
      $zip.Entries | Where-Object { $_.FullName -match '^File Sementara[/\\]' }
    ).Count
  } finally {
    $zip.Dispose()
  }

  if ($entryCount -le 0) { throw "Storage archive does not contain files." }
  if ($temporaryEntryCount -gt 0) { throw "Storage archive unexpectedly contains File Sementara." }

  $storageInfo = Get-Item -LiteralPath $storageFile
  $manifest = [ordered]@{
    schemaVersion = 1
    packageId = $packageId
    mode = "Storage"
    status = "verified"
    destructive = $false
    storageRoot = $StorageDir
    createdAt = (Get-Date).ToString("o")
    files = [ordered]@{
      storage = [ordered]@{
        name = "storage.zip"
        sizeBytes = $storageInfo.Length
        sha256 = (Get-FileHash -LiteralPath $storageFile -Algorithm SHA256).Hash
        entryCount = $entryCount
        uncompressedBytes = $uncompressedBytes
        temporaryFolderExcluded = $true
      }
    }
  }
  $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestFile -Encoding UTF8

  Move-Item -LiteralPath $stagingFolder -Destination $finalFolder
  [ordered]@{
    status = "verified"
    packageId = $packageId
    packageFolder = $finalFolder
    storageBytes = $storageInfo.Length
    storageEntries = $entryCount
  } | ConvertTo-Json -Depth 4
} catch {
  if (Test-Path -LiteralPath $stagingFolder) {
    Set-Content -LiteralPath (Join-Path $stagingFolder "compress-error.txt") -Value $_.Exception.Message -Encoding UTF8
    if (-not (Test-Path -LiteralPath $failedFolder)) {
      Move-Item -LiteralPath $stagingFolder -Destination $failedFolder
    }
  }
  throw
}
