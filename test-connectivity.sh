#!/bin/bash
# ─────────────────────────────────────────────────
#  Test konektivitas dari PC ini ke SDP & services
# ─────────────────────────────────────────────────

echo "======================================"
echo "  SOC Analytics Connectivity Check"
echo "======================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "  ${GREEN}✓ $1${NC}"; }
fail() { echo -e "  ${RED}✗ $1${NC}"; }
warn() { echo -e "  ${YELLOW}! $1${NC}"; }

# 1. Docker running?
echo "[1] Docker..."
if docker info &>/dev/null; then
    pass "Docker is running"
else
    fail "Docker is NOT running — start Docker first"
    exit 1
fi

# 2. Containers running?
echo ""
echo "[2] Containers..."
for svc in soc-db soc-redis soc-backend soc-frontend; do
    if docker ps --format '{{.Names}}' | grep -q "$svc"; then
        pass "$svc is running"
    else
        fail "$svc is NOT running"
    fi
done

# 3. SDP API reachable?
echo ""
echo "[3] SDP API (sdp-ioc.mtm.id:8050)..."

# Test from HOST (this PC)
SDP_URL="https://sdp-ioc.mtm.id:8050"
HTTP_CODE=$(curl -sk -o /dev/null -w "%{http_code}" --connect-timeout 10 "$SDP_URL" 2>/dev/null)
if [ "$HTTP_CODE" != "000" ]; then
    pass "Reachable from HOST (HTTP $HTTP_CODE, $(curl -sk -o /dev/null -w '%{time_connect}s' --connect-timeout 10 "$SDP_URL" 2>/dev/null))"
else
    fail "UNREACHABLE from HOST — same problem as VPS!"
fi

# Test from BACKEND container
CONTAINER_CODE=$(docker exec soc-backend python -c "
import httpx, sys
try:
    r = httpx.get('https://sdp-ioc.mtm.id:8050', verify=False, timeout=10)
    print(r.status_code)
except Exception as e:
    print(f'000:{type(e).__name__}')
" 2>/dev/null)

if [[ "$CONTAINER_CODE" =~ ^[2-5] ]]; then
    pass "Reachable from BACKEND container (HTTP $CONTAINER_CODE)"
else
    fail "UNREACHABLE from BACKEND container ($CONTAINER_CODE)"
    warn "Backend sync will NOT work! Check Docker network/DNS."
fi

# 4. Backend API health
echo ""
echo "[4] Backend API..."
BACKEND=$(curl -s --connect-timeout 5 http://localhost:8500/api/health 2>/dev/null)
if [ -n "$BACKEND" ]; then
    pass "Backend API responding on :8500"
    # Check sync status
    SYNC=$(curl -s http://localhost:8500/api/sync/status 2>/dev/null)
    if [ -n "$SYNC" ]; then
        echo "      Sync status: $SYNC" | head -c 200
        echo ""
    fi
else
    fail "Backend API not responding on :8500"
fi

# 5. Frontend
echo ""
echo "[5] Frontend..."
FE_CODE=$(curl -sk -o /dev/null -w "%{http_code}" --connect-timeout 5 http://localhost:3500 2>/dev/null)
if [ "$FE_CODE" = "200" ]; then
    pass "Frontend responding on :3500"
else
    fail "Frontend not responding on :3500 (HTTP $FE_CODE)"
fi

# 6. Database
echo ""
echo "[6] Database..."
DB_COUNT=$(docker exec soc-db psql -U soc soc_analytics -t -c "SELECT COUNT(*) FROM tickets;" 2>/dev/null | tr -d ' ')
if [ -n "$DB_COUNT" ] && [ "$DB_COUNT" -gt 0 ] 2>/dev/null; then
    pass "Database OK — $DB_COUNT tickets"
    LATEST=$(docker exec soc-db psql -U soc soc_analytics -t -c "SELECT created_time FROM tickets ORDER BY created_time DESC LIMIT 1;" 2>/dev/null | tr -d ' ')
    echo "      Latest ticket: $LATEST"
else
    fail "Database empty or not accessible"
fi

echo ""
echo "======================================"
if docker exec soc-backend python -c "import httpx; r=httpx.get('https://sdp-ioc.mtm.id:8050',verify=False,timeout=10); exit(0 if r.status_code else 1)" &>/dev/null; then
    echo -e "  ${GREEN}ALL GOOD — SDP sync will work from this PC!${NC}"
else
    echo -e "  ${RED}WARNING — SDP unreachable from backend container${NC}"
    echo -e "  ${YELLOW}Sync will fail like the VPS. Check firewall/network.${NC}"
fi
echo "======================================"
