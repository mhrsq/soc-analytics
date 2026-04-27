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
                Ticket.sla_met == False,
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
