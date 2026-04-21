# Test Plan — Main Dashboard

**Module:** Main Dashboard  
**URL:** `http://<host>/` → Tab "Main Dashboard"  
**Last Updated:** 2026-04-21  

---

## 1. Page Load & Initial State

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 1.1 | Page loads without error | Login → click "Main Dashboard" tab | Dashboard renders with all default widgets, no console errors | ☐ |
| 1.2 | Default time range | Observe filter bar | "Last 24 hours" preset is selected by default | ☐ |
| 1.3 | KPI strip renders | Observe Overview widget | 6 KPI cards visible: Total Tickets, Open, True Positive %, False Positive %, Avg MTTD, SLA Compliance | ☐ |
| 1.4 | All default widgets present | Scroll through dashboard | 8 widgets visible: Overview, Ticket Volume, Alert Quality, Priority Distribution, Tickets by Customer, Top Alert Rules, Analyst Performance, SLA Achievement | ☐ |
| 1.5 | Loading spinners | Hard-refresh page (Ctrl+Shift+R) | Each widget shows spinner while loading, then renders data | ☐ |
| 1.6 | Sync banner on empty DB | Deploy fresh instance with no data | Yellow banner shows "Database Empty — Initial Sync Required" | ☐ |
| 1.7 | AI Insights panel | Scroll below grid | "AI Insights" section visible with "Generate Insights" button | ☐ |

---

## 2. Filter Bar

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 2.1 | Time range presets | Click time range dropdown → select "Last 7 days" | All widgets refresh with 7-day data, dropdown label updates | ☐ |
| 2.2 | Custom date range | Click time range → "Custom Range" → enter start/end dates → Apply | Widgets reload with custom date range, label shows date range | ☐ |
| 2.3 | Customer filter | Select a customer from dropdown (e.g. "CMWI") | All widgets filter to show only CMWI data, asset dropdown updates | ☐ |
| 2.4 | Customer reset | Select "All Customers" | Data resets to all customers, asset dropdown resets | ☐ |
| 2.5 | Asset hostname filter | Click "All Assets" → search for asset → check one or more | Widgets filter to selected assets only | ☐ |
| 2.6 | Asset clear | Click X on asset filter | Assets reset to "All Assets" | ☐ |
| 2.7 | Combined filters | Set customer = "CMWI" + time range = "Last 30 days" | Data shows CMWI for last 30 days | ☐ |
| 2.8 | Empty data state | Set date range to a future date (e.g. 2027-01-01) | Widgets show "No data available" or empty state | ☐ |

---

## 3. Auto-Refresh

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 3.1 | Enable auto-refresh | Click "Auto Refresh" → select "30s" | Countdown timer appears, data refreshes every 30s | ☐ |
| 3.2 | Countdown display | Watch countdown | Timer counts down, shows spinning icon during refresh | ☐ |
| 3.3 | Custom interval | Select "Custom" → type "15" → unit "s" | Auto-refresh runs every 15 seconds | ☐ |
| 3.4 | Disable auto-refresh | Select "Off" | Countdown disappears, no more auto-refresh | ☐ |
| 3.5 | Persistence | Enable 30s → refresh page | Auto-refresh restored from localStorage | ☐ |
| 3.6 | Min/max clamp | Try custom "1s" | Clamped to minimum 5s | ☐ |

---

## 4. KPI Cards

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 4.1 | KPI values correct | Compare with API response `/api/metrics/summary` | Total Tickets, Open, TP%, FP%, MTTD, SLA% match API | ☐ |
| 4.2 | KPI card click | Click "Total Tickets" KPI | KPI Detail Modal opens showing Total Tickets breakdown | ☐ |
| 4.3 | KPI Detail - ticket list | In KPI Detail Modal, observe ticket table | Paginated table (15/page) with ticket rows | ☐ |
| 4.4 | KPI Detail - pagination | Click page 2 in KPI Detail | Table shows next 15 tickets | ☐ |
| 4.5 | KPI Detail - ticket click | Click a ticket row in detail modal | Ticket Detail Modal opens with full ticket info | ☐ |
| 4.6 | Ticket Detail fields | Observe Ticket Detail Modal | Subject, status, priority, customer, asset, timestamps, MTTD, validation all displayed | ☐ |
| 4.7 | Ticket Detail close | Click X or outside modal | Modal closes cleanly | ☐ |
| 4.8 | KPI sparkline | Observe KPI cards with data | Mini sparkline SVG background visible showing 7-day trend | ☐ |
| 4.9 | Delta indicators | Observe TP% and FP% cards | Up/down arrow indicators showing change direction | ☐ |

---

## 5. Chart Widgets

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 5.1 | Volume chart render | Observe "Ticket Volume" widget | Area chart with TP (green), FP (red), NS (gray) fills | ☐ |
| 5.2 | Volume chart tooltip | Hover over volume chart | Tooltip shows date, total, TP, FP, NS counts | ☐ |
| 5.3 | Alert Quality | Observe "Alert Quality" widget | Text-stats display: TP%, FP%, NS% with colored bars | ☐ |
| 5.4 | Priority chart | Observe "Priority Distribution" | Horizontal bar chart: P1=red, P2=amber, P3=gray labels | ☐ |
| 5.5 | Customer chart | Observe "Tickets by Customer" | Vertical bar chart per customer | ☐ |
| 5.6 | Top Alerts table | Observe "Top Alert Rules" | Table with Category, Count, TP Rate columns | ☐ |
| 5.7 | Analyst Performance | Observe "Analyst Performance" | Table: Analyst, Assigned, Resolved, Avg MTTR, TP Found | ☐ |
| 5.8 | SLA Gauge | Observe "SLA Achievement" widget | Canvas gauge: value %, color (green≥95, amber≥70, red<70), target line at 95% | ☐ |

---

## 6. Dashboard Profiles

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 6.1 | Default profile | Observe profile selector | "Default" profile selected, shown in dropdown | ☐ |
| 6.2 | Save new profile | Click "Edit" → rearrange widgets → dropdown → "Save to New Profile" → type name → confirm | New profile created and saved | ☐ |
| 6.3 | Switch profile | Select a different profile from dropdown | Dashboard layout changes to match selected profile | ☐ |
| 6.4 | Set as default | Click star icon on non-default profile | Profile becomes default, star filled | ☐ |
| 6.5 | Delete profile | Click trash icon on a profile → confirm | Profile removed from list, switches to another | ☐ |
| 6.6 | Persistence - page refresh | Save a profile → refresh page | Same profile and layout restored | ☐ |
| 6.7 | Persistence - API | Save profile → check Network tab | PUT /api/dashboard/profiles sent | ☐ |
| 6.8 | Reset layout | Click "Edit" → "Reset" button | Widgets reset to factory default positions/types | ☐ |

---

## 7. Edit Mode & Widget Management

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 7.1 | Enter edit mode | Click "Edit" button | Button changes to "Done", drag handles appear, edit/remove icons visible | ☐ |
| 7.2 | Drag widget | In edit mode, drag a widget by handle | Widget moves, other widgets reflow | ☐ |
| 7.3 | Resize widget | In edit mode, drag widget resize handle (bottom-right) | Widget resizes, chart redraws | ☐ |
| 7.4 | Add Widget - open modal | Click "Add" button (edit mode) | Add Custom Widget modal opens | ☐ |
| 7.5 | Add Widget - select chart type | Click through chart types (Area, Bar, Gauge, Table, etc.) | Each type highlights with accent color | ☐ |
| 7.6 | Add Widget - select data source | Click through data sources | Each source highlights | ☐ |
| 7.7 | Add Widget - create | Select "Table" + "Live Ticket Feed" → click "Add Widget" | New "Live Ticket Feed" widget appears in grid | ☐ |
| 7.8 | Add Widget - auto-name | Leave name blank → add widget | Name auto-generated from chart type + data source | ☐ |
| 7.9 | Add Widget - Gauge + SLA | Select "Gauge" + "SLA Achievement Gauge" → Add | Radial gauge shows SLA % with color coding | ☐ |
| 7.10 | Edit widget | Click pencil icon on a widget | Edit Widget Modal opens with current settings | ☐ |
| 7.11 | Edit widget - change type | Change chart type from "bar" to "pie" → Save | Widget re-renders as pie chart with same data | ☐ |
| 7.12 | Remove widget | Click trash icon on a custom widget | Widget removed from grid | ☐ |
| 7.13 | Remove built-in (blocked) | Observe built-in widget | No trash icon — built-in widgets cannot be deleted | ☐ |
| 7.14 | Exit edit mode | Click "Done" | Handles disappear, widgets are no longer draggable | ☐ |

---

## 8. Live Ticket Feed Widget

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 8.1 | Feed renders | Add a Live Ticket Feed widget | Table with columns: Time, ID, Ticket Name, Asset | ☐ |
| 8.2 | Latest 10 tickets | Count rows | Exactly 10 (or fewer if less data) rows shown | ☐ |
| 8.3 | Time format | Observe "Time" column | Shows relative time: "3m ago", "1h ago", or date | ☐ |
| 8.4 | Ticket ID format | Observe "ID" column | Shows "#XXXXXX" format with accent color | ☐ |
| 8.5 | Asset name shown | Observe "Asset" column | Shows actual asset hostname or "—" if null | ☐ |
| 8.6 | Click ticket row | Click any ticket row | Ticket Detail Modal opens for that ticket | ☐ |
| 8.7 | Auto-refresh | Wait 30+ seconds | Feed data refreshes automatically | ☐ |
| 8.8 | Filter applies | Set customer filter → observe feed | Only shows tickets for selected customer | ☐ |
| 8.9 | Live feed header | Observe header | Green pulse icon, "LIVE FEED" label, "10 latest" count | ☐ |
| 8.10 | Empty state | Filter to impossible date range | "No tickets found" message | ☐ |

---

## 9. AI Insights Panel

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 9.1 | Panel visible | Scroll below dashboard grid | AI Insights panel visible with provider selector and Generate button | ☐ |
| 9.2 | Provider selector | Click provider dropdown | Shows "Auto (default)" + configured LLM providers | ☐ |
| 9.3 | Generate insights | Click "Generate Insights" | Loading spinner → AI analysis appears (narrative, anomalies, recommendations) | ☐ |
| 9.4 | Insights categories | Read generated insights | Recommendations categorized: People, Process, Technology | ☐ |
| 9.5 | Insights metadata | Check below insights | Model name + generation timestamp shown | ☐ |
| 9.6 | Error state | Disable all LLM providers → Generate | Error message with alert triangle shown | ☐ |
| 9.7 | LLM settings link | Click gear icon | LLM Settings section expands or panel opens | ☐ |

---

## 10. Visual / Design Compliance

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 10.1 | Dark theme | Observe background | Base: #0a0a0c, surface: #141418, border: #26262e | ☐ |
| 10.2 | Font families | Inspect text | IBM Plex Sans for UI, IBM Plex Mono for values/numbers | ☐ |
| 10.3 | Signal colors only | Scan all charts | Red=#ef4444, Amber=#f59e0b, Green=#10b981 only for signal | ☐ |
| 10.4 | KPI value color | Observe KPI values | Off-white (--theme-text-primary), NOT colored | ☐ |
| 10.5 | Card consistency | Observe all widget cards | Consistent rounded-lg, same border color, accent bar on title | ☐ |
| 10.6 | Responsive layout | Resize browser to tablet/mobile | Grid reflows: 12→10→6→4→2 columns | ☐ |
| 10.7 | No footer | Scroll to bottom | No footer bar present | ☐ |
| 10.8 | Tooltips on widget titles | Hover widget title (guide-tip) | Descriptive tooltip appears explaining the widget | ☐ |

---

## 11. Navigation & Header

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 11.1 | Tab navigation | Click each tab: Main Dashboard, Manager, Client View, Threats, Users | Each page loads correctly, active tab highlighted | ☐ |
| 11.2 | Live clock | Observe top-right | Real-time clock in dd MMM yyyy HH.mm.ss format | ☐ |
| 11.3 | Connection indicator | Observe top-right icons | Green wifi icon = backend healthy | ☐ |
| 11.4 | SDP status | Hover SDP indicator | Tooltip shows SDP connection status, URL, ticket count | ☐ |
| 11.5 | Sync Status button | Click database icon | Sync Status modal opens with DB/SDP counts, sync logs | ☐ |
| 11.6 | Trigger sync | In Sync modal, click "Incremental Sync" | Sync starts, progress bar appears | ☐ |
| 11.7 | Notification bell | Click bell icon | Notification dropdown opens with recent tickets | ☐ |
| 11.8 | Notification sound | Enable sound → new ticket arrives | Sound plays on new ticket notification | ☐ |
| 11.9 | Theme panel | Click palette icon | Theme panel slides in from right | ☐ |
| 11.10 | Theme switch | Select "Midnight" preset | Colors change to midnight theme | ☐ |
| 11.11 | Theme persistence | Change theme → refresh | Theme persists | ☐ |
| 11.12 | Logout | Click user name → LogOut | Redirects to login page, token cleared | ☐ |
