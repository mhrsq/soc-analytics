"""Analyst scoring & Manager View API endpoints."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas import (
    AnalystAIReview,
    AnalystAIReviewRequest,
    AnalystDetail,
    AnalystScore,
    AnalystTrend,
    TeamTrendPoint,
)
from app.services.analyst_service import AnalystScoringService
from app.utils import parse_date_param as _parse_time

router = APIRouter(prefix="/api/analysts", tags=["analysts"])


@router.get("/scores", response_model=list[AnalystScore])
async def get_analyst_scores(
    start: Optional[str] = Query(None, description="Start date (ISO)"),
    end: Optional[str] = Query(None, description="End date (ISO)"),
    db: AsyncSession = Depends(get_db),
):
    """Get scored leaderboard for all analysts."""
    svc = AnalystScoringService(db)
    return await svc.get_scores(_parse_time(start), _parse_time(end))


# ── Team-level routes (BEFORE /{name} to avoid path collision) ──


@router.get("/team/trend", response_model=list[TeamTrendPoint])
async def get_team_trend(
    granularity: str = Query("weekly", regex="^(weekly|monthly)$"),
    limit: int = Query(26, ge=4, le=52),
    db: AsyncSession = Depends(get_db),
):
    """Get historical trend for all analysts (comparison view)."""
    svc = AnalystScoringService(db)
    return await svc.get_team_trend(granularity, limit)


@router.post("/snapshots/backfill")
async def backfill_snapshots(
    weeks: int = Query(26, ge=1, le=52, description="Weeks to backfill"),
    granularity: str = Query("weekly", regex="^(weekly|monthly)$"),
    db: AsyncSession = Depends(get_db),
):
    """Trigger manual backfill of historical analyst snapshots."""
    svc = AnalystScoringService(db)
    count = await svc.backfill_snapshots(weeks, granularity)
    return {"message": f"Backfilled {count} snapshots", "weeks": weeks, "granularity": granularity}


# ── Per-analyst routes ──


@router.get("/{name}/detail", response_model=AnalystDetail)
async def get_analyst_detail(
    name: str,
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Get detailed metrics for a single analyst."""
    svc = AnalystScoringService(db)
    result = await svc.get_detail(name, _parse_time(start), _parse_time(end))
    if result is None:
        raise HTTPException(status_code=404, detail="Analyst not found or no data")
    return result


@router.post("/{name}/ai-review", response_model=AnalystAIReview)
async def generate_analyst_ai_review(
    name: str,
    body: AnalystAIReviewRequest,
    db: AsyncSession = Depends(get_db),
):
    """Generate AI performance review for an analyst."""
    from app.services.ai_service import AIService

    svc = AnalystScoringService(db)
    start_date = _parse_time(body.start_date)
    end_date = _parse_time(body.end_date)

    prompt_data = await svc.build_ai_prompt_data(name, start_date, end_date)
    if prompt_data is None:
        raise HTTPException(status_code=404, detail="Analyst not found or no data")

    ai_svc = AIService(db)
    provider = await ai_svc._get_provider(body.provider_id)

    if provider is None:
        raise HTTPException(status_code=400, detail="No active LLM provider configured")

    try:
        text = await ai_svc._call_llm(provider, prompt_data)
        return {
            "analyst": name,
            "review": text,
            "provider": f"{provider.label} ({provider.model})",
            "generated_at": datetime.now(timezone.utc),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI generation failed: {str(e)}")


@router.get("/{name}/trend", response_model=AnalystTrend)
async def get_analyst_trend(
    name: str,
    granularity: str = Query("weekly", regex="^(weekly|monthly)$"),
    limit: int = Query(26, ge=4, le=52),
    db: AsyncSession = Depends(get_db),
):
    """Get historical score trend for an analyst."""
    svc = AnalystScoringService(db)
    points = await svc.get_trend(name, granularity, limit)
    return {"analyst": name, "granularity": granularity, "points": points}
