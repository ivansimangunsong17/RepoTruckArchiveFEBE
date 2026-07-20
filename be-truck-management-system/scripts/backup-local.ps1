param(
  [string]$StorageDir = "",
  [string]$BackupRoot = "",
  [string]$DatabaseUrl = "",
  [string]$PgDumpPath = "",
  [int]$KeepSuccessful = 0,
  [int]$GraceSeconds = 5
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

function Assert-PathInside([string]$Root, [string]$Candidate) {
  $rootPath = [System.IO.Path]::GetFullPath($Root).TrimEnd('\')
  $candidatePath = [System.IO.Path]::GetFullPath($Candidate)
  if (-not $candidatePath.StartsWith("$rootPath\", [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Unsafe backup path outside backup root: $candidatePath"
  }
}

function Resolve-ExistingBackupLock([string]$Path, [string]$StorageRoot) {
  $existingLock = $null
  try {
    $existingLock = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
  } catch {
    throw "Backup lock is unreadable. Inspect it manually before continuing: $Path"
  }

  $lockComputer = [string]$existingLock.computerName
  $lockProcessId = 0
  $hasValidProcessId = [int]::TryParse([string]$existingLock.processId, [ref]$lockProcessId)
  $sameComputer = -not [string]::IsNullOrWhiteSpace($lockComputer) -and
    $lockComputer.Equals($env:COMPUTERNAME, [System.StringComparison]::OrdinalIgnoreCase)
  if (-not $sameComputer -or -not $hasValidProcessId -or $lockProcessId -le 0) {
    throw "Another local backup is still marked as running: $Path"
  }

  if (Get-Process -Id $lockProcessId -ErrorAction SilentlyContinue) {
    throw "Another local backup is still running with process ID ${lockProcessId}: $Path"
  }

  $auditFolder = Join-Path $StorageRoot "File Karantina\Storage Audit"
  New-Item -ItemType Directory -Force -Path $auditFolder | Out-Null
  $archivedLock = Join-Path $auditFolder (
    "stale-backup-lock-{0}.json" -f (Get-Date -Format "yyyyMMdd-HHmmssfff")
  )
  Move-Item -LiteralPath $Path -Destination $archivedLock
  Write-Warning "A stale backup lock was archived to: $archivedLock"
}

if ([string]::IsNullOrWhiteSpace($StorageDir)) {
  $StorageDir = if ($env:UPLOAD_DIR) { $env:UPLOAD_DIR } else { Get-DotEnvValue "UPLOAD_DIR" }
}
if ([string]::IsNullOrWhiteSpace($StorageDir) -or -not (Test-Path -LiteralPath $StorageDir)) {
  throw "Active storage was not found. Set UPLOAD_DIR or pass -StorageDir."
}
$StorageDir = (Resolve-Path -LiteralPath $StorageDir).Path.TrimEnd('\')

if ([string]::IsNullOrWhiteSpace($BackupRoot)) {
  $BackupRoot = Join-Path (Split-Path -Parent $StorageDir) "backups\local"
}
$BackupRoot = [System.IO.Path]::GetFullPath($BackupRoot).TrimEnd('\')
if (
  $BackupRoot.Equals($StorageDir, [System.StringComparison]::OrdinalIgnoreCase) -or
  $BackupRoot.StartsWith("$StorageDir\", [System.StringComparison]::OrdinalIgnoreCase) -or
  $StorageDir.StartsWith("$BackupRoot\", [System.StringComparison]::OrdinalIgnoreCase)
) {
  throw "Backup root and active storage must not be inside one another."
}

if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
  $DatabaseUrl = if ($env:DATABASE_URL) { $env:DATABASE_URL } else { Get-DotEnvValue "DATABASE_URL" }
}
if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
  throw "DATABASE_URL is required for a complete local backup."
}
if ([string]::IsNullOrWhiteSpace($PgDumpPath)) {
  $PgDumpPath = if ($env:PG_DUMP_PATH) { $env:PG_DUMP_PATH } else { Get-DotEnvValue "PG_DUMP_PATH" }
}
if ($KeepSuccessful -le 0) {
  $configuredKeep = if ($env:LOCAL_BACKUP_KEEP) { $env:LOCAL_BACKUP_KEEP } else { Get-DotEnvValue "LOCAL_BACKUP_KEEP" }
  $KeepSuccessful = if ($configuredKeep) { [int]$configuredKeep } else { 7 }
}
if ($KeepSuccessful -lt 1 -or $KeepSuccessful -gt 365) {
  throw "LOCAL_BACKUP_KEEP must be between 1 and 365."
}
if ($GraceSeconds -lt 0 -or $GraceSeconds -gt 60) {
  throw "GraceSeconds must be between 0 and 60."
}

$startedAt = Get-Date
$backupId = "BACKUP-{0}" -f $startedAt.ToString("yyyyMMdd-HHmmss")
$yearFolder = $startedAt.ToString("yyyy")
$monthFolder = "{0} - {1}" -f $startedAt.ToString("MM"), $monthNames[$startedAt.Month - 1]
$periodFolder = Join-Path (Join-Path $BackupRoot $yearFolder) $monthFolder
$stagingFolder = Join-Path $periodFolder ".in-progress-$backupId"
$finalFolder = Join-Path $periodFolder $backupId
$failedFolder = Join-Path $periodFolder ".failed-$backupId"
$lockPath = Join-Path $StorageDir "File Sementara\backup-in-progress.lock"
$lockCreated = $false

New-Item -ItemType Directory -Force -Path $periodFolder | Out-Null
Assert-PathInside $BackupRoot $stagingFolder
Assert-PathInside $BackupRoot $finalFolder
Assert-PathInside $BackupRoot $failedFolder
if ((Test-Path -LiteralPath $stagingFolder) -or (Test-Path -LiteralPath $finalFolder)) {
  throw "Backup ID already exists: $backupId"
}
if (Test-Path -LiteralPath $lockPath) {
  Resolve-ExistingBackupLock $lockPath $StorageDir
}

$lockPayload = [ordered]@{
  backupId = $backupId
  startedAt = $startedAt.ToString("o")
  computerName = $env:COMPUTERNAME
  processId = $PID
} | ConvertTo-Json

try {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $lockPath) | Out-Null
  $lockStream = [System.IO.FileStream]::new(
    $lockPath,
    [System.IO.FileMode]::CreateNew,
    [System.IO.FileAccess]::Write,
    [System.IO.FileShare]::Read
  )
  try {
    $lockBytes = [System.Text.UTF8Encoding]::new($false).GetBytes($lockPayload)
    $lockStream.Write($lockBytes, 0, $lockBytes.Length)
    $lockStream.Flush($true)
  } finally {
    $lockStream.Dispose()
  }
  $lockCreated = $true
  if ($GraceSeconds -gt 0) { Start-Sleep -Seconds $GraceSeconds }

  New-Item -ItemType Directory -Path $stagingFolder | Out-Null
  $databaseFile = Join-Path $stagingFolder "database.sql"
  $storageFile = Join-Path $stagingFolder "storage.zip"
  $manifestFile = Join-Path $stagingFolder "manifest.json"

  & (Join-Path $PSScriptRoot "backup-database.ps1") `
    -DatabaseUrl $DatabaseUrl `
    -PgDumpPath $PgDumpPath `
    -OutputFile $databaseFile | Out-Null
  & (Join-Path $PSScriptRoot "backup-storage.ps1") `
    -StorageDir $StorageDir `
    -OutputFile $storageFile | Out-Null

  $databaseInfo = Get-Item -LiteralPath $databaseFile
  if ($databaseInfo.Length -le 0) { throw "Database dump is empty." }
  $databaseTail = Get-Content -LiteralPath $databaseFile -Tail 20
  if (-not ($databaseTail -match "PostgreSQL database dump complete")) {
    throw "Database dump completion marker was not found."
  }

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [System.IO.Compression.ZipFile]::OpenRead($storageFile)
  try {
    $storageEntryCount = $zip.Entries.Count
    $storageUncompressedBytes = ($zip.Entries | Measure-Object Length -Sum).Sum
    $temporaryEntryCount = @(
      $zip.Entries | Where-Object { $_.FullName -match '^File Sementara[/\\]' }
    ).Count
  } finally {
    $zip.Dispose()
  }
  if ($storageEntryCount -le 0) { throw "Storage archive does not contain files." }
  if ($temporaryEntryCount -gt 0) {
    throw "Storage archive unexpectedly contains File Sementara."
  }

  $storageInfo = Get-Item -LiteralPath $storageFile
  if ($storageInfo.Length -le 0) { throw "Storage archive is empty." }
  $databaseHash = (Get-FileHash -LiteralPath $databaseFile -Algorithm SHA256).Hash
  $storageHash = (Get-FileHash -LiteralPath $storageFile -Algorithm SHA256).Hash
  $completedAt = Get-Date
  $manifest = [ordered]@{
    schemaVersion = 1
    backupId = $backupId
    status = "verified"
    startedAt = $startedAt.ToString("o")
    completedAt = $completedAt.ToString("o")
    computerName = $env:COMPUTERNAME
    storageRoot = $StorageDir
    mutationsLocked = $true
    files = [ordered]@{
      database = [ordered]@{
        name = "database.sql"
        sizeBytes = $databaseInfo.Length
        sha256 = $databaseHash
        completionMarkerVerified = $true
      }
      storage = [ordered]@{
        name = "storage.zip"
        sizeBytes = $storageInfo.Length
        sha256 = $storageHash
        entryCount = $storageEntryCount
        uncompressedBytes = $storageUncompressedBytes
        temporaryFolderExcluded = $true
      }
    }
    retention = [ordered]@{
      keepSuccessfulLocalSets = $KeepSuccessful
    }
  }
  $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestFile -Encoding UTF8
  $manifestCheck = Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json
  if ($manifestCheck.backupId -ne $backupId -or $manifestCheck.status -ne "verified") {
    throw "Backup manifest verification failed."
  }
  if (
    $manifestCheck.files.database.sha256 -ne (Get-FileHash -LiteralPath $databaseFile -Algorithm SHA256).Hash -or
    $manifestCheck.files.storage.sha256 -ne (Get-FileHash -LiteralPath $storageFile -Algorithm SHA256).Hash
  ) {
    throw "Backup checksum verification failed."
  }

  Move-Item -LiteralPath $stagingFolder -Destination $finalFolder
  if (-not (Test-Path -LiteralPath $finalFolder)) {
    throw "Verified backup could not be promoted to its final folder."
  }

  $removedByRetention = @()
  try {
    $successfulSets = Get-ChildItem -LiteralPath $BackupRoot -Directory -Recurse |
      Where-Object { $_.Name -like "BACKUP-*" } |
      Sort-Object Name -Descending
    $expiredSets = @($successfulSets | Select-Object -Skip $KeepSuccessful)
    foreach ($expiredSet in $expiredSets) {
      Assert-PathInside $BackupRoot $expiredSet.FullName
      Remove-Item -LiteralPath $expiredSet.FullName -Recurse -Force
      $removedByRetention += $expiredSet.FullName
    }
  } catch {
    Write-Warning "Backup succeeded, but local retention cleanup failed: $($_.Exception.Message)"
  }

  [ordered]@{
    status = "verified"
    backupId = $backupId
    backupFolder = $finalFolder
    databaseBytes = $databaseInfo.Length
    storageBytes = $storageInfo.Length
    storageEntries = $storageEntryCount
    retainedSuccessfulSets = $KeepSuccessful
    removedByRetention = $removedByRetention
  } | ConvertTo-Json -Depth 4
} catch {
  if (Test-Path -LiteralPath $stagingFolder) {
    Set-Content -LiteralPath (Join-Path $stagingFolder "backup-error.txt") -Value $_.Exception.Message -Encoding UTF8
    if (-not (Test-Path -LiteralPath $failedFolder)) {
      Move-Item -LiteralPath $stagingFolder -Destination $failedFolder
    }
  }
  throw
} finally {
  if ($lockCreated -and (Test-Path -LiteralPath $lockPath)) {
    Remove-Item -LiteralPath $lockPath -Force
  }
}
