# Registers launcher.py to auto-start on login via Windows Task Scheduler,
# retrying every couple minutes if it crashes.
# (Run as Administrator: right-click Start menu -> Windows PowerShell (Admin))
# NOTE: messages kept in plain ASCII on purpose - Korean text here has been
# observed to garble in some console codepages.

$repoDir = $PSScriptRoot
$pythonw = (Get-Command pythonw.exe -ErrorAction SilentlyContinue).Source
if (-not $pythonw) { $pythonw = "pythonw.exe" }

$action = New-ScheduledTaskAction -Execute $pythonw -Argument "`"$repoDir\launcher.py`"" -WorkingDirectory $repoDir
$trigger = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 2) `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Days 0) `
    -DontStopIfGoingOnBatteries `
    -AllowStartIfOnBatteries

Register-ScheduledTask -TaskName "3DPrintViewerLauncher" -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "Auto-starts the 3D print viewer on login, retrying if it crashes" -Force

Write-Host "Registered. To test immediately: Start-ScheduledTask -TaskName '3DPrintViewerLauncher'"
