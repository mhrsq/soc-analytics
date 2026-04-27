"""Reports API endpoints — Monthly Security Reports."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.routers.auth import require_auth
from app.models import User
from app.schemas import MonthlyReportRequest, MonthlyReportResponse
from app.services.ai_service import AIService

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.post("/monthly", response_model=MonthlyReportResponse)
async def generate_monthly_report(
    req: MonthlyReportRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_auth),
):
    """Generate a Monthly Security Operations Report as styled HTML."""
    # Customer-role users can only generate reports for their own customer
    if user.role == "customer" and user.customer:
        req = req.model_copy(update={"customer": user.customer})
    ai = AIService(db)
    return await ai.generate_monthly_report(req.customer, req.month, req.provider_id)
