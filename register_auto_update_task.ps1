# TESTONIC R&D - 3D Print Viewer
# Registers a scheduled task that runs update.ps1 every hour
# (syncs with GitHub, restarts the server only if the code changed).

$repoDir = $PSScriptRoot
$pythonw = (Get-Command pythonw.exe -ErrorAction SilentlyContinue).Source
if (-not $pythonw) { $pythonw = "pythonw.exe" }

# Runs unattended: hidden window, and -Unattended so it never waits for a keypress.
$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$repoDir\update.ps1`" -Unattended" `
    -WorkingDirectory $repoDir

$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration (New-TimeSpan -Days 3650)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

Register-ScheduledTask -TaskName "3DPrintViewerAutoUpdate" -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "Checks GitHub for updates every hour and restarts the 3D print viewer only if the code changed" -Force

Write-Host "Registered. To test immediately: Start-ScheduledTask -TaskName '3DPrintViewerAutoUpdate'"
