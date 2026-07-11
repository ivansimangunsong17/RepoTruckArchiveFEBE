param(
  [string]$Root = "D:\ARMADA_SYSTEM",
  [string]$DatabaseUrl = $env:DATABASE_URL,
  [string]$PgDumpPath = $env:PG_DUMP_PATH,
  [string]$DatabaseTaskName = "ATMS Database Backup",
  [string]$StorageTaskName = "ATMS Storage Backup",
  [string]$DatabaseBackupTime = "23:00",
  [string]$StorageBackupTime = "23:30"
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
  throw "DATABASE_URL is required. Set it in environment variables or pass -DatabaseUrl."
}

$scriptRoot = Join-Path $Root "apps\backend\scripts"
$dbScript = Join-Path $scriptRoot "backup-database.ps1"
$storageScript = Join-Path $scriptRoot "backup-storage.ps1"

if (-not (Test-Path -Path $dbScript)) {
  throw "Database backup script not found: $dbScript"
}
if (-not (Test-Path -Path $storageScript)) {
  throw "Storage backup script not found: $storageScript"
}

$databaseBackupDir = Join-Path $Root "backups\database"
$storageBackupDir = Join-Path $Root "backups\storage"
$storageDir = Join-Path $Root "storage"

$dbArgs = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", "`"$dbScript`"",
  "-DatabaseUrl", "`"$DatabaseUrl`"",
  "-BackupDir", "`"$databaseBackupDir`""
)
if (-not [string]::IsNullOrWhiteSpace($PgDumpPath)) {
  $dbArgs += @("-PgDumpPath", "`"$PgDumpPath`"")
}

$storageArgs = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", "`"$storageScript`"",
  "-StorageDir", "`"$storageDir`"",
  "-BackupDir", "`"$storageBackupDir`""
)

$dbAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument ($dbArgs -join " ")
$dbTrigger = New-ScheduledTaskTrigger -Daily -At $DatabaseBackupTime
Register-ScheduledTask -TaskName $DatabaseTaskName -Action $dbAction -Trigger $dbTrigger -Description "Daily ATMS PostgreSQL backup" -Force | Out-Null

$storageAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument ($storageArgs -join " ")
$storageTrigger = New-ScheduledTaskTrigger -Daily -At $StorageBackupTime
Register-ScheduledTask -TaskName $StorageTaskName -Action $storageAction -Trigger $storageTrigger -Description "Daily ATMS storage zip backup" -Force | Out-Null

Write-Output "Registered scheduled tasks: $DatabaseTaskName, $StorageTaskName"
