"""Dashboard profile persistence API."""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import DashboardProfile, User
from app.routers.auth import require_auth

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


class ProfileOut(BaseModel):
    id: str
    name: str
    widgets: list
    is_default: bool
    is_active: bool
    page: str = "main"
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ProfileSave(BaseModel):
    id: str
    name: str
    widgets: list
    is_default: bool = False
    is_active: bool = False


class BulkSave(BaseModel):
    profiles: list[ProfileSave]
    active_profile_id: Optional[str] = None


@router.get("/profiles", response_model=list[ProfileOut])
async def get_profiles(
    page: str = Query("main"),
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Get all dashboard profiles for the current user, filtered by page."""
    result = await db.execute(
        select(DashboardProfile)
        .where(DashboardProfile.user_id == user.id, DashboardProfile.page == page)
        .order_by(DashboardProfile.is_default.desc(), DashboardProfile.created_at)
    )
    return [ProfileOut.model_validate(r) for r in result.scalars().all()]


@router.put("/profiles")
async def save_profiles(
    body: BulkSave,
    page: str = Query("main"),
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Bulk save all profiles for the current user (replaces all for the given page)."""
    # Delete existing profiles for this user on this page
    existing = await db.execute(
        select(DashboardProfile).where(
            DashboardProfile.user_id == user.id, DashboardProfile.page == page
        )
    )
    for row in existing.scalars().all():
        await db.delete(row)

    # Insert new profiles
    for p in body.profiles:
        profile = DashboardProfile(
            id=p.id,
            user_id=user.id,
            name=p.name,
            widgets=p.widgets,
            is_default=p.is_default,
            is_active=(body.active_profile_id == p.id) if body.active_profile_id else p.is_active,
            page=page,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(profile)

    await db.commit()
    return {"ok": True, "count": len(body.profiles)}
