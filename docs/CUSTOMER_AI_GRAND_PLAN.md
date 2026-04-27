# Grand Plan: AI-Enabled Customer Experience

## Vision
Customer merasakan bahwa SOC MTM adalah **AI-enabled** dan **AI-assisted** — bukan cuma dashboard metrik biasa, tapi ada intelligence layer yang aktif bekerja untuk mereka. Setiap interaksi dengan dashboard memberikan value: insight, rekomendasi, dan sense bahwa ada "otak AI" di balik operasi SOC.

## Current State (Customer View — CMWI example)

| Widget | Status | AI? |
|---|---|---|
| KPI Cards (Total Alerts, Active, MTTD, SLA, Incidents) | ✅ Working | ❌ |
| Incident Timeline (area chart) | ✅ Working | ❌ |
| SLA Performance (gauge) | ✅ Working | ❌ |
| Priority Breakdown (donut) | ✅ Working | ❌ |
| Top Alert Rules (bar chart) | ✅ Working | ❌ |
| Asset Exposure (ranked bars) | ✅ Working | ❌ |

**Gap:** Zero AI presence di customer-facing view. Customer hanya lihat angka dan grafik tanpa konteks atau actionable insight.

---

## Phase 1: Quick AI Wins (1-2 days)
*"Bikin customer WOW pada first impression"*

### 1.1 Customer Executive Summary (AI-Generated)
- Same pattern as Main Dashboard exec summary — tapi scoped per customer
- Auto-generates saat customer login atau tiap 3 jam
- Bahasa: Bahasa Indonesia, tone profesional-friendly
- Content: "Bulan ini environment Anda menangani X alerts, SLA compliance di Y%, top threat adalah Z, rekomendasi kami adalah..."
- **Impact:** Customer langsung lihat value — bukan cuma grafik, tapi ada "SOC brain" yang ngeanalisis

### 1.2 AI Insight Tooltips per Widget
- Same ✨ AI button pattern dari Manager View
- Per-widget: "Asset AD_Server_Primary menerima 184 alerts — 3x lebih tinggi dari asset lain. Rekomendasikan hardening dan review rule..."
- **Impact:** Setiap chart punya "so what?" yang jelas

### 1.3 AI Security Advisor (Scoped Chat)
- AI Chat widget (sudah ada FAB) tapi otomatis ter-scope ke data customer
- Prompt: "Kamu adalah security advisor untuk {CUSTOMER}. Datanya..."
- Customer bisa tanya: "Apa rekomendasi untuk minggu ini?", "Kenapa SLA turun?"
- **Impact:** Interactive AI experience, customer merasa punya dedicated advisor

---

## Phase 2: Customer Intelligence Dashboard (3-5 days)
*"Data → Insight → Action"*

### 2.1 Monthly Security Report (Auto-Generated)
- Endpoint `POST /api/reports/monthly?customer=X&month=2026-03`
- AI generates narrative report:
  - Executive summary
  - Trend analysis (volume, SLA, FP rate)
  - Top threats & attack patterns
  - Asset risk ranking
  - Recommendations for next month
- Output: HTML page (viewable in browser) + export as PDF
- Auto-generated setiap awal bulan, bisa di-generate manual juga
- **Impact:** Replace "laporan yang di-make-up" dengan laporan real, AI-generated

### 2.2 Threat Intelligence Brief
- Widget baru di Customer View: "AI Threat Brief"
- AI analyzes top attack categories + rules targeting this customer
- Output: "Environment Anda minggu ini menghadapi peningkatan serangan Brute Force (target: AD_Server). Pattern ini konsisten dengan campaign yang juga menyerang financial sector..."
- Generated weekly or on-demand
- **Impact:** Customer merasa ada proactive intelligence, bukan reactive

### 2.3 Anomaly Alerts (AI-Detected)
- Backend: scheduled job yang compare current metrics vs historical baseline
- If anomaly detected: push notification + AI explanation
- "Volume alert di environment Anda naik 200% dibanding rata-rata. Penyebab utama: Brute Force dari IP range 103.x.x.x. Tim SOC sudah men-triage."
- **Impact:** Proactive communication, customer tahu sebelum komplain

### 2.4 Predictive SLA Widget
- "Berdasarkan tren 7 hari terakhir, estimasi SLA akhir bulan: 42% (masih di bawah target 99%)"
- Simple regression dari SLA trend data (sudah ada di backend)
- Red/amber/green indicator for trajectory
- **Impact:** Forward-looking metric, bukan cuma backward-looking

---

## Phase 3: Customer Onboarding & Self-Service (1 week)
*"Customer feel in control"*

### 3.1 Welcome Dashboard & Guided Tour
- First-time customer login: modal overlay with step-by-step tour
- "Selamat datang di SOC Analytics Dashboard. Berikut fitur yang tersedia untuk Anda..."
- Highlight each widget with tooltip explaining what it shows
- Use `driver.js` or custom step-through component
- **Impact:** Reduce confusion, improve adoption

### 3.2 Custom SLA Thresholds
- Per-customer SLA target setting (stored in DB)
- Admin sets: "CMWI target MTTD SLA = 95%, MTTR SLA = 90%"
- All gauges and trend charts show customer-specific target line
- **Impact:** Customers see progress toward THEIR targets, not generic

### 3.3 Self-Service Report Generator
- Button: "Generate Report" → modal with date range picker
- One-click: generate AI-powered report for any period
- Download as PDF/HTML
- **Impact:** Customer doesn't need to ask SOC team for reports

### 3.4 Alert Notification Preferences
- Customer can set: "Notify me for Critical + High alerts only"
- Email digest frequency: real-time / hourly / daily
- Customize which assets to monitor
- **Impact:** Customer feels in control of their monitoring

---

## Phase 4: Advanced AI Features (2-4 weeks)
*"AI becomes the differentiator"*

### 4.1 Risk Score per Asset
- AI computes composite risk score per asset based on:
  - Attack frequency (high freq = higher risk)
  - Attack severity (more criticals = higher risk)
  - Vulnerability exposure (if integrated)
  - SLA compliance history
- Displayed as heatmap or ranked list
- Weekly delta: "AD_Server_Primary risk increased by 15 points"
- **Impact:** Prioritization guidance for customer's security team

### 4.2 SOAR Tuning Recommendations
- AI analyzes FP rate per rule per customer
- "Rule 'User account locked out' has 99% FP rate for CMWI. Recommend suppressing or adjusting threshold."
- Show estimated noise reduction if rule is tuned
- **Impact:** Directly reduces alert fatigue, improves SOC efficiency

### 4.3 QBR (Quarterly Business Review) Auto-Generator
- End of quarter: AI generates full review deck
- Sections: exec summary, KPI trends, incident summary, asset risk changes, SLA trajectory, recommendations, next quarter goals
- Export as professional HTML/PDF with charts embedded
- **Impact:** Save manager hours of manual report writing, ensure consistency

### 4.4 Industry Benchmarking
- "Your SLA of 39.5% is below the MSSP industry median of 75%"
- Benchmark data: aggregate from all MTM customers (anonymized)
- Show customer where they stand relative to peers
- **Impact:** Creates urgency for improvement, validates investment

---

## Phase 5: Business Value Storytelling (ongoing)
*"Show the ROI"*

### 5.1 ROI Dashboard Widget
- "MTM SOC has analyzed 397 alerts this month"
- "Prevented X potential incidents"
- "Estimated cost savings: Rp Y million"
- Based on: ticket volume × industry avg cost per incident × TP rate
- **Impact:** Justifies SOC investment to C-level

### 5.2 Compliance Mapping
- Map SOC activities to compliance frameworks (ISO 27001, PCI DSS, POJK)
- "Your monitoring covers 12 of 14 required ISO 27001 Annex A controls"
- **Impact:** Additional value for regulated customers

---

## Implementation Priority Matrix

| Feature | Effort | Customer Impact | AI Visibility | Recommendation |
|---|---|---|---|---|
| 1.1 Customer Exec Summary | Low | High | ⭐⭐⭐ | **Do first** |
| 1.2 AI Insight Tooltips | Low | High | ⭐⭐⭐ | **Do first** |
| 1.3 Scoped AI Chat | Medium | Very High | ⭐⭐⭐⭐ | **Do first** |
| 2.1 Monthly Report | Medium | Very High | ⭐⭐⭐ | Phase 2 |
| 2.2 Threat Intel Brief | Medium | High | ⭐⭐⭐⭐ | Phase 2 |
| 2.3 Anomaly Alerts | Medium | High | ⭐⭐⭐⭐ | Phase 2 |
| 2.4 Predictive SLA | Low | Medium | ⭐⭐ | Phase 2 |
| 3.1 Welcome Tour | Low | Medium | ⭐ | Phase 3 |
| 3.2 Custom SLA Targets | Low | Medium | ⭐ | Phase 3 |
| 3.3 Report Generator | Medium | High | ⭐⭐ | Phase 3 |
| 3.4 Alert Preferences | Medium | Medium | ⭐ | Phase 3 |
| 4.1 Asset Risk Score | High | Very High | ⭐⭐⭐⭐ | Phase 4 |
| 4.2 SOAR Tuning Recs | High | High | ⭐⭐⭐⭐ | Phase 4 |
| 4.3 QBR Generator | High | Very High | ⭐⭐⭐ | Phase 4 |
| 4.4 Benchmarking | Medium | Medium | ⭐⭐ | Phase 4 |
| 5.1 ROI Dashboard | Medium | Very High | ⭐⭐ | Phase 5 |
| 5.2 Compliance Mapping | High | High | ⭐⭐ | Phase 5 |

---

## Key Principles

1. **AI should be visible** — Every AI feature should have a ✨ or 🤖 indicator so customer SEES the AI at work
2. **Bahasa Indonesia** — All AI outputs in natural Bahasa Indonesia (already established)
3. **Actionable, not just informative** — Every AI output should end with "what to do next"
4. **Progressive disclosure** — Simple summary first, detail on click/expand
5. **Trust building** — Show when AI generated, what model used, give confidence indicator
6. **Zero extra work for SOC team** — All AI features auto-run; no manual data entry needed
