@echo off
REM ============================================================
REM  Migrate database from VPS to local Mini PC
REM  Run this AFTER setup-windows.bat
REM ============================================================

echo.
echo ============================================================
echo   Migrating data from VPS (178.128.222.1)
echo ============================================================
echo.

REM Check if db container is running
docker ps --filter name=soc-db --format "{{.Names}}" | findstr soc-db >nul 2>&1
if errorlevel 1 (
    echo [ERROR] soc-db container not running. Run setup-windows.bat first.
    pause
    exit /b 1
)

echo [1/3] Dumping database from VPS...
echo     This will download ~27000 tickets. May take 1-2 minutes.
echo.

REM Use pg_dump from VPS directly and pipe to local
ssh root@178.128.222.1 "docker exec soc-db pg_dump -U soc --no-owner --no-privileges soc_analytics" > db_dump.sql

if not exist db_dump.sql (
    echo [ERROR] Failed to dump database from VPS
    pause
    exit /b 1
)

for %%A in (db_dump.sql) do set SIZE=%%~zA
echo [OK] Database dump: %SIZE% bytes

echo.
echo [2/3] Importing into local database...
echo     (Dropping and recreating to avoid conflicts)

docker exec soc-db psql -U soc -d soc_analytics -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" 2>nul
docker exec -i soc-db psql -U soc -d soc_analytics < db_dump.sql

echo.
echo [3/3] Refreshing materialized views...
docker exec soc-db psql -U soc -d soc_analytics -c "REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_metrics; REFRESH MATERIALIZED VIEW CONCURRENTLY mv_customer_daily; REFRESH MATERIALIZED VIEW CONCURRENTLY mv_analyst_daily;" 2>nul

echo.
echo ============================================================
echo   Migration Complete!
echo   All ticket data has been transferred to local database.
echo   Dashboard: http://localhost:3500
echo ============================================================
echo.
pause
