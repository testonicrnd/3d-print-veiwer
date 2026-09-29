# Run once to make this machine check GitHub for updates every hour
# automatically (pulls latest code, reinstalls deps, restarts the server only if
# something actually changed). No more manually re-running update.ps1.

$repoDir = $PSScriptRoot
$pythonw = (Get-Command pythonw.exe -ErrorAction SilentlyContinue).Source
if (-not $pythonw) { $pythonw = "pythonw.exe" }

# -WindowStyle Hidden + -Unattended: this fires once an hour with nobody watching,
# so it must never show a window or wait on Read-Host for a keypress that will
# never come (that previously left a stuck, visible PowerShell window behind
# after every single hourly run).
$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$repoDir\update.ps1`" -Unattended" `
    -WorkingDirectory $repoDir

$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration (New-TimeSpan -Days 3650)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

Register-ScheduledTask -TaskName "3DPrintViewerAutoUpdate" -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "Checks GitHub for updates every hour and restarts the 3D print viewer only if the code changed" -Force

Write-Host "Registered. To test immediately: Start-ScheduledTask -TaskName '3DPrintViewerAutoUpdate'"
