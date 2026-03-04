# SOC Analytics Dashboard — MVP Concept Document

> **Project**: AI-Powered SOC Analytics Dashboard for MTM MSSP  
> **Owner**: Cybersecurity Manager  
> **Target**: MVP by early April 2026  
> **Status**: Concept → Ready for Development

---

## 1. Executive Summary

Dashboard analytics yang menarik data langsung dari ManageEngine ServiceDesk Plus (SDP) untuk memberikan visibility real-time ke SOC operations. Tujuan utama MVP: **menunjukkan value ke management** melalui data-driven insights dari ticketing SOC.

### Problem Statement
- Tim SOC (7 orang) menangani ~30-35 ticket/hari dari SOAR automation
- Tidak ada visibility aggregated ke management tentang performa SOC
- Data ada di SDP tapi tidak ada analytics layer
- Sulit mengukur MTTD, TP/FP ratio, analyst workload distribution

### MVP Goal
Dashboard yang bisa di-present ke atasan dengan metrics:
1. Volume ticket trends (daily/weekly/monthly)
2. TP vs FP vs Not Specified ratio  
3. SLA compliance (MTTD < 15 menit)
4. Ticket by severity/priority distribution
5. Analyst performance & workload
6. Top alert rules / attack categories
7. Misclassification rate

---

## 2. Environment & Data Source

### 2.1 SDP On-Premise
| Item | Detail |
|------|--------|
| Product | ManageEngine ServiceDesk Plus v14.0 Build 14000 |
| URL | `https://sdp-ioc.mtm.id:8050/` |
| API | REST v3, auth via API key header |
| SOC Account | "Cyber Security" |
| SOC Template | "CAR - Case Template" (id: `1802`) |
| Total SOC Tickets | ~28,739 |
| Daily Volume | ~30-35 tickets/day |
| Auto-creation | SOAR webhook (Wazuh alert → SDP ticket) |

### 2.2 Wazuh SIEM
| Item | Detail |
|------|--------|
| Version | 4.9 & 4.10 |
| Access | API key (manager + indexer/OpenSearch) |
| Role | Alert source, enrichment data |

### 2.3 Infrastructure
| Item | Detail |
|------|--------|
| Server | CPU 24 cores, RAM 48GB, Disk 150GB |
| Network | Data can leave network (cloud AI API OK) |
| Budget | AI API budget available |

---

## 3. SDP Ticket Data Model (CAR Template)

### 3.1 Standard Fields
| Field | API Path | Values |
|-------|----------|--------|
| Ticket ID | `request.id` | Numeric |
| Subject | `request.subject` | Alert title from SOAR |
| Description | `request.description_html` | Alert detail (HTML) |
| Status | `request.status.name` | Open, Assigned, In Progress, Onhold, Resolved, Closed, Cancelled |
| Priority | `request.priority.name` | P1-Critical, P2-High, P3-Medium, P4-Low |
| Technician | `request.technician.name` | Assigned analyst |
| Group | `request.group.name` | "Cyber Security" |
| Account | `request.account.name` | "Cyber Security" |
| Site | `request.site.name` | CAR-CMWI, CAR-IOS Division, CAR-MRT Jakarta, CAR-IT IS, CAR-POC |
| Created | `request.created_time.value` | Epoch ms |
| Completed | `request.completed_time.value` | Epoch ms |

### 3.2 UDF Fields (Custom SOC Fields)
| UDF Key | Label (Deduced) | Type | Known Values |
|---------|-----------------|------|--------------|
| `udf_pick_1805` | Initial Validation | Dropdown | True Positive, False Positive, Not Specified |
| `udf_pick_1806` | Attack Category | Dropdown | Other, (more categories TBD) |
| `udf_pick_1819` | Case Type | Dropdown | Security Event, Security Incident |
| `udf_pick_2704` | PIC / Creator | Dropdown | SOC, (individual names) |
| `udf_pick_3901` | Customer | Dropdown | CMWI, IOS-MTM, MRTJ, (others) |
| `udf_pick_1818` | Asset Name | Dropdown | Hostname/asset from Wazuh |
| `udf_sline_1827` | IP Address | Text | Source IP |
| `udf_date_2701` | Alert Time | Datetime | When Wazuh alert triggered |
| `udf_date_1807` | First Notification Time | Datetime | When analyst first notified customer |
| `udf_date_1808` | (TBD) | Datetime | Unknown purpose |
| `udf_multiselect_2101` | (TBD) | Multi-select | Usually empty |
| `udf_mline_2102` | (TBD) | Multi-line text | Usually empty |
| `udf_sline_1816` | (TBD) | Text | Usually empty |
| `udf_sline_1820` | (TBD) | Text | Usually empty |

### 3.3 Key Calculations
| Metric | Formula |
|--------|---------|
| **MTTD** (Mean Time to Detect) | `udf_date_1807` - `udf_date_2701` |
| **MTTR** (Mean Time to Resolve) | `completed_time` - `created_time` |
| **TP Rate** | Count(`udf_pick_1805` = "True Positive") / Total |
| **FP Rate** | Count(`udf_pick_1805` = "False Positive") / Total |
| **SLA Compliance** | % tickets where MTTD ≤ 15 minutes |

### 3.4 API Constraints
- **List endpoint** (`/api/v3/requests`) returns basic fields only, **NOT UDF fields**
- **Detail endpoint** (`/api/v3/requests/{id}`) returns full UDF data
- **Rate limiting**: No explicit limit found, but sequential calls ~200ms each
- **Conversations endpoint**: Restricted (401) with current API key
- **Search**: Supports `search_criteria` with field/condition/value + children for AND/OR
- **Pagination**: `row_count` max 100, `start_index` for offset

### 3.5 Priority & Status ID Map
```
Priority: P1-Critical=301, P2-High=4801, P3-Medium=3001, P4-Low=4802
Status:   Open=1, Onhold=2, Closed=3, Resolved=4, Assigned=5, In Progress=6, Cancelled=601
```

---

## 4. Architecture

### 4.1 Tech Stack Decision
| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Backend | **Python (FastAPI)** | Fast, async, great for data processing, maintainable |
| Database | **PostgreSQL** | Reliable, good for time-series analytics, JSON support |
| Cache | **Redis** | Fast caching for API responses and computed metrics |
| Frontend | **React + Vite + Tailwind CSS** | Fast dev, modern, component-based |
| Charts | **Recharts** or **Apache ECharts** | Feature-rich, React-native |
| AI Layer | **Claude API** (Anthropic) | Natural language insights, anomaly narratives |
| Scheduler | **APScheduler** (Python) | Periodic SDP data sync |
| Deployment | **Docker Compose** | Single-server deployment |

### 4.2 System Architecture
```
┌─────────────────────────────────────────────────┐
│                 Browser (React)                  │
│    Dashboard  │  Filters  │  AI Insights Panel   │
└───────────────────┬─────────────────────────────┘
                    │ REST API
┌───────────────────▼─────────────────────────────┐
│              FastAPI Backend                      │
│  /api/metrics  │  /api/tickets  │  /api/ai       │
│  /api/trends   │  /api/analysts │  /api/export   │
├──────────────────────────────────────────────────┤
│  Analytics Engine  │  AI Service  │  SDP Sync    │
│  (pandas/numpy)    │  (Claude)    │  (scheduler) │
└──┬──────────────────────┬────────────────┬───────┘
   │                      │                │
   ▼                      ▼                ▼
┌────────┐         ┌──────────┐     ┌──────────────┐
│PostgreSQL│         │  Redis   │     │  SDP API     │
│(tickets) │         │ (cache)  │     │  (on-prem)   │
└────────┘         └──────────┘     └──────────────┘
```

### 4.3 Data Flow
```
1. [Scheduler] Every 5 min → Poll SDP API for new/updated tickets
2. [SDP Sync] GET /api/v3/requests (list) → Get new ticket IDs
3. [SDP Sync] GET /api/v3/requests/{id} (detail) → Get full UDF data
4. [SDP Sync] Upsert into PostgreSQL
5. [Analytics] Compute aggregated metrics from DB (cached in Redis)
6. [Frontend] Fetch pre-computed metrics via FastAPI endpoints
7. [AI Layer] On-demand: Summarize trends, detect anomalies, generate narratives
```

---

## 5. Dashboard Design (MVP Screens)

### 5.1 Main Dashboard
```
┌─────────────────────────────────────────────────────────────┐
│  SOC Analytics Dashboard                    [Date Range ▼]  │
├──────────┬──────────┬──────────┬──────────┬────────────────┤
│ Total    │ Open     │ TP Rate  │ Avg MTTD │ SLA Compliance │
│ Tickets  │ Tickets  │          │          │                │
│ 28,739   │ 156      │ 2.1%     │ 8m 23s   │ 94.2%          │
├──────────┴──────────┴──────────┴──────────┴────────────────┤
│                                                             │
│  [Volume Trend - Line Chart]           [TP/FP Donut Chart] │
│  Daily ticket volume over time          TP vs FP vs NS     │
│                                                             │
├─────────────────────────────┬───────────────────────────────┤
│  [Priority Distribution]    │  [Tickets by Customer]        │
│  Bar chart P1-P4            │  Bar chart per customer site  │
│                             │                               │
├─────────────────────────────┴───────────────────────────────┤
│  [Top 10 Alert Rules]                                       │
│  Horizontal bar chart - most triggered Wazuh rules          │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  [Analyst Performance Table]                                │
│  Name | Assigned | Resolved | Avg MTTR | TP Found           │
│  ─────┼──────────┼──────────┼──────────┼────────────        │
│  Analyst1 | 45  |   42     |  2h 15m  |  3                  │
│  ...                                                        │
├─────────────────────────────────────────────────────────────┤
│  [AI Insights Panel]                                        │
│  🤖 "This week shows 15% increase in FP rate on CMWI       │
│      assets. Top contributor: AD_Server_Primary brute-force │
│      alerts. Consider tuning Wazuh rule 5710."              │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Filters (Global)
- Date range (Today / 7D / 30D / Custom)
- Customer (CMWI / IOS-MTM / MRTJ / All)
- Priority (P1 / P2 / P3 / P4 / All)
- Status (Open / In Progress / Resolved / Closed / All)
- Validation (TP / FP / Not Specified / All)

---

## 6. API Endpoints Design

### 6.1 Metrics API
```
GET /api/metrics/summary
  → { total_tickets, open_tickets, tp_rate, avg_mttd, sla_compliance }

GET /api/metrics/volume?period=daily&from=2025-01-01&to=2025-06-30
  → [{ date, count, tp_count, fp_count }]

GET /api/metrics/validation-breakdown?from=&to=
  → { true_positive: N, false_positive: N, not_specified: N }

GET /api/metrics/priority-distribution?from=&to=
  → [{ priority, count }]

GET /api/metrics/customer-distribution?from=&to=
  → [{ customer, count, tp_rate }]

GET /api/metrics/top-alerts?limit=10&from=&to=
  → [{ rule_name, count, tp_rate }]

GET /api/metrics/mttd-trend?period=daily&from=&to=
  → [{ date, avg_mttd_seconds, sla_compliant_pct }]

GET /api/metrics/analyst-performance?from=&to=
  → [{ analyst, assigned, resolved, avg_mttr, tp_found }]
```

### 6.2 Ticket API
```
GET /api/tickets?page=1&limit=20&status=Open&priority=P1-Critical
  → Paginated ticket list with UDF fields

GET /api/tickets/{id}
  → Full ticket detail
```

### 6.3 AI API
```
POST /api/ai/insights
  body: { period: "7d", customer: "all" }
  → { narrative: "...", anomalies: [...], recommendations: [...] }

POST /api/ai/ticket-summary
  body: { ticket_id: 202088 }
  → { summary: "...", similar_tickets: [...] }
```

### 6.4 Sync API
```
POST /api/sync/trigger  → Manual sync trigger
GET  /api/sync/status   → Last sync time, records synced, errors
```

---

## 7. Database Schema

```sql
-- Core ticket data (synced from SDP)
CREATE TABLE tickets (
    id              BIGINT PRIMARY KEY,          -- SDP request ID
    subject         TEXT NOT NULL,
    description     TEXT,
    status          VARCHAR(50),
    priority        VARCHAR(50),
    technician      VARCHAR(200),
    group_name      VARCHAR(200),
    account_name    VARCHAR(200),
    site_name       VARCHAR(200),
    created_time    TIMESTAMP WITH TIME ZONE,
    completed_time  TIMESTAMP WITH TIME ZONE,
    
    -- UDF Fields (SOC-specific)
    validation      VARCHAR(50),                  -- udf_pick_1805: TP/FP/Not Specified
    attack_category VARCHAR(200),                 -- udf_pick_1806
    case_type       VARCHAR(100),                 -- udf_pick_1819: SE/SI
    pic_creator     VARCHAR(200),                 -- udf_pick_2704
    customer        VARCHAR(200),                 -- udf_pick_3901
    asset_name      VARCHAR(500),                 -- udf_pick_1818
    ip_address      VARCHAR(100),                 -- udf_sline_1827
    alert_time      TIMESTAMP WITH TIME ZONE,     -- udf_date_2701
    first_notif     TIMESTAMP WITH TIME ZONE,     -- udf_date_1807
    
    -- Computed
    mttd_seconds    INTEGER,                      -- first_notif - alert_time (in seconds)
    mttr_seconds    INTEGER,                      -- completed_time - created_time
    sla_met         BOOLEAN,                      -- mttd_seconds <= 900 (15 min)
    
    -- Parsed from subject
    wazuh_rule_id   VARCHAR(20),
    wazuh_rule_name VARCHAR(500),
    
    -- Metadata
    synced_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    raw_json        JSONB                         -- Full SDP response for reference
);

-- Indexes for analytics queries
CREATE INDEX idx_tickets_created ON tickets(created_time);
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_priority ON tickets(priority);
CREATE INDEX idx_tickets_validation ON tickets(validation);
CREATE INDEX idx_tickets_customer ON tickets(customer);
CREATE INDEX idx_tickets_technician ON tickets(technician);
CREATE INDEX idx_tickets_sla ON tickets(sla_met);

-- Materialized view for daily aggregates
CREATE MATERIALIZED VIEW daily_metrics AS
SELECT
    DATE(created_time) as date,
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE validation = 'True Positive') as tp_count,
    COUNT(*) FILTER (WHERE validation = 'False Positive') as fp_count,
    COUNT(*) FILTER (WHERE validation = 'Not Specified') as ns_count,
    AVG(mttd_seconds) FILTER (WHERE mttd_seconds IS NOT NULL) as avg_mttd,
    COUNT(*) FILTER (WHERE sla_met = true) as sla_met_count,
    COUNT(*) FILTER (WHERE sla_met = false) as sla_missed_count
FROM tickets
GROUP BY DATE(created_time)
ORDER BY date;

-- Sync tracking
CREATE TABLE sync_log (
    id          SERIAL PRIMARY KEY,
    started_at  TIMESTAMP WITH TIME ZONE,
    finished_at TIMESTAMP WITH TIME ZONE,
    tickets_synced INTEGER,
    errors      INTEGER,
    status      VARCHAR(20),  -- running, completed, failed
    details     JSONB
);
```

---

## 8. SDP Data Sync Strategy

### 8.1 Initial Load
- Fetch all ~28,739 SOC tickets (account = "Cyber Security")
- List API returns 100 tickets/page → ~288 list calls
- Each ticket needs detail call for UDF → ~28,739 detail calls
- At ~200ms/call → ~96 minutes for full initial load
- **Strategy**: Run initial load as background job, track progress

### 8.2 Incremental Sync (Every 5 minutes)
```python
# Pseudo-code for incremental sync
last_sync = get_last_sync_time()
new_tickets = sdp_list(
    search_criteria={"field": "account.name", "value": "Cyber Security"},
    sort_field="id", sort_order="desc",
    row_count=100
)
for ticket in new_tickets:
    if ticket.id > last_synced_id or ticket.updated > last_sync:
        detail = sdp_get_detail(ticket.id)
        upsert_to_db(detail)
```

### 8.3 Handling API Constraints
| Constraint | Solution |
|-----------|----------|
| No UDF in list endpoint | Batch detail calls for new tickets |
| No rate limit docs | Self-limit to 5 concurrent calls |
| SSL cert issues | `verify=False` (on-prem self-signed) |
| Network latency | Async HTTP with `httpx` |

---

## 9. AI Integration (Phase 1 - MVP)

### 9.1 Automated Insights
- **Weekly Summary**: "Minggu ini ada X ticket, Y% adalah TP, Z% FP. MTTD rata-rata Xm Ys."
- **Anomaly Detection**: "Volume ticket CMWI naik 40% dibanding minggu lalu"
- **Recommendation**: "Rule 5710 generate 80% FP di CMWI, consider tuning threshold"

### 9.2 Prompt Template
```
You are a SOC analytics assistant for an MSSP company.
Given the following SOC metrics for {period}:
- Total tickets: {total}
- TP: {tp}, FP: {fp}, Not Specified: {ns}
- Avg MTTD: {mttd}
- SLA compliance: {sla_pct}%
- Top alert rules: {top_rules}
- Customer breakdown: {customers}

Generate:
1. Executive summary (2-3 sentences, bahasa Indonesia)
2. Key anomalies or concerns
3. Actionable recommendations for SOC manager
```

### 9.3 AI Budget Estimate
- ~500 tokens input + ~300 tokens output per insight call
- ~$0.02 per call (Claude Sonnet)
- Dashboard refresh: ~10 calls/day max → ~$6/month

---

## 10. Implementation Plan

### Phase 1: Foundation (Week 1)
- [ ] Setup Docker Compose (PostgreSQL + Redis + FastAPI)
- [ ] Build SDP sync service with initial load
- [ ] Database schema + migrations
- [ ] Basic health check endpoints

### Phase 2: Analytics Backend (Week 2)
- [ ] All metrics API endpoints
- [ ] Materialized views + refresh logic
- [ ] Redis caching layer
- [ ] Ticket list/detail endpoints

### Phase 3: Dashboard Frontend (Week 3)
- [ ] React app scaffold with Vite + Tailwind
- [ ] KPI cards component
- [ ] Volume trend chart
- [ ] TP/FP donut chart
- [ ] Priority & customer bar charts
- [ ] Analyst performance table
- [ ] Global filters (date range, customer, priority)

### Phase 4: AI & Polish (Week 4)
- [ ] Claude API integration
- [ ] AI Insights panel
- [ ] Export to PDF/CSV
- [ ] Error handling & logging
- [ ] Documentation

---

## 11. Data Observations from API Exploration

### 11.1 Key Findings
1. **~97% tickets are False Positive** — This is normal for SOAR-automated SOC, but means TP tickets are rare and valuable
2. **Most tickets are "Security Event"** — Very few escalate to "Security Incident" 
3. **Attack category mostly "Other"** — Suggests SOAR doesn't map Wazuh rules to attack categories well
4. **PIC is always "SOC"** — Individual analyst assignment is via `technician` field
5. **Customers**: CMWI (dominant), IOS-MTM, MRTJ
6. **Subject contains Wazuh rule info** — Can be parsed for rule-level analytics

### 11.2 Subject Pattern Analysis
Typical subject format from SOAR:
```
[ALERT] Wazuh - Rule 5710: sshd: brute force trying to get access... - AD_Server_Primary-Karawang-CMWI
```
→ Parseable: rule ID, rule name, asset name

### 11.3 Dashboard Value Proposition
Even though most tickets are FP, the dashboard enables:
- **FP reduction tracking**: Monitor FP rate trends to show tuning effectiveness
- **MTTD tracking**: Prove SLA compliance to customers
- **Workload visibility**: Show management how analysts handle volume
- **Incident spotlight**: When TP/SI happens, it's clearly visible
- **Customer reporting**: Per-customer metrics for MSSP client reports

---

## 12. Risk & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Initial load takes ~96 min | Delayed first use | Run as background job, show progress bar |
| SDP API goes down | No fresh data | Cache last-known data, show staleness warning |
| UDF field labels change | Wrong mapping | Store raw JSON, re-map if needed |
| Low TP count skews metrics | Misleading stats | Show absolute numbers alongside percentages |
| SDP On-Prem upgrade breaks API | Sync fails | Version check, graceful error handling |

---

## 13. Future Roadmap (Post-MVP)

1. **Ticketing Copilot**: AI-assisted triage recommendations in real-time
2. **Wazuh Integration**: Pull raw alert data for deeper enrichment
3. **Auto-Summary**: AI generates ticket resolution summary
4. **Similar Ticket Finder**: Find related past tickets for faster resolution
5. **Customer Portal**: Self-service dashboard for MSSP clients
6. **Alert Tuning Recommender**: AI suggests Wazuh rule threshold changes based on FP patterns
7. **Shift Handover Report**: Auto-generated shift handover document
