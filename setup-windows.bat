@echo off
REM ============================================================
REM  SOC Analytics Dashboard - Windows Setup Script
REM  Run this ONCE on the Mini PC after installing Docker Desktop
REM ============================================================

echo.
echo ============================================================
echo   SOC Analytics Dashboard - Setup
echo ============================================================
echo.

REM Check Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not running!
    echo Please install Docker Desktop and start it first.
    echo Download: https://www.docker.com/products/docker-desktop/
    echo.
    pause
    exit /b 1
)
echo [OK] Docker is running

REM Check .env exists
if not exist .env (
    echo [ERROR] .env file not found!
    echo Copy .env.example to .env and fill in the values.
    pause
    exit /b 1
)
echo [OK] .env file found

REM Step 1: Start database first
echo.
echo [1/4] Starting database and redis...
docker compose up -d db redis
echo Waiting for database to be healthy...
timeout /t 10 /nobreak >nul

REM Step 2: Import database dump if exists
if exist db_dump.sql (
    echo.
    echo [2/4] Importing database dump (this may take a few minutes)...
    docker exec -i soc-db psql -U soc -d soc_analytics < db_dump.sql
    echo [OK] Database imported
) else (
    echo.
    echo [2/4] No db_dump.sql found - starting with fresh database
    echo     To migrate data from VPS, run: migrate-from-vps.bat
)

REM Step 3: Start all services
echo.
echo [3/4] Starting all services...
docker compose up -d --build

REM Step 4: Wait and verify
echo.
echo [4/4] Waiting for services to start...
timeout /t 15 /nobreak >nul

echo.
echo Checking services...
docker compose ps

echo.
echo ============================================================
echo   Setup Complete!
echo.
echo   Dashboard:  http://localhost:3500
echo   API:        http://localhost:8500/api/health
echo   Database:   localhost:5433
echo.
echo   Auto-sync runs every 5 minutes.
echo   To stop:  docker compose down
echo   To start: docker compose up -d
echo ============================================================
echo.
pause
