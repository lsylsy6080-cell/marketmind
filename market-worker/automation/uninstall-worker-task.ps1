$taskName = "MarketMind-MarketWorker"
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Write-Host "자동 실행 작업을 제거했습니다: $taskName"
