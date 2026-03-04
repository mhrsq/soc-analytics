"""Metrics API endpoints."""

from datetime import date
from typing import Optional

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


@router.get("/summary", response_model=MetricsSummary)
async def get_summary(
    start: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    end: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    customer: Optional[str] = Query(None, description="Filter by customer"),
    db: AsyncSession = Depends(get_db),
):
    """Get KPI summary metrics."""
    svc = AnalyticsService(db)
    return await svc.get_summary(start, end, customer)


@router.get("/volume", response_model=list[VolumePoint])
async def get_volume_trend(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
    customer: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Get ticket volume trend over time (daily)."""
    svc = AnalyticsService(db)
    return await svc.get_volume_trend("daily", start, end, customer)


@router.get("/validation", response_model=ValidationBreakdown)
async def get_validation_breakdown(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
    customer: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Get TP/FP/Not Specified breakdown."""
    svc = AnalyticsService(db)
    return await svc.get_validation_breakdown(start, end, customer)


@router.get("/priority", response_model=list[PriorityItem])
async def get_priority_distribution(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
    customer: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Get ticket count by priority."""
    svc = AnalyticsService(db)
    return await svc.get_priority_distribution(start, end, customer)


@router.get("/customers", response_model=list[CustomerItem])
async def get_customer_distribution(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Get per-customer metrics."""
    svc = AnalyticsService(db)
    return await svc.get_customer_distribution(start, end)


@router.get("/top-alerts", response_model=list[AlertRuleItem])
async def get_top_alerts(
    limit: int = Query(10, ge=1, le=50),
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
    customer: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Get most triggered Wazuh alert rules."""
    svc = AnalyticsService(db)
    return await svc.get_top_alerts(limit, start, end, customer)


@router.get("/mttd", response_model=list[MttdPoint])
async def get_mttd_trend(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
    customer: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Get MTTD trend over time."""
    svc = AnalyticsService(db)
    return await svc.get_mttd_trend(start, end, customer)


@router.get("/analysts", response_model=list[AnalystPerformance])
async def get_analyst_performance(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Get analyst performance metrics."""
    svc = AnalyticsService(db)
    return await svc.get_analyst_performance(start, end)
