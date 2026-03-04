@echo off
REM ============================================================
REM  Auto-start SOC Analytics Dashboard
REM  
REM  To auto-run on boot:
REM  1. Press Win+R, type: shell:startup
REM  2. Create a shortcut to this file in that folder
REM  
REM  Or create a Scheduled Task:
REM  1. Open Task Scheduler
REM  2. Create Basic Task → "SOC Dashboard"
REM  3. Trigger: "When the computer starts"
REM  4. Action: Start a program → browse to this .bat file
REM  5. Check "Run with highest privileges"
REM ============================================================

REM Wait for Docker to be ready (Docker Desktop auto-starts)
echo Waiting for Docker Desktop to start...
:WAIT_DOCKER
docker info >nul 2>&1
if errorlevel 1 (
    timeout /t 5 /nobreak >nul
    goto WAIT_DOCKER
)

echo Docker is ready. Starting SOC Analytics...
cd /d "%~dp0"
docker compose up -d

echo SOC Analytics Dashboard started.
echo Dashboard: http://localhost:3500
