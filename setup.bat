@echo off
setlocal

rem One-time setup script for a new machine (e.g. office mini PC).
rem Copy just this file over and double-click it - it clones the repo,
rem installs dependencies, and registers auto-start on login.
rem
rem NOTE: this script deliberately avoids forward "goto" jumps placed after any
rem external command that prints output (git, pip) inside a parenthesized
rem if/else block - that combination has been observed to corrupt cmd.exe's
rem label lookup ("the system cannot find the batch label specified"). Where a
rem branch is needed after such a command, this script uses "call :label" +
rem "exit /b" (a subroutine that returns) instead of a forward goto.

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
echo Registering hourly auto-update check (pulls GitHub, restarts only if changed)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%REPO_DIR%\register_auto_update_task.ps1"

echo.
echo Starting the server now to verify it works...
start "" pythonw "%REPO_DIR%\launcher.py"

echo.
echo ===============================================
echo   Setup complete! Check the notification/browser
echo   that should appear shortly.
echo   From now on it starts automatically on login,
echo   and checks GitHub for updates every hour on its own.
echo ===============================================
pause
exit /b 0
