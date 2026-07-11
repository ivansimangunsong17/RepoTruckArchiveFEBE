param(
  [string]$StorageDir = $(if ($env:UPLOAD_DIR) { $env:UPLOAD_DIR } else { "D:\ARMADA_SYSTEM\storage" }),
  [string]$BackupDir = "D:\ARMADA_SYSTEM\backups\storage"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -Path $StorageDir)) {
  throw "Storage directory does not exist: $StorageDir"
}

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd_HHmm"
$outputFile = Join-Path $BackupDir "atms_storage_$timestamp.zip"

if (Test-Path -Path $outputFile) {
  Remove-Item -LiteralPath $outputFile -Force
}

Compress-Archive -Path (Join-Path $StorageDir "*") -DestinationPath $outputFile -Force

Write-Output $outputFile
