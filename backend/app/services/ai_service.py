"""AI insights service — multi-provider LLM support."""

import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import LlmProvider

logger = logging.getLogger(__name__)
settings = get_settings()


class AIService:
    """Generates AI-powered insights from SOC analytics data."""

    SYSTEM_PROMPT = """You are a SOC (Security Operations Center) analytics assistant for an MSSP 
(Managed Security Service Provider) company in Indonesia. You analyze security ticket data and provide 
actionable insights in Bahasa Indonesia.

PENTING tentang bahasa:
- Gunakan Bahasa Indonesia yang NATURAL dan mudah dipahami, seperti percakapan profesional sehari-hari.
- JANGAN gunakan kata-kata formal/kaku yang jarang dipakai sehari-hari (contoh: hindari "disparitas", "anomali signifikan", "eskalasi komprehensif", "implikasi substansial"). 
- Gunakan padanan yang lebih umum dan langsung (contoh: "perbedaan besar", "lonjakan yang perlu dicek", "perlu ditindaklanjuti segera").
- Boleh pakai istilah teknis cybersecurity dalam bahasa Inggris (MTTD, SLA, True Positive, False Positive, rule tuning, dll) — yang penting kalimatnya tetap natural.
- Tone: profesional tapi santai, seperti SOC manager ngobrol sama timnya.

Focus on:
1. Trends and anomalies
2. Actionable recommendations for the SOC manager
3. Highlighting concerning patterns"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _get_provider(self, provider_id: Optional[int] = None) -> Optional[LlmProvider]:
        """Get specific or default LLM provider from DB."""
        if provider_id:
            row = await self.db.get(LlmProvider, provider_id)
            if row and row.is_active:
                return row
            return None

        # Get default provider
        result = await self.db.execute(
            select(LlmProvider)
            .where(LlmProvider.is_active == True, LlmProvider.is_default == True)
            .limit(1)
        )
        row = result.scalar_one_or_none()
        if row:
            return row

        # Fallback: any active provider
        result = await self.db.execute(
            select(LlmProvider).where(LlmProvider.is_active == True).limit(1)
        )
        return result.scalar_one_or_none()

    async def classify_attack_category(self, subject: str) -> str:
        """Use LLM to classify a ticket subject into an attack category."""
        provider = await self._get_provider()
        if not provider:
            return "Other"

        prompt = f"""Klasifikasikan ticket security berikut ke dalam salah satu kategori:
Brute Force, Account Manipulation, Malware, Web Exploitation, Unauthorized Access,
PowerShell Execution, Network IDS/IPS, O365/Cloud Identity, Windows Security Event,
Agent Issue, Web Attack, Threat Intelligence, Spam, CVE/Vulnerability, SIEM Issue,
Operational/Non-Alert, Other

Subject: {subject}

Jawab HANYA dengan nama kategori saja, tanpa penjelasan."""

        try:
            result = await self._call_llm(provider, prompt)
            return result.strip().split('\n')[0].strip()
        except Exception:
            return "Other"

    async def generate_insights(
        self,
        metrics: dict,
        period: str = "7d",
        customer: Optional[str] = None,
        provider_id: Optional[int] = None,
        start_date=None,
        end_date=None,
    ) -> dict:
        """Generate AI narrative insights from metrics data."""
        provider = await self._get_provider(provider_id)

        if provider is None:
            # Legacy fallback: try CLAUDE_API_KEY from env
            if settings.CLAUDE_API_KEY:
                return await self._call_anthropic_legacy(metrics, period, customer)
            return self._fallback_insights(metrics, period)

        prompt = self._build_prompt(metrics, period, customer, start_date, end_date)

        try:
            text = await self._call_llm(provider, prompt)
            result = self._parse_ai_response(text)
            result["model_used"] = f"{provider.label} ({provider.model})"
            return result
        except Exception as e:
            logger.error(f"AI insight generation failed [{provider.label}]: {e}")
            return self._fallback_insights(metrics, period)

    async def _call_llm(self, provider: LlmProvider, prompt: str) -> str:
        """Call the appropriate LLM provider."""
        if provider.provider == "anthropic":
            return await self._call_anthropic(provider, prompt)
        elif provider.provider in ("openai", "xai", "google", "openrouter", "9router"):
            return await self._call_openai_compatible(provider, prompt)
        else:
            raise ValueError(f"Unsupported provider: {provider.provider}")

    async def _call_anthropic(self, provider: LlmProvider, prompt: str) -> str:
        import anthropic

        client = anthropic.AsyncAnthropic(api_key=provider.api_key)
        response = await client.messages.create(
            model=provider.model,
            max_tokens=1024,
            system=self.SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.content[0].text

    async def _call_openai_compatible(self, provider: LlmProvider, prompt: str) -> str:
        import httpx

        DEFAULT_URLS = {
            "xai": "https://api.x.ai/v1",
            "google": "https://generativelanguage.googleapis.com/v1beta/openai",
            "openrouter": "https://openrouter.ai/api/v1",
            "9router": "https://9ai.cyberxatria.id/v1",
        }
        url = provider.base_url or DEFAULT_URLS.get(provider.provider, "https://api.openai.com/v1")

        # Newer OpenAI models (gpt-4o, gpt-5*, o1, o3, etc.) require
        # 'max_completion_tokens' instead of 'max_tokens'.
        model_lower = (provider.model or "").lower()
        use_new_param = provider.provider == "openai" and any(
            tag in model_lower for tag in ("gpt-4o", "gpt-5", "o1", "o3", "o4")
        )
        token_param = (
            {"max_completion_tokens": 1024} if use_new_param else {"max_tokens": 1024}
        )

        async with httpx.AsyncClient(timeout=60) as http:
            resp = await http.post(
                f"{url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {provider.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": provider.model,
                    **token_param,
                    "stream": False,
                    "messages": [
                        {"role": "system", "content": self.SYSTEM_PROMPT},
                        {"role": "user", "content": prompt},
                    ],
                },
            )
            if resp.status_code != 200:
                raise RuntimeError(f"LLM HTTP {resp.status_code}: {resp.text[:300]}")
            data = resp.json()
            return data["choices"][0]["message"]["content"]

    async def _call_anthropic_legacy(self, metrics: dict, period: str, customer: Optional[str]) -> dict:
        """Legacy path using env-var Claude API key."""
        try:
            import anthropic

            client = anthropic.AsyncAnthropic(api_key=settings.CLAUDE_API_KEY)
            prompt = self._build_prompt(metrics, period, customer)
            response = await client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=1024,
                system=self.SYSTEM_PROMPT,
                messages=[{"role": "user", "content": prompt}],
            )
            text = response.content[0].text
            result = self._parse_ai_response(text)
            result["model_used"] = "Claude Sonnet (legacy env key)"
            return result
        except Exception as e:
            logger.error(f"Legacy AI call failed: {e}")
            return self._fallback_insights(metrics, period)

    def _build_prompt(self, metrics: dict, period: str, customer: Optional[str], start_date=None, end_date=None) -> str:
        if start_date and end_date:
            days = (end_date - start_date).days
            if days <= 1:
                period_label = f"hari ini ({start_date.strftime('%d %b %Y')})"
            else:
                period_label = f"{days} hari ({start_date.strftime('%d %b')} - {end_date.strftime('%d %b %Y')})"
        else:
            period_label = {"1d": "hari ini", "7d": "7 hari terakhir", "30d": "30 hari terakhir"}.get(
                period, period
            )
        customer_label = f" untuk customer {customer}" if customer else ""

        return f"""Analisis data SOC berikut untuk periode {period_label}{customer_label}:

**Summary:**
- Total ticket: {metrics.get('total_tickets', 0)}
- Open ticket: {metrics.get('open_tickets', 0)}
- True Positive: {metrics.get('tp_count', 0)} ({metrics.get('tp_rate', 0)}%)
- False Positive: {metrics.get('fp_count', 0)} ({metrics.get('fp_rate', 0)}%)
- Not Specified: {metrics.get('ns_count', 0)}
- Security Incident: {metrics.get('si_count', 0)}
- Avg MTTD: {metrics.get('avg_mttd_display', 'N/A')}
- SLA Compliance: {metrics.get('sla_compliance_pct', 'N/A')}%

**Top Alert Rules:**
{self._format_top_alerts(metrics.get('top_alerts', []))}

**Customer Breakdown:**
{self._format_customers(metrics.get('customers', []))}

**Analyst Performance:**
{self._format_analysts(metrics.get('analysts', []))}

Berikan:
1. RINGKASAN: Executive summary 2-3 kalimat
2. ANOMALI: Daftar anomali atau concern (jika ada)
3. Rekomendasi yang dibagi ke 3 kategori:
   - PEOPLE: Rekomendasi terkait SDM, skill, training, workload analyst, shift management
   - PROCESS: Rekomendasi terkait SOP, workflow, eskalasi, proses notifikasi, triage
   - TECHNOLOGY: Rekomendasi terkait tuning rule, tools, automation, integrasi sistem

Format: gunakan heading RINGKASAN:, ANOMALI:, PEOPLE:, PROCESS:, TECHNOLOGY: untuk setiap bagian.
Setiap kategori rekomendasi HARUS ada minimal 1 item (jika memang tidak ada concern, berikan saran improvement)."""

    def _format_top_alerts(self, alerts: list) -> str:
        if not alerts:
            return "- Tidak ada data"
        lines = []
        for a in alerts[:5]:
            lines.append(
                f"- Rule {a.get('rule_id', '?')}: {a.get('rule_name', '?')} "
                f"({a.get('count', 0)}x, TP: {a.get('tp_rate', 0)}%)"
            )
        return "\n".join(lines)

    def _format_customers(self, customers: list) -> str:
        if not customers:
            return "- Tidak ada data"
        lines = []
        for c in customers:
            lines.append(
                f"- {c.get('customer', '?')}: {c.get('total', 0)} tickets, "
                f"TP rate: {c.get('tp_rate', 0)}%"
            )
        return "\n".join(lines)

    def _format_analysts(self, analysts: list) -> str:
        if not analysts:
            return "- Tidak ada data"
        lines = []
        for a in analysts:
            lines.append(
                f"- {a.get('analyst', '?')}: {a.get('assigned', 0)} assigned, "
                f"{a.get('resolved', 0)} resolved, MTTR: {a.get('avg_mttr_display', 'N/A')}"
            )
        return "\n".join(lines)

    def _parse_ai_response(self, text: str) -> dict:
        """Parse AI response into structured sections."""
        sections = {
            "narrative": "",
            "anomalies": [],
            "recommendations": [],
            "rec_people": [],
            "rec_process": [],
            "rec_technology": [],
        }

        current = "narrative"
        for line in text.split("\n"):
            line_stripped = line.strip()
            if not line_stripped:
                continue

            lower = line_stripped.lower()
            if "ringkasan" in lower:
                current = "narrative"
                continue
            elif "anomali" in lower:
                current = "anomalies"
                continue
            elif "people" in lower and (":" in line_stripped or "**" in line_stripped):
                current = "rec_people"
                continue
            elif "process" in lower and (":" in line_stripped or "**" in line_stripped):
                current = "rec_process"
                continue
            elif "technology" in lower and (":" in line_stripped or "**" in line_stripped):
                current = "rec_technology"
                continue
            elif "rekomendasi" in lower:
                current = "recommendations"
                continue

            if current == "narrative":
                sections["narrative"] += line_stripped + " "
            else:
                item = line_stripped.lstrip("- \u2022123456789.)")
                if item:
                    sections[current].append(item.strip())

        sections["narrative"] = sections["narrative"].strip()

        # If categorized recs were found, clear the generic list
        # If only generic recommendations were found (old-style), keep them
        has_categorized = sections["rec_people"] or sections["rec_process"] or sections["rec_technology"]
        if has_categorized:
            sections["recommendations"] = []

        sections["generated_at"] = datetime.now(timezone.utc)
        return sections

    async def generate_widget_insights(self, data: dict, provider_id: Optional[int] = None) -> dict:
        """Generate 1-2 sentence AI insights per widget from aggregated metric data."""
        provider = await self._get_provider(provider_id)
        if not provider:
            return {"error": "No LLM provider configured"}

        # Build a compact summary of each widget's data
        parts = []

        if data.get("posture_score"):
            ps = data["posture_score"]
            parts.append(f"Security Posture Score: {ps.get('score', 0):.1f}/100 (Grade {ps.get('grade','?')}), MTTD SLA {ps.get('mttd_sla_pct', 0):.1f}%, MTTR SLA {ps.get('mttr_sla_pct', 0):.1f}%, FP Rate {ps.get('fp_rate', 0):.1f}%")

        if data.get("sla_trend"):
            rows = data["sla_trend"][-3:]  # last 3 months
            trend_str = ", ".join([f"{r['month']}: MTTD={r.get('mttd_sla_pct', 'N/A')}% MTTR={r.get('mttr_sla_pct', 'N/A')}%" for r in rows])
            parts.append(f"SLA Trend (3 bulan terakhir): {trend_str}")

        if data.get("fp_trend"):
            rows = data["fp_trend"][-3:]
            fp_str = ", ".join([f"{r['month']}: FP={r.get('fp_rate', 'N/A')}%" for r in rows])
            parts.append(f"FP Rate Trend: {fp_str}")

        if data.get("mom_kpis"):
            for k in data["mom_kpis"]:
                parts.append(f"MoM {k['metric']}: sekarang={k['current']:.1f}, sebelumnya={k['previous']:.1f}, delta={k.get('delta_pct', 'N/A')}%")

        if data.get("shift_perf"):
            for s in data["shift_perf"]:
                parts.append(f"Shift {s['shift']}: {s['total']} tiket, MTTD SLA {s.get('mttd_sla_pct', 'N/A')}%, avg MTTD {s.get('avg_mttd_min', 'N/A')} min")

        if data.get("analyst_scores"):
            top = sorted(data["analyst_scores"], key=lambda x: x.get("composite_score", 0), reverse=True)[:3]
            for a in top:
                parts.append(f"Analyst {a['analyst']}: score={a.get('composite_score', 0):.1f}, tier={a.get('tier','?')}")

        if data.get("customer_sla"):
            # Get worst customers
            cells = [c for c in data["customer_sla"] if c.get("mttd_sla_pct") is not None]
            worst = sorted(cells, key=lambda x: x.get("mttd_sla_pct", 100))[:3]
            for c in worst:
                parts.append(f"Customer {c['customer']} bulan {c['month']}: SLA {c.get('mttd_sla_pct', 'N/A')}%")

        if data.get("funnel"):
            for step in data["funnel"]:
                parts.append(f"Funnel {step['step']}: {step['count']} ({step['pct_of_total']:.1f}% dari total)")

        context = "\n".join(parts)

        prompt = f"""Kamu adalah SOC analyst senior yang menganalisis data berikut.
Berikan insight singkat (1-2 kalimat) dalam Bahasa Indonesia untuk SETIAP widget.
Fokus pada: anomali, tren penting, atau action yang perlu diambil.
Jawab dalam format JSON dengan key yang persis sama seperti yang diminta.

DATA METRIK:
{context}

Berikan insight untuk widget-widget ini (format JSON):
{{
  "posture_score": "insight tentang security posture score keseluruhan",
  "sla_trend": "insight tentang tren SLA compliance",
  "fp_trend": "insight tentang tren false positive rate",
  "mom_kpis": "insight tentang perbandingan bulan ini vs sebelumnya",
  "customer_sla": "insight tentang performa SLA per customer",
  "sla_breach": "insight tentang penyebab utama SLA breach",
  "shift_perf": "insight tentang performa per shift",
  "analyst_scores": "insight tentang performa tim analyst",
  "fp_patterns": "insight tentang kategori yang paling banyak FP",
  "funnel": "insight tentang konversi alert ke incident"
}}

Jawab HANYA dengan JSON valid, tanpa markdown atau teks lain."""

        try:
            result = await self._call_llm(provider, prompt)
            # Parse JSON from response
            import json
            import re
            # Extract JSON from response (LLM sometimes wraps in markdown)
            json_match = re.search(r'\{.*\}', result, re.DOTALL)
            if json_match:
                insights = json.loads(json_match.group())
            else:
                insights = json.loads(result)
            return {"insights": insights, "model_used": f"{provider.label} ({provider.model})"}
        except Exception as e:
            logger.error(f"Widget insights failed: {e}")
            return {"insights": {}, "model_used": "error", "error": str(e)}

    async def generate_executive_summary(
        self, start_date=None, end_date=None, customer=None, provider_id=None
    ) -> dict:
        """Generate an executive summary paragraph from SOC metrics."""
        from app.services.analytics_service import AnalyticsService

        provider = await self._get_provider(provider_id)
        if not provider:
            return {
                "summary": "No LLM provider configured.",
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "model_used": "none",
            }

        svc = AnalyticsService(self.db)
        metrics = await svc.get_summary(start_date, end_date, customer)
        top_alerts = await svc.get_top_alerts(5, start_date, end_date, customer)

        period_str = f"{start_date} s/d {end_date}" if start_date and end_date else ("24 jam terakhir" if not start_date else "semua periode")
        customer_str = f"Customer: {customer}" if customer else "Seluruh Customer"
        top_alert_str = ", ".join([f"{a['rule_name']} ({a['count']} tiket)" for a in top_alerts[:5]]) or "—"

        prompt = f"""Tulis Executive Summary laporan operasional SOC dalam Bahasa Indonesia formal.

PERIODE: {period_str}
{customer_str}

DATA OPERASIONAL:
- Total tiket: {metrics['total_tickets']} | Open: {metrics['open_tickets']}
- True Positive: {metrics['tp_count']} ({metrics['tp_rate']}%) | False Positive: {metrics['fp_count']} ({metrics['fp_rate']}%)
- MTTD SLA Compliance: {metrics['sla_compliance_pct']}% | MTTR SLA: {metrics['mttr_sla_pct']}%
- Rata-rata MTTD: {metrics['avg_mttd_display'] or "—"} | Rata-rata MTTR: {metrics['avg_mttr_display'] or "—"}
- Security Incident (TP with impact): {metrics['si_count']}
- Alert terbanyak: {top_alert_str}

FORMAT OUTPUT (ikuti persis):
- Hanya 3–4 paragraf teks, dipisahkan baris kosong
- JANGAN gunakan markdown header (##, ###), JANGAN gunakan garis pemisah (---, ***)
- JANGAN gunakan bullet points atau numbered list
- Gunakan **teks** HANYA untuk angka kritis atau temuan paling penting
- Setiap paragraf wajib mengandung angka spesifik dari data
- Paragraf terakhir: satu atau dua rekomendasi konkret dengan justifikasi data

LARANGAN KERAS — jangan gunakan frasa atau elemen berikut:
"Perlu dicatat", "Penting untuk dipahami", "Secara keseluruhan", "Berdasarkan data",
"Kabar baiknya", "Tidak dapat disangkal", "Sebagai catatan", "Dapat disimpulkan bahwa",
"## ", "### ", "---", "***", bullet points, kalimat pembuka basa-basi.

Tone: laporan eksekutif formal, objektif, padat, langsung ke poin. Mulai langsung dengan fakta."""

        try:
            text = await self._call_llm(provider, prompt)
            return {
                "summary": text,
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "model_used": f"{provider.label} ({provider.model})",
            }
        except Exception as e:
            logger.error(f"Executive summary generation failed: {e}")
            return {
                "summary": f"Failed to generate: {e}",
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "model_used": "error",
            }

    def _fallback_insights(self, metrics: dict, period: str) -> dict:
        """Generate basic insights without AI when no LLM is available."""
        total = metrics.get("total_tickets", 0)
        tp = metrics.get("tp_count", 0)
        fp = metrics.get("fp_count", 0)
        tp_rate = metrics.get("tp_rate", 0)
        sla = metrics.get("sla_compliance_pct", 0)
        mttd = metrics.get("avg_mttd_display", "N/A")

        narrative = (
            f"Dalam periode ini terdapat {total} ticket SOC. "
            f"True Positive rate: {tp_rate}%, Average MTTD: {mttd}, "
            f"SLA compliance: {sla}%."
        )

        anomalies = []
        if tp_rate > 10:
            anomalies.append(f"TP rate tinggi ({tp_rate}%) — perlu investigasi lebih lanjut")
        if sla and sla < 90:
            anomalies.append(f"SLA compliance di bawah target ({sla}% < 90%)")

        rec_people = []
        rec_process = []
        rec_technology = []
        if fp > total * 0.9:
            rec_technology.append(
                "FP rate sangat tinggi (>90%). Pertimbangkan tuning rule Wazuh untuk mengurangi noise."
            )
        if sla and sla < 95:
            rec_process.append(
                "Tingkatkan SLA compliance dengan optimasi proses notifikasi pertama."
            )

        return {
            "narrative": narrative,
            "anomalies": anomalies,
            "recommendations": [],
            "rec_people": rec_people,
            "rec_process": rec_process,
            "rec_technology": rec_technology,
            "generated_at": datetime.now(timezone.utc),
            "model_used": "Fallback (no LLM configured)",
        }
