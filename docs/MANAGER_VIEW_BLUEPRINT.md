# Manager View — Analyst Performance Dashboard

## Blueprint & Implementation Plan

> **Project**: SOC Analytics Dashboard — MTM MSSP  
> **Author**: AI Assistant  
> **Created**: 7 Maret 2026  
> **Status**: Blueprint / Pre-Implementation

---

## 1. Tujuan

Memberikan **helicopter view** bagi SOC Manager untuk:
- Memantau performa individual setiap analyst
- Membandingkan analyst secara visual (spider chart + leaderboard)
- Melihat trend performa dari waktu ke waktu
- Mendapatkan AI-generated review per analyst
- Mengidentifikasi area improvement dan training needs

---

## 2. Data yang Tersedia (dari Ticket Model)

Field-field di tabel `tickets` yang relevan untuk scoring:

| Field | Type | Kegunaan |
|---|---|---|
| `technician` | `String(200)` | Identitas analyst (primary key performa) |
| `status` | `String(50)` | Open/Assigned/In Progress/Resolved/Closed |
| `priority` | `String(50)` | High/Medium/Low — untuk complexity scoring |
| `validation` | `String(50)` | True Positive / False Positive / Not Specified |
| `case_type` | `String(100)` | Security Incident vs biasa |
| `attack_category` | `String(200)` | Jenis serangan — diversity metric |
| `mttd_seconds` | `Integer` | Mean Time to Detect (computed) |
| `mttr_seconds` | `Integer` | Mean Time to Resolve (computed) |
| `sla_met` | `Boolean` | SLA compliance per ticket |
| `created_time` | `DateTime` | Waktu ticket dibuat |
| `completed_time` | `DateTime` | Waktu ticket selesai |
| `customer` | `String(200)` | Customer — diversity metric |
| `wazuh_rule_id` | `String(20)` | Alert rule — diversity metric |

### Data yang Belum Tersedia (Future Phase)

| Data | Keterangan |
|---|---|
| Shift schedule | Jam kerja analyst (untuk throughput/jam) |
| Attendance | Absensi / kehadiran |
| Peer review scores | Feedback dari rekan |
| Documentation quality | Kualitas report |
| Escalation rate | Ticket yang di-eskalasi |
| Customer feedback | Satisfaction score dari customer |

---

## 3. Scoring System

### 3.1 Tujuh Metrik (Spider Chart Axes)

Setiap metrik di-normalize ke skala **0–100**.

| # | Axis | Nama | Formula | Bobot |
|---|---|---|---|---|
| 1 | **Speed** | Kecepatan Deteksi | Inverse avg MTTD terhadap baseline (15 min). Semakin cepat = semakin tinggi | 20% |
| 2 | **Detection** | Deteksi TP | `(tp_count / total_tickets) × 100`. True Positive rate | 15% |
| 3 | **Accuracy** | Akurasi Validasi | `((tp + fp) / total) × 100` — seberapa banyak ticket yang sudah divalidasi (bukan "Not Specified") | 15% |
| 4 | **Volume** | Volume Handled | Normalized count ticket yang di-handle vs rata-rata team | 15% |
| 5 | **SLA** | SLA Compliance | `(sla_met_count / sla_total) × 100` | 20% |
| 6 | **Throughput** | Resolution Rate | `(resolved / assigned) × 100` | 10% |
| 7 | **Complexity** | Kompleksitas | Weighted score berdasarkan priority mix + Security Incident ratio | 5% |

### 3.2 Composite Score

```
composite = Σ (metric_score × weight)
```

Range: **0 – 100**

### 3.3 Tier System

| Tier | Score Range | Label | Color |
|---|---|---|---|
| **S** | 90 – 100 | Elite | `#FFD700` (Gold) |
| **A** | 75 – 89 | Excellent | `#22C55E` (Green) |
| **B** | 60 – 74 | Good | `#3B82F6` (Blue) |
| **C** | 40 – 59 | Average | `#F59E0B` (Amber) |
| **D** | 0 – 39 | Needs Improvement | `#EF4444` (Red) |

### 3.4 Normalisasi Detail per Metrik

#### Speed (MTTD)
```python
SLA_BASELINE = 900  # 15 menit
if avg_mttd <= 0 or avg_mttd is None:
    score = 0  # no data
elif avg_mttd <= SLA_BASELINE * 0.5:  # ≤7.5 min
    score = 100
elif avg_mttd <= SLA_BASELINE:        # ≤15 min
    score = 50 + 50 * (1 - (avg_mttd - SLA_BASELINE*0.5) / (SLA_BASELINE*0.5))
elif avg_mttd <= SLA_BASELINE * 2:    # ≤30 min
    score = 50 * (1 - (avg_mttd - SLA_BASELINE) / SLA_BASELINE)
else:
    score = 0
```

#### Detection (TP Rate)
```python
score = min(100, tp_rate * 1.25)  # 80% TP rate = score 100
```

#### Accuracy (Validation Rate)
```python
validated = tp_count + fp_count
score = (validated / total) * 100 if total > 0 else 0
```

#### Volume
```python
team_avg = total_team_tickets / num_analysts
score = min(100, (analyst_tickets / team_avg) * 75)  # 133% of avg = score 100
```

#### SLA Compliance
```python
score = sla_compliance_pct  # sudah 0-100
```

#### Throughput (Resolution Rate)
```python
score = min(100, (resolved / assigned) * 100) if assigned > 0 else 0
```

#### Complexity
```python
high_ratio = high_priority_count / total
si_ratio = security_incident_count / total
score = min(100, (high_ratio * 60 + si_ratio * 40) * 2)  # Heavy caseload = higher score
```

---

## 4. Arsitektur

### 4.1 Backend

```
backend/app/
├── services/
│   └── analyst_service.py        # NEW — Scoring engine + analyst metrics
├── routers/
│   └── analysts.py               # NEW — API endpoints /api/analysts/*
└── schemas.py                    # EXTEND — New response models
```

### 4.2 Frontend

```
frontend/src/
├── pages/
│   ├── Dashboard.tsx             # Existing
│   └── ManagerView.tsx           # NEW — Manager View page
├── components/
│   ├── AnalystScoreCard.tsx      # NEW — Individual analyst card with spider chart
│   ├── AnalystLeaderboard.tsx    # NEW — Ranked table with tiers
│   ├── AnalystSpiderChart.tsx    # NEW — Radar/spider chart component
│   ├── AnalystDetailModal.tsx    # NEW — Full detail modal per analyst
│   ├── AnalystTrendChart.tsx     # NEW — Line chart trends (Phase 2)
│   └── AnalystAIReview.tsx       # NEW — AI-generated performance review
└── App.tsx                       # MODIFY — Add routing to Manager View
```

### 4.3 Navigation

- Header bar: tambah tombol **"Manager View"** di samping Settings
- Atau: simple page toggle (Dashboard ↔ Manager View)
- Future: role-based access (hanya manager yang bisa akses)

---

## 5. API Endpoints

### 5.1 `GET /api/analysts/scores`

Leaderboard semua analyst dengan composite score.

**Query Params:**
| Param | Type | Default | Description |
|---|---|---|---|
| `start` | ISO date | 30 hari lalu | Periode mulai |
| `end` | ISO date | Hari ini | Periode akhir |

**Response:**
```json
[
  {
    "analyst": "Rizky Fauzi",
    "tier": "A",
    "composite_score": 82.5,
    "metrics": {
      "speed": 88.0,
      "detection": 75.0,
      "accuracy": 92.0,
      "volume": 70.0,
      "sla": 85.0,
      "throughput": 80.0,
      "complexity": 65.0
    },
    "stats": {
      "total_tickets": 145,
      "resolved": 130,
      "tp_count": 95,
      "fp_count": 35,
      "ns_count": 15,
      "avg_mttd_seconds": 420,
      "avg_mttd_display": "7m 0s",
      "avg_mttr_seconds": 3600,
      "avg_mttr_display": "1h 0m",
      "sla_met": 120,
      "sla_total": 140,
      "sla_pct": 85.7,
      "high_priority": 30,
      "security_incidents": 12
    }
  }
]
```

### 5.2 `GET /api/analysts/{name}/detail`

Detail lengkap satu analyst.

**Query Params:** `start`, `end`

**Response:**
```json
{
  "analyst": "Rizky Fauzi",
  "tier": "A",
  "composite_score": 82.5,
  "metrics": { ... },
  "stats": { ... },
  "top_customers": [
    { "customer": "Bank XYZ", "count": 25 },
    { "customer": "PT ABC", "count": 18 }
  ],
  "top_alerts": [
    { "rule_name": "Brute Force Attack", "count": 12 },
    { "rule_name": "Malware Detection", "count": 8 }
  ],
  "recent_tickets": [
    { "id": 12345, "subject": "...", "status": "Resolved", "priority": "High" }
  ]
}
```

### 5.3 `GET /api/analysts/{name}/trend` *(Phase 2)*

Trend composite score over time.

**Query Params:** `start`, `end`, `granularity` (weekly/monthly)

**Response:**
```json
{
  "analyst": "Rizky Fauzi",
  "points": [
    {
      "period": "2026-W09",
      "composite_score": 78.0,
      "metrics": { "speed": 85, "detection": 72, ... }
    },
    {
      "period": "2026-W10",
      "composite_score": 82.5,
      "metrics": { "speed": 88, "detection": 75, ... }
    }
  ]
}
```

### 5.4 `POST /api/analysts/{name}/ai-review`

AI-generated performance review per analyst.

**Request Body:**
```json
{
  "provider_id": 1,
  "start_date": "2026-03-01",
  "end_date": "2026-03-07"
}
```

**Response:**
```json
{
  "analyst": "Rizky Fauzi",
  "review": "## Performance Review: Rizky Fauzi\n\n### Strengths\n- Excellent detection speed...\n\n### Areas for Improvement\n- ...",
  "provider": "GPT-5.2",
  "generated_at": "2026-03-07T10:30:00Z"
}
```

---

## 6. Frontend Layout

### 6.1 Manager View Page — Helicopter View

```
┌─────────────────────────────────────────────────────┐
│  [← Dashboard]   Manager View    [Period Filter]    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─── Team Summary KPIs ─────────────────────────┐  │
│  │ Total Analysts │ Avg Score │ Top Tier │ ...    │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  ┌─── Leaderboard ───────────────────────────────┐  │
│  │ # │ Analyst  │ Tier │ Score │ Tickets │ SLA   │  │
│  │ 1 │ Rizky F  │  S   │ 92.0  │   180   │ 95%   │  │
│  │ 2 │ Ahmad S  │  A   │ 82.5  │   145   │ 85%   │  │
│  │ 3 │ Budi P   │  B   │ 68.0  │   120   │ 72%   │  │
│  │ ...                                           │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  ┌─── Analyst Cards (Grid) ──────────────────────┐  │
│  │ ┌──────────┐ ┌──────────┐ ┌──────────┐       │  │
│  │ │ Rizky F  │ │ Ahmad S  │ │ Budi P   │       │  │
│  │ │ [Spider] │ │ [Spider] │ │ [Spider] │       │  │
│  │ │ Tier: S  │ │ Tier: A  │ │ Tier: B  │       │  │
│  │ │ Score:92 │ │ Score:82 │ │ Score:68 │       │  │
│  │ └──────────┘ └──────────┘ └──────────┘       │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 6.2 Analyst Detail Modal (click pada card/leaderboard row)

```
┌──────────────────────────────────────────────────────────┐
│  Analyst Detail: Rizky Fauzi               Tier: S [92]  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌── Spider Chart ──┐  ┌── KPI Summary ──────────────┐  │
│  │                  │  │ Total Tickets: 180           │  │
│  │   Speed:88       │  │ Resolved: 165               │  │
│  │   Det:75  SLA:85 │  │ TP Rate: 72%                │  │
│  │   Acc:92         │  │ Avg MTTD: 7m 0s             │  │
│  │   Vol:70 Thr:80  │  │ Avg MTTR: 1h 0m             │  │
│  │   Cplx:65       │  │ SLA Compliance: 85.7%        │  │
│  └──────────────────┘  └─────────────────────────────┘  │
│                                                          │
│  ┌── Top Customers ──┐  ┌── Top Alerts ──────────────┐  │
│  │ Bank XYZ    : 25  │  │ Brute Force     : 12       │  │
│  │ PT ABC      : 18  │  │ Malware         : 8        │  │
│  └───────────────────┘  └─────────────────────────────┘  │
│                                                          │
│  ┌── Trend Chart (Phase 2) ──────────────────────────┐  │
│  │ [Line chart: composite score over weeks/months]   │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  ┌── AI Performance Review ──────────────────────────┐  │
│  │ [Generate Review]                                 │  │
│  │                                                   │  │
│  │ ## Strengths                                      │  │
│  │ - Excellent detection speed (avg 7m, well below   │  │
│  │   15m SLA)                                        │  │
│  │ - High validation completion rate (92%)           │  │
│  │                                                   │  │
│  │ ## Areas for Improvement                          │  │
│  │ - Volume slightly below team average              │  │
│  │ ...                                               │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  ┌── Recent Tickets ─────────────────────────────────┐  │
│  │ ID    │ Subject        │ Status   │ Priority      │  │
│  │ 12345 │ Brute Force... │ Resolved │ High          │  │
│  │ 12300 │ Malware Det... │ Closed   │ Medium        │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## 7. Database Additions

### Phase 1: Tidak Perlu Tabel Baru

Semua data dihitung on-the-fly dari tabel `tickets`. Cukup efficient karena:
- Filter by `technician` + date range
- Aggregate functions (COUNT, AVG, etc.)
- Index pada `technician` + `created_time` sudah cukup

**Recommended Index:**
```sql
CREATE INDEX idx_tickets_technician_created 
ON tickets (technician, created_time) 
WHERE technician IS NOT NULL;
```

### Phase 2: Snapshot Table (untuk trend)

```sql
CREATE TABLE analyst_snapshots (
    id SERIAL PRIMARY KEY,
    analyst VARCHAR(200) NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    granularity VARCHAR(20) NOT NULL DEFAULT 'weekly',  -- weekly, monthly
    composite_score REAL,
    speed_score REAL,
    detection_score REAL,
    accuracy_score REAL,
    volume_score REAL,
    sla_score REAL,
    throughput_score REAL,
    complexity_score REAL,
    total_tickets INTEGER,
    resolved INTEGER,
    tp_count INTEGER,
    fp_count INTEGER,
    avg_mttd_seconds REAL,
    avg_mttr_seconds REAL,
    sla_pct REAL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (analyst, period_start, granularity)
);
```

**Snapshot Job**: Scheduled task (weekly) yang menghitung score dan menyimpan ke tabel ini.

---

## 8. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Spider Chart | `recharts` RadarChart | Already using recharts |
| Table | Custom Tailwind table | Consistent with existing AnalystTable |
| AI Review | Existing LLM service | Reuse `ai_service.py` multi-provider |
| Markdown | `react-markdown` + `remark-gfm` | Already installed |
| Routing | Simple state toggle | No react-router needed (MVP) |

---

## 9. Implementation Plan — Per Phase

### Phase 1: Foundation *(Estimated: 2-3 sessions)*

**Backend:**
- [ ] `backend/app/services/analyst_service.py` — Scoring engine
  - `AnalystScoringService` class
  - 7 metric calculators
  - Composite score + tier assignment
  - Per-analyst detail aggregation (top customers, top alerts)
- [ ] `backend/app/routers/analysts.py` — API endpoints
  - `GET /api/analysts/scores` — Leaderboard
  - `GET /api/analysts/{name}/detail` — Detail
  - `POST /api/analysts/{name}/ai-review` — AI review
- [ ] `backend/app/schemas.py` — Extend with new models
  - `AnalystScore`, `AnalystMetrics`, `AnalystDetail`, `AnalystAIReview`
- [ ] `backend/app/main.py` — Register new router
- [ ] Database index: `idx_tickets_technician_created`

**Frontend:**
- [ ] `ManagerView.tsx` — Main page (leaderboard + analyst cards grid)
- [ ] `AnalystSpiderChart.tsx` — Recharts RadarChart component
- [ ] `AnalystScoreCard.tsx` — Card with mini spider + tier badge
- [ ] `AnalystLeaderboard.tsx` — Ranked table
- [ ] `AnalystDetailModal.tsx` — Full detail modal
- [ ] `AnalystAIReview.tsx` — AI review panel (reuse markdown renderer)
- [ ] `App.tsx` — Add page toggle (Dashboard ↔ Manager View)

**Deliverables:**
- ✅ Functional Manager View page
- ✅ Spider chart per analyst
- ✅ Leaderboard with tier badges
- ✅ Analyst detail modal with KPIs + top customers/alerts
- ✅ AI-generated performance review

---

### Phase 2: Trends & Historical *(Estimated: 1-2 sessions)*

**Backend:**
- [ ] `analyst_snapshots` table + SQLAlchemy model
- [ ] Snapshot scheduled task (weekly cron at Sunday midnight WIB)
- [ ] `GET /api/analysts/{name}/trend` endpoint
- [ ] Backfill script untuk historical data

**Frontend:**
- [ ] `AnalystTrendChart.tsx` — Line chart (composite score over time)
- [ ] Time granularity selector (weekly/monthly/quarterly)
- [ ] Comparison mode (overlay 2+ analysts)
- [ ] Add trend chart to AnalystDetailModal

**Deliverables:**
- ✅ Historical score tracking
- ✅ Trend line charts per analyst
- ✅ Period comparison (week-over-week, month-over-month)

---

### Phase 3: Extensions *(Future / Optional)*

- [ ] **Auth Gate**: Role-based access control (Manager only)
- [ ] **Attendance Module**: Integrasi data shift/kehadiran
- [ ] **Documentation Quality**: Score berdasarkan description completeness
- [ ] **Team Comparison**: Multiple team/group comparison
- [ ] **Export**: PDF report per analyst per bulan
- [ ] **Notification**: Alert jika analyst score turun dibawah threshold
- [ ] **Custom Weights**: UI untuk adjust bobot scoring per metric
- [ ] **Peer Review**: Manual input rating dari rekan

---

## 10. Risiko & Mitigasi

| Risk | Impact | Mitigation |
|---|---|---|
| Analyst name inconsistent di SDP | Scoring salah | Normalize names, add alias mapping |
| Terlalu sedikit data per analyst | Score tidak representatif | Set minimum ticket threshold (≥10) |
| Performance query berat | Slow API | Database index + caching (Redis) |
| Bias pada volume | Analyst shift malam handle lebih sedikit | Future: normalize per working hours |
| FP tickets inflate volume | Score tidak fair | Sudah include FP — complexity metric covers ini |

---

## 11. File Reference — Existing Code

| File | Relevance |
|---|---|
| `backend/app/models.py` | Ticket model — semua field yang dibutuhkan |
| `backend/app/services/analytics_service.py` | Existing `get_analyst_performance()` — akan di-extend |
| `backend/app/routers/metrics.py` | Existing `GET /api/metrics/analysts` — basic version |
| `backend/app/schemas.py` | `AnalystPerformance` schema — akan diperluas |
| `backend/app/services/ai_service.py` | AI multi-provider — reuse untuk AI review |
| `frontend/src/components/AnalystTable.tsx` | Existing analyst table — referensi styling |
| `frontend/src/pages/Dashboard.tsx` | Existing page — referensi arsitektur |
| `frontend/src/App.tsx` | Entry point — add Manager View toggle |

---

## 12. Rekomendasi: Per Phase Implementation

> **Pertanyaan**: Implementasi per fase atau sekaligus?

**Rekomendasi: Per Phase (Incremental)**

Alasan:
1. **Phase 1 sudah deliver value** — Manager langsung bisa lihat score + leaderboard
2. **Feedback loop** — Bisa adjust scoring formula sebelum build trend system
3. **Avoid over-engineering** — Phase 2 & 3 mungkin berubah setelah real usage
4. **Risk reduction** — Kalau ada bug di scoring, ketahuan lebih awal
5. **Smaller PRs** — Easier to review, test, and deploy

**Timeline estimasi:**
- Phase 1: 2-3 working sessions (backend API + frontend page)
- Phase 2: 1-2 working sessions (trend snapshots + charts)
- Phase 3: Ongoing (fitur tambahan sesuai kebutuhan)

---

*Last updated: 7 Maret 2026*
