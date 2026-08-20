param(
  [string]$ProjectPath = "C:\Project\coin-research\market-worker",
  [int]$IntervalMinutes = 5
)
$ErrorActionPreference = "Stop"
if ($IntervalMinutes -lt 5) { throw "실행 간격은 최소 5분이어야 합니다." }
$runner = Join-Path $ProjectPath "automation\run-market-worker.ps1"
if (-not (Test-Path $runner)) { throw "실행 스크립트가 없습니다: $runner" }
$taskName = "MarketMind-MarketWorker"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$runner`" -ProjectPath `"$ProjectPath`""
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "MarketMind AI paper-trading worker automation" -Force | Out-Null
Write-Host "등록 완료: $taskName / ${IntervalMinutes}분 간격"
Write-Host "실거래 기능은 포함되지 않았습니다."
