param(
  [string]$DatabaseUrl = "",
  [string]$BackupDir = "",
  [string]$PgDumpPath = "",
  [string]$OutputFile = ""
)

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $ProjectDir ".env"

function Get-DotEnvValue([string]$Name) {
  if (-not (Test-Path -LiteralPath $EnvFile)) { return "" }
  $line = Get-Content -LiteralPath $EnvFile |
    Where-Object { $_ -match "^\s*$([regex]::Escape($Name))\s*=" } |
    Select-Object -Last 1
  if (-not $line) { return "" }
  return (($line -split "=", 2)[1]).Trim().Trim('"').Trim("'")
}

if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
  $DatabaseUrl = if ($env:DATABASE_URL) { $env:DATABASE_URL } else { Get-DotEnvValue "DATABASE_URL" }
}
if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
  throw "DATABASE_URL is required in environment variables, .env, or -DatabaseUrl."
}
if ([string]::IsNullOrWhiteSpace($PgDumpPath)) {
  $PgDumpPath = if ($env:PG_DUMP_PATH) { $env:PG_DUMP_PATH } else { Get-DotEnvValue "PG_DUMP_PATH" }
}
if ([string]::IsNullOrWhiteSpace($PgDumpPath)) {
  $pgDumpCommand = Get-Command "pg_dump" -ErrorAction SilentlyContinue
  if ($pgDumpCommand) {
    $PgDumpPath = $pgDumpCommand.Source
  } else {
    $postgresRoot = Join-Path $env:ProgramFiles "PostgreSQL"
    $PgDumpPath = Get-ChildItem -LiteralPath $postgresRoot -Filter "pg_dump.exe" -Recurse -File -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -match "\\bin\\pg_dump\.exe$" } |
      Sort-Object FullName -Descending |
      Select-Object -First 1 -ExpandProperty FullName
  }
}
if ([string]::IsNullOrWhiteSpace($PgDumpPath) -or -not (Test-Path -LiteralPath $PgDumpPath)) {
  throw "pg_dump was not found. Set PG_DUMP_PATH in .env or pass -PgDumpPath."
}
if ([string]::IsNullOrWhiteSpace($OutputFile)) {
  if ([string]::IsNullOrWhiteSpace($BackupDir)) {
    $storageDir = if ($env:UPLOAD_DIR) { $env:UPLOAD_DIR } else { Get-DotEnvValue "UPLOAD_DIR" }
    $BackupDir = if ($storageDir) {
      Join-Path (Split-Path -Parent $storageDir) "backups\database"
    } else {
      Join-Path $ProjectDir "backups\database"
    }
  }
  New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
  $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
  $OutputFile = Join-Path $BackupDir "atms_db_$timestamp.sql"
}

$OutputFile = [System.IO.Path]::GetFullPath($OutputFile)
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutputFile) | Out-Null
if (Test-Path -LiteralPath $OutputFile) {
  throw "Backup output already exists: $OutputFile"
}

& $PgDumpPath $DatabaseUrl --file $OutputFile --no-owner --no-privileges
if ($LASTEXITCODE -ne 0) {
  throw "pg_dump failed with exit code $LASTEXITCODE"
}

Write-Output $OutputFile
