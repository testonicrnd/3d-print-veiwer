# Run once on a machine to make it check GitHub for updates every hour
# automatically (pulls latest code, reinstalls deps, restarts the server only if
# something actually changed). No more manually re-running update.ps1.
# NOTE: messages are kept in plain ASCII on purpose - Korean text here has been
# observed to garble in some console codepages when this runs unattended.
#
# NOTE: wrapped in try/finally with a Read-Host at the end so the window stays
# open when a person double-clicks this to run it manually (otherwise the window
# closes the instant the script exits, even on error, before anyone can read it).
# The hourly scheduled task passes -Unattended so THAT run never waits for a
# keypress nobody is there to give - without this, every hourly run left behind
# a stuck PowerShell window forever waiting at the prompt.
param([switch]$Unattended)

try {
    $repoDir = $PSScriptRoot
    Set-Location $repoDir

    if (-not (Test-Path "$repoDir\.git")) {
        Write-Host "[ERROR] $repoDir is not a git checkout."
        Write-Host "Run setup.bat first, or make sure this script sits inside the cloned 3d-print-veiwer folder."
        exit 1
    }

    $before = git rev-parse HEAD

    Write-Host "-- git fetch --"
    git fetch origin main
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] git fetch failed (network?). Keeping current version."
        exit 1
    }

    # This checkout only ever exists to mirror GitHub - there's no legitimate reason for
    # local edits to any tracked file here. Hard-reset to origin/main instead of pulling
    # so neither a stray local change (e.g. line-ending conversion) nor a force-pushed
    # (rewritten) history on GitHub can ever block the update. Untracked files like .env
    # are left alone.
    git reset --hard origin/main

    $after = git rev-parse HEAD
    $codeChanged = $before -ne $after

    if ($codeChanged) {
        Write-Host "-- updated $($before.Substring(0,7)) -> $($after.Substring(0,7)), installing python dependencies --"
        python -m pip install -r requirements.txt
    }
    $serverRunning = [bool](Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue)

    if (-not $codeChanged -and $serverRunning) {
        Write-Host "No changes and server already running - nothing to do."
    } else {
        if ($codeChanged) { Write-Host "-- code changed, (re)starting server --" }
        else { Write-Host "-- server was not running, starting it --" }
        Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique |
            ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
        Start-Sleep -Seconds 1
        Start-Process -FilePath (Get-Command pythonw.exe).Source -ArgumentList "`"$repoDir\launcher.py`" --no-browser" -WorkingDirectory $repoDir
    }

    Write-Host "Done."
} catch {
    Write-Host "[ERROR] $($_.Exception.Message)"
} finally {
    if (-not $Unattended) {
        Write-Host ""
        Write-Host "Press Enter to close this window..."
        Read-Host | Out-Null
    }
}
