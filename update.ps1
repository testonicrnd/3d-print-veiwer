# TESTONIC R&D - 3D Print Viewer
# Syncs this checkout to GitHub (origin/main) and restarts the server only if the code changed.
# Run by the 3DPrintViewerAutoUpdate scheduled task (with -Unattended), or double-click to run manually.
# Messages are plain ASCII - Korean text can garble in some console codepages.
# Without -Unattended the window waits for Enter at the end so the output can be read.
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

    # This checkout just mirrors GitHub: hard-reset instead of pull so local edits or a
    # force-pushed history never block the update. Untracked files are kept.
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
