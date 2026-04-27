# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SOC Analytics Dashboard — a full-stack web application that syncs ticket data from ManageEngine ServiceDesk Plus (SDP) and presents SOC analyst performance metrics, threat maps, and AI-powered insights. The product is scoped to a specific SOC team and uses Bahasa Indonesia in AI prompts and some UI labels.

## Commands

### Full stack (primary)
```bash
docker compose up           # Start all services
docker compose up -d        # Detached
docker compose build backend && docker compose up -d  # After backend changes
docker compose build frontend && docker compose up -d # After frontend changes
```

**Service ports:**
- App (nginx): http://localhost:80
- Backend API: http://localhost:8500
- Frontend dev: http://localhost:3500
- PostgreSQL: localhost:5433
- Redis: localhost:6380

### Frontend standalone
```bash
cd frontend
npm install
npm run dev      # Vite dev server on :3000
npm run build
```

### Backend standalone
```bash
source .venv/Scripts/activate   # Windows/WSL path
cd backend
uvicorn app.main:app --reload --port 8000
```

### TypeScript type-checking
```bash
cd frontend && npx tsc --noEmit
```

There are no automated tests. Manual test plans live in `docs/test-*.md`.

## Architecture

### Request flow
1. Nginx (port 80) serves static `nginx/html/login.html` at `/login` and proxies `/api/*` → `backend:8000`, everything else → `frontend:3000`
2. JWT token stored in `localStorage` as `soc_token`; `AuthMiddleware` in `backend/app/main.py` enforces auth on all `/api/*` routes except `/api/health` and `/api/auth/login`
3. RBAC roles: `superadmin`, `admin`, `viewer`, `customer`. Customer-scoped users are auto-filtered in every endpoint via `request.state.user_customer`

### Data sync pipeline
- `SDPClient` (`backend/app/services/sdp_client.py`) calls ManageEngine SDP REST API v3 with `verify=False` (self-signed cert on-prem)
- `SyncService` runs three `asyncio.create_task()` background loops at startup:
  - Incremental sync every `SYNC_INTERVAL_MINUTES` (default 3) — fetches new IDs + re-syncs open tickets
  - Full re-sync daily at midnight WIB (17:00 UTC)
  - Analyst performance snapshots every Sunday 01:00 WIB
- After every sync, three materialized views are refreshed: `mv_daily_metrics`, `mv_customer_daily`, `mv_analyst_daily`
- Use these materialized views for dashboard aggregates — don't query `tickets` directly when a view covers it

### Database schema management
- **No Alembic migrations.** Schema is defined in `backend/db/init.sql` (used when the `db` container starts fresh)
- Schema changes must be applied to `init.sql` AND manually to any running database

### AI / LLM
- `AIService` (`backend/app/services/ai_service.py`) supports Anthropic (native SDK) and OpenAI-compatible providers (xAI, Google, OpenAI via httpx)
- Providers are stored in the `llm_providers` DB table and managed from the Settings panel UI — `CLAUDE_API_KEY` env var is a legacy fallback only
- Chat history stored in `chat_messages` table (max 20-message context window)
- AI prompts and structured output sections are in Bahasa Indonesia

### Analyst scoring
- `AnalystScoringService` computes 7 weighted dimensions (weights must sum to 1.0): speed=0.20, SLA=0.20, detection=0.15, accuracy=0.15, volume=0.15, throughput=0.10, complexity=0.05
- Tiers: S(90+), A(75+), B(60+), C(40+), D(<40); minimum 5 tickets required for scoring

### Threat map
- `geo_service.py` geolocates IPs via external API, cached in Redis (7-day TTL); private IPs are skipped
- Wazuh integration via `wazuh_client.py` queries Wazuh Indexer (Elasticsearch API) for real-time attack data
- Topology editor persists ReactFlow canvas to `topology_nodes` / `topology_links` tables

## Key Conventions

**Type mirroring:** `frontend/src/types.ts` and `backend/app/schemas.py` define the same structures. Keep them in sync when adding or changing fields.

**API client:** All frontend API calls must go through `frontend/src/api/client.ts`. Never use `fetch` directly in components.

**Theme system:** Use CSS custom properties (`var(--theme-*)`) set by `ThemeContext` for all colors. Do not hardcode color values in components. Tailwind tokens (`surface/*`, `signal/*`) map to these variables.

**Dashboard profiles:** Widget layouts are cached in `localStorage` and synced to `/api/dashboard/profiles` automatically by `DashboardContext`. Do not manage this persistence manually in components.

**Background tasks:** Use plain `asyncio.create_task()` — APScheduler is installed but not used in the main flow.

## Environment Variables

Required in `.env` (see `.env.example`):

| Variable | Description |
|---|---|
| `SDP_BASE_URL` | ManageEngine SDP URL |
| `SDP_API_KEY` | SDP REST API token |
| `JWT_SECRET` | Generate with `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `WAZUH_INDEXER_URL` / `_USER` / `_PASS` | Wazuh Indexer connection |
| `DB_PASSWORD` | PostgreSQL password (default: `soc_s3cur3_pwd`) |
| `SYNC_INTERVAL_MINUTES` | Incremental sync frequency (default: `3`) |

LLM API keys are managed in the DB via the Settings UI, not in `.env`.

## Default Seed Users

| Username | Password | Role |
|---|---|---|
| `admin` | `mtmn1f4rr0` | `superadmin` |
| `cmwi` | `cmwi2026` | `customer` (scoped to "CMWI") |
