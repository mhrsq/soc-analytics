# Implementation Plan — BitBait-Style Live Attack Map

## Objective

Redesign the current Threats page Map mode to match the BitBait attack map style — a real-time geographic visualization showing animated attack arcs flying from source countries to our SOC-monitored assets, with country heat coloring, protocol legend, and live feed.

---

## Reference: https://demo.bitbait.io/public/attack-map

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React)                          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  react-simple-maps (SVG world map)                  │    │
│  │  ├─ Country heat coloring (log-scale per volume)    │    │
│  │  ├─ Animated attack arcs (Bézier curves, 3-phase)   │    │
│  │  ├─ Impact flash animations (pulse-ring)            │    │
│  │  ├─ Source country markers (pulse dots)             │    │
│  │  └─ Target site markers (our assets)                │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌──────────┐ ┌──────────────┐ ┌─────────────────────┐     │
│  │ KPI Cards│ │ Country List │ │ Live Attack Feed    │     │
│  └──────────┘ └──────────────┘ └─────────────────────┘     │
├─────────────────────────────────────────────────────────────┤
│                    Backend (FastAPI)                         │
│  GET /api/threatmap/attack-map-data    → summary stats      │
│  GET /api/threatmap/attack-map-events  → live events        │
├─────────────────────────────────────────────────────────────┤
│                    Data Sources                              │
│  ├─ Wazuh SIEM (via SDP tickets + IP geolocation)          │
│  ├─ GeoIP database (IP → country/lat/lng)                   │
│  └─ tickets table (existing SOC data)                       │
└─────────────────────────────────────────────────────────────┘
```

---

## What You Need to Provide

### ✅ Already Available (dari SOC kita)
- Ticket data (14k+ tiket dengan IP address, customer, asset, priority, timestamps)
- Customer → site mapping (topology nodes with lat/lng)
- Attack category dari Wazuh (rule_name, rule_id)

### ❓ Perlu Disiapkan

| # | Item | Detail | Priority |
|---|------|--------|----------|
| 1 | **GeoIP Database** | Butuh MaxMind GeoLite2 atau IP2Location untuk resolusi IP → negara/kota/lat/lng. **Opsi**: (a) Download GeoLite2-City.mmdb gratis dari MaxMind (perlu registrasi), (b) Pakai API ipinfo.io (gratis 50k lookup/bulan), (c) Pakai Python `geoip2` library + offline DB | 🔴 Wajib |
| 2 | **Keputusan data source** | Tiket SOC kita bukan real-time honeypot — datanya berasal dari SIEM (Wazuh). Pilih: (a) **Replay mode**: animasikan tiket historis seolah real-time, (b) **Periodic poll**: fetch tiket terbaru setiap 5-10 detik, (c) **Wazuh direct**: connect langsung ke Wazuh API untuk alert real-time (butuh akses) | 🔴 Wajib |
| 3 | **Target site coordinates** | Lat/lng dari asset-asset yang dimonitor (sudah ada di topology_nodes). Perlu pastikan semua customer punya site coordinates | 🟡 Penting |
| 4 | **Country flag icons** | Bisa pakai CDN: `https://flagcdn.com/24x18/{code}.png` (gratis) atau bundle sendiri | 🔵 Nice-to-have |
| 5 | **Natural Earth GeoJSON** | File `countries-110m.json` (TopoJSON world map ~200KB). Bisa download dari Natural Earth atau npm `world-atlas` | 🔴 Wajib |
| 6 | **Wazuh API access** (optional) | Kalau mau real-time feed langsung dari SIEM, bukan dari SDP tickets. URL + credentials Wazuh Manager | 🟡 Optional |

---

## Implementation Phases

### Phase 1: Backend API Endpoints (1-2 hari)

#### A. GeoIP Resolution Service
```python
# services/geo_service.py
# Gunakan geoip2 + MaxMind GeoLite2-City.mmdb
# IP → { country_code, country_name, city, lat, lng }
```

#### B. Attack Map Data Endpoint
```
GET /api/threatmap/attack-map-data?range=24h&customer=CMWI

Response:
{
  "total_events": 14523,
  "total_24h": 176,
  "active_countries": 12,
  "top_source_country": "United States",
  "events_per_minute": 3.2,
  "by_country": [
    { "country_code": "US", "country_name": "United States", "count": 4521, "lat": 37.1, "lng": -95.7 },
    { "country_code": "CN", "country_name": "China", "count": 2103, "lat": 35.8, "lng": 104.1 },
    ...
  ],
  "by_protocol": [
    { "protocol": "ssh", "count": 3201 },
    { "protocol": "rdp", "count": 1500 },
    ...
  ]
}
```

**Logic**: Query tickets, geolocate `ip_address` field, aggregate by country.

#### C. Attack Map Events Endpoint
```
GET /api/threatmap/attack-map-events?limit=20&since=2026-04-22T10:00:00

Response:
{
  "items": [
    {
      "id": 206615,
      "time": "2026-04-22T10:05:29Z",
      "source_ip": "185.218.138.17",
      "source_country_code": "US",
      "source_country_name": "United States",
      "source_lat": 37.75,
      "source_lng": -97.82,
      "dest_ip": "192.168.116.44",
      "dest_asset": "wazuh-manager1-gcp-mtm-icc",
      "dest_customer": "CMWI",
      "dest_lat": -7.62,
      "dest_lng": 112.81,
      "port": "22",
      "protocol": "ssh",
      "priority": "P2 - High",
      "subject": "Fortigate attack dropped: ...",
      "validation": "False Positive"
    }
  ],
  "last_event_time": "2026-04-22T10:05:29Z"
}
```

**Logic**: Query recent tickets, geolocate source IPs, join with topology nodes for dest coords.

### Phase 2: Frontend — Map Redesign (2-3 hari)

#### A. Ganti Leaflet → react-simple-maps

```
npm install react-simple-maps topojson-client
```

**Konfigurasi**:
- Projection: Mercator, scale 147, center [10, 10]
- GeoJSON: Natural Earth 110m TopoJSON (`countries-110m.json`) → simpan di `/public/geo/`
- Zoom: 1-8x, controlled via ZoomableGroup
- Country fill: heat gradient berdasarkan attack volume (log-scale)

#### B. Attack Arc Animation System

**3-Phase Lifecycle** (30ms tick):
1. **Travel** (0-2s): Arc moves from source → target along Bézier curve
2. **Impact** (2-3s): Flash at destination, full opacity
3. **Fade** (3-5.5s): Opacity decays → removed from state

**Visual elements per arc**:
- Trail dots along Bézier curve (small circles, fading opacity)
- Animated head circle with glow (SVG filter + pulsing ring)
- Source marker pulse at origin country
- Impact flash ring at destination (CSS `pulse-ring` animation)
- Color per protocol: SSH=red, HTTP=orange, RDP=blue, etc.

**State management**: Max 50 active arcs, 20 impact flashes. New events from polling → create arcs (max 8 per poll, staggered with random 0-400ms delay).

#### C. UI Components (BitBait-style)

```
┌───────────────────────────────────────────────────────┐
│ 🛡️ Live Attack Map            🔴 Live  ·  3s ago  ⟳ │
│ Real-time SOC attack visualization                    │
├──────┬──────┬──────┬──────────────────────────────────┤
│ 176  │  12  │  US  │  3.2/min                        │
│Events│Ctry  │ Top  │  Rate                            │
├──────┴──────┴──────┴──────────────────────────────────┤
│                                                       │
│            🌍 SVG World Map                           │
│       (country heat + attack arcs)                    │
│                                                       │
│  [Zoom+] [Zoom-] [Reset]                            │
│  ┌─ Threat ─────┐  ┌─ Protocol ─────────────┐       │
│  │ Low ▇▇▇ High │  │ SSH  HTTP  RDP  Other  │       │
│  └──────────────┘  └────────────────────────┘       │
├────────────────────┬──────────────────────────────────┤
│ Top Attacking      │ Live Attack Feed                 │
│ Countries          │                                  │
│                    │ 🇺🇸 185.218.138.17 → :22 ssh  3s │
│ 1. 🇺🇸 US  4,521  │ 🇧🇬 93.123.109.245 → :3389 rdp 5s│
│ 2. 🇨🇳 CN  2,103  │ 🇷🇴 80.94.95.88 → :3389 rdp  6s │
│ 3. 🇷🇺 RU  1,890  │ 🇨🇦 195.178.110.98 → :22 ssh  8s│
│ 4. 🇩🇪 DE  1,200  │ ...                              │
│ 5. 🇳🇱 NL    890  │                                  │
└────────────────────┴──────────────────────────────────┘
```

### Phase 3: Styling & Animations (1 hari)

- Dark theme (sesuai design guide kita: #0a0a0c bg, #141418 surfaces)
- CSS keyframes: pulse-ring, glow-pulse, fade-in, radar-sweep
- SVG glow filter untuk attack arc heads
- Protocol-specific colors (diambil dari BitBait):
  ```
  SSH = #ef4444 (red)
  HTTP = #f97316 (orange) 
  RDP = #3b82f6 (blue)
  Telnet = #eab308 (amber)
  FTP = #8b5cf6 (purple)
  SMB = #a855f7 (violet)
  DNS = #22c55e (green)
  SIP = #ec4899 (pink)
  Other = #06b6d4 (cyan)
  ```

### Phase 4: Integration & Polish (1 hari)

- Customer filter → only show attacks for selected customer
- Integrate with Graph mode toggle (keep existing topology editor)
- Click country → filter feed by that country
- Click arc → show ticket detail modal
- Mobile responsive layout

---

## Data Flow

```
Ticket Created in SDP
       ↓
   Synced to DB (every 3min)
       ↓
   GeoIP Resolve (ip_address → country/lat/lng)
       ↓ 
   Stored in tickets table (+ geo fields)
       ↓
   Frontend polls /attack-map-events (every 2-5s)
       ↓
   New events → Create animated arcs on map
       ↓
   Arc lifecycle: travel → impact → fade → remove
```

---

## Database Changes

```sql
-- Add geo columns to tickets table
ALTER TABLE tickets ADD COLUMN source_country_code VARCHAR(3);
ALTER TABLE tickets ADD COLUMN source_country_name VARCHAR(100);
ALTER TABLE tickets ADD COLUMN source_lat FLOAT;
ALTER TABLE tickets ADD COLUMN source_lng FLOAT;

-- Index for fast geo queries
CREATE INDEX idx_tickets_source_country ON tickets(source_country_code);
```

**Geolocation**: Run batch on existing tickets + enrich during sync for new tickets.

---

## NPM Packages Required

```json
{
  "react-simple-maps": "^3.0.0",
  "topojson-client": "^3.1.0"
}
```

**Backend Python**:
```
geoip2==4.8.0     # MaxMind GeoIP2 library
```

**Static assets**:
- `/public/geo/countries-110m.json` (Natural Earth TopoJSON, ~200KB)
- `/public/geo/GeoLite2-City.mmdb` (MaxMind database, ~70MB) — atau pakai server-side resolution

---

## Estimated Timeline

| Phase | Task | Duration |
|-------|------|----------|
| 0 | Setup GeoIP + database migration | 0.5 hari |
| 1 | Backend API endpoints (data + events) | 1 hari |
| 2 | Frontend map redesign (react-simple-maps + arcs) | 2-3 hari |
| 3 | Styling, animations, polish | 1 hari |
| 4 | Integration + testing | 0.5 hari |
| **Total** | | **5-6 hari** |

---

## Comparison: Current vs BitBait-Style

| Feature | Current | After |
|---------|---------|-------|
| Map library | Leaflet (tile-based) | react-simple-maps (SVG) |
| Country heat | ❌ None | ✅ Log-scale heat gradient |
| Attack arcs | ❌ None (only dots) | ✅ Animated Bézier arcs with 3-phase lifecycle |
| Protocol colors | ❌ None | ✅ 9 protocol-specific colors |
| Country ranking | ❌ None | ✅ Top countries with flags + progress bars |
| LIVE indicator | ❌ None | ✅ Red pulse dot + "Xs ago" |
| KPI cards | ❌ None | ✅ 4 cards: Total, Countries, Top Source, Rate |
| Zoom controls | ❌ None | ✅ Zoom in/out/reset |
| Impact flash | ❌ None | ✅ Pulse-ring animation at destination |
| Source pulse | ❌ None | ✅ Pulsing circles at attack origin |
| Dark theme | ✅ Already dark | ✅ Keep dark theme |
| Graph mode | ✅ ReactFlow topology | ✅ Keep as separate mode |
| Replay | ✅ Historical replay | ✅ Keep (works even better with arcs) |

---

## Decision Points for You

1. **GeoIP provider**: MaxMind GeoLite2 (free, download, offline) vs ipinfo.io API (free tier 50k/month)?
   - Recommend: MaxMind GeoLite2 offline DB for speed

2. **Data freshness**: 
   - (a) Replay SDP tickets as "real-time" (setiap 5 detik fetch tiket terbaru)
   - (b) Direct Wazuh API connection for actual real-time alerts
   - Recommend: Option (a) dulu, Wazuh direct later

3. **Keep Leaflet for detailed site zoom?** 
   - react-simple-maps bagus untuk world view tapi tidak bisa zoom ke street-level
   - Bisa hybrid: BitBait view untuk Map, keep Leaflet hidden for detailed site view
   - Recommend: Full replace to react-simple-maps, sites cukup dari topology Graph mode

4. **Keep existing Replay feature?**
   - Recommend: Yes, replay works even better with animated arcs
