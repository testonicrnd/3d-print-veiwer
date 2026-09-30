@echo off
rem TESTONIC R&D - 3D Print Viewer
setlocal

rem One-time setup for a new PC: clones the repo, installs dependencies,
rem and registers auto-start on login + auto-update every 10 minutes.
rem
rem NOTE: avoid forward "goto" after external commands (git, pip) inside
rem parenthesized if/else blocks - it can break cmd.exe's label lookup.

set "REPO_URL=https://github.com/testonicrnd/3d-print-veiwer.git"
set "REPO_DIR=%USERPROFILE%\3d-print-veiwer"

echo ===============================================
echo   3D Print Viewer - Setup
echo ===============================================
echo.

where git >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Git is not installed.
    echo Install it from https://git-scm.com and rerun this script.
    pause
    exit /b 1
)

where python >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Python is not installed.
    echo Install it from https://python.org and rerun this script.
    echo Be sure to check "Add python.exe to PATH" during install.
    pause
    exit /b 1
)

if exist "%REPO_DIR%\.git" (
    echo Existing checkout found, pulling latest code...
    cd /d "%REPO_DIR%"
    git pull origin main
) else (
    echo Cloning repo into %REPO_DIR% ...
    git clone "%REPO_URL%" "%REPO_DIR%"
    cd /d "%REPO_DIR%"
)

if not exist "%REPO_DIR%\.git" (
    echo [ERROR] Clone failed. Check your internet connection.
    pause
    exit /b 1
)

echo.
echo Installing Python packages...
python -m pip install -r requirements.txt

if errorlevel 1 (
    echo [ERROR] Package install failed.
    pause
    exit /b 1
)

echo.
echo Registering auto-start on login (with auto-retry if it crashes)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%REPO_DIR%\register_startup_task.ps1"

echo.
echo Registering auto-update check every 10 minutes (pulls GitHub, restarts only if changed)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%REPO_DIR%\register_auto_update_task.ps1"

echo.
echo Starting the server now to verify it works...
start "" pythonw "%REPO_DIR%\launcher.py"

echo.
echo ===============================================
echo   Setup complete! Check the notification/browser
echo   that should appear shortly.
echo   From now on it starts automatically on login,
echo   and checks GitHub for updates every 10 minutes.
echo ===============================================
pause
exit /b 0
