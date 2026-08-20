param([string]$ProjectPath = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = "Stop"
Set-Location $ProjectPath
$env:WORKER_TRIGGER_SOURCE = "windows_task_scheduler"
$logDirectory = Join-Path $ProjectPath "logs"
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
$logFile = Join-Path $logDirectory ("worker-" + (Get-Date -Format "yyyy-MM-dd") + ".log")
"[$(Get-Date -Format o)] scheduled run start" | Out-File $logFile -Append -Encoding utf8
& npm.cmd start *>> $logFile
$exitCode = $LASTEXITCODE
"[$(Get-Date -Format o)] scheduled run exit=$exitCode" | Out-File $logFile -Append -Encoding utf8
exit $exitCode
