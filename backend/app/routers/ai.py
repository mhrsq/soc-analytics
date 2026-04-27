"""AI insights API endpoints."""

from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas import AIInsight, AIInsightRequest, ExecSummaryRequest, ExecSummaryResponse, WidgetInsightsRequest, WidgetInsightsResponse
from app.services.ai_service import AIService
from app.services.analytics_service import AnalyticsService

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.post("/insights", response_model=AIInsight)
async def generate_insights(
    req: AIInsightRequest,
    db: AsyncSession = Depends(get_db),
):
    """Generate AI-powered insights from SOC data."""
    from datetime import date, timedelta

    # Use explicit start/end dates if provided, else fall back to period
    if req.start_date and req.end_date:
        try:
            start_date = date.fromisoformat(req.start_date)
            end_date = date.fromisoformat(req.end_date)
        except ValueError:
            end_date = date.today()
            start_date = end_date - timedelta(days=7)
    else:
        end_date = date.today()
        if req.period == "1d":
            start_date = end_date
        elif req.period == "7d":
            start_date = end_date - timedelta(days=7)
        elif req.period == "30d":
            start_date = end_date - timedelta(days=30)
        else:
            start_date = end_date - timedelta(days=7)

    # Gather metrics
    analytics = AnalyticsService(db)
    summary = await analytics.get_summary(start_date, end_date, req.customer)
    top_alerts = await analytics.get_top_alerts(5, start_date, end_date, req.customer)
    customers = await analytics.get_customer_distribution(start_date, end_date)
    analysts = await analytics.get_analyst_performance(start_date, end_date)

    # Add extra data to metrics
    summary["top_alerts"] = top_alerts
    summary["customers"] = customers
    summary["analysts"] = analysts

    # Compute period label from actual date range
    days_diff = (end_date - start_date).days
    if days_diff <= 1:
        period_str = "1d"
    elif days_diff <= 7:
        period_str = f"{days_diff}d"
    elif days_diff <= 30:
        period_str = f"{days_diff}d"
    else:
        period_str = f"{days_diff}d"

    # Generate insights
    ai = AIService(db)
    result = await ai.generate_insights(
        summary, period_str, req.customer,
        provider_id=req.provider_id,
        start_date=start_date,
        end_date=end_date,
    )
    return result


@router.post("/widget-insights", response_model=WidgetInsightsResponse)
async def get_widget_insights(
    req: WidgetInsightsRequest,
    db: AsyncSession = Depends(get_db),
):
    """Generate 1-2 sentence AI insights for all Manager View widgets in one LLM call."""
    ai = AIService(db)
    result = await ai.generate_widget_insights(req.model_dump(exclude_none=True), req.provider_id)
    return WidgetInsightsResponse(
        insights=result.get("insights", {}),
        model_used=result.get("model_used", "unknown"),
    )


@router.post("/executive-summary", response_model=ExecSummaryResponse)
async def get_executive_summary(
    req: ExecSummaryRequest,
    db: AsyncSession = Depends(get_db),
):
    """Generate an AI-powered executive summary of SOC metrics."""
    from datetime import date as date_type

    ai = AIService(db)
    start = datetime.strptime(req.start_date, "%Y-%m-%d").date() if req.start_date else None
    end = datetime.strptime(req.end_date, "%Y-%m-%d").date() if req.end_date else None
    return await ai.generate_executive_summary(start, end, req.customer, req.provider_id)
