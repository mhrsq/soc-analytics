"""Analyst scoring & performance service for Manager View."""

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import and_, case, cast, delete, func, select, Date, Float, Integer
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AnalystSnapshot, Ticket
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

SLA_BASELINE = settings.MTTD_SLA_SECONDS  # 900s = 15 min

# Scoring weights — must sum to 1.0
WEIGHTS = {
    "speed": 0.20,
    "detection": 0.15,
    "accuracy": 0.15,
    "volume": 0.15,
    "sla": 0.20,
    "throughput": 0.10,
    "complexity": 0.05,
}

TIER_THRESHOLDS = [
    (90, "S"),
    (75, "A"),
    (60, "B"),
    (40, "C"),
    (0, "D"),
]

MIN_TICKETS = 5  # Minimum tickets to be scored


def _format_duration(seconds: Optional[float]) -> Optional[str]:
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


def _tier(score: float) -> str:
    for threshold, tier in TIER_THRESHOLDS:
        if score >= threshold:
            return tier
    return "D"


def _clamp(v: float) -> float:
    return max(0.0, min(100.0, round(v, 1)))


def _score_speed(avg_mttd: Optional[float]) -> float:
    """Score MTTD — lower is better."""
    if avg_mttd is None or avg_mttd <= 0:
        return 0.0
    half = SLA_BASELINE * 0.5
    if avg_mttd <= half:
        return 100.0
    if avg_mttd <= SLA_BASELINE:
        return 50.0 + 50.0 * (1.0 - (avg_mttd - half) / half)
    if avg_mttd <= SLA_BASELINE * 2:
        return 50.0 * (1.0 - (avg_mttd - SLA_BASELINE) / SLA_BASELINE)
    return 0.0


def _score_detection(tp_count: int, total: int) -> float:
    """TP rate score — 80% TP rate = 100."""
    if total == 0:
        return 0.0
    tp_rate = tp_count / total * 100
    return min(100.0, tp_rate * 1.25)


def _score_accuracy(tp_count: int, fp_count: int, total: int) -> float:
    """Validation completion rate (how many validated vs Not Specified)."""
    if total == 0:
        return 0.0
    validated = tp_count + fp_count
    return (validated / total) * 100


def _score_volume(analyst_tickets: int, team_avg: float) -> float:
    """Volume relative to team average — 133% of avg = 100."""
    if team_avg <= 0:
        return 50.0
    return min(100.0, (analyst_tickets / team_avg) * 75)


def _score_sla(sla_met: int, sla_total: int) -> float:
    """SLA compliance percentage."""
    if sla_total == 0:
        return 0.0
    return (sla_met / sla_total) * 100


def _score_throughput(resolved: int, assigned: int) -> float:
    """Resolution rate."""
    if assigned == 0:
        return 0.0
    return min(100.0, (resolved / assigned) * 100)


def _score_complexity(high_count: int, si_count: int, total: int) -> float:
    """Complexity — handling high-priority & security incidents."""
    if total == 0:
        return 0.0
    high_ratio = high_count / total
    si_ratio = si_count / total
    return min(100.0, (high_ratio * 60 + si_ratio * 40) * 2 * 100)


class AnalystScoringService:
    """Computes analyst performance scores from ticket data."""

    def __init__(self, session: AsyncSession):
        self.session = session

    def _build_filters(
        self,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> list:
        filters = [Ticket.technician != None]
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
        return filters

    async def get_scores(
        self,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> list[dict]:
        """Get scored leaderboard for all analysts."""
        filters = self._build_filters(start_date, end_date)

        q = (
            select(
                Ticket.technician,
                func.count(Ticket.id).label("total"),
                func.count(Ticket.id).filter(
                    Ticket.status.in_(["Resolved", "Closed"])
                ).label("resolved"),
                func.count(Ticket.id).filter(
                    Ticket.validation == "True Positive"
                ).label("tp_count"),
                func.count(Ticket.id).filter(
                    Ticket.validation == "False Positive"
                ).label("fp_count"),
                func.count(Ticket.id).filter(
                    (Ticket.validation == None) | (Ticket.validation == "Not Specified")
                ).label("ns_count"),
                func.avg(Ticket.mttd_seconds).filter(
                    Ticket.mttd_seconds != None, Ticket.mttd_seconds > 0
                ).label("avg_mttd"),
                func.avg(Ticket.mttr_seconds).filter(
                    Ticket.mttr_seconds != None, Ticket.mttr_seconds > 0
                ).label("avg_mttr"),
                func.count(Ticket.id).filter(Ticket.sla_met == True).label("sla_met"),
                func.count(Ticket.id).filter(Ticket.sla_met != None).label("sla_total"),
                func.count(Ticket.id).filter(Ticket.priority == "High").label("high_priority"),
                func.count(Ticket.id).filter(
                    Ticket.case_type == "Security Incident"
                ).label("si_count"),
            )
            .where(*filters)
            .group_by(Ticket.technician)
            .having(func.count(Ticket.id) >= MIN_TICKETS)
        )

        result = await self.session.execute(q)
        rows = result.all()

        if not rows:
            return []

        # Team average for volume normalization
        total_team = sum(r.total for r in rows)
        team_avg = total_team / len(rows) if rows else 1

        scored = []
        for r in rows:
            metrics = {
                "speed": _clamp(_score_speed(r.avg_mttd)),
                "detection": _clamp(_score_detection(r.tp_count, r.total)),
                "accuracy": _clamp(_score_accuracy(r.tp_count, r.fp_count, r.total)),
                "volume": _clamp(_score_volume(r.total, team_avg)),
                "sla": _clamp(_score_sla(r.sla_met, r.sla_total)),
                "throughput": _clamp(_score_throughput(r.resolved, r.total)),
                "complexity": _clamp(_score_complexity(r.high_priority, r.si_count, r.total)),
            }

            composite = sum(metrics[k] * WEIGHTS[k] for k in WEIGHTS)
            composite = round(composite, 1)

            sla_pct = round(r.sla_met / r.sla_total * 100, 1) if r.sla_total > 0 else None

            scored.append({
                "analyst": r.technician,
                "tier": _tier(composite),
                "composite_score": composite,
                "metrics": metrics,
                "stats": {
                    "total_tickets": r.total,
                    "resolved": r.resolved,
                    "tp_count": r.tp_count,
                    "fp_count": r.fp_count,
                    "ns_count": r.ns_count,
                    "avg_mttd_seconds": round(r.avg_mttd, 1) if r.avg_mttd else None,
                    "avg_mttd_display": _format_duration(r.avg_mttd),
                    "avg_mttr_seconds": round(r.avg_mttr, 1) if r.avg_mttr else None,
                    "avg_mttr_display": _format_duration(r.avg_mttr),
                    "sla_met": r.sla_met,
                    "sla_total": r.sla_total,
                    "sla_pct": sla_pct,
                    "high_priority": r.high_priority,
                    "security_incidents": r.si_count,
                },
            })

        scored.sort(key=lambda x: x["composite_score"], reverse=True)
        return scored

    async def get_detail(
        self,
        analyst_name: str,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> Optional[dict]:
        """Get detailed metrics for a single analyst."""
        filters = self._build_filters(start_date, end_date)
        filters.append(Ticket.technician == analyst_name)

        # Base stats
        q = select(
            func.count(Ticket.id).label("total"),
            func.count(Ticket.id).filter(
                Ticket.status.in_(["Resolved", "Closed"])
            ).label("resolved"),
            func.count(Ticket.id).filter(
                Ticket.validation == "True Positive"
            ).label("tp_count"),
            func.count(Ticket.id).filter(
                Ticket.validation == "False Positive"
            ).label("fp_count"),
            func.count(Ticket.id).filter(
                (Ticket.validation == None) | (Ticket.validation == "Not Specified")
            ).label("ns_count"),
            func.avg(Ticket.mttd_seconds).filter(
                Ticket.mttd_seconds != None, Ticket.mttd_seconds > 0
            ).label("avg_mttd"),
            func.avg(Ticket.mttr_seconds).filter(
                Ticket.mttr_seconds != None, Ticket.mttr_seconds > 0
            ).label("avg_mttr"),
            func.count(Ticket.id).filter(Ticket.sla_met == True).label("sla_met"),
            func.count(Ticket.id).filter(Ticket.sla_met != None).label("sla_total"),
            func.count(Ticket.id).filter(Ticket.priority == "High").label("high_priority"),
            func.count(Ticket.id).filter(
                Ticket.case_type == "Security Incident"
            ).label("si_count"),
        ).where(*filters)

        row = (await self.session.execute(q)).one()

        if row.total == 0:
            return None

        # Team avg for volume scoring
        team_filters = self._build_filters(start_date, end_date)
        tq = (
            select(
                func.count(Ticket.id).label("team_total"),
                func.count(func.distinct(Ticket.technician)).label("num_analysts"),
            ).where(*team_filters)
        )
        team_row = (await self.session.execute(tq)).one()
        team_avg = (
            team_row.team_total / team_row.num_analysts
            if team_row.num_analysts > 0
            else 1
        )

        metrics = {
            "speed": _clamp(_score_speed(row.avg_mttd)),
            "detection": _clamp(_score_detection(row.tp_count, row.total)),
            "accuracy": _clamp(_score_accuracy(row.tp_count, row.fp_count, row.total)),
            "volume": _clamp(_score_volume(row.total, team_avg)),
            "sla": _clamp(_score_sla(row.sla_met, row.sla_total)),
            "throughput": _clamp(_score_throughput(row.resolved, row.total)),
            "complexity": _clamp(_score_complexity(row.high_priority, row.si_count, row.total)),
        }
        composite = round(sum(metrics[k] * WEIGHTS[k] for k in WEIGHTS), 1)
        sla_pct = round(row.sla_met / row.sla_total * 100, 1) if row.sla_total > 0 else None

        # Top customers
        cq = (
            select(
                Ticket.customer,
                func.count(Ticket.id).label("count"),
            )
            .where(*filters, Ticket.customer != None)
            .group_by(Ticket.customer)
            .order_by(func.count(Ticket.id).desc())
            .limit(5)
        )
        customers_result = await self.session.execute(cq)
        top_customers = [
            {"customer": r.customer, "count": r.count}
            for r in customers_result.all()
        ]

        # Top alert rules
        aq = (
            select(
                Ticket.wazuh_rule_name,
                func.count(Ticket.id).label("count"),
            )
            .where(*filters, Ticket.wazuh_rule_name != None)
            .group_by(Ticket.wazuh_rule_name)
            .order_by(func.count(Ticket.id).desc())
            .limit(5)
        )
        alerts_result = await self.session.execute(aq)
        top_alerts = [
            {"rule_name": r.wazuh_rule_name, "count": r.count}
            for r in alerts_result.all()
        ]

        # If no wazuh rules, fall back to attack_category
        if not top_alerts:
            aq2 = (
                select(
                    Ticket.attack_category,
                    func.count(Ticket.id).label("count"),
                )
                .where(*filters, Ticket.attack_category != None)
                .group_by(Ticket.attack_category)
                .order_by(func.count(Ticket.id).desc())
                .limit(5)
            )
            alerts_result2 = await self.session.execute(aq2)
            top_alerts = [
                {"rule_name": r.attack_category, "count": r.count}
                for r in alerts_result2.all()
            ]

        # Recent tickets
        rq = (
            select(
                Ticket.id,
                Ticket.subject,
                Ticket.status,
                Ticket.priority,
                Ticket.validation,
                Ticket.created_time,
                Ticket.mttd_seconds,
                Ticket.sla_met,
            )
            .where(*filters)
            .order_by(Ticket.created_time.desc())
            .limit(10)
        )
        tickets_result = await self.session.execute(rq)
        recent_tickets = [
            {
                "id": t.id,
                "subject": t.subject,
                "status": t.status,
                "priority": t.priority,
                "validation": t.validation,
                "created_time": t.created_time.isoformat() if t.created_time else None,
                "mttd_seconds": t.mttd_seconds,
                "sla_met": t.sla_met,
            }
            for t in tickets_result.all()
        ]

        return {
            "analyst": analyst_name,
            "tier": _tier(composite),
            "composite_score": composite,
            "metrics": metrics,
            "stats": {
                "total_tickets": row.total,
                "resolved": row.resolved,
                "tp_count": row.tp_count,
                "fp_count": row.fp_count,
                "ns_count": row.ns_count,
                "avg_mttd_seconds": round(row.avg_mttd, 1) if row.avg_mttd else None,
                "avg_mttd_display": _format_duration(row.avg_mttd),
                "avg_mttr_seconds": round(row.avg_mttr, 1) if row.avg_mttr else None,
                "avg_mttr_display": _format_duration(row.avg_mttr),
                "sla_met": row.sla_met,
                "sla_total": row.sla_total,
                "sla_pct": sla_pct,
                "high_priority": row.high_priority,
                "security_incidents": row.si_count,
            },
            "top_customers": top_customers,
            "top_alerts": top_alerts,
            "recent_tickets": recent_tickets,
        }

    async def build_ai_prompt_data(
        self,
        analyst_name: str,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> Optional[str]:
        """Build data context for AI analyst review."""
        detail = await self.get_detail(analyst_name, start_date, end_date)
        if not detail:
            return None

        m = detail["metrics"]
        s = detail["stats"]

        period_label = ""
        if start_date and end_date:
            days = (end_date - start_date).days if isinstance(end_date, date) and isinstance(start_date, date) else 30
            if days <= 1:
                period_label = f"hari ini"
            else:
                period_label = f"{days} hari terakhir"
        else:
            period_label = "seluruh periode"

        top_cust = ", ".join(f"{c['customer']} ({c['count']})" for c in detail["top_customers"][:3])
        top_alert = ", ".join(f"{a['rule_name']} ({a['count']})" for a in detail["top_alerts"][:3])

        prompt = f"""Buat performance review untuk SOC analyst berikut ({period_label}):

**Analyst**: {detail['analyst']}
**Tier**: {detail['tier']} (Composite Score: {detail['composite_score']}/100)

**Scoring Breakdown**:
- Speed (MTTD): {m['speed']}/100 — Avg MTTD: {s['avg_mttd_display'] or 'N/A'}
- Detection (TP Rate): {m['detection']}/100 — {s['tp_count']} TP dari {s['total_tickets']} total
- Accuracy (Validation Rate): {m['accuracy']}/100 — {s['tp_count'] + s['fp_count']} tervalidasi dari {s['total_tickets']}
- Volume: {m['volume']}/100 — {s['total_tickets']} ticket di-handle
- SLA Compliance: {m['sla']}/100 — {s['sla_pct'] or 0}% ({s['sla_met']}/{s['sla_total']})
- Throughput: {m['throughput']}/100 — {s['resolved']} resolved dari {s['total_tickets']}
- Complexity: {m['complexity']}/100 — {s['high_priority']} High Priority, {s['security_incidents']} Security Incidents

**Top Customers**: {top_cust or 'N/A'}
**Top Alerts**: {top_alert or 'N/A'}

Berikan review dalam format:
## Performance Review: [Nama Analyst]

### Ringkasan
(1-2 kalimat penilaian keseluruhan)

### Kekuatan
- (poin-poin kekuatan berdasarkan data)

### Area Peningkatan
- (poin-poin area yang perlu ditingkatkan)

### Rekomendasi
- (saran actionable untuk meningkatkan performa)

Gunakan Bahasa Indonesia. Bersikap objektif dan berbasis data."""

        return prompt

    # ── Snapshot & Trend (Phase 2) ──────────────────────────────────

    async def create_snapshot(
        self,
        period_start: date,
        period_end: date,
        granularity: str = "weekly",
    ) -> int:
        """Compute scores for all analysts in a period and store as snapshots.
        Returns the number of snapshots upserted."""
        scores = await self.get_scores(period_start, period_end)
        if not scores:
            return 0

        count = 0
        for s in scores:
            m = s["metrics"]
            st = s["stats"]

            # Upsert: delete existing then insert
            await self.session.execute(
                delete(AnalystSnapshot).where(
                    AnalystSnapshot.analyst == s["analyst"],
                    AnalystSnapshot.period_start == datetime.combine(period_start, datetime.min.time(), tzinfo=timezone.utc),
                    AnalystSnapshot.granularity == granularity,
                )
            )

            snap = AnalystSnapshot(
                analyst=s["analyst"],
                period_start=datetime.combine(period_start, datetime.min.time(), tzinfo=timezone.utc),
                period_end=datetime.combine(period_end, datetime.min.time(), tzinfo=timezone.utc),
                granularity=granularity,
                composite_score=int(s["composite_score"] * 10),
                speed_score=int(m["speed"] * 10),
                detection_score=int(m["detection"] * 10),
                accuracy_score=int(m["accuracy"] * 10),
                volume_score=int(m["volume"] * 10),
                sla_score=int(m["sla"] * 10),
                throughput_score=int(m["throughput"] * 10),
                complexity_score=int(m["complexity"] * 10),
                total_tickets=st["total_tickets"],
                resolved=st["resolved"],
                tp_count=st["tp_count"],
                fp_count=st["fp_count"],
                avg_mttd_seconds=int(st["avg_mttd_seconds"]) if st.get("avg_mttd_seconds") else None,
                avg_mttr_seconds=int(st["avg_mttr_seconds"]) if st.get("avg_mttr_seconds") else None,
                sla_pct=int(st["sla_pct"] * 10) if st.get("sla_pct") is not None else 0,
            )
            self.session.add(snap)
            count += 1

        await self.session.commit()
        logger.info(f"Created {count} analyst snapshots for {period_start} ({granularity})")
        return count

    async def backfill_snapshots(
        self,
        weeks_back: int = 26,
        granularity: str = "weekly",
    ) -> int:
        """Generate historical weekly snapshots going back N weeks."""
        total = 0
        today = date.today()

        for i in range(weeks_back, 0, -1):
            if granularity == "weekly":
                period_end = today - timedelta(days=(i - 1) * 7)
                period_start = period_end - timedelta(days=7)
            else:  # monthly
                # Approximate month boundaries
                period_end = today.replace(day=1) - timedelta(days=(i - 1) * 30)
                period_start = period_end - timedelta(days=30)

            try:
                count = await self.create_snapshot(period_start, period_end, granularity)
                total += count
            except Exception as e:
                logger.warning(f"Backfill error for {period_start}: {e}")
                await self.session.rollback()

        logger.info(f"Backfill complete: {total} total snapshots created")
        return total

    async def get_trend(
        self,
        analyst_name: str,
        granularity: str = "weekly",
        limit: int = 26,
    ) -> list[dict]:
        """Get trend data points for a single analyst from snapshots."""
        q = (
            select(AnalystSnapshot)
            .where(
                AnalystSnapshot.analyst == analyst_name,
                AnalystSnapshot.granularity == granularity,
            )
            .order_by(AnalystSnapshot.period_start.desc())
            .limit(limit)
        )
        result = await self.session.execute(q)
        rows = result.scalars().all()

        points = []
        for r in reversed(rows):  # chronological order
            ps = r.period_start
            pe = r.period_end
            if granularity == "weekly":
                period_label = f"{ps.strftime('%Y')}-W{ps.isocalendar()[1]:02d}"
            else:
                period_label = ps.strftime("%Y-%m")

            points.append({
                "period": period_label,
                "period_start": ps.strftime("%Y-%m-%d"),
                "period_end": pe.strftime("%Y-%m-%d"),
                "composite_score": (r.composite_score or 0) / 10.0,
                "tier": _tier((r.composite_score or 0) / 10.0),
                "metrics": {
                    "speed": (r.speed_score or 0) / 10.0,
                    "detection": (r.detection_score or 0) / 10.0,
                    "accuracy": (r.accuracy_score or 0) / 10.0,
                    "volume": (r.volume_score or 0) / 10.0,
                    "sla": (r.sla_score or 0) / 10.0,
                    "throughput": (r.throughput_score or 0) / 10.0,
                    "complexity": (r.complexity_score or 0) / 10.0,
                },
                "total_tickets": r.total_tickets or 0,
                "resolved": r.resolved or 0,
                "sla_pct": (r.sla_pct or 0) / 10.0 if r.sla_pct is not None else None,
            })

        return points

    async def get_team_trend(
        self,
        granularity: str = "weekly",
        limit: int = 26,
    ) -> list[dict]:
        """Get trend for ALL analysts — for comparison overlay."""
        q = (
            select(AnalystSnapshot)
            .where(AnalystSnapshot.granularity == granularity)
            .order_by(AnalystSnapshot.period_start.desc())
            .limit(limit * 20)  # generous limit for all analysts
        )
        result = await self.session.execute(q)
        rows = result.scalars().all()

        # Group by period
        by_period: dict[str, list] = {}
        for r in rows:
            ps = r.period_start
            if granularity == "weekly":
                key = f"{ps.strftime('%Y')}-W{ps.isocalendar()[1]:02d}"
            else:
                key = ps.strftime("%Y-%m")

            if key not in by_period:
                by_period[key] = {
                    "period": key,
                    "period_start": ps.strftime("%Y-%m-%d"),
                    "period_end": r.period_end.strftime("%Y-%m-%d"),
                    "analysts": [],
                }
            by_period[key]["analysts"].append({
                "analyst": r.analyst,
                "composite_score": (r.composite_score or 0) / 10.0,
                "tier": _tier((r.composite_score or 0) / 10.0),
            })

        # Sort by period chronologically and take last N
        periods = sorted(by_period.values(), key=lambda x: x["period_start"])
        return periods[-limit:]
