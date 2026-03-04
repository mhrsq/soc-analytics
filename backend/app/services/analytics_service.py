"""Analytics computation service."""

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import and_, case, cast, func, select, text, Date, Float, Integer
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Ticket

logger = logging.getLogger(__name__)


def _format_duration(seconds: Optional[float]) -> Optional[str]:
    """Format seconds into human-readable duration (e.g., '8m 23s', '2h 15m')."""
    if seconds is None:
        return None
    s = int(seconds)
    if s < 60:
        return f"{s}s"
    if s < 3600:
        return f"{s // 60}m {s % 60}s"
    h = s // 3600
    m = (s % 3600) // 60
    return f"{h}h {m}m"


class AnalyticsService:
    """Computes analytics metrics from the tickets database."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_summary(
        self,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        customer: Optional[str] = None,
    ) -> dict:
        """Get summary KPI metrics."""
        filters = self._build_filters(start_date, end_date, customer)

        # Total tickets
        q = select(func.count(Ticket.id)).where(*filters)
        total = (await self.session.execute(q)).scalar() or 0

        # Open tickets
        q = select(func.count(Ticket.id)).where(
            *filters,
            Ticket.status.in_(["Open", "Assigned", "In Progress"]),
        )
        open_count = (await self.session.execute(q)).scalar() or 0

        # Validation counts
        q = select(
            func.count(Ticket.id).filter(Ticket.validation == "True Positive").label("tp"),
            func.count(Ticket.id).filter(Ticket.validation == "False Positive").label("fp"),
            func.count(Ticket.id).filter(
                (Ticket.validation == None) | (Ticket.validation == "Not Specified")
            ).label("ns"),
            func.count(Ticket.id).filter(Ticket.case_type == "Security Incident").label("si"),
        ).where(*filters)
        row = (await self.session.execute(q)).one()
        tp, fp, ns, si = row.tp, row.fp, row.ns, row.si

        # Avg MTTD
        q = select(func.avg(Ticket.mttd_seconds)).where(
            *filters,
            Ticket.mttd_seconds != None,
            Ticket.mttd_seconds > 0,
        )
        avg_mttd = (await self.session.execute(q)).scalar()

        # SLA compliance
        q = select(
            func.count(Ticket.id).filter(Ticket.sla_met == True).label("met"),
            func.count(Ticket.id).filter(Ticket.sla_met != None).label("total"),
        ).where(*filters)
        sla_row = (await self.session.execute(q)).one()
        sla_pct = (
            round(sla_row.met / sla_row.total * 100, 1)
            if sla_row.total > 0
            else None
        )

        return {
            "total_tickets": total,
            "open_tickets": open_count,
            "tp_count": tp,
            "fp_count": fp,
            "ns_count": ns,
            "tp_rate": round(tp / total * 100, 2) if total > 0 else 0.0,
            "fp_rate": round(fp / total * 100, 2) if total > 0 else 0.0,
            "avg_mttd_seconds": round(avg_mttd, 1) if avg_mttd else None,
            "avg_mttd_display": _format_duration(avg_mttd),
            "sla_compliance_pct": sla_pct,
            "si_count": si,
            "period_start": start_date.date() if isinstance(start_date, datetime) else start_date,
            "period_end": end_date.date() if isinstance(end_date, datetime) else end_date,
        }

    async def get_volume_trend(
        self,
        period: str = "daily",
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        customer: Optional[str] = None,
    ) -> list[dict]:
        """Get ticket volume over time."""
        filters = self._build_filters(start_date, end_date, customer)

        q = (
            select(
                cast(Ticket.created_time, Date).label("date"),
                func.count(Ticket.id).label("total"),
                func.count(Ticket.id).filter(Ticket.validation == "True Positive").label("tp_count"),
                func.count(Ticket.id).filter(Ticket.validation == "False Positive").label("fp_count"),
                func.count(Ticket.id).filter(
                    (Ticket.validation == None) | (Ticket.validation == "Not Specified")
                ).label("ns_count"),
            )
            .where(*filters, Ticket.created_time != None)
            .group_by(cast(Ticket.created_time, Date))
            .order_by(cast(Ticket.created_time, Date))
        )

        result = await self.session.execute(q)
        return [
            {
                "date": row.date,
                "total": row.total,
                "tp_count": row.tp_count,
                "fp_count": row.fp_count,
                "ns_count": row.ns_count,
            }
            for row in result.all()
        ]

    async def get_validation_breakdown(
        self,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        customer: Optional[str] = None,
    ) -> dict:
        """Get TP/FP/NS breakdown."""
        filters = self._build_filters(start_date, end_date, customer)

        q = select(
            func.count(Ticket.id).filter(Ticket.validation == "True Positive").label("tp"),
            func.count(Ticket.id).filter(Ticket.validation == "False Positive").label("fp"),
            func.count(Ticket.id).filter(
                (Ticket.validation == None) | (Ticket.validation == "Not Specified")
            ).label("ns"),
            func.count(Ticket.id).label("total"),
        ).where(*filters)

        row = (await self.session.execute(q)).one()
        return {
            "true_positive": row.tp,
            "false_positive": row.fp,
            "not_specified": row.ns,
            "total": row.total,
        }

    async def get_priority_distribution(
        self,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        customer: Optional[str] = None,
    ) -> list[dict]:
        """Get ticket count by priority."""
        filters = self._build_filters(start_date, end_date, customer)

        q = (
            select(
                Ticket.priority,
                func.count(Ticket.id).label("count"),
            )
            .where(*filters, Ticket.priority != None)
            .group_by(Ticket.priority)
            .order_by(Ticket.priority)
        )

        result = await self.session.execute(q)
        return [{"priority": row.priority, "count": row.count} for row in result.all()]

    async def get_customer_distribution(
        self,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> list[dict]:
        """Get metrics per customer."""
        filters = self._build_filters(start_date, end_date)

        q = (
            select(
                Ticket.customer,
                func.count(Ticket.id).label("total"),
                func.count(Ticket.id).filter(Ticket.validation == "True Positive").label("tp"),
                func.count(Ticket.id).filter(Ticket.validation == "False Positive").label("fp"),
                func.avg(Ticket.mttd_seconds).filter(
                    Ticket.mttd_seconds != None, Ticket.mttd_seconds > 0
                ).label("avg_mttd"),
            )
            .where(*filters, Ticket.customer != None)
            .group_by(Ticket.customer)
            .order_by(func.count(Ticket.id).desc())
        )

        result = await self.session.execute(q)
        return [
            {
                "customer": row.customer,
                "total": row.total,
                "tp_count": row.tp,
                "fp_count": row.fp,
                "tp_rate": round(row.tp / row.total * 100, 2) if row.total > 0 else 0.0,
                "avg_mttd_seconds": round(row.avg_mttd, 1) if row.avg_mttd else None,
            }
            for row in result.all()
        ]

    async def get_top_alerts(
        self,
        limit: int = 10,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        customer: Optional[str] = None,
    ) -> list[dict]:
        """Get top alert categories (prefers wazuh_rule_name, falls back to attack_category)."""
        filters = self._build_filters(start_date, end_date, customer)

        # Try wazuh rules first
        q_wazuh = (
            select(
                Ticket.wazuh_rule_id,
                Ticket.wazuh_rule_name,
                func.count(Ticket.id).label("count"),
                func.count(Ticket.id).filter(Ticket.validation == "True Positive").label("tp"),
                func.count(Ticket.id).filter(Ticket.validation == "False Positive").label("fp"),
            )
            .where(*filters, Ticket.wazuh_rule_name != None)
            .group_by(Ticket.wazuh_rule_id, Ticket.wazuh_rule_name)
            .order_by(func.count(Ticket.id).desc())
            .limit(limit)
        )
        result = await self.session.execute(q_wazuh)
        rows = result.all()

        if rows:
            return [
                {
                    "rule_id": row.wazuh_rule_id,
                    "rule_name": row.wazuh_rule_name,
                    "count": row.count,
                    "tp_count": row.tp,
                    "fp_count": row.fp,
                    "tp_rate": round(row.tp / row.count * 100, 2) if row.count > 0 else 0.0,
                }
                for row in rows
            ]

        # Fallback: group by attack_category
        q_cat = (
            select(
                Ticket.attack_category,
                func.count(Ticket.id).label("count"),
                func.count(Ticket.id).filter(Ticket.validation == "True Positive").label("tp"),
                func.count(Ticket.id).filter(Ticket.validation == "False Positive").label("fp"),
            )
            .where(*filters, Ticket.attack_category != None)
            .group_by(Ticket.attack_category)
            .order_by(func.count(Ticket.id).desc())
            .limit(limit)
        )
        result = await self.session.execute(q_cat)
        return [
            {
                "rule_id": None,
                "rule_name": row.attack_category,
                "count": row.count,
                "tp_count": row.tp,
                "fp_count": row.fp,
                "tp_rate": round(row.tp / row.count * 100, 2) if row.count > 0 else 0.0,
            }
            for row in result.all()
        ]

    async def get_mttd_trend(
        self,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        customer: Optional[str] = None,
    ) -> list[dict]:
        """Get MTTD trend over time."""
        filters = self._build_filters(start_date, end_date, customer)

        q = (
            select(
                cast(Ticket.created_time, Date).label("date"),
                func.avg(Ticket.mttd_seconds).filter(
                    Ticket.mttd_seconds != None, Ticket.mttd_seconds > 0
                ).label("avg_mttd"),
                func.percentile_cont(0.5).within_group(Ticket.mttd_seconds).filter(
                    Ticket.mttd_seconds != None, Ticket.mttd_seconds > 0
                ).label("median_mttd"),
                func.count(Ticket.id).filter(Ticket.sla_met == True).label("sla_met"),
                func.count(Ticket.id).filter(Ticket.sla_met != None).label("sla_total"),
            )
            .where(*filters, Ticket.created_time != None)
            .group_by(cast(Ticket.created_time, Date))
            .order_by(cast(Ticket.created_time, Date))
        )

        result = await self.session.execute(q)
        return [
            {
                "date": row.date,
                "avg_mttd_seconds": round(row.avg_mttd, 1) if row.avg_mttd else None,
                "median_mttd_seconds": round(row.median_mttd, 1) if row.median_mttd else None,
                "sla_compliant_pct": (
                    round(row.sla_met / row.sla_total * 100, 1)
                    if row.sla_total and row.sla_total > 0
                    else None
                ),
                "total_measured": row.sla_total or 0,
            }
            for row in result.all()
        ]

    async def get_analyst_performance(
        self,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> list[dict]:
        """Get analyst performance metrics."""
        filters = self._build_filters(start_date, end_date)

        q = (
            select(
                Ticket.technician,
                func.count(Ticket.id).label("assigned"),
                func.count(Ticket.id).filter(
                    Ticket.status.in_(["Resolved", "Closed"])
                ).label("resolved"),
                func.avg(Ticket.mttr_seconds).filter(
                    Ticket.mttr_seconds != None, Ticket.mttr_seconds > 0
                ).label("avg_mttr"),
                func.count(Ticket.id).filter(
                    Ticket.validation == "True Positive"
                ).label("tp_found"),
            )
            .where(*filters, Ticket.technician != None)
            .group_by(Ticket.technician)
            .order_by(func.count(Ticket.id).desc())
        )

        result = await self.session.execute(q)
        return [
            {
                "analyst": row.technician,
                "assigned": row.assigned,
                "resolved": row.resolved,
                "avg_mttr_seconds": round(row.avg_mttr, 1) if row.avg_mttr else None,
                "avg_mttr_display": _format_duration(row.avg_mttr),
                "tp_found": row.tp_found,
            }
            for row in result.all()
        ]

    def _build_filters(
        self,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        customer: Optional[str] = None,
    ) -> list:
        """Build SQLAlchemy filter clauses from common params.
        Accepts both date and datetime objects — datetime gives precise filtering."""
        filters = []
        if start_date:
            if isinstance(start_date, datetime):
                filters.append(Ticket.created_time >= start_date)
            else:
                filters.append(cast(Ticket.created_time, Date) >= start_date)
        if end_date:
            if isinstance(end_date, datetime):
                filters.append(Ticket.created_time <= end_date)
            else:
                filters.append(cast(Ticket.created_time, Date) <= end_date)
        if customer:
            filters.append(Ticket.customer == customer)
        return filters
