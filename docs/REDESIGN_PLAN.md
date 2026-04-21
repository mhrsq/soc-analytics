# SOC Dashboard UI Redesign Plan

## Design Direction

**Reference**: Linear, Vercel Dashboard, GitHub Dark, Datadog Console, Stripe
**Aesthetic**: Grown-up dark — monochrome-heavy, selective color, information-dense, operationally authentic

---

## Phase 1: Design Foundation (Theme + Typography + Color)

### 1.1 Color System Overhaul

**Current**: 7 `cyber-*` colors (green, blue, red, orange, yellow, purple, teal) used freely across UI
**Target**: Grayscale dominant + 2 signal colors

```
Base Palette (gray scale):
  --bg-primary:     #0a0a0b       (page background)
  --bg-secondary:   #121214       (card/surface background)
  --bg-tertiary:    #1a1a1f       (raised surface, hover states)
  --border-primary: #2a2a2e       (default borders)
  --border-subtle:  #1f1f23       (subtle dividers)

Text:
  --text-primary:   #e8e8ea       (headings, values)
  --text-secondary: #a0a0a8       (labels, descriptions)
  --text-muted:     #5a5a64       (hints, disabled, timestamps)

Signal Colors (ONLY when semantically meaningful):
  --signal-red:     #ef4444       (critical alerts, breaches, errors)
  --signal-amber:   #f59e0b       (warnings, degraded, attention)
  --signal-green:   #22c55e       (healthy, resolved — SPARINGLY)

Accent:
  --accent:         #3b82f6       (interactive elements, links, active states)
  --accent-muted:   rgba(59,130,246,0.12)  (hover backgrounds)
```

**Files to change**:
- `frontend/src/contexts/ThemeContext.tsx` — replace all presets with new palette
- `frontend/tailwind.config.js` — replace `cyber` colors with `signal` colors
- `frontend/src/index.css` — update utility classes, remove `.text-glow-*`

### 1.2 Typography

**Current**: Lato (sans), JetBrains Mono (mono) — Lato used everywhere including headings
**Target**: 

```
Body/Heading:  Inter (already available, widely cached)
Monospace:     JetBrains Mono — ONLY for:
               - Ticket IDs
               - IP addresses
               - Timestamps in tables
               - Hash values
               - Numeric KPI values
```

**Rules**:
- NO monospace on headings like "THREAT MAP", "TOPOLOGY EDITOR"
- Headings: Inter 500-600 weight, normal case (not ALL CAPS unless abbreviation)
- Body: Inter 400, 13-14px
- Labels/captions: Inter 400, 11-12px, `--text-muted`

**Files to change**:
- `frontend/tailwind.config.js` — `fontFamily.sans: ["Inter", ...]`
- `frontend/index.html` — add Google Fonts `<link>` for Inter
- All components using `font-mono` on headings → remove

### 1.3 Icon Treatment

**Current**: Filled icons inside colored rounded backgrounds (e.g., KPI cards)
**Target**: 
- Lucide icons at 1.5px stroke weight (default), `--text-muted` color
- NO background circles/squares behind icons
- Icon size: 16px in body, 14px in compact areas, 18px in headers

**Files to change**:
- `frontend/src/components/KPICards.tsx` — remove icon bg wrappers

---

## Phase 2: Dashboard Layout — KPI Strip + Operational Metadata

### 2.1 Compact KPI Strip

**Current**: 6 large KPI cards in a 3×2 grid, each ~120×100px with icon, label, animated value
**Target**: Single horizontal strip, inline metrics

```
Layout concept (single row):
┌─────────────────────────────────────────────────────────────────────────┐
│  49 tickets  ·  0 open  ·  2.0% TP  ·  98.0% FP  ·  48m MTTD  ·  97.8% SLA │
│  ▂▃▅▇▅▃▂     ────      ▁▁▁▁▁▁▂     ▇▇▇▇▇▇▅     ▃▅▃▅▃▅▃      ▇▇▇▇▇▇▇     │
└─────────────────────────────────────────────────────────────────────────┘

Each metric:
- Value (large, font-mono tabular-nums)
- Label (small, --text-muted, below value)
- Sparkline (tiny 7-day trend, 40×16px, below label)
- Color: grayscale by default, signal-red/amber ONLY if threshold breached
```

**Sparkline data**: Backend already has `/api/metrics/volume` returning daily data — can derive 7-day sparklines from existing endpoints.

**Click behavior**: Clicking a KPI opens drill-down modal (existing `KPIDetailModal`)

**Files to change**:
- `frontend/src/components/KPICards.tsx` — full rewrite to strip layout
- `frontend/src/contexts/DashboardContext.tsx` — KPI widget config (smaller h value)

### 2.2 Operational Metadata Bar

**New component** — a subtle bar below the filter bar showing real-time ops context:

```
Layout concept:
┌──────────────────────────────────────────────────────────────────────┐
│ ● Synced 23s ago · 14,832 tickets  │  Queue: 3 >30min unassigned  │ │
│ On-shift: Jeffri, Ramadhanty       │  Next handover: 08:00 WIB    │ │
└──────────────────────────────────────────────────────────────────────┘
```

**Data sources**:
- Last sync: existing `GET /api/sync/status` → `last_sync` timestamp
- Ticket count: existing `total_in_db`
- Queue backlog: NEW — need backend endpoint or derive from tickets with status=Open and age > 30min
- On-shift analysts: NEW — could be config-based or derive from recent ticket activity
- Next handover: static config or backend setting

**Complexity note**: Queue backlog needs a new lightweight query. On-shift can start as a simple "most recently active analysts" list.

**Files to create**:
- `frontend/src/components/OpsMetaBar.tsx` — new component
- Backend: add queue backlog data to `/api/sync/status` or new endpoint

### 2.3 Filter Bar Simplification

**Current**: Complex multi-section bar with time dropdown, customer select, asset multi-select, auto-refresh, profile selector, edit button
**Target**: Cleaner, more compact — single-line

```
[24h ▾]  [All Customers ▾]  [All Assets ▾]          [Default ▾] [✏ Edit]
```

- Remove auto-refresh toggle from filter bar (move to settings or always-on)
- Profile selector becomes a simple dropdown, no floating menu
- Consistent dropdown styling (all use same component pattern)

**Files to change**:
- `frontend/src/components/FilterBar.tsx` — restyle
- `frontend/src/components/AutoRefreshControl.tsx` — move or hide

---

## Phase 3: Chart Restyling + Header Cleanup

### 3.1 Chart Color Scheme

All charts switch to grayscale-primary palette:

```
Chart palette:
  Primary data:    #e8e8ea (white-ish, main bar/line)
  Secondary data:  #5a5a64 (muted gray, comparison/secondary series)
  Grid lines:      #1f1f23 (very subtle)
  Axis labels:     #5a5a64
  Tooltip bg:      #1a1a1f with #2a2a2e border

Signal colors ONLY for:
  - TP bars: --signal-green
  - FP bars: --signal-amber
  - Critical priority: --signal-red
  - SLA breach: --signal-red
```

**Files to change**:
- `frontend/src/hooks/useChartColors.ts` — update color constants
- `frontend/src/components/ValidationDonut.tsx` — update COLORS map
- `frontend/src/components/PriorityChart.tsx` — update PRIORITY_COLORS
- `frontend/src/components/VolumeTrendChart.tsx` — area/line colors
- `frontend/src/components/CustomerChart.tsx` — bar colors
- `frontend/src/components/MttdChart.tsx` — line color

### 3.2 Header Cleanup

**Current**: Logo + tabs | clock + wifi + SDP + sync + bell + LLM + theme + user + logout
**Target**: Reduce cognitive load

```
New header layout:
[Logo SOC Analytics]  [Dashboard] [Manager] [Threat Map] [Topology] [Users]
                                              [clock]  [🔔 2]  [⚙]  [admin ▾]

Settings flyout (⚙): contains LLM, Theme, Sync Status
User flyout (admin ▾): Profile, Logout
```

- Merge LLM + Theme + Sync into single Settings gear icon
- Remove standalone connection status dots (move into Sync panel)
- Notification bell keeps count badge
- User dropdown instead of separate name + logout button

**Files to change**:
- `frontend/src/App.tsx` — header restructure

### 3.3 Remove SLA Gauge Widget

**Current**: Full widget showing a circular SVG gauge for SLA %
**Target**: Remove as standalone widget. SLA is already in the KPI strip with sparkline. If detailed SLA view needed, it goes into KPI drill-down modal.

**Files to change**:
- `frontend/src/contexts/DashboardContext.tsx` — remove `mttd` widget from defaults

---

## Phase 4: Manager View → Workload Balance

### 4.1 Workload Table

**Current**: Leaderboard with composite scores, spider charts, score cards — competitive framing
**Target**: Operational workload balance view

```
Layout concept:
┌──────────────────────────────────────────────────────────────────┐
│ Analyst          │ Assigned │ Resolved │ Open │ Workload         │
├──────────────────┼──────────┼──────────┼──────┼──────────────────┤
│ Jeffri W.        │ 31       │ 31       │ 0    │ ████████████ 62% │
│ Atalarik S.      │ 14       │ 14       │ 0    │ █████░░░░░░░ 28% │
│ Ramadhanty S.    │ 3        │ 3        │ 0    │ ██░░░░░░░░░░  6% │
│ Ilham A.         │ 1        │ 1        │ 0    │ █░░░░░░░░░░░  2% │
└──────────────────────────────────────────────────────────────────┘

Flags:
  🔴 Overloaded (>40% of team volume)
  🟡 Imbalanced (>2x average)
  ⚪ Underutilized (<10% of team volume)
```

**Additional metrics per analyst** (expandable row):
- Avg MTTD, Avg MTTR, SLA %, TP rate
- Trend sparkline (last 4 weeks)

**Files to change**:
- `frontend/src/pages/ManagerView.tsx` — major rewrite
- `frontend/src/components/AnalystLeaderboard.tsx` — repurpose or replace
- Remove/deprecate: `AnalystScoreCard.tsx`, `AnalystSpiderChart.tsx`

---

## Phase 5: Polish & Details

### 5.1 Card Styling

```css
Cards:
  background: var(--bg-secondary)    /* #121214 */
  border: 1px solid var(--border-primary)  /* #2a2a2e */
  border-radius: 8px                 /* rounded-lg, not rounded-xl */
  padding: 16px
  NO box-shadow (flat design)
```

### 5.2 Table Styling

```
Tables (analyst, top alerts, tickets):
  Header: uppercase 10px tracking-wider --text-muted, no background
  Rows: subtle --border-subtle bottom border, no alternating bg
  Hover: --bg-tertiary background
  Values: font-mono for numbers, regular for text
```

### 5.3 Remove/Update

- Remove footer ("© 2026 MTM MSSP · SOC Analytics Dashboard") — wastes space
- Remove `stagger-children` animation on KPI cards (strip loads instantly)
- Remove all `.text-glow-*` utilities
- Remove `bg-grid-pattern` background utility

---

## File Change Summary

| Phase | Files Changed | New Files | Complexity |
|-------|--------------|-----------|------------|
| P1: Foundation | ThemeContext, tailwind.config, index.css, index.html | — | Medium |
| P2: KPI + Ops | KPICards.tsx, DashboardContext, FilterBar.tsx | OpsMetaBar.tsx | High |
| P3: Charts + Header | 6 chart components, App.tsx, useChartColors.ts | — | Medium |
| P4: Manager | ManagerView.tsx, AnalystLeaderboard.tsx | — | High |
| P5: Polish | Card.tsx, various components | — | Low |

**Total estimated files**: ~20 files modified, 1-2 new files

---

## Migration Strategy

1. **Theme first** — change CSS variables and color palette. Everything shifts at once.
2. **Component by component** — update each component to use new color tokens.
3. **No big-bang** — each phase is independently testable and committable.
4. **Preserve functionality** — no backend changes in Phases 1-5 (except optional ops metadata endpoint).
5. **localStorage compat** — saved dashboard profiles reference widget IDs, not styles. Profiles survive redesign.

---

## What Stays the Same

- React-grid-layout widget system (drag, resize, profiles)
- All backend APIs (no endpoint changes needed for Phases 1-5)
- Authentication flow (login page, JWT)
- Dashboard profile system (localStorage persistence)
- Threat Map (full-screen map, separate from grid)
- Topology Editor (React Flow, separate from grid)
- AI Insights panel (standalone, below grid)
