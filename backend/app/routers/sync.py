"""Sync management API endpoints."""

import asyncio
import logging

from fastapi import APIRouter

from app.schemas import SyncStatus, SyncTriggerResponse
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


def get_sync_service() -> SyncService:
    """Get the shared sync service instance (for scheduler)."""
    return sync_service
