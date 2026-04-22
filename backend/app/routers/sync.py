"""Sync management API endpoints."""

import asyncio
import logging

from fastapi import APIRouter, Depends

from app.routers.auth import require_admin

from app.config import get_settings
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session
from app.models import SyncLog, User
from app.schemas import SDPConnectionStatus, SyncDetailedStatus, SyncLogEntry, SyncStatus, SyncTriggerResponse
from app.services.sdp_client import SDPClient
from app.services.sync_service import SyncService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/sync", tags=["sync"])

# Shared sync service instance
sync_service = SyncService()


@router.get("/status", response_model=SyncStatus)
async def get_sync_status():
    """Get current sync status and last sync info."""
    return await sync_service.get_sync_status()


@router.get("/status/detailed", response_model=SyncDetailedStatus)
async def get_sync_status_detailed():
    """Get detailed sync status with recent log history."""
    base = await sync_service.get_sync_status()
    async with async_session() as session:
        result = await session.execute(
            select(SyncLog).order_by(SyncLog.id.desc()).limit(20)
        )
        logs = result.scalars().all()
    return SyncDetailedStatus(
        **base,
        recent_logs=[
            SyncLogEntry(
                id=l.id,
                sync_type=l.sync_type or "unknown",
                status=l.status or "unknown",
                tickets_synced=l.tickets_synced or 0,
                tickets_total=l.tickets_total or 0,
                errors=l.errors or 0,
                started_at=l.started_at,
                finished_at=l.finished_at,
                details=l.details,
            )
            for l in logs
        ],
    )


@router.post("/trigger", response_model=SyncTriggerResponse)
async def trigger_sync(full: bool = False, user: User = Depends(require_admin)):
    """Manually trigger a sync.
    
    Args:
        full: If True, run full initial sync. Otherwise incremental.
    """
    if sync_service.is_running:
        return {"message": "Sync already in progress", "sync_id": None}

    # Run sync in background
    if full:
        asyncio.create_task(sync_service.run_initial_sync())
        return {"message": "Full sync started in background", "sync_id": None}
    else:
        asyncio.create_task(sync_service.run_incremental_sync())
        return {"message": "Incremental sync started in background", "sync_id": None}


@router.get("/sdp-status", response_model=SDPConnectionStatus)
async def check_sdp_connection():
    """Test SDP API key validity and connection."""
    s = get_settings()
    key = s.SDP_API_KEY
    masked = f"{key[:4]}...{key[-4:]}" if len(key) > 8 else "***"
    base_url = s.SDP_BASE_URL

    if not key:
        return SDPConnectionStatus(
            connected=False,
            api_key_valid=False,
            base_url=base_url,
            api_key_masked="(not set)",
            error="SDP_API_KEY not configured",
        )

    try:
        client = SDPClient()
        count = await client.get_ticket_count()
        return SDPConnectionStatus(
            connected=True,
            api_key_valid=True,
            base_url=base_url,
            api_key_masked=masked,
            ticket_count=count,
        )
    except Exception as e:
        err = str(e)
        etype = type(e).__name__
        is_auth = any(k in err for k in ("401", "403", "Unauthorized", "INVALID"))
        is_conn = any(k in err for k in ("ConnectError", "TimeoutException", "ConnectionRefused")) or "connect" in etype.lower()
        return SDPConnectionStatus(
            connected=False if (is_auth or is_conn) else True,
            api_key_valid=False if is_auth else None,
            base_url=base_url,
            api_key_masked=masked,
            error=f"{etype}: {e}",
        )


def get_sync_service() -> SyncService:
    """Get the shared sync service instance (for scheduler)."""
    return sync_service
