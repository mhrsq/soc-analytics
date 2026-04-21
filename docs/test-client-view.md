# Test Plan — Client View

**Module:** Client View (Customer Dashboard)  
**URL:** `http://<host>/` → Tab "Client View"  
**Last Updated:** 2026-04-21  

---

## 1. Page Load & Initial State

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 1.1 | Page loads | Click "Client View" tab | Client View page renders without errors | ☐ |
| 1.2 | Empty state - no customer | Observe initial state | Large centered message: "Select a customer to view their dashboard" | ☐ |
| 1.3 | Customer dropdown visible | Observe toolbar | Customer selector dropdown populated with all customers | ☐ |
| 1.4 | Period selector visible | Observe toolbar | Period selector with presets: 7d, 14d, 30d, 90d, All Time | ☐ |
| 1.5 | No widgets until customer | Observe grid area | No widgets rendered until customer selected | ☐ |

---

## 2. Customer Selection

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 2.1 | Select customer | Pick "CMWI" from dropdown | All 6 built-in widgets load with CMWI data | ☐ |
| 2.2 | Switch customer | Switch from "CMWI" to "IOS-MTM" | Data refreshes for new customer | ☐ |
| 2.3 | Customer list from API | Check Network tab | `GET /api/filters/options` fetched, customers populated | ☐ |
| 2.4 | Reset customer | Deselect customer (if possible) | Returns to empty state | ☐ |

---

## 3. Period Selector

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 3.1 | 7 days | Select "7d" | Data filtered to last 7 days | ☐ |
| 3.2 | 14 days | Select "14d" | Data filtered to last 14 days | ☐ |
| 3.3 | 30 days | Select "30d" | Data filtered to last 30 days | ☐ |
| 3.4 | 90 days | Select "90d" | Data filtered to last 90 days | ☐ |
| 3.5 | All Time | Select "All Time" | No date filter, shows all data | ☐ |
| 3.6 | Data refresh on change | Switch period | Widgets reload with new time range | ☐ |

---

## 4. Built-in Widgets

### 4A. Customer KPI Cards

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 4A.1 | KPI strip renders | Select customer → observe KPI | 5 KPI cards: Total Incidents, Active, Avg Response Time, SLA Compliance, Security Incidents | ☐ |
| 4A.2 | Values accuracy | Compare with `/api/metrics/summary?customer=CMWI` | All values match API response | ☐ |
| 4A.3 | SLA color | Observe SLA Compliance | Green ≥ 90%, Amber ≥ 70%, Red < 70% | ☐ |
| 4A.4 | Response time format | Observe Avg Response Time | Formatted as "Xm Ys" or "Xh Ym" | ☐ |
| 4A.5 | Zero state | Customer with no tickets | Values show 0 / "—" appropriately | ☐ |

### 4B. Incident Timeline

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 4B.1 | Timeline chart | Observe "Incident Timeline" widget | Area chart showing daily ticket volume | ☐ |
| 4B.2 | Chart tooltip | Hover over chart | Shows date + count breakdown | ☐ |
| 4B.3 | Date range matches | Verify X-axis dates | Matches selected period | ☐ |

### 4C. SLA Gauge

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 4C.1 | Gauge renders | Observe SLA gauge widget | SVG circular gauge with percentage | ☐ |
| 4C.2 | Color coding | Observe gauge color | Green ≥ 90%, Yellow ≥ 70%, Red < 70% | ☐ |
| 4C.3 | Target line | Observe gauge | Target threshold marker visible | ☐ |
| 4C.4 | Value accuracy | Compare with API | Matches `sla_compliance_pct` from summary | ☐ |

### 4D. Priority Breakdown

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 4D.1 | Donut chart | Observe Priority widget | Donut chart with P1/P2/P3/P4 segments | ☐ |
| 4D.2 | Legend | Observe chart legend | Priority labels with correct colors | ☐ |
| 4D.3 | Values match API | Compare with `/api/metrics/priority?customer=CMWI` | Counts match | ☐ |

### 4E. Top Alerts

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 4E.1 | Top alerts render | Observe Top Alerts widget | Horizontal bar chart, top 8 alert rules | ☐ |
| 4E.2 | Bar labels | Check alert names | Descriptive alert rule names shown | ☐ |
| 4E.3 | Count accuracy | Compare with API | Matches `/api/metrics/top-alerts?customer=CMWI` | ☐ |

### 4F. Asset Exposure

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 4F.1 | Asset chart | Observe Asset Exposure widget | Bar chart + ranked list of top 10 assets | ☐ |
| 4F.2 | Asset names | Check asset list | Real asset hostnames shown | ☐ |
| 4F.3 | Ranked list | Observe order | Sorted by alert count descending | ☐ |
| 4F.4 | Data from API | Check Network | `GET /api/metrics/asset-exposure?customer=CMWI` called | ☐ |

---

## 5. Profile Management (Customer Dashboard)

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 5.1 | Default profile | Observe profile selector | Default profile loaded | ☐ |
| 5.2 | Save new profile | Edit layout → Save to new profile with name | Profile saved successfully | ☐ |
| 5.3 | Switch profile | Select different profile | Layout changes | ☐ |
| 5.4 | Delete profile | Delete a custom profile | Profile removed | ☐ |
| 5.5 | Separate from main | Profiles are independent from Main Dashboard profiles | ☐ |

---

## 6. Edit Mode & Custom Widgets

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 6.1 | Enter edit mode | Click "Edit" button | Drag handles and edit icons appear | ☐ |
| 6.2 | Drag widget | Drag a widget to new position | Widget moves, others reflow | ☐ |
| 6.3 | Resize widget | Resize via drag handle | Widget resizes, chart redraws | ☐ |
| 6.4 | Add widget | Click "Add" → select chart type + data source → Add | New widget appears | ☐ |
| 6.5 | Edit widget | Click pencil on widget → change chart type → Save | Widget re-renders with new type | ☐ |
| 6.6 | Remove custom widget | Click trash on custom widget | Widget removed | ☐ |
| 6.7 | Reset layout | Click "Reset" | Factory layout restored | ☐ |
| 6.8 | Exit edit mode | Click "Done" | Edit controls hidden | ☐ |

---

## 7. Visual / Design Compliance

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 7.1 | Theme consistency | Compare with Main Dashboard | Same dark theme, fonts, card styles | ☐ |
| 7.2 | Customer-specific data | Verify all widgets | Only show data for selected customer | ☐ |
| 7.3 | Empty state design | No customer selected | Clean, centered message with icon | ☐ |
| 7.4 | Responsive | Resize browser | Grid reflows properly | ☐ |
| 7.5 | Widget card style | Observe cards | Same WidgetWrapper style as Main Dashboard | ☐ |

---

## 8. Data Validation

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 8.1 | Customer isolation | Select CMWI → check all widgets | No data from other customers visible | ☐ |
| 8.2 | Total vs breakdown | Compare KPI total with priority breakdown | Sum of priorities ≈ total incidents | ☐ |
| 8.3 | SLA consistency | Compare SLA gauge with KPI SLA | Values match | ☐ |
| 8.4 | Timeline dates | Check timeline X-axis | Dates fall within selected period | ☐ |
| 8.5 | Asset names valid | Check asset exposure list | Asset hostnames are real, not null/undefined | ☐ |
