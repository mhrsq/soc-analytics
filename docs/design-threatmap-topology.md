# Threat Map & Topology Redesign Plan

## Executive Summary

Both features are currently broken or unusable for real SOC operations:
- **Threat Map**: Shows empty map for private-IP environments (which is 100% of internal SOC data). No attack visualization unless topology nodes have manually-entered coordinates.
- **Topology Editor**: React Flow based drag-and-drop, but hard to use — no bulk operations, no map-based coordinate picker, no visual feedback on errors.

This plan proposes a **complete redesign** that merges both into a unified, animated visualization.

---

## Current Problems

### Threat Map
| Problem | Impact |
|---------|--------|
| 500 attacks shown as "500 internal" — zero arcs on map | **Feature appears broken** |
| Requires topology nodes with lat/lng for target locations | Chicken-and-egg: need topology before map works |
| No AssetLocation/SiemLocation markers rendered | Backend has data, frontend ignores it |
| Map center hardcoded to Indonesia, no auto-fit | Bad for non-Indonesia deployments |
| Replay feature untested, labels overlap | Minor |
| Manual clustering (0.5° grid) is crude | Inaccurate grouping |

### Topology Editor
| Problem | Impact |
|---------|--------|
| Hard to set coordinates — manual lat/lng input | Users don't know coordinates of their servers |
| No map picker for placing nodes | Unintuitive |
| No undo/delete confirmation | Data loss risk |
| No visual preview of how topology affects threat map | No feedback loop |
| Links default to "lan", must edit afterwards | Extra clicks |
| No error toasts — failures silent | Confusing |

---

## Proposed Solution: Unified "Threats & Infrastructure" View

### Concept
Instead of two separate pages, merge into **one view with two modes**:

```
┌─────────────────────────────────────────────────────────────────┐
│ Threats & Infrastructure    [🗺 Map Mode] [🔗 Graph Mode]       │
│                                                                 │
│ ┌───────────────────────────────────────────────────────────┐   │
│ │                                                           │   │
│ │              INTERACTIVE MAP                              │   │
│ │                                                           │   │
│ │    🏢 MTM HQ          ═══════════    🏢 CMWI Office      │   │
│ │    Jakarta             VPN           Karawang             │   │
│ │    ├── SIEM ●                        ├── AD Server ●      │   │
│ │    ├── Wazuh ●         ←── 🔴 ──     ├── Syslog ●        │   │
│ │    └── Dashboard ●     attack arc    └── ERP ●            │   │
│ │                                                           │   │
│ │    💥 3 attacks from 103.28.x.x (Jakarta)                │   │
│ │    💥 1 attack from 185.220.x.x (TOR exit node)          │   │
│ │                                                           │   │
│ └───────────────────────────────────────────────────────────┘   │
│                                                                 │
│ ┌─ Attack Feed (real-time) ─────────────────────────────────┐   │
│ │ 14:23:01  P2-High  Rule 100021  → AD_Server CMWI  [FP]   │   │
│ │ 14:22:58  P1-Crit  Rule 200134  → ERP MTM-IT      [TP]   │   │
│ │ 14:22:45  P3-Med   Rule 100021  → Syslog CMWI     [FP]   │   │
│ └───────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Two Modes

#### 🗺 Map Mode (Geographic)
- Full-screen Leaflet/MapLibre map with dark tiles
- **Site markers**: Each customer site as a cluster point (e.g., "MTM HQ Jakarta", "CMWI Karawang")
- **Attack arcs**: Animated dashed lines from source → target
  - **Public IP attacks**: Arc from geolocated source to target site
  - **Private IP attacks**: Pulsing ring animation at the target site (shows attack happening internally)
- **Live attack feed**: Scrolling ticker at bottom showing recent attacks in real-time
- **Site detail panel**: Click a site → slide panel showing all assets, recent attacks, SLA for that site
- **Auto-fit bounds**: Map zooms to fit all sites + attack sources

#### 🔗 Graph Mode (Network Topology)
- React Flow graph view showing network relationships
- **Same nodes** as map mode but in graph layout (force-directed or manual)
- **Attack animations on edges**: When an attack flows through a link, the edge pulses red
- **Node status indicators**: Green (healthy), Amber (under attack), Red (SLA breach)
- **Drag-and-drop**: Rearrange layout, save positions
- **Click node** → same detail panel as map mode

### Key Design Principles

1. **Private IPs must work**: Internal attacks show as pulsing rings at target site, not empty map
2. **Sites replace individual nodes**: Group assets by customer/location into "sites" (clusters)
3. **Animation is key**: Attack arcs animate in real-time, not static lines
4. **Attack feed at bottom**: Always-visible scrolling log of recent attacks — shows the map is "alive"
5. **One infrastructure config**: Editing a site/node in graph mode updates the map mode and vice versa

---

## Data Architecture Changes

### New Concept: "Sites"
Instead of individual topology nodes with lat/lng, introduce **Sites** — logical groupings of assets:

```sql
-- Sites table (replaces manual lat/lng per topology node)
CREATE TABLE sites (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(200) NOT NULL,     -- "MTM HQ Jakarta"
    customer    VARCHAR(200),              -- "IT-IS-MTM"
    lat         DOUBLE PRECISION NOT NULL,
    lng         DOUBLE PRECISION NOT NULL,
    site_type   VARCHAR(50) DEFAULT 'office',  -- office, datacenter, cloud, remote
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Asset → Site mapping**: Each topology node gets a `site_id` foreign key. Multiple assets at same physical location share one site marker on the map.

### Attack Rendering Logic (Fixed)

```
For each attack ticket:
1. Source IP → geolocate
   - Public IP → lat/lng from ip-api.com ✅
   - Private IP → mark as "internal" → use target site location
   
2. Target → find site for this ticket's customer + asset_name
   - Match topology_node by hostname → get site_id → get site lat/lng
   - Fallback: first site for this customer
   - Final fallback: use "Unknown" placeholder site
   
3. Render:
   - Public source: animated arc from source geo → target site
   - Private source: pulsing ring at target site (internal attack indicator)
   - No source at all: pulse at target site
```

### Backend Endpoint Changes

```
GET /api/threatmap/attacks    — existing, add site_id to response
GET /api/threatmap/sites      — new, list all sites with asset counts  
POST /api/threatmap/sites     — new, create/update a site
DELETE /api/threatmap/sites/:id — new, delete a site
GET /api/threatmap/feed       — new, real-time recent attacks (last 50, SSE or polling)
```

---

## UI Components

### Shared: Infrastructure Detail Panel
When clicking a site/node, a slide-over panel shows:
```
┌─────────────────────────────┐
│ 🏢 CMWI Karawang            │
│ Customer: CMWI               │
│ Lat: -6.32, Lng: 107.33     │
│                              │
│ ASSETS (4)                   │
│ ● AD_Server_Primary    [🟢] │
│ ● AD_Server_Secondary  [🟢] │
│ ● Syslog              [🟡] │
│ ● FW-CMWI-HO-M290     [🟢] │
│                              │
│ RECENT ATTACKS (24h)         │
│ 12 attacks · 0 TP · 12 FP   │
│ Top rule: Rule 100021 (10x)  │
│                              │
│ SLA: 100% ✅                 │
└─────────────────────────────┘
```

### Map Mode Components
```
ThreatMapRedesign
├── MapCanvas           — Leaflet dark map
│   ├── SiteMarker      — Cluster dot per site (size = attack count)
│   ├── AttackArc       — Animated bezier from source → target
│   ├── InternalPulse   — Pulsing ring for private IP attacks
│   └── AttackLabel     — Floating label on arc (rule, priority)
├── AttackFeed          — Bottom ticker (last 50 attacks, auto-scroll)
├── SiteDetailPanel     — Right slide-over on click
└── MapControls         — Customer filter, time range, fit bounds
```

### Graph Mode Components
```
TopologyRedesign
├── ReactFlowCanvas     — Force-directed or manual layout
│   ├── SiteNode        — Grouped node showing site name + asset icons
│   ├── AssetNode       — Individual asset within site expansion
│   └── LinkEdge        — Connection with type badge + bandwidth
├── AttackOverlay       — Red pulse on edges/nodes under attack
├── SiteDetailPanel     — Same shared panel
└── GraphControls       — Add site, add link, auto-layout, save
```

---

## Animation Specifications

### Attack Arc Animation
- **Duration**: 2-3 seconds per arc
- **Style**: Dashed line with moving dash offset (CSS `stroke-dashoffset` animation)
- **Color**: Priority-based (P1=red, P2=amber, P3=gray)
- **Opacity**: Starts at 0, fades to 0.8, holds 2s, fades to 0 (lifecycle: appear → display → fade)
- **Simultaneous**: Up to 20 arcs visible at once, older ones fade out

### Internal Attack Pulse
- **Style**: Concentric rings expanding outward from site marker
- **Color**: Priority-based, starts opaque, fades as ring expands
- **Duration**: 1.5 seconds per pulse, 3 pulses per attack event
- **Size**: Ring expands from site marker radius to 3× radius

### Live Feed Ticker
- **Auto-scroll**: New attacks slide in from bottom, push older up
- **Highlight**: New entries flash briefly (200ms amber background)
- **Compact format**: `HH:MM:SS  P2  Rule 100021  →  AD_Server CMWI  [FP]`
- **Click**: Clicking an entry highlights that arc/site on the map

---

## Implementation Phases

### Phase 1: Backend Foundation
- Create `sites` table + model
- New endpoints for site CRUD
- Update attack endpoint to include site data
- Fix private IP rendering (pulsing instead of arc)

### Phase 2: Map Mode Redesign
- Rewrite ThreatMapView with site markers
- Internal attack pulse animation (CSS keyframes)
- Public attack arc animation (Leaflet polyline)
- Attack feed ticker
- Auto-fit bounds
- Site detail panel

### Phase 3: Graph Mode Redesign
- Rewrite TopologyEditor with site-based grouping
- Map picker for site coordinates (click on mini-map to set lat/lng)
- Attack overlay (pulse on nodes under attack)
- Auto-layout option
- Error toasts
- Undo/redo for delete operations

### Phase 4: Polish
- Smooth transitions between map/graph modes
- Keyboard shortcuts
- Export topology as image
- Performance optimization (limit visible arcs, cluster at zoom levels)

---

## What Gets Deleted

| Component | Action |
|-----------|--------|
| Current ThreatMapView.tsx (516 lines) | **Full rewrite** |
| Current TopologyEditor.tsx (660 lines) | **Full rewrite** |
| `asset_locations` table | **Keep** (migrate to sites) |
| `siem_locations` table | **Keep** (migrate to sites) |
| `topology_nodes` table | **Keep** (add site_id FK) |
| `topology_links` table | **Keep** as-is |

---

## Design Reference

- **Visual style**: Follow design-guide.html — monochrome map, red/amber signal colors only for attacks
- **Map tiles**: CartoDB dark (current) or MapTiler dark — very desaturated
- **Font on map**: IBM Plex Mono for coordinates/IPs, IBM Plex Sans for labels
- **Animation library**: CSS animations for pulses, SVG stroke-dashoffset for arcs — no heavy JS animation libs needed
