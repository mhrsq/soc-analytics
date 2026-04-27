# SOC Analytics Dashboard — Feature Roadmap

## Context & Data Findings

**Data snapshot (as of April 2026):**
- 30,942 tickets total, 8 customers, 18 analysts, data from Nov 2022
- Useful range: **Jan 2024 – present** (pre-2024 data too sparse)
- MTTD SLA: **~12%** (target: 99%) — systemic issue across all customers
- MTTR SLA: **~77%** — better but still below target
- FP rate: **93% overall**, exploded from 5% → 97%+ starting Mar 2025 (SOAR auto-create from Wazuh alerts)
- Security Incident (case_type) rate: near 0% since mid-2025 — very few real incidents, most are FP events
- `attack_category`: 93% "Other" — SOAR default, not manually classified by analysts
- `wazuh_rule_name`: empty for all tickets — subject line is the only classification signal

**Key event: Mar 2025 — SOAR integration**
SOAR started auto-creating tickets from Wazuh alerts. This caused:
- Volume: 20/month → 3,500/month (175x increase)
- FP rate: 5% → 97%+ (almost all SOAR-created tickets are FP)
- SLA collapse: system overwhelmed by volume, MTTD dropped to ~8-13%

**SLA definitions:**
- **MTTD**: created_time → analyst fills Initial Validation (TP or FP determination). Target: 15 minutes.
- **MTTR**: TP tickets only. created_time → workaround_time (first notif + recommendation sent to customer). Target varies.

**Terminology:**
- **Security Event**: FP or TP without impact (benign true positive)
- **Security Incident**: TP with impact (real breach, customer affected)
- **Non Security**: legitimate activity flagged — TP means "confirmed not a security issue" (not a misclassification)

**Users:**
- SOC Analyst: real-time alert monitoring, sound notifications (already implemented)
- SOC Manager: team performance, SLA tracking, root cause analysis
- Atasan/CxO: business operational view, customer health
- Customer (client): multi-tenant client view via RBAC (already implemented)

**Business context:**
- Reports to clients have been "made up" — this dashboard is meant to fix that by showing real numbers
- Clients don't currently know their SLA is ~12% (far from 99% target)
- Manager wants to identify why SLA is bad and fix the root causes

---

## Candidate Widgets / Features

### P0 — High Priority (data ready, directly impactful)

#### 1. SLA Trend vs Target 99%
- **For:** Manager View
- **Type:** Line chart (monthly)
- **Data:** Monthly MTTD SLA % from Jan 2024 – present, with a horizontal red line at 99%
- **Value:** The single most important chart. Shows the gap between target and reality (~12% vs 99%). Enables tracking improvement over time.
- **Backend:** New endpoint `/api/metrics/sla-trend` — aggregate by month, compute SLA %
- **Frontend:** New widget component, area chart with target reference line

#### 2. FP Rate Trend
- **For:** Manager View
- **Type:** Area chart (monthly) with annotation
- **Data:** Monthly FP rate %. Annotate Mar 2025 = "SOAR integration"
- **Value:** Tracks whether FP rate is improving or worsening. 93% FP rate = analysts spending 93% of time on noise. Actionable for SOAR rule tuning.
- **Backend:** Can reuse volume data (already has tp_count/fp_count per day — aggregate to month)
- **Frontend:** New widget, could share chart component with SLA Trend

#### 3. Customer SLA Heatmap
- **For:** Manager + CxO (Manager View)
- **Type:** Heatmap table (rows = customers, columns = months, cells = SLA % colored)
- **Data:** Per-customer per-month MTTD SLA %
- **Value:** At a glance: which customers are consistently underserved. Currently:
  - MRTJ: 11.3%, avg MTTD 27.7 hours
  - IT-IS-MTM: 12.3%, avg MTTD 16 hours
  - IOS-MTM: 12.4%, avg MTTD 9.3 hours
  - CMWI: 12.9%, avg MTTD 5.6 hours
- **Backend:** New endpoint `/api/metrics/customer-sla-matrix`
- **Frontend:** Custom heatmap grid component

#### 4. SLA Breach Root Cause
- **For:** Manager View
- **Type:** Multi-facet breakdown (tabs or stacked bars)
- **Data:** SLA breach tickets grouped by: analyst, hour-of-day (shift), priority, customer
- **Value:** Answers "WHY is SLA bad?" — is it specific analysts? Specific shifts? High-priority tickets taking too long?
- **Backend:** New endpoint `/api/metrics/sla-breach-analysis`
- **Frontend:** Tabbed breakdown component

### P1 — Medium Priority (needs moderate effort)

#### 5. Month-over-Month KPI Cards
- **For:** CxO / Manager View top section
- **Type:** Enhanced KPI cards with delta indicators
- **Data:** Current month vs previous month: volume, FP rate, MTTD SLA, MTTR SLA, incident count
- **Value:** Executive summary in 5 seconds — "are things getting better or worse?"
- **Backend:** Existing summary endpoint + compare two periods
- **Frontend:** Enhanced KPI card component with ▲/▼ delta badges

#### 6. Security Incident Funnel
- **For:** Manager View
- **Type:** Funnel or stacked bar
- **Data:** Total Alerts → Security Events → Security Incidents (case_type breakdown)
- **Value:** Shows conversion rate: what % of alerts become real incidents. Currently near 0% (good — no breaches, or bad — not being tagged?)
- **Backend:** Simple aggregation of case_type values
- **Frontend:** Funnel visualization or horizontal stacked bar

#### 7. Ticket Age / Queue Health
- **For:** Manager + Analyst
- **Type:** Histogram or bucket bars
- **Data:** Open/In-Progress tickets grouped by age: <1h, 1-4h, 4-12h, 12-24h, 1-3d, 3-7d, >7d
- **Value:** Shows queue health at a glance. Dangerous old tickets = SLA breach risk. Currently 5 open tickets — small now but important as volume grows.
- **Backend:** Query open tickets, compute age buckets from created_time
- **Frontend:** Horizontal bar chart with color coding (green → yellow → red by age)

#### 8. Analyst Shift Performance
- **For:** Manager View
- **Type:** Grouped bar or comparison table
- **Data:** Tickets handled, avg MTTD, SLA % grouped by shift (00-08 WIB, 08-16, 16-24). Note: shift change at 08:00.
- **Value:** Which shift performs best/worst? Helps staffing decisions. Peak alert volume at 08-10 WIB = shift handover period, high risk for SLA.
- **Backend:** Aggregate by EXTRACT(HOUR FROM created_time) buckets
- **Frontend:** Comparison visualization

### P2 — Longer Term (needs AI / data quality work)

#### 9. AI Auto-Classify Attack Category
- **For:** System (runs on sync)
- **Type:** Background process, not a widget
- **Data:** Read ticket subject → LLM classifies into: Malware, Web Attack, Brute Force, Unauthorized Access, Agent Issue, SIEM Issue, Threat Intelligence, Spam, CVE, Other
- **Value:** 93% of tickets are "Other" because SOAR doesn't classify. Auto-classification enables attack pattern analysis.
- **Implementation:** On each sync cycle, find tickets with attack_category = "Other", batch-send subjects to configured LLM, update DB.
- **Dependencies:** Working LLM provider (9router already configured)
- **Note:** wazuh_rule_name is empty — classification uses subject only.
- **SOAR subject format (Mar 2025+):** `[SE] | CUSTOMER | MITRE_TACTIC | PRIORITY | Description`
- **Regex-first approach:** 14 regex patterns already cover **82% of SOAR tickets** (23.6k/28.9k). Breakdown: Brute Force (5.6k), Network IDS/IPS (5.4k), Windows Security (2.6k), Account Manipulation (1.6k), O365/Cloud Identity (1.6k), Ingress Tool Transfer (1.5k), Agent Issue (1.5k), PowerShell (1.2k), App Shimming (1.2k), Exploit/Web Attack (0.7k), Malware (0.4k), Web Attack (0.3k), SQL Injection (0.1k), File/Dir Discovery (41).
- **LLM fallback:** Only needed for ~5.3k (18%) "Uncategorized" tickets where regex doesn't match.
- **Pre-SOAR tickets (2024):** Different format — `[OH]`, `[S]`, `[M]` = shift logs, `[MACD]` = change requests. These are operational/non-alert tickets, should be tagged accordingly.

#### 10. FP Pattern Analysis (Noisy Rule Detection)
- **For:** Manager
- **Type:** Table or horizontal bar chart
- **Data:** Group tickets by subject pattern or attack_category → show FP rate per group. "Which rules generate the most false positives?"
- **Value:** Actionable for SOAR tuning — suppress or auto-close noisy rules to reduce FP rate
- **Dependencies:** Needs attack_category auto-classification (#9) to be most useful. Can start with subject-based grouping.

#### 11. Security Posture Score
- **For:** CxO
- **Type:** Single composite gauge (0-100)
- **Data:** Weighted composite of: MTTD SLA %, MTTR SLA %, FP rate (inverted), incident rate, ticket resolution rate
- **Value:** Single number for executives. "Is our security operations getting better?" Comparable month over month.
- **Implementation:** Define formula, compute on backend, display as gauge widget
- **Formula suggestion:** (MTTD_SLA × 0.30) + (MTTR_SLA × 0.25) + ((1 - FP_rate) × 100 × 0.20) + (resolution_rate × 0.15) + (no_incidents_bonus × 0.10)

---

## Implementation Notes

- **Historical data range:** Jan 2024 – present. Pre-2024 data excluded from trend widgets.
- **Manager View** is the primary target for P0/P1 widgets. CxO uses the same view.
- **Client View** already has RBAC-scoped data. Future: add case_type + attack_category widgets.
- **AI auto-classification:** Use regex first (covers 82%), LLM only for remaining 18%. Test on small batch before bulk run.
- **Pre-SOAR tickets (before Mar 2025):** Attack category classification less reliable — subjects are human-written, inconsistent format.
