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
actionable insights in Bahasa Indonesia. Be concise and data-driven. Focus on:
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

    async def generate_insights(
        self,
        metrics: dict,
        period: str = "7d",
        customer: Optional[str] = None,
        provider_id: Optional[int] = None,
    ) -> dict:
        """Generate AI narrative insights from metrics data."""
        provider = await self._get_provider(provider_id)

        if provider is None:
            # Legacy fallback: try CLAUDE_API_KEY from env
            if settings.CLAUDE_API_KEY:
                return await self._call_anthropic_legacy(metrics, period, customer)
            return self._fallback_insights(metrics, period)

        prompt = self._build_prompt(metrics, period, customer)

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
        elif provider.provider in ("openai", "xai", "google"):
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

        if provider.provider == "xai":
            url = provider.base_url or "https://api.x.ai/v1"
        elif provider.provider == "google":
            url = provider.base_url or "https://generativelanguage.googleapis.com/v1beta/openai"
        else:
            url = provider.base_url or "https://api.openai.com/v1"

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

    def _build_prompt(self, metrics: dict, period: str, customer: Optional[str]) -> str:
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
3. REKOMENDASI: Daftar rekomendasi actionable untuk SOC manager

Format: gunakan heading RINGKASAN:, ANOMALI:, REKOMENDASI: untuk setiap bagian."""

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
        sections = {"narrative": "", "anomalies": [], "recommendations": []}

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
            elif "rekomendasi" in lower:
                current = "recommendations"
                continue

            if current == "narrative":
                sections["narrative"] += line_stripped + " "
            elif current == "anomalies":
                item = line_stripped.lstrip("- \u2022123456789.)")
                if item:
                    sections["anomalies"].append(item.strip())
            elif current == "recommendations":
                item = line_stripped.lstrip("- \u2022123456789.)")
                if item:
                    sections["recommendations"].append(item.strip())

        sections["narrative"] = sections["narrative"].strip()
        sections["generated_at"] = datetime.now(timezone.utc)
        return sections

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
            anomalies.append(f"TP rate tinggi ({tp_rate}%) \u2014 perlu investigasi lebih lanjut")
        if sla and sla < 90:
            anomalies.append(f"SLA compliance di bawah target ({sla}% < 90%)")

        recommendations = []
        if fp > total * 0.9:
            recommendations.append(
                "FP rate sangat tinggi (>90%). Pertimbangkan tuning rule Wazuh untuk mengurangi noise."
            )
        if sla and sla < 95:
            recommendations.append(
                "Tingkatkan SLA compliance dengan optimasi proses notifikasi pertama."
            )

        return {
            "narrative": narrative,
            "anomalies": anomalies,
            "recommendations": recommendations,
            "generated_at": datetime.now(timezone.utc),
            "model_used": "Fallback (no LLM configured)",
        }
