"""WhatsApp Bot settings and control endpoints."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Ticket, User
from app.routers.auth import require_admin

router = APIRouter(prefix="/api/wa-bot", tags=["wa-bot"])


# ── Schemas ──

class WaBotConfigUpdate(BaseModel):
    enabled: Optional[bool] = None
    fonnte_token: Optional[str] = None
    sla_target_pct: Optional[float] = None
    schedule_hour: Optional[int] = None
    escalation_auto: Optional[bool] = None
    streak_threshold_kind: Optional[int] = None
    streak_threshold_toxic: Optional[int] = None
    min_tickets_threshold: Optional[int] = None


class AnalystMappingCreate(BaseModel):
    technician: str
    phone: str
    mode_override: Optional[str] = None


class AnalystMappingUpdate(BaseModel):
    phone: Optional[str] = None
    mode_override: Optional[str] = None
    is_active: Optional[bool] = None


# ── Config endpoints ──

@router.get("/config")
async def get_config(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(text("SELECT * FROM wa_bot_config ORDER BY id LIMIT 1"))
    row = result.mappings().first()
    if not row:
        return {}
    return dict(row)


@router.patch("/config")
async def update_config(
    body: WaBotConfigUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")
    set_clauses = ", ".join(f"{k} = :{k}" for k in updates)
    await db.execute(
        text(f"UPDATE wa_bot_config SET {set_clauses}, updated_at = NOW() WHERE id = (SELECT MIN(id) FROM wa_bot_config)"),
        updates,
    )
    await db.commit()
    return {"ok": True}


# ── Analyst mappings ──

@router.get("/mappings")
async def list_mappings(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(text("SELECT * FROM wa_analyst_mapping ORDER BY technician"))
    return [dict(r) for r in result.mappings()]


@router.post("/mappings")
async def create_mapping(
    body: AnalystMappingCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    await db.execute(
        text("""
            INSERT INTO wa_analyst_mapping (technician, phone, mode_override)
            VALUES (:technician, :phone, :mode_override)
            ON CONFLICT (technician) DO UPDATE
              SET phone = :phone, mode_override = :mode_override, is_active = true
        """),
        body.model_dump(),
    )
    await db.commit()
    return {"ok": True}


@router.patch("/mappings/{mapping_id}")
async def update_mapping(
    mapping_id: int,
    body: AnalystMappingUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")
    set_clauses = ", ".join(f"{k} = :{k}" for k in updates)
    updates["id"] = mapping_id
    await db.execute(text(f"UPDATE wa_analyst_mapping SET {set_clauses} WHERE id = :id"), updates)
    await db.commit()
    return {"ok": True}


@router.delete("/mappings/{mapping_id}")
async def delete_mapping(
    mapping_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    await db.execute(text("DELETE FROM wa_analyst_mapping WHERE id = :id"), {"id": mapping_id})
    await db.commit()
    return {"ok": True}


# ── Available technicians (dynamic from tickets) ──

@router.get("/available-technicians")
async def get_technicians(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(
        select(func.distinct(Ticket.technician))
        .where(Ticket.technician != None)
        .order_by(Ticket.technician)
    )
    return [r[0] for r in result.all() if r[0]]


# ── Streak data ──

@router.get("/streaks")
async def get_streaks(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(text("SELECT * FROM analyst_wa_streaks ORDER BY streak_count DESC"))
    return [dict(r) for r in result.mappings()]


# ── Message log ──

@router.get("/logs")
async def get_logs(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(
        text("SELECT * FROM wa_message_log ORDER BY sent_at DESC LIMIT :limit"),
        {"limit": limit},
    )
    return [dict(r) for r in result.mappings()]


# ── Manual trigger (test send) ──

@router.post("/trigger")
async def trigger_now(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Manually trigger the daily reminder job (admin use)."""
    from app.services.wa_bot_service import run_daily_reminders

    try:
        await run_daily_reminders(db)
        return {"ok": True, "message": "Reminders sent"}
    except Exception as e:
        raise HTTPException(500, str(e))


# ── Send test message ──

class TestSendRequest(BaseModel):
    phone: str
    message: Optional[str] = "Test message dari SOC Analytics WA Bot 🤖"


@router.post("/test-send")
async def test_send(
    body: TestSendRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Send a test message to a specific phone number."""
    from app.services.wa_bot_service import send_fonnte, get_config as get_wa_config

    cfg = await get_wa_config(db)
    if not cfg or not cfg.get("fonnte_token"):
        raise HTTPException(400, "No Fonnte token configured")
    resp = await send_fonnte(cfg["fonnte_token"], body.phone, body.message or "")
    return resp
