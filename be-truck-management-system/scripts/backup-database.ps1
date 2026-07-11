param(
  [string]$DatabaseUrl = $env:DATABASE_URL,
  [string]$BackupDir = "D:\ARMADA_SYSTEM\backups\database",
  [string]$PgDumpPath = $env:PG_DUMP_PATH
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
  throw "DATABASE_URL is required. Set it in environment variables or pass -DatabaseUrl."
}

if ([string]::IsNullOrWhiteSpace($PgDumpPath)) {
  $PgDumpPath = "pg_dump"
}

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd_HHmm"
$outputFile = Join-Path $BackupDir "atms_db_$timestamp.sql"

& $PgDumpPath $DatabaseUrl --file $outputFile --no-owner --no-privileges
if ($LASTEXITCODE -ne 0) {
  throw "pg_dump failed with exit code $LASTEXITCODE"
}

Write-Output $outputFile
