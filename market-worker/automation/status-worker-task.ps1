$taskName = "MarketMind-MarketWorker"
Get-ScheduledTask -TaskName $taskName -ErrorAction Stop | Get-ScheduledTaskInfo |
  Format-List LastRunTime, LastTaskResult, NextRunTime, NumberOfMissedRuns
