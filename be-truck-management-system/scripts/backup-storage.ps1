param(
  [string]$StorageDir = "",
  [string]$BackupDir = "",
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

if ([string]::IsNullOrWhiteSpace($StorageDir)) {
  $StorageDir = if ($env:UPLOAD_DIR) { $env:UPLOAD_DIR } else { Get-DotEnvValue "UPLOAD_DIR" }
}
if ([string]::IsNullOrWhiteSpace($StorageDir)) {
  throw "UPLOAD_DIR is required in environment variables, .env, or -StorageDir."
}
if (-not (Test-Path -LiteralPath $StorageDir)) {
  throw "Storage directory does not exist: $StorageDir"
}

$StorageDir = (Resolve-Path -LiteralPath $StorageDir).Path.TrimEnd('\')
if ([string]::IsNullOrWhiteSpace($OutputFile)) {
  if ([string]::IsNullOrWhiteSpace($BackupDir)) {
    $BackupDir = Join-Path (Split-Path -Parent $StorageDir) "backups\storage"
  }
  New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
  $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
  $OutputFile = Join-Path $BackupDir "atms_storage_$timestamp.zip"
}

$OutputFile = [System.IO.Path]::GetFullPath($OutputFile)
$outputParent = Split-Path -Parent $OutputFile
New-Item -ItemType Directory -Force -Path $outputParent | Out-Null
if ($OutputFile.StartsWith("$StorageDir\", [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Backup output must be outside the active storage directory."
}
if (Test-Path -LiteralPath $OutputFile) {
  throw "Backup output already exists: $OutputFile"
}

$backupItems = Get-ChildItem -LiteralPath $StorageDir -Force |
  Where-Object { $_.Name -ne "File Sementara" }
if (-not $backupItems) {
  throw "Storage directory does not contain files to back up: $StorageDir"
}
Compress-Archive -Path $backupItems.FullName -DestinationPath $OutputFile

Write-Output $OutputFile
