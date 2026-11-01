# setup-daily-task.ps1
# Creates a Windows scheduled task "JobFinder" that searches for jobs every day.
#
# Run it from Git Bash or PowerShell, inside the jobfinder folder:
#   powershell -ExecutionPolicy Bypass -File setup-daily-task.ps1
# Choose another time:
#   powershell -ExecutionPolicy Bypass -File setup-daily-task.ps1 -Time 08:30
# Remove the task later:
#   powershell -Command "Unregister-ScheduledTask -TaskName JobFinder -Confirm:`$false"

param([string]$Time = "09:00")

$folder = $PSScriptRoot
$batFile = Join-Path $folder "run-daily.bat"

$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$batFile`"" -WorkingDirectory $folder
$trigger = New-ScheduledTaskTrigger -Daily -At $Time

# StartWhenAvailable: if the PC was off at that time, run as soon as it's back on
# AllowStartIfOnBatteries: also run on a laptop that isn't plugged in
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName "JobFinder" -Action $action -Trigger $trigger -Settings $settings `
  -Description "Searches for new web development jobs (Job Finder)" -Force | Out-Null

Write-Host "Done: Job Finder will search for jobs every day at $Time."
Write-Host "Test it now with:  schtasks /run /tn JobFinder"
