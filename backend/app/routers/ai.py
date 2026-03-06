"""AI insights API endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas import AIInsight, AIInsightRequest
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
