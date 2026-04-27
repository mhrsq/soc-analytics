"""Analytics computation service."""

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import and_, case, cast, extract, func, select, text, Date, Float, Integer
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
        asset_names: Optional[list[str]] = None,
    ) -> dict:
        """Get summary KPI metrics."""
        filters = self._build_filters(start_date, end_date, customer, asset_names)

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

        # Avg MTTR
        q = select(func.avg(Ticket.mttr_seconds)).where(
            *filters,
            Ticket.mttr_seconds != None,
            Ticket.mttr_seconds > 0,
        )
        avg_mttr = (await self.session.execute(q)).scalar()

        # SLA compliance (MTTD-based)
        q = select(
            func.count(Ticket.id).filter(Ticket.sla_met == True).label("met"),
            func.count(Ticket.id).filter(Ticket.sla_met != None).label("total"),
        ).where(*filters)
        sla_row = (await self.session.execute(q)).one()
        sla_pct = (
            round(sla_row.met / sla_row.total * 100, 1)
            if sla_row.total > 0
            else 0.0
        )

        # MTTR SLA compliance (priority-based)
        q = select(
            func.count(Ticket.id).filter(Ticket.mttr_sla_met == True).label("met"),
            func.count(Ticket.id).filter(Ticket.mttr_sla_met != None).label("total"),
        ).where(*filters)
        mttr_sla_row = (await self.session.execute(q)).one()
        mttr_sla_pct = (
            round(mttr_sla_row.met / mttr_sla_row.total * 100, 1)
            if mttr_sla_row.total > 0
            else 0.0
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
            "avg_mttr_seconds": round(avg_mttr, 1) if avg_mttr else None,
            "avg_mttr_display": _format_duration(avg_mttr),
            "sla_compliance_pct": sla_pct,
            "mttr_sla_pct": mttr_sla_pct,
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
        asset_names: Optional[list[str]] = None,
    ) -> list[dict]:
        """Get ticket volume over time. Supports 'daily' and 'hourly' granularity."""
        filters = self._build_filters(start_date, end_date, customer, asset_names)

        if period == "hourly":
            # Hourly: group by date + hour using date_trunc
            hour_expr = func.date_trunc("hour", Ticket.created_time)
            q = (
                select(
                    hour_expr.label("date"),
                    func.count(Ticket.id).label("total"),
                    func.count(Ticket.id).filter(Ticket.validation == "True Positive").label("tp_count"),
                    func.count(Ticket.id).filter(Ticket.validation == "False Positive").label("fp_count"),
                    func.count(Ticket.id).filter(
                        (Ticket.validation == None) | (Ticket.validation == "Not Specified")
                    ).label("ns_count"),
                )
                .where(*filters, Ticket.created_time != None)
                .group_by(hour_expr)
                .order_by(hour_expr)
            )
        else:
            # Daily: group by date
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
        asset_names: Optional[list[str]] = None,
    ) -> dict:
        """Get TP/FP/NS breakdown."""
        filters = self._build_filters(start_date, end_date, customer, asset_names)

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
        asset_names: Optional[list[str]] = None,
    ) -> list[dict]:
        """Get ticket count by priority."""
        filters = self._build_filters(start_date, end_date, customer, asset_names)

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
        asset_names: Optional[list[str]] = None,
    ) -> list[dict]:
        """Get metrics per customer."""
        filters = self._build_filters(start_date, end_date, asset_names=asset_names)

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
        asset_names: Optional[list[str]] = None,
    ) -> list[dict]:
        """Get top alert categories (prefers wazuh_rule_name, falls back to attack_category)."""
        filters = self._build_filters(start_date, end_date, customer, asset_names)

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
        asset_names: Optional[list[str]] = None,
    ) -> list[dict]:
        """Get MTTD trend over time."""
        filters = self._build_filters(start_date, end_date, customer, asset_names)

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
        asset_names: Optional[list[str]] = None,
    ) -> list[dict]:
        """Get analyst performance metrics."""
        filters = self._build_filters(start_date, end_date, asset_names=asset_names)

        q = (
            select(
                Ticket.technician,
                func.count(Ticket.id).label("assigned"),
                func.count(Ticket.id).filter(
                    Ticket.status.in_(["Resolved", "Closed"])
                ).label("resolved"),
                func.avg(Ticket.mttd_seconds).filter(
                    Ticket.mttd_seconds != None, Ticket.mttd_seconds > 0
                ).label("avg_mttd"),
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
                "avg_mttd_seconds": round(row.avg_mttd, 1) if row.avg_mttd else None,
                "avg_mttd_display": _format_duration(row.avg_mttd),
                "avg_mttr_seconds": round(row.avg_mttr, 1) if row.avg_mttr else None,
                "avg_mttr_display": _format_duration(row.avg_mttr),
                "tp_found": row.tp_found,
            }
            for row in result.all()
        ]

    async def get_asset_exposure(
        self,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        customer: Optional[str] = None,
        asset_names: Optional[list[str]] = None,
        limit: int = 20,
    ) -> list[dict]:
        """Get assets ranked by alert count for a customer."""
        filters = self._build_filters(start_date, end_date, customer, asset_names)

        q = (
            select(
                Ticket.asset_name,
                func.count(Ticket.id).label("count"),
            )
            .where(*filters, Ticket.asset_name != None, Ticket.asset_name != "")
            .group_by(Ticket.asset_name)
            .order_by(func.count(Ticket.id).desc())
            .limit(limit)
        )

        result = await self.session.execute(q)
        return [
            {"asset_name": row.asset_name, "count": row.count}
            for row in result.all()
        ]

    async def get_sla_trend(
        self,
        start_date=None,
        end_date=None,
        customer=None,
        asset_names=None,
    ) -> list[dict]:
        """Get monthly SLA compliance trend (MTTD and MTTR SLA percentages)."""
        filters = self._build_filters(start_date, end_date, customer, asset_names)
        month_expr = func.date_trunc("month", Ticket.created_time)
        q = (
            select(
                month_expr.label("month"),
                func.count().label("total"),
                func.count().filter(Ticket.mttd_seconds != None).label("measured"),
                (
                    100.0
                    * func.sum(case((Ticket.sla_met == True, 1), else_=0))
                    / func.nullif(func.count().filter(Ticket.mttd_seconds != None), 0)
                ).label("mttd_sla_pct"),
                (
                    100.0
                    * func.sum(case((Ticket.mttr_sla_met == True, 1), else_=0))
                    / func.nullif(func.count().filter(Ticket.mttr_seconds != None), 0)
                ).label("mttr_sla_pct"),
            )
            .where(*filters, cast(Ticket.created_time, Date) >= date(2024, 1, 1))
            .group_by(month_expr)
            .order_by(month_expr)
        )
        result = await self.session.execute(q)
        return [
            {
                "month": row.month.strftime("%Y-%m"),
                "total": row.total,
                "measured": row.measured,
                "mttd_sla_pct": round(row.mttd_sla_pct, 1) if row.mttd_sla_pct is not None else None,
                "mttr_sla_pct": round(row.mttr_sla_pct, 1) if row.mttr_sla_pct is not None else None,
            }
            for row in result.all()
        ]

    async def get_fp_trend(
        self,
        start_date=None,
        end_date=None,
        customer=None,
        asset_names=None,
    ) -> list[dict]:
        """Get monthly False Positive rate trend."""
        filters = self._build_filters(start_date, end_date, customer, asset_names)
        month_expr = func.date_trunc("month", Ticket.created_time)
        q = (
            select(
                month_expr.label("month"),
                func.count().label("total"),
                func.sum(case((Ticket.validation == "True Positive", 1), else_=0)).label("tp_count"),
                func.sum(case((Ticket.validation == "False Positive", 1), else_=0)).label("fp_count"),
                (
                    100.0
                    * func.sum(case((Ticket.validation == "False Positive", 1), else_=0))
                    / func.nullif(func.count(), 0)
                ).label("fp_rate"),
            )
            .where(*filters, cast(Ticket.created_time, Date) >= date(2024, 1, 1))
            .group_by(month_expr)
            .order_by(month_expr)
        )
        result = await self.session.execute(q)
        return [
            {
                "month": row.month.strftime("%Y-%m"),
                "total": row.total,
                "tp_count": int(row.tp_count or 0),
                "fp_count": int(row.fp_count or 0),
                "fp_rate": round(row.fp_rate, 1) if row.fp_rate is not None else None,
            }
            for row in result.all()
        ]

    async def get_customer_sla_matrix(
        self,
        start_date=None,
        end_date=None,
        customer=None,
        asset_names=None,
    ) -> list[dict]:
        """Get per-customer per-month MTTD SLA compliance matrix."""
        filters = self._build_filters(start_date, end_date, customer, asset_names)
        month_expr = func.date_trunc("month", Ticket.created_time)
        q = (
            select(
                Ticket.customer,
                month_expr.label("month"),
                (
                    100.0
                    * func.sum(case((Ticket.sla_met == True, 1), else_=0))
                    / func.nullif(
                        func.count().filter(Ticket.mttd_seconds != None), 0
                    )
                ).label("mttd_sla_pct"),
                func.count().label("total"),
            )
            .where(
                *filters,
                cast(Ticket.created_time, Date) >= date(2024, 1, 1),
                Ticket.customer != None,
                Ticket.customer != "",
            )
            .group_by(Ticket.customer, month_expr)
            .order_by(Ticket.customer, month_expr)
        )
        result = await self.session.execute(q)
        return [
            {
                "customer": row.customer,
                "month": row.month.strftime("%Y-%m"),
                "mttd_sla_pct": round(row.mttd_sla_pct, 1) if row.mttd_sla_pct is not None else None,
                "total": row.total,
            }
            for row in result.all()
        ]

    async def get_sla_breach_analysis(
        self,
        dimension: str = "analyst",
        start_date=None,
        end_date=None,
        customer=None,
        asset_names=None,
    ) -> list[dict]:
        """Get SLA breach breakdown by analyst, customer, priority, or hour."""
        filters = self._build_filters(start_date, end_date, customer, asset_names)

        if dimension == "analyst":
            group_expr = Ticket.technician
        elif dimension == "customer":
            group_expr = Ticket.customer
        elif dimension == "priority":
            group_expr = Ticket.priority
        elif dimension == "hour":
            group_expr = extract(
                "hour",
                func.timezone("Asia/Jakarta", Ticket.created_time),
            )
        else:
            group_expr = Ticket.technician

        q = (
            select(
                group_expr.label("group_value"),
                func.count().label("total"),
                func.sum(case((Ticket.sla_met == False, 1), else_=0)).label("breached"),
                (
                    100.0
                    * func.sum(case((Ticket.sla_met == False, 1), else_=0))
                    / func.nullif(func.count(), 0)
                ).label("breach_pct"),
                func.avg(Ticket.mttd_seconds).label("avg_mttd_sec"),
            )
            .where(
                *filters,
                Ticket.mttd_seconds != None,
                group_expr != None,
            )
            .group_by(group_expr)
            .order_by(func.count().desc())
        )
        result = await self.session.execute(q)
        return [
            {
                "group_value": str(row.group_value),
                "total": row.total,
                "breached": int(row.breached or 0),
                "breach_pct": round(row.breach_pct, 1) if row.breach_pct is not None else 0.0,
                "avg_mttd_min": round(row.avg_mttd_sec / 60, 1) if row.avg_mttd_sec is not None else None,
            }
            for row in result.all()
        ]

    async def get_mom_kpis(
        self,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        customer: Optional[str] = None,
        asset_names: Optional[list[str]] = None,
    ) -> list[dict]:
        """Month-over-month KPI comparison.

        Current period = start_date → end_date (default: last 30 days).
        Previous period = same duration immediately before start_date.
        """
        today = date.today()
        if not end_date:
            end_date = today
        if not start_date:
            start_date = today - timedelta(days=30)

        # Normalise to plain dates for arithmetic
        s = start_date if isinstance(start_date, date) and not isinstance(start_date, datetime) else (start_date.date() if isinstance(start_date, datetime) else start_date)
        e = end_date if isinstance(end_date, date) and not isinstance(end_date, datetime) else (end_date.date() if isinstance(end_date, datetime) else end_date)
        duration = (e - s).days or 1
        prev_end = s - timedelta(days=1)
        prev_start = prev_end - timedelta(days=duration - 1)

        async def _period_kpis(sd, ed):
            filters = self._build_filters(sd, ed, customer, asset_names)
            q = select(
                func.count(Ticket.id).label("total"),
                func.sum(case((Ticket.validation == "False Positive", 1), else_=0)).label("fp"),
                (
                    100.0
                    * func.sum(case((Ticket.sla_met == True, 1), else_=0))
                    / func.nullif(func.count().filter(Ticket.mttd_seconds != None), 0)
                ).label("mttd_sla_pct"),
                (
                    100.0
                    * func.sum(case((Ticket.mttr_sla_met == True, 1), else_=0))
                    / func.nullif(func.count().filter(Ticket.mttr_seconds != None), 0)
                ).label("mttr_sla_pct"),
                func.sum(case((Ticket.case_type == "Security Incident", 1), else_=0)).label("incidents"),
            ).where(*filters)
            row = (await self.session.execute(q)).one()
            total = row.total or 0
            fp = int(row.fp or 0)
            return {
                "total": float(total),
                "fp_rate": round(fp / total * 100, 2) if total > 0 else 0.0,
                "mttd_sla": round(row.mttd_sla_pct, 1) if row.mttd_sla_pct is not None else 0.0,
                "mttr_sla": round(row.mttr_sla_pct, 1) if row.mttr_sla_pct is not None else 0.0,
                "incidents": float(int(row.incidents or 0)),
            }

        cur = await _period_kpis(s, e)
        prev = await _period_kpis(prev_start, prev_end)

        result = []
        for metric in ("total", "fp_rate", "mttd_sla", "mttr_sla", "incidents"):
            c_val = cur[metric]
            p_val = prev[metric]
            delta = round((c_val - p_val) / p_val * 100, 1) if p_val > 0 else None
            result.append({
                "metric": metric,
                "current": c_val,
                "previous": p_val,
                "delta_pct": delta,
            })
        return result

    async def get_incident_funnel(
        self,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        customer: Optional[str] = None,
        asset_names: Optional[list[str]] = None,
    ) -> list[dict]:
        """Security incident funnel: total → security events → true positives → incidents."""
        filters = self._build_filters(start_date, end_date, customer, asset_names)

        q = select(
            func.count(Ticket.id).label("total_alerts"),
            func.sum(case((Ticket.case_type == "Security Event", 1), else_=0)).label("security_events"),
            func.sum(case((Ticket.validation == "True Positive", 1), else_=0)).label("true_positives"),
            func.sum(case((Ticket.case_type == "Security Incident", 1), else_=0)).label("security_incidents"),
        ).where(*filters)

        row = (await self.session.execute(q)).one()
        total = row.total_alerts or 0

        steps = [
            ("total_alerts", total),
            ("security_events", int(row.security_events or 0)),
            ("true_positives", int(row.true_positives or 0)),
            ("security_incidents", int(row.security_incidents or 0)),
        ]
        return [
            {
                "step": step,
                "count": count,
                "pct_of_total": round(count / total * 100, 1) if total > 0 else 0.0,
            }
            for step, count in steps
        ]

    async def get_queue_health(
        self,
        customer: Optional[str] = None,
    ) -> list[dict]:
        """Current open-ticket queue bucketed by age."""
        now = datetime.now(timezone.utc)

        customer_filter = []
        if customer:
            customer_filter.append(Ticket.customer == customer)

        q = select(Ticket.id, Ticket.created_time).where(
            Ticket.status.in_(["Open", "Assigned", "In Progress"]),
            *customer_filter,
        )
        results = (await self.session.execute(q)).all()

        bucket_order = ["<1h", "1-4h", "4-12h", "12-24h", "1-3d", "3-7d", ">7d"]
        buckets: dict[str, list[int]] = {b: [] for b in bucket_order}

        for row in results:
            if row.created_time is None:
                continue
            age_hours = (now - row.created_time).total_seconds() / 3600
            if age_hours < 1:
                buckets["<1h"].append(row.id)
            elif age_hours < 4:
                buckets["1-4h"].append(row.id)
            elif age_hours < 12:
                buckets["4-12h"].append(row.id)
            elif age_hours < 24:
                buckets["12-24h"].append(row.id)
            elif age_hours < 72:
                buckets["1-3d"].append(row.id)
            elif age_hours < 168:
                buckets["3-7d"].append(row.id)
            else:
                buckets[">7d"].append(row.id)

        return [
            {
                "bucket": b,
                "count": len(ids),
                "oldest_id": min(ids) if ids else None,
            }
            for b, ids in buckets.items()
        ]

    async def get_shift_performance(
        self,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        customer: Optional[str] = None,
        asset_names: Optional[list[str]] = None,
    ) -> list[dict]:
        """Analyst shift performance bucketed by WIB hour ranges."""
        filters = self._build_filters(start_date, end_date, customer, asset_names)

        wib_hour = extract("hour", func.timezone("Asia/Jakarta", Ticket.created_time))
        shift_expr = case(
            (and_(wib_hour >= 8, wib_hour <= 19), "Day (08:00-20:00)"),
            else_="Night (20:00-08:00)",
        )

        q = (
            select(
                shift_expr.label("shift"),
                func.count(Ticket.id).label("total"),
                (func.avg(Ticket.mttd_seconds) / 60.0).label("avg_mttd_min"),
                (
                    100.0
                    * func.sum(case((Ticket.sla_met == True, 1), else_=0))
                    / func.nullif(func.count().filter(Ticket.mttd_seconds != None), 0)
                ).label("mttd_sla_pct"),
                (
                    func.avg(
                        case((Ticket.mttr_seconds != None, Ticket.mttr_seconds), else_=None)
                    )
                    / 60.0
                ).label("avg_mttr_min"),
            )
            .where(*filters, cast(Ticket.created_time, Date) >= date(2024, 1, 1))
            .group_by(shift_expr)
            .order_by(shift_expr)
        )

        result = await self.session.execute(q)
        return [
            {
                "shift": row.shift,
                "total": row.total,
                "avg_mttd_min": round(row.avg_mttd_min, 1) if row.avg_mttd_min is not None else None,
                "mttd_sla_pct": round(row.mttd_sla_pct, 1) if row.mttd_sla_pct is not None else None,
                "avg_mttr_min": round(row.avg_mttr_min, 1) if row.avg_mttr_min is not None else None,
            }
            for row in result.all()
        ]

    async def get_fp_patterns(
        self,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        customer: Optional[str] = None,
        asset_names: Optional[list[str]] = None,
    ) -> list[dict]:
        """Get FP rate breakdown by attack_category (excluding 'Other')."""
        filters = self._build_filters(start_date, end_date, customer, asset_names)

        category_expr = func.coalesce(Ticket.attack_category, "Unclassified")
        q = (
            select(
                category_expr.label("category"),
                func.count().label("total"),
                func.sum(case((Ticket.validation == "False Positive", 1), else_=0)).label("fp_count"),
                func.sum(case((Ticket.validation == "True Positive", 1), else_=0)).label("tp_count"),
                (
                    100.0
                    * func.sum(case((Ticket.validation == "False Positive", 1), else_=0))
                    / func.nullif(func.count(), 0)
                ).label("fp_rate"),
            )
            .where(
                *filters,
                Ticket.attack_category != "Other",
                Ticket.attack_category != None,
                Ticket.attack_category != "",
            )
            .group_by(category_expr)
            .having(func.count() >= 5)
            .order_by(
                (
                    100.0
                    * func.sum(case((Ticket.validation == "False Positive", 1), else_=0))
                    / func.nullif(func.count(), 0)
                ).desc(),
                func.count().desc(),
            )
            .limit(20)
        )
        result = await self.session.execute(q)
        return [
            {
                "category": row.category,
                "total": row.total,
                "fp_count": int(row.fp_count or 0),
                "tp_count": int(row.tp_count or 0),
                "fp_rate": round(row.fp_rate, 1) if row.fp_rate is not None else 0.0,
            }
            for row in result.all()
        ]

    async def get_posture_score(
        self,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        customer: Optional[str] = None,
        asset_names: Optional[list[str]] = None,
    ) -> dict:
        """Compute security posture score (0-100) from key SOC metrics."""
        filters = self._build_filters(start_date, end_date, customer, asset_names)

        q = select(
            func.count(Ticket.id).label("total"),
            # MTTD SLA
            func.sum(case((Ticket.sla_met == True, 1), else_=0)).label("mttd_sla_met"),
            func.count().filter(Ticket.mttd_seconds != None).label("mttd_measured"),
            # MTTR SLA
            func.sum(case((Ticket.mttr_sla_met == True, 1), else_=0)).label("mttr_sla_met"),
            func.count().filter(Ticket.mttr_seconds != None).label("mttr_measured"),
            # FP
            func.sum(case((Ticket.validation == "False Positive", 1), else_=0)).label("fp_count"),
            # Resolved
            func.sum(
                case(
                    (Ticket.status.in_(["Resolved", "Closed"]), 1),
                    else_=0,
                )
            ).label("resolved"),
            # Security Incidents
            func.sum(case((Ticket.case_type == "Security Incident", 1), else_=0)).label("incidents"),
        ).where(*filters)

        row = (await self.session.execute(q)).one()
        total = row.total or 0

        mttd_sla_pct = (
            round(int(row.mttd_sla_met or 0) / int(row.mttd_measured) * 100, 1)
            if row.mttd_measured and int(row.mttd_measured) > 0
            else 0.0
        )
        mttr_sla_pct = (
            round(int(row.mttr_sla_met or 0) / int(row.mttr_measured) * 100, 1)
            if row.mttr_measured and int(row.mttr_measured) > 0
            else 0.0
        )
        fp_rate = round(int(row.fp_count or 0) / total * 100, 1) if total > 0 else 0.0
        resolution_rate = round(int(row.resolved or 0) / total * 100, 1) if total > 0 else 0.0
        incident_rate = round(int(row.incidents or 0) / total, 4) if total > 0 else 0.0

        # Composite score
        score = (
            (mttd_sla_pct * 0.30)
            + (mttr_sla_pct * 0.25)
            + ((100 - fp_rate) * 0.20)
            + (resolution_rate * 0.15)
            + (max(0, 100 - incident_rate * 100) * 0.10)
        )
        score = round(score, 1)

        # Grade
        if score >= 90:
            grade = "S"
        elif score >= 75:
            grade = "A"
        elif score >= 60:
            grade = "B"
        elif score >= 40:
            grade = "C"
        else:
            grade = "D"

        return {
            "score": score,
            "mttd_sla_pct": mttd_sla_pct,
            "mttr_sla_pct": mttr_sla_pct,
            "fp_rate": fp_rate,
            "resolution_rate": resolution_rate,
            "incident_rate": round(incident_rate * 100, 2),  # as percentage for display
            "grade": grade,
        }

    async def get_sla_prediction(self, customer=None) -> dict:
        """Predict end-of-month SLA compliance based on current month data and 7-day trend."""
        from calendar import monthrange

        today = date.today()

        # Current month SLA so far
        month_start = date(today.year, today.month, 1)
        month_filters = self._build_filters(month_start, today, customer)
        q = select(
            func.count(Ticket.id).filter(Ticket.sla_met == True).label("met"),
            func.count(Ticket.id).filter(Ticket.sla_met != None).label("total"),
        ).where(*month_filters)
        row = (await self.session.execute(q)).one()
        current_sla = round(row.met / row.total * 100, 1) if row.total > 0 else 0.0

        # Last 7 days daily SLA rate for trend
        week_ago = today - timedelta(days=7)
        week_filters = self._build_filters(week_ago, today, customer)
        daily_q = (
            select(
                cast(Ticket.created_time, Date).label("d"),
                func.sum(case((Ticket.sla_met == True, 1), else_=0)).label("met"),
                func.count(Ticket.id).filter(Ticket.sla_met != None).label("total"),
            )
            .where(*week_filters, Ticket.sla_met != None)
            .group_by(cast(Ticket.created_time, Date))
            .order_by(cast(Ticket.created_time, Date))
        )
        daily_rows = (await self.session.execute(daily_q)).all()
        daily_rates = [round(r.met / r.total * 100, 1) for r in daily_rows if r.total > 0]

        # Linear trend: average of last half vs first half of daily rates
        if len(daily_rates) >= 4:
            first_half = sum(daily_rates[:len(daily_rates) // 2]) / (len(daily_rates) // 2)
            second_half = sum(daily_rates[len(daily_rates) // 2:]) / (len(daily_rates) - len(daily_rates) // 2)
            delta = second_half - first_half
            if delta > 2:
                trend = "improving"
            elif delta < -2:
                trend = "declining"
            else:
                trend = "stable"
            daily_avg_change = delta / max(len(daily_rates), 1)
        else:
            trend = "stable"
            daily_avg_change = 0.0

        # Days remaining in month
        days_in_month = monthrange(today.year, today.month)[1]
        days_remaining = days_in_month - today.day

        # Predict EOM SLA
        predicted = min(100.0, max(0.0, current_sla + daily_avg_change * days_remaining))

        return {
            "current_sla_pct": current_sla,
            "predicted_eom_sla_pct": round(predicted, 1),
            "trend": trend,
            "data_points": len(daily_rates),
            "days_remaining": days_remaining,
        }

    async def get_filter_options(
        self,
        start_date=None,
        end_date=None,
        customer=None,
    ) -> dict:
        """Get available filter options for frontend dropdowns."""
        from sqlalchemy import distinct

        # Customers: scoped by date range only (not by customer)
        date_filters = self._build_filters(start_date, end_date)
        cust_q = (
            select(distinct(Ticket.customer))
            .where(*date_filters, Ticket.customer != None)
            .order_by(Ticket.customer)
        )
        customers = (await self.session.execute(cust_q)).scalars().all()

        # Priorities: no date/customer filter
        prio_q = (
            select(distinct(Ticket.priority))
            .where(Ticket.priority != None)
            .order_by(Ticket.priority)
        )
        priorities = (await self.session.execute(prio_q)).scalars().all()

        # Statuses: no date/customer filter
        stat_q = (
            select(distinct(Ticket.status))
            .where(Ticket.status != None)
            .order_by(Ticket.status)
        )
        statuses = (await self.session.execute(stat_q)).scalars().all()

        # Technicians: no date/customer filter
        tech_q = (
            select(distinct(Ticket.technician))
            .where(Ticket.technician != None)
            .order_by(Ticket.technician)
        )
        technicians = (await self.session.execute(tech_q)).scalars().all()

        # Asset names: filtered by customer + date
        asset_filters = self._build_filters(start_date, end_date, customer)
        asset_q = (
            select(distinct(Ticket.asset_name))
            .where(*asset_filters, Ticket.asset_name != None, Ticket.asset_name != "")
            .order_by(Ticket.asset_name)
        )
        asset_names = (await self.session.execute(asset_q)).scalars().all()

        return {
            "customers": customers,
            "priorities": priorities,
            "statuses": statuses,
            "technicians": technicians,
            "validations": ["True Positive", "False Positive", "Not Specified"],
            "asset_names": asset_names,
        }

    def _build_filters(
        self,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        customer: Optional[str] = None,
        asset_names: Optional[list[str]] = None,
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
        if asset_names:
            filters.append(Ticket.asset_name.in_(asset_names))
        return filters
