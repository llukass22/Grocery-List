param([ValidateSet('start','stop','status')][string]$Action = 'start')
$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path $PSScriptRoot -Parent
$dbDirectory = Join-Path $projectDirectory '.local-db'
$dbExecutable = Join-Path $dbDirectory 'runtime\mariadb-11.8.9-winx64\bin\mariadbd.exe'
$dbPidFile = Join-Path $dbDirectory 'database.pid'
$appPidFile = Join-Path $dbDirectory 'application.pid'
$localEnvironment = Get-Content -LiteralPath (Join-Path $projectDirectory '.env')
$appOrigin = ($localEnvironment | Where-Object { $_ -match '^APP_ORIGIN=' }) -replace '^APP_ORIGIN=', ''
$bundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$nodeExecutable = $bundledNode
if (!(Test-Path -LiteralPath $nodeExecutable)) {
  $nodeExecutable = (Get-Command node -ErrorAction Stop).Source
  $nodeVersion = & $nodeExecutable -p 'process.versions.node.split(".")[0]'
  if ([int]$nodeVersion -lt 22) { throw 'Install Node.js 22 or newer before starting Basket.' }
}
function Get-ManagedProcess($pidFile, $executable) {
  if (Test-Path -LiteralPath $pidFile) {
    $processId = [int](Get-Content -LiteralPath $pidFile)
    $runningProcess = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($runningProcess -and $runningProcess.Path -eq $executable) { return $runningProcess }
  }
  return $null
}
if ($Action -eq 'stop') {
  $appProcess = Get-ManagedProcess $appPidFile $nodeExecutable
  if ($appProcess) { Stop-Process -Id $appProcess.Id }
  $dbProcess = Get-ManagedProcess $dbPidFile $dbExecutable
  if ($dbProcess) {
    & $nodeExecutable (Join-Path $PSScriptRoot 'local-admin.cjs') shutdown
    if ($LASTEXITCODE -ne 0) { throw 'Database shutdown failed; consult .local-db logs.' }
    Wait-Process -Id $dbProcess.Id -Timeout 15 -ErrorAction SilentlyContinue
  }
  Write-Output 'Local Basket and MariaDB stopped.'
  exit
}
if ($Action -eq 'status') {
  Write-Output ('Database running: ' + [bool](Get-ManagedProcess $dbPidFile $dbExecutable))
  Write-Output ('Application running: ' + [bool](Get-ManagedProcess $appPidFile $nodeExecutable))
  exit
}
if (!(Test-Path -LiteralPath $dbExecutable)) { throw 'The project-local MariaDB installation is missing.' }
if (!(Get-ManagedProcess $dbPidFile $dbExecutable)) {
  $dbProcess = Start-Process -FilePath $dbExecutable -ArgumentList ('--defaults-file="' + (Join-Path $dbDirectory 'my.ini') + '"'), '--console' -WorkingDirectory $projectDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $dbDirectory 'database.stdout.log') -RedirectStandardError (Join-Path $dbDirectory 'database.stderr.log')
  Set-Content -LiteralPath $dbPidFile -Value $dbProcess.Id
}
& $nodeExecutable (Join-Path $PSScriptRoot 'local-admin.cjs') ready
if ($LASTEXITCODE -ne 0) { throw 'Database did not become ready; consult .local-db logs.' }
& $nodeExecutable (Join-Path $PSScriptRoot 'local-admin.cjs') initialize
if ($LASTEXITCODE -ne 0) { throw 'Database schema setup failed; consult .local-db logs.' }
if (!(Get-ManagedProcess $appPidFile $nodeExecutable)) {
  $appProcess = Start-Process -FilePath $nodeExecutable -ArgumentList 'server.cjs' -WorkingDirectory $projectDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $dbDirectory 'application.stdout.log') -RedirectStandardError (Join-Path $dbDirectory 'application.stderr.log')
  Set-Content -LiteralPath $appPidFile -Value $appProcess.Id
}
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  try { $response = Invoke-RestMethod -Uri ($appOrigin + '/api/session') -NoProxy -TimeoutSec 2; Write-Output ('Basket is ready at ' + $appOrigin); exit }
  catch { Start-Sleep -Milliseconds 300 }
}
throw 'Application did not become ready; consult .local-db/application.stderr.log.'
