#!/bin/bash
# ============================================================
#  Migrate database from VPS to local Mini PC
#  Run from WSL or Git Bash after docker compose is up
# ============================================================

set -e

echo ""
echo "============================================================"
echo "  Migrating data from VPS (178.128.222.1)"
echo "============================================================"
echo ""

# Check docker
if ! docker ps --filter name=soc-db --format '{{.Names}}' | grep -q soc-db; then
    echo "[ERROR] soc-db container not running. Run: docker compose up -d"
    exit 1
fi

echo "[1/3] Dumping database from VPS (~27000 tickets, may take 1-2 min)..."
ssh root@178.128.222.1 "docker exec soc-db pg_dump -U soc --no-owner --no-privileges soc_analytics" > db_dump.sql

SIZE=$(wc -c < db_dump.sql)
echo "[OK] Database dump: ${SIZE} bytes"

echo ""
echo "[2/3] Importing into local database..."
docker exec soc-db psql -U soc -d soc_analytics -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" 2>/dev/null || true
docker exec -i soc-db psql -U soc -d soc_analytics < db_dump.sql

echo ""
echo "[3/3] Refreshing materialized views..."
docker exec soc-db psql -U soc -d soc_analytics -c "
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_metrics;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_customer_daily;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_analyst_daily;
" 2>/dev/null || true

echo ""
echo "============================================================"
echo "  Migration Complete!"
echo "  Dashboard: http://localhost:3500"
echo "============================================================"
