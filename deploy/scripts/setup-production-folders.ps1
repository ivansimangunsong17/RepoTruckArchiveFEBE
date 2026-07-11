param(
  [string]$Root = "D:\ARMADA_SYSTEM"
)

$ErrorActionPreference = "Stop"

$folders = @(
  "apps\frontend",
  "apps\backend",
  "storage",
  "backups\database",
  "backups\storage",
  "logs\backend",
  "deploy\scripts",
  "deploy\env"
)

foreach ($folder in $folders) {
  $path = Join-Path $Root $folder
  New-Item -ItemType Directory -Force -Path $path | Out-Null
}

Write-Output "Production folders are ready under $Root"
