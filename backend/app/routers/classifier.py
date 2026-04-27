"""Classifier API endpoints — auto-classify attack_category on tickets."""

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Ticket, User
from app.routers.auth import require_admin
from app.services.classifier_service import ClassifierService

router = APIRouter(prefix="/api/classifier", tags=["classifier"])


@router.post("/run")
async def run_classifier(
    limit: int = Query(500, ge=1, le=5000),
    use_llm: bool = Query(False),
    customer: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Run attack category auto-classification. Admin only."""
    svc = ClassifierService(db)
    return await svc.run_batch(customer=customer, limit=limit, use_llm=use_llm)


@router.get("/stats")
async def get_classifier_stats(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Get current classification status."""
    q = (
        select(
            Ticket.attack_category,
            func.count().label("n"),
        )
        .group_by(Ticket.attack_category)
        .order_by(func.count().desc())
    )
    result = await db.execute(q)
    rows = result.all()
    total = sum(r.n for r in rows)
    classified = sum(r.n for r in rows if r.attack_category not in ("Other", None, ""))
    return {
        "total": total,
        "classified": classified,
        "unclassified": total - classified,
        "classification_rate": round(classified / total * 100, 1) if total > 0 else 0,
        "breakdown": [
            {"category": r.attack_category or "null", "count": r.n}
            for r in rows[:20]
        ],
    }
