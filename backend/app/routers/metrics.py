"""Metrics API endpoints."""

from datetime import date, datetime, timezone
from typing import Optional, Union

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas import (
    AnalystPerformance,
    AlertRuleItem,
    CustomerItem,
    MetricsSummary,
    MttdPoint,
    PriorityItem,
    ValidationBreakdown,
    VolumePoint,
)
from app.services.analytics_service import AnalyticsService

router = APIRouter(prefix="/api/metrics", tags=["metrics"])


def _parse_asset_names(raw: Optional[str]) -> Optional[list[str]]:
    """Parse comma-separated asset names from query param."""
    if not raw:
        return None
    names = [n.strip() for n in raw.split(",") if n.strip()]
    return names or None


def _parse_time(value: Optional[str]) -> Optional[Union[date, datetime]]:
    """Parse ISO datetime or date string.
    Date-only strings (YYYY-MM-DD) return date objects for day-level filtering.
    Full datetime strings return datetime objects for precise filtering."""
    if not value:
        return None
    # Date-only pattern (YYYY-MM-DD) → return date, not datetime
    if len(value) == 10 and value[4] == "-" and value[7] == "-":
        try:
            return date.fromisoformat(value)
        except ValueError:
            return None
    # Full ISO datetime
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return None


@router.get("/summary", response_model=MetricsSummary)
async def get_summary(
    start: Optional[str] = Query(None, description="Start date/datetime (ISO)"),
    end: Optional[str] = Query(None, description="End date/datetime (ISO)"),
    customer: Optional[str] = Query(None, description="Filter by customer"),
    asset_name: Optional[str] = Query(None, description="Comma-separated asset hostnames"),
    db: AsyncSession = Depends(get_db),
):
    """Get KPI summary metrics."""
    svc = AnalyticsService(db)
    return await svc.get_summary(_parse_time(start), _parse_time(end), customer, _parse_asset_names(asset_name))


@router.get("/volume", response_model=list[VolumePoint])
async def get_volume_trend(
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
    customer: Optional[str] = Query(None),
    asset_name: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Get ticket volume trend over time. Auto-detects granularity:
    - ≤2 days → hourly aggregation
    - >2 days → daily aggregation
    """
    parsed_start = _parse_time(start)
    parsed_end = _parse_time(end)
    # Auto-detect granularity based on range
    period = "daily"
    if parsed_start and parsed_end:
        start_d = parsed_start if isinstance(parsed_start, date) and not isinstance(parsed_start, datetime) else (parsed_start.date() if isinstance(parsed_start, datetime) else parsed_start)
        end_d = parsed_end if isinstance(parsed_end, date) and not isinstance(parsed_end, datetime) else (parsed_end.date() if isinstance(parsed_end, datetime) else parsed_end)
        if (end_d - start_d).days <= 2:
            period = "hourly"
    svc = AnalyticsService(db)
    return await svc.get_volume_trend(period, parsed_start, parsed_end, customer, _parse_asset_names(asset_name))


@router.get("/validation", response_model=ValidationBreakdown)
async def get_validation_breakdown(
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
    customer: Optional[str] = Query(None),
    asset_name: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Get TP/FP/Not Specified breakdown."""
    svc = AnalyticsService(db)
    return await svc.get_validation_breakdown(_parse_time(start), _parse_time(end), customer, _parse_asset_names(asset_name))


@router.get("/priority", response_model=list[PriorityItem])
async def get_priority_distribution(
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
    customer: Optional[str] = Query(None),
    asset_name: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Get ticket count by priority."""
    svc = AnalyticsService(db)
    return await svc.get_priority_distribution(_parse_time(start), _parse_time(end), customer, _parse_asset_names(asset_name))


@router.get("/customers", response_model=list[CustomerItem])
async def get_customer_distribution(
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
    asset_name: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Get per-customer metrics."""
    svc = AnalyticsService(db)
    return await svc.get_customer_distribution(_parse_time(start), _parse_time(end), _parse_asset_names(asset_name))


@router.get("/top-alerts", response_model=list[AlertRuleItem])
async def get_top_alerts(
    limit: int = Query(10, ge=1, le=50),
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
    customer: Optional[str] = Query(None),
    asset_name: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Get most triggered Wazuh alert rules."""
    svc = AnalyticsService(db)
    return await svc.get_top_alerts(limit, _parse_time(start), _parse_time(end), customer, _parse_asset_names(asset_name))


@router.get("/mttd", response_model=list[MttdPoint])
async def get_mttd_trend(
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
    customer: Optional[str] = Query(None),
    asset_name: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Get MTTD trend over time."""
    svc = AnalyticsService(db)
    return await svc.get_mttd_trend(_parse_time(start), _parse_time(end), customer, _parse_asset_names(asset_name))


@router.get("/analysts", response_model=list[AnalystPerformance])
async def get_analyst_performance(
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
    asset_name: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Get analyst performance metrics."""
    svc = AnalyticsService(db)
    return await svc.get_analyst_performance(_parse_time(start), _parse_time(end), _parse_asset_names(asset_name))


@router.get("/asset-exposure")
async def get_asset_exposure(
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
    customer: Optional[str] = Query(None),
    asset_name: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Get assets ranked by alert count — used in Customer View."""
    svc = AnalyticsService(db)
    return await svc.get_asset_exposure(
        _parse_time(start), _parse_time(end), customer, _parse_asset_names(asset_name), limit
    )
