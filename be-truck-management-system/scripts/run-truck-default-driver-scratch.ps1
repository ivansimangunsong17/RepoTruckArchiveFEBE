# Run exactly one whitelisted integration suite against the dedicated scratch database.
# The password is supplied through ATMS_SCRATCH_APP_PW and is never written to output.
param(
  [ValidateSet('truck-default-driver', 'container-job-inap-running-at', 'truck-maintenance-edit', 'sales-order-cancel', 'sales-order-active-operational', 'repo-pickup-commission', 'repo-titip-e2e', 'repo-revenue', 'sales-order-inap-status', 'combo-assignment', 'finance-eligibility', 'repo-pickup-uj', 'repo-reporting', 'repo-timeline', 'repo-transport-attribution')]
  [string]$Suite = 'truck-default-driver'
)
$ErrorActionPreference = 'Stop'
$expectedTests = @{ 'truck-default-driver' = 5; 'container-job-inap-running-at' = 1; 'truck-maintenance-edit' = 2; 'sales-order-cancel' = 7; 'sales-order-active-operational' = 3; 'repo-pickup-commission' = 9; 'repo-titip-e2e' = 3; 'repo-revenue' = 7; 'sales-order-inap-status' = 4; 'combo-assignment' = 14; 'finance-eligibility' = 11; 'repo-pickup-uj' = 10; 'repo-reporting' = 6; 'repo-timeline' = 9; 'repo-transport-attribution' = 11 }[$Suite]
$testFile = "src/integration/$Suite.integration.test.js"

$backendRoot = Split-Path -Parent $PSScriptRoot
$databaseName = 'atms_scratch_test'
$databaseUser = 'atms_scratch_app'
$databaseHost = '127.0.0.1'
$databasePort = 5433
$password = [Environment]::GetEnvironmentVariable('ATMS_SCRATCH_APP_PW', 'Process')

if ([string]::IsNullOrEmpty($password)) {
  [Console]::Error.WriteLine('ATMS_SCRATCH_APP_PW is required in this process to run the scratch integration tests.')
  exit 2
}

$previousPgPassword = [Environment]::GetEnvironmentVariable('PGPASSWORD', 'Process')
$previousScratchUrl = [Environment]::GetEnvironmentVariable('ATMS_SCRATCH_DATABASE_URL', 'Process')
$previousScratchName = [Environment]::GetEnvironmentVariable('ATMS_SCRATCH_DATABASE_NAME', 'Process')
$encodedPassword = [Uri]::EscapeDataString($password)

try {
  $env:PGPASSWORD = $password
  $identityOutput = & psql -X -w -q -A -t -v ON_ERROR_STOP=1 -h $databaseHost -p $databasePort -U $databaseUser -d $databaseName -c 'select current_database(), current_user, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls from pg_roles where rolname = current_user' 2>&1
  $psqlExit = $LASTEXITCODE
  if ($psqlExit -ne 0) {
    throw "Scratch identity check failed (psql exit $psqlExit)."
  }

  $identityRows = @($identityOutput | ForEach-Object { [string]$_ } | Where-Object { $_.Trim() })
  if ($identityRows.Count -ne 1) {
    throw "Scratch identity check returned $($identityRows.Count) rows; expected one."
  }
  $fields = $identityRows[0].Trim() -split '\|'
  if ($fields.Count -ne 6 -or $fields[0] -ne $databaseName -or $fields[1] -ne $databaseUser) {
    throw 'Scratch database or role identity does not match the expected target.'
  }
  # PostgreSQL emits text booleans as t/f. In PowerShell, the string 'f' is truthy.
  # Compare the actual value, never use a string boolean as an if-condition.
  foreach ($flag in $fields[2..5]) {
    if ($flag -notin @('f', 'false')) {
      throw 'Scratch app role has elevated privileges or an unrecognized privilege flag.'
    }
  }

  $env:ATMS_SCRATCH_DATABASE_NAME = $databaseName
  $env:ATMS_SCRATCH_DATABASE_URL = "postgresql://${databaseUser}:${encodedPassword}@${databaseHost}:${databasePort}/${databaseName}"
  Set-Location -LiteralPath $backendRoot

  $testOutput = & node --test --test-reporter=tap $testFile 2>&1
  $testExit = $LASTEXITCODE
  foreach ($line in $testOutput) {
    $safeLine = [string]$line
    $safeLine = $safeLine.Replace($password, '[REDACTED]').Replace($encodedPassword, '[REDACTED]')
    [Console]::Out.WriteLine($safeLine)
  }
  if ($testExit -ne 0) {
    throw "Integration test process failed (exit $testExit)."
  }

  $summary = @($testOutput | ForEach-Object { [string]$_ }) -join "`n"
  if ($summary -notmatch "(?m)^# tests $expectedTests\s*$" -or
      $summary -notmatch "(?m)^# pass $expectedTests\s*$" -or
      $summary -notmatch '(?m)^# fail 0\s*$' -or
      $summary -notmatch '(?m)^# skipped 0\s*$') {
    throw "Integration test summary did not report exactly $expectedTests passing tests with zero failures and skips."
  }
  exit 0
} catch {
  $message = [string]$_.Exception.Message
  $message = $message.Replace($password, '[REDACTED]').Replace($encodedPassword, '[REDACTED]')
  [Console]::Error.WriteLine($message)
  exit 1
} finally {
  [Environment]::SetEnvironmentVariable('PGPASSWORD', $previousPgPassword, 'Process')
  [Environment]::SetEnvironmentVariable('ATMS_SCRATCH_DATABASE_URL', $previousScratchUrl, 'Process')
  [Environment]::SetEnvironmentVariable('ATMS_SCRATCH_DATABASE_NAME', $previousScratchName, 'Process')
}
