# Test Plan — Manager View

**Module:** Manager (Team Workload)  
**URL:** `http://<host>/` → Tab "Manager"  
**Last Updated:** 2026-04-21  

---

## 1. Page Load & Initial State

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 1.1 | Page loads | Click "Manager" tab | Manager View renders without errors | ☐ |
| 1.2 | Default period | Observe period selector | "Last 1 Month" selected by default | ☐ |
| 1.3 | Workload table renders | Observe main table | Table with columns: Analyst, Assigned, Resolved, Open, MTTD, MTTR, SLA %, Workload, Flag | ☐ |
| 1.4 | Loading state | Navigate to Manager tab | Spinner shown while data loads | ☐ |
| 1.5 | Data from API | Check Network tab | `GET /api/analysts/scores?start=...&end=...` called | ☐ |

---

## 2. Period Selector

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 2.1 | Last 1 Month | Select "Last 1 Month" | Data filtered to previous calendar month | ☐ |
| 2.2 | Last 2 Months | Select "Last 2 Months" | Data covers 2 months back | ☐ |
| 2.3 | Last 3 Months | Select "Last 3 Months" | Data covers 3 months back | ☐ |
| 2.4 | All Time | Select "All Time" | No date filter applied, shows all data | ☐ |
| 2.5 | Data refresh on change | Switch from 1 month → 3 months | Table reloads with new data, spinner shown | ☐ |

---

## 3. Workload Table

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 3.1 | Analyst names | Observe Analyst column | Full analyst names displayed with initials avatar | ☐ |
| 3.2 | Initials avatar | Observe left of analyst name | 2-letter initials in colored circle (first+last name initial) | ☐ |
| 3.3 | Assigned count | Compare with API data | Assigned ticket count matches API response | ☐ |
| 3.4 | Resolved count | Compare with API data | Resolved count matches, with progress bar overlay | ☐ |
| 3.5 | Open count | Check calculation | Open = Assigned - Resolved | ☐ |
| 3.6 | MTTD display | Observe MTTD column | Formatted as human-readable (e.g. "11m 54s", "4h 7m") | ☐ |
| 3.7 | MTTR display | Observe MTTR column | Formatted same as MTTD | ☐ |
| 3.8 | SLA % display | Observe SLA column | Percentage with color: green ≥ 95%, amber ≥ 70%, red < 70% | ☐ |
| 3.9 | Workload bar | Observe Workload column | Horizontal progress bar proportional to assigned/avg | ☐ |
| 3.10 | Flag - Overloaded | Analyst with > 40% of total tickets | Orange "Overloaded" flag badge | ☐ |
| 3.11 | Flag - Imbalanced | Analyst with > 2× average | Orange "Imbalanced" badge | ☐ |
| 3.12 | Flag - Underutilized | Analyst with < 10% of average | Gray "Underutilized" badge | ☐ |
| 3.13 | Empty state | Set date range with no data | "No analyst data for this period" message + "View All Time" button | ☐ |
| 3.14 | View All Time button | Click "View All Time" on empty state | Period switches to All Time, data loads | ☐ |
| 3.15 | Row hover | Hover over analyst row | Row highlights subtly | ☐ |
| 3.16 | Row clickable | Click an analyst row | Analyst Detail Modal opens | ☐ |

---

## 4. Analyst Detail Modal

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 4.1 | Modal opens | Click any analyst row | Modal slides in with analyst info | ☐ |
| 4.2 | Analyst name & tier | Observe modal header | Analyst name, tier badge (S/A/B/C/D) with color | ☐ |
| 4.3 | Spider chart | Observe radar/spider chart | 7 axes: Speed, Detection, Accuracy, Volume, SLA, Throughput, Complexity | ☐ |
| 4.4 | Spider chart values | Hover spider chart points | Tooltip shows metric name and score value | ☐ |
| 4.5 | Metric bars | Below spider chart | 7 horizontal bars with score values (0-100 scale) | ☐ |
| 4.6 | Overall score | Observe score display | Single composite score shown prominently | ☐ |
| 4.7 | KPI stats grid | Observe stats section | 6 stats: Total Tickets, Resolved, Avg MTTD, Avg MTTR, SLA %, Security Incidents | ☐ |
| 4.8 | Stats accuracy | Compare with workload table row | Values should match or be consistent | ☐ |

---

## 5. Analyst AI Review

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 5.1 | AI Review button | In Analyst Detail Modal, find AI Review section | "Generate AI Review" button visible | ☐ |
| 5.2 | Generate review | Click "Generate AI Review" | Loading state → AI-generated text review of analyst appears | ☐ |
| 5.3 | Review content | Read generated review | Includes: performance summary, strengths, areas for improvement, recommendations | ☐ |
| 5.4 | Error handling | Disable all LLM providers → generate | Error message shown cleanly | ☐ |
| 5.5 | Model attribution | Check review footer | Shows which AI model generated the review | ☐ |

---

## 6. Analyst Trend Chart

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 6.1 | Trend chart visible | In Analyst Detail, observe trend section | Line/area chart showing historical performance | ☐ |
| 6.2 | Data points | Check chart data | Weekly data points (up to 26 weeks) | ☐ |
| 6.3 | Tooltip on hover | Hover over chart point | Shows date + metric values | ☐ |
| 6.4 | Empty trend | New analyst with no history | "No trend data" or empty chart message | ☐ |

---

## 7. Analyst Detail - Additional Tables

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 7.1 | Top customers table | In detail modal, observe | Top customers this analyst handled, with ticket counts | ☐ |
| 7.2 | Top alerts table | Observe | Most common alert types for this analyst | ☐ |
| 7.3 | Recent tickets table | Observe | Last few tickets with ID, subject, status, time | ☐ |
| 7.4 | Ticket row click | Click a ticket in recent tickets | Ticket Detail Modal opens | ☐ |

---

## 8. Performance Trends Section

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 8.1 | Team trend chart | Scroll below workload table | Team-wide performance trend chart visible | ☐ |
| 8.2 | Chart data | Observe chart | Weekly team aggregate metrics over time | ☐ |
| 8.3 | Backfill button | Find "Backfill snapshots" button | Button visible with description | ☐ |
| 8.4 | Backfill action | Click "Backfill snapshots" | POST request fires, success message shown | ☐ |
| 8.5 | Trend after backfill | Backfill → reload page | Trend chart now has historical data points | ☐ |

---

## 9. Modal Interactions

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 9.1 | Close modal - X | Click X button on modal | Modal closes | ☐ |
| 9.2 | Close modal - outside | Click overlay/background | Modal closes | ☐ |
| 9.3 | Close modal - Escape | Press Escape key | Modal closes | ☐ |
| 9.4 | Multiple modals | Analyst detail → click ticket → ticket detail | Second modal opens, first still behind | ☐ |
| 9.5 | Close inner modal | Close ticket detail | Returns to analyst detail modal | ☐ |

---

## 10. Visual / Design Compliance

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 10.1 | Theme consistency | Compare with Main Dashboard | Same dark theme, fonts, colors | ☐ |
| 10.2 | Table styling | Observe workload table | Alternating row shading, proper borders | ☐ |
| 10.3 | Flag badge colors | Check flag badges | Overloaded=amber, Underutilized=gray, proper icons | ☐ |
| 10.4 | Tier badge colors | Check tier badges | S=gold, A=green, B=blue, C=amber, D=red | ☐ |
| 10.5 | SLA color coding | Check SLA column | Green ≥ 95%, Amber ≥ 70%, Red < 70% | ☐ |
| 10.6 | Responsive | Resize browser | Table wraps or scrolls horizontally on small screens | ☐ |

---

## 11. Data Validation

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 11.1 | Analyst count | Count rows vs API | Rows match `GET /api/analysts/scores` response count | ☐ |
| 11.2 | Total assigned | Sum all Assigned values | Should equal total tickets for the period | ☐ |
| 11.3 | Resolved ≤ Assigned | Check each analyst | Resolved never exceeds Assigned | ☐ |
| 11.4 | SLA % range | Check all SLA values | Always between 0% and 100% | ☐ |
| 11.5 | MTTD/MTTR format | Observe time values | Formatted properly, "—" for null/zero | ☐ |
| 11.6 | Excluded analysts | Exclude an analyst → reload | Excluded analyst not shown in table (localStorage check) | ☐ |
