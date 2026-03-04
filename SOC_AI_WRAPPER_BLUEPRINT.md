# SOC AI Wrapper Blueprint (SDP + Wazuh)

## 1) Tujuan

Membangun platform wrapper berbasis web app di atas ServiceDesk Plus (SDP) dan Wazuh untuk:

1. Meningkatkan produktivitas SOC analyst.
2. Mempercepat triage dan investigasi ticket.
3. Menyediakan single pane of glass untuk operational dan management.
4. Menyediakan pelaporan mingguan dan bulanan yang konsisten.

Model AI rencana eksekusi: **Claude Opus 4.6** melalui layer adapter agar provider/model bisa diganti tanpa ubah arsitektur utama.

---

## 2) Arsitektur Tingkat Tinggi

```text
[Web App]
Ticketing Copilot | Technical Dashboard | Management Dashboard | Reports

        |
        v

[Backend API + Orchestrator]
Auth/RBAC | Workflow Engine | SLA Engine | Report Engine | Audit Log

        |                    |                     |
        v                    v                     v
[SDP Connector]        [Wazuh Connector]      [Data Store]
Ticket CRUD, notes,    Alerts/rules/host      Postgres (metrics),
custom fields, merge   context, history        Vector DB (similarity),
                                              Object Storage (reports)

        |
        v
[AI Adapter Layer]
Claude Opus 4.6 (primary), prompt templates, PII masking, policy checks
```

---

## 3) Modul Produk

1. **Ticketing Copilot**
2. **SOC Ops Dashboard** (technical single pane of glass)
3. **Management Dashboard**
4. **Report Center** (weekly/monthly)
5. **Knowledge & Similarity**
6. **Admin & Governance** (RBAC, prompt/version control, audit)

---

## 4) Use Case Scope (Final List)

| ID | Use Case | Input Utama | Output Utama | Approval |
|---|---|---|---|---|
| UC-01 | Auto Summary + Timeline | Ticket body, comments, activity log | Ringkasan 5-7 baris + timeline event | Analyst |
| UC-02 | Severity Suggestion | Ticket context, Wazuh alerts, asset criticality | Saran severity + alasan | Analyst/Lead |
| UC-03 | Wazuh Enrichment | Ticket indicator, host/user/IP | Rule detail, IOC context, alert serupa | Auto attach |
| UC-04 | Similar Ticket Finder | Ticket text + metadata | Top-N ticket mirip + resolusi terdahulu | Analyst |
| UC-05 | Similar Ticket Merger | Similarity score + status ticket | Rekomendasi merge candidate | **Lead wajib approve** |
| UC-06 | Draft Email First Notification | Incident context + template client | Draft email awal (teknis/non-teknis) | Analyst |
| UC-07 | SLA + MTTD + MTTR | Ticket timestamps + SLA matrix | KPI realtime + breach risk | Auto |
| UC-08 | False Positive Rate + Reduction Suggestion | Label TP/FP + rule trend | FP trend + rekomendasi tuning | Lead/SecEng |
| UC-09 | Weekly/Monthly Report Generator | KPI, trend, incident summary | Report PDF/HTML siap kirim | Manager review |
| UC-10 | Technical Dashboard | Live ticket, alert, queue health | Operasional dashboard untuk SOC | Auto |
| UC-11 | Management Dashboard | KPI agregat + tren + cost/risk signal | Executive view untuk leadership | Auto |

---

## 5) Workflow Inti

1. SDP mengirim event `ticket_create` / `ticket_update` / `ticket_close` ke webhook orchestrator.
2. Orchestrator mengambil detail ticket dari SDP API.
3. Orchestrator menjalankan enrichment dari Wazuh API.
4. Orchestrator mengeksekusi task AI sesuai trigger:
   `summary`, `severity`, `draft_email`, `similarity`.
5. Hasil AI ditulis kembali ke SDP (`custom fields` / `private notes`).
6. Analyst melakukan review dan keputusan final.
7. Batch job harian/mingguan menghitung KPI dan generate report.

---

## 6) Definisi KPI (Standar Operasional)

1. **MTTD** = rata-rata `first_detected_at - event_occurred_at`
2. **MTTR** = rata-rata `resolved_at - first_detected_at`
3. **First Response SLA Compliance** = jumlah ticket first response on-time / total ticket
4. **Resolution SLA Compliance** = jumlah ticket resolved on-time / total ticket
5. **False Positive Rate** = FP / (FP + TP)

Catatan: MTTD dan MTTR bukan satu-satunya indikator SLA, tetap butuh metrik response dan resolution SLA formal.

---

## 7) Guardrails & Governance

1. Semua output AI berstatus **suggestion**, bukan auto-decision.
2. `Similar Ticket Merger` tidak boleh auto-merge tanpa approval Lead.
3. Terapkan PII/secret masking sebelum request ke model.
4. Simpan audit trail lengkap: model version, prompt version, input hash, output, user decision.
5. Terapkan RBAC ketat: Analyst, Lead, Manager, Admin.
6. Sediakan fallback non-AI saat model timeout/error.

---

## 8) Rencana Implementasi Bertahap

### Phase 1 (Quick Win)

1. UC-01 Auto Summary + Timeline
2. UC-02 Severity Suggestion
3. UC-03 Wazuh Enrichment
4. UC-06 Draft Email First Notification
5. UC-07 SLA + MTTD + MTTR
6. UC-10 Technical Dashboard

### Phase 2 (Knowledge Efficiency)

1. UC-04 Similar Ticket Finder
2. UC-05 Similar Ticket Merger (approval flow)
3. UC-09 Weekly/Monthly Report Generator

### Phase 3 (Continuous Improvement & Executive)

1. UC-08 False Positive Rate + suggestion
2. UC-11 Management Dashboard

---

## 9) Kompatibilitas Sistem: Data yang Dibutuhkan dari Tim Anda

### P0 (Wajib sebelum technical design final)

- [ ] Versi exact ServiceDesk Plus (Cloud/On-Prem + build number)
- [ ] Versi exact Wazuh (manager/indexer/dashboard)
- [ ] Metode auth API SDP dan Wazuh (API key/OAuth/basic + scope)
- [ ] Ketersediaan webhook di SDP untuk create/update/close
- [ ] Daftar field ticket saat ini + custom field yang boleh ditambah
- [ ] Dukungan API untuk merge/link duplicate ticket di SDP
- [ ] Kebijakan data residency/compliance (boleh keluar network atau on-prem only)
- [ ] Volume operasional (ticket/day, alert/day, peak concurrency)
- [ ] SLA matrix resmi per severity dan per service
- [ ] Role matrix akses (Analyst, Lead, Manager, Admin)

### P1 (Sangat disarankan)

- [ ] Historis ticket 6-12 bulan (termasuk status final)
- [ ] Label TP/FP historis per incident/rule
- [ ] Asset criticality mapping (CMDB atau tag system)
- [ ] Template email first notification saat ini
- [ ] Format laporan yang dibutuhkan manajemen (PDF/PPT/dashboard)

---

## 10) Non-Functional Requirement (Draft)

1. Availability target backend: **99.5%** minimum.
2. P95 latency untuk AI assist ticket: **< 8 detik**.
3. Semua API call dan action user tercatat di audit log.
4. Data retention menyesuaikan kebijakan internal/compliance.
5. Dashboard refresh interval technical view: **30-60 detik**.

---

## 11) Integrasi AI (Claude Opus 4.6) - Prinsip Implementasi

1. Gunakan **AI Adapter Layer** agar model/provider dapat diganti tanpa rewrite service.
2. Pisahkan prompt per task:
   `summary`, `severity_reasoning`, `similarity`, `email_draft`, `fp_recommendation`.
3. Gunakan prompt versioning dan evaluation set kecil untuk regression check.
4. Tambahkan policy validation post-processing sebelum hasil ditampilkan.
5. Sediakan retry + timeout policy agar tidak mengganggu workflow analyst.

---

## 12) Deliverable Blueprint Ini

1. Arsitektur dan batasan implementasi.
2. Prioritas use case bertahap.
3. KPI dan guardrail operasional.
4. Checklist compatibility untuk kick-off lintas tim.

Dokumen ini adalah baseline untuk sesi detail berikutnya: ERD, API contract, RBAC matrix, dan sprint backlog.
