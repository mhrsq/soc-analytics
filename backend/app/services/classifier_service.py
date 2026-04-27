"""Auto-classify attack_category from ticket subject using regex + LLM fallback."""
import re
import logging
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Ticket

logger = logging.getLogger(__name__)

# Regex rules - order matters (first match wins)
REGEX_RULES: list[tuple[str, str]] = [
    # Operational/non-alert (pre-SOAR prefix patterns)
    (r"^\[(OH|S|M|MACD|SHIFT|OFFICE)\]", "Operational / Non-Alert"),
    (r"^(S|M|OH)\s*\|", "Operational / Non-Alert"),
    (r"SHIFTING SOC|OFFICE HOUR SOC", "Operational / Non-Alert"),
    # MITRE tactics from SOAR subject
    (r"Brute Force", "Brute Force"),
    (r"Account Manipulation|Account.*Changed|account.*locked", "Account Manipulation"),
    (r"Ingress Tool Transfer", "Ingress Tool Transfer"),
    (r"Application Shimming", "Application Shimming"),
    (r"File and Directory Discovery|File.*Discovery", "File / Directory Discovery"),
    (r"Exploit Public-Facing|sql.injection|SQL.injection", "Web Exploitation"),
    (r"Powershell|PowerShell|powershell", "PowerShell Execution"),
    (r"fortigate|FortiGate", "Network IDS / IPS"),
    (r"O365|Office 365|office365", "O365 / Cloud Identity"),
    (r"windows_security|Windows.*audit|audit failure", "Windows Security Event"),
    (r"agent_flooding|Agent.*queue|event queue", "Agent Issue"),
    (r"malware|Malware|AndroxGh0st|ransomware", "Malware"),
    (r"web attack|Web Attack|Malicious web", "Web Attack"),
    (r"Threat Intelligence|threat.intel", "Threat Intelligence"),
    (r"Unauthorized Access|unauthorized.access", "Unauthorized Access"),
    (r"Spam|spam email", "Spam"),
    (r"CVE-|Common Vulnerabilities", "CVE / Vulnerability"),
    (r"SIEM.*issue|siem.*error", "SIEM Issue"),
]


def classify_by_regex(subject: str) -> Optional[str]:
    """Return category string if regex matches, else None."""
    for pattern, category in REGEX_RULES:
        if re.search(pattern, subject, re.IGNORECASE):
            return category
    return None


class ClassifierService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def run_batch(
        self,
        customer: Optional[str] = None,
        limit: int = 500,
        use_llm: bool = False,
        llm_provider_id: Optional[int] = None,
    ) -> dict:
        """
        Classify tickets with attack_category = 'Other' or NULL.
        Returns stats: total_processed, regex_classified, llm_classified, skipped.
        """
        q = (
            select(Ticket.id, Ticket.subject, Ticket.attack_category)
            .where(
                Ticket.attack_category.in_(["Other", None, ""]),
                Ticket.subject != None,
                Ticket.subject != "",
            )
        )
        if customer:
            q = q.where(Ticket.customer == customer)
        q = q.limit(limit)

        result = await self.session.execute(q)
        tickets = result.all()

        regex_classified = 0
        llm_classified = 0
        skipped = 0
        regex_updates: list[tuple[int, str]] = []
        llm_pending: list[tuple[int, str]] = []

        for row in tickets:
            category = classify_by_regex(row.subject or "")
            if category:
                regex_updates.append((row.id, category))
                regex_classified += 1
            else:
                llm_pending.append((row.id, row.subject))
                skipped += 1

        # Apply regex updates in bulk
        for ticket_id, category in regex_updates:
            await self.session.execute(
                update(Ticket).where(Ticket.id == ticket_id).values(attack_category=category)
            )

        # LLM fallback (optional, only if use_llm=True)
        if use_llm and llm_pending and llm_provider_id:
            try:
                from app.services.ai_service import AIService
                ai = AIService(self.session)
                for ticket_id, subject in llm_pending[:50]:  # cap at 50 per run
                    try:
                        category = await ai.classify_attack_category(subject)
                        if category and category != "Other":
                            await self.session.execute(
                                update(Ticket).where(Ticket.id == ticket_id).values(attack_category=category)
                            )
                            llm_classified += 1
                    except Exception as e:
                        logger.warning(f"LLM classify failed for #{ticket_id}: {e}")
            except Exception as e:
                logger.error(f"LLM batch classify failed: {e}")

        await self.session.commit()
        return {
            "total_processed": len(tickets),
            "regex_classified": regex_classified,
            "llm_classified": llm_classified,
            "skipped": skipped,
        }
