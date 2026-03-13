"""Sync management API endpoints."""

import asyncio
import logging

from fastapi import APIRouter

from app.config import get_settings
from app.schemas import SDPConnectionStatus, SyncStatus, SyncTriggerResponse
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


@router.post("/trigger", response_model=SyncTriggerResponse)
async def trigger_sync(full: bool = False):
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
        is_auth = any(k in err for k in ("401", "403", "Unauthorized", "INVALID"))
        return SDPConnectionStatus(
            connected=not is_auth,
            api_key_valid=not is_auth,
            base_url=base_url,
            api_key_masked=masked,
            error=f"{type(e).__name__}: {e}",
        )


def get_sync_service() -> SyncService:
    """Get the shared sync service instance (for scheduler)."""
    return sync_service
