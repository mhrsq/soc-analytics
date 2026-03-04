"""SDP data synchronization service."""

import asyncio
import logging
import traceback
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import func, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session
from app.models import SyncLog, Ticket
from app.services.sdp_client import SDPClient

logger = logging.getLogger(__name__)


class SyncService:
    """Handles syncing ticket data from SDP to local PostgreSQL."""

    def __init__(self):
        self.sdp = SDPClient()
        self._is_running = False

    @property
    def is_running(self) -> bool:
        return self._is_running

    async def run_initial_sync(self) -> int:
        """Full sync of all SOC tickets. Returns sync_log ID."""
        if self._is_running:
            logger.warning("Sync already running, skipping")
            return -1

        self._is_running = True
        sync_id = None

        try:
            async with async_session() as session:
                # Create sync log entry
                log = SyncLog(
                    started_at=datetime.now(timezone.utc),
                    sync_type="initial",
                    status="running",
                )
                session.add(log)
                await session.commit()
                sync_id = log.id

            # Get total count
            total = await self.sdp.get_ticket_count()
            logger.info(f"Initial sync: {total} SOC tickets to sync")

            synced = 0
            errors = 0
            page_size = 100

            for start in range(1, total + 1, page_size):
                try:
                    tickets, _ = await self.sdp.list_tickets(
                        start_index=start,
                        row_count=page_size,
                        sort_field="id",
                        sort_order="asc",
                    )

                    # Fetch details in parallel (controlled by semaphore)
                    detail_tasks = [
                        self.sdp.get_ticket_detail(t["id"])
                        for t in tickets
                    ]
                    details = await asyncio.gather(*detail_tasks, return_exceptions=True)

                    # Parse and upsert
                    records = []
                    for detail in details:
                        if isinstance(detail, Exception):
                            errors += 1
                            continue
                        if detail is None:
                            errors += 1
                            continue
                        parsed = self.sdp.parse_ticket(detail)
                        if parsed:
                            records.append(parsed)

                    if records:
                        await self._upsert_tickets(records)
                        synced += len(records)

                    # Update progress
                    async with async_session() as session:
                        log_entry = await session.get(SyncLog, sync_id)
                        if log_entry:
                            log_entry.tickets_synced = synced
                            log_entry.tickets_total = total
                            log_entry.errors = errors
                            await session.commit()

                    logger.info(f"Initial sync progress: {synced}/{total} ({errors} errors)")

                except Exception as e:
                    logger.error(f"Error syncing page at {start}: {e}")
                    errors += 1

            # Finalize
            async with async_session() as session:
                log_entry = await session.get(SyncLog, sync_id)
                if log_entry:
                    log_entry.finished_at = datetime.now(timezone.utc)
                    log_entry.tickets_synced = synced
                    log_entry.tickets_total = total
                    log_entry.errors = errors
                    log_entry.status = "completed"
                    await session.commit()

            # Refresh materialized views
            await self._refresh_views()

            logger.info(f"Initial sync completed: {synced} tickets, {errors} errors")
            return sync_id

        except Exception as e:
            logger.error(f"Initial sync failed: {type(e).__name__}: {repr(e)}")
            logger.error(traceback.format_exc())
            if sync_id:
                async with async_session() as session:
                    log_entry = await session.get(SyncLog, sync_id)
                    if log_entry:
                        log_entry.finished_at = datetime.now(timezone.utc)
                        log_entry.status = "failed"
                        log_entry.details = {"error": str(e)}
                        await session.commit()
            raise
        finally:
            self._is_running = False

    async def run_incremental_sync(self) -> int:
        """Sync only new/updated tickets since last sync. Returns sync_log ID."""
        if self._is_running:
            logger.warning("Sync already running, skipping")
            return -1

        self._is_running = True
        sync_id = None

        try:
            async with async_session() as session:
                # Get max ticket ID in our DB
                result = await session.execute(select(func.max(Ticket.id)))
                max_id = result.scalar() or 0

                # Create sync log
                log = SyncLog(
                    started_at=datetime.now(timezone.utc),
                    sync_type="incremental",
                    status="running",
                )
                session.add(log)
                await session.commit()
                sync_id = log.id

            # Fetch recent tickets (desc order, stop when we reach known IDs)
            tickets, total = await self.sdp.list_tickets(
                start_index=1,
                row_count=100,
                sort_field="id",
                sort_order="desc",
            )

            new_ids = [t["id"] for t in tickets if int(t["id"]) > max_id]

            if not new_ids:
                logger.info("Incremental sync: no new tickets")
                async with async_session() as session:
                    log_entry = await session.get(SyncLog, sync_id)
                    if log_entry:
                        log_entry.finished_at = datetime.now(timezone.utc)
                        log_entry.tickets_synced = 0
                        log_entry.tickets_total = 0
                        log_entry.status = "completed"
                        await session.commit()
                return sync_id

            logger.info(f"Incremental sync: {len(new_ids)} new tickets to sync")

            # Fetch details
            detail_tasks = [self.sdp.get_ticket_detail(tid) for tid in new_ids]
            details = await asyncio.gather(*detail_tasks, return_exceptions=True)

            records = []
            errors = 0
            for detail in details:
                if isinstance(detail, Exception):
                    errors += 1
                    continue
                if detail is None:
                    errors += 1
                    continue
                parsed = self.sdp.parse_ticket(detail)
                if parsed:
                    records.append(parsed)

            if records:
                await self._upsert_tickets(records)

            # Finalize
            async with async_session() as session:
                log_entry = await session.get(SyncLog, sync_id)
                if log_entry:
                    log_entry.finished_at = datetime.now(timezone.utc)
                    log_entry.tickets_synced = len(records)
                    log_entry.tickets_total = len(new_ids)
                    log_entry.errors = errors
                    log_entry.status = "completed"
                    await session.commit()

            # Refresh materialized views
            await self._refresh_views()

            logger.info(f"Incremental sync: {len(records)} new tickets synced, {errors} errors")
            return sync_id

        except Exception as e:
            logger.error(f"Incremental sync failed: {type(e).__name__}: {repr(e)}")
            logger.error(traceback.format_exc())
            if sync_id:
                async with async_session() as session:
                    log_entry = await session.get(SyncLog, sync_id)
                    if log_entry:
                        log_entry.finished_at = datetime.now(timezone.utc)
                        log_entry.status = "failed"
                        log_entry.details = {"error": str(e)}
                        await session.commit()
            raise
        finally:
            self._is_running = False

    async def _upsert_tickets(self, records: list[dict]):
        """Upsert ticket records into the database."""
        async with async_session() as session:
            for record in records:
                stmt = insert(Ticket).values(**record)
                stmt = stmt.on_conflict_do_update(
                    index_elements=["id"],
                    set_={
                        k: v for k, v in record.items()
                        if k != "id"
                    },
                )
                await session.execute(stmt)
            await session.commit()

    async def _refresh_views(self):
        """Refresh materialized views after sync."""
        async with async_session() as session:
            try:
                await session.execute(
                    text("REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_metrics")
                )
                await session.execute(
                    text("REFRESH MATERIALIZED VIEW CONCURRENTLY mv_customer_daily")
                )
                await session.execute(
                    text("REFRESH MATERIALIZED VIEW CONCURRENTLY mv_analyst_daily")
                )
                await session.commit()
                logger.info("Materialized views refreshed")
            except Exception as e:
                logger.warning(f"Failed to refresh views (may be empty): {e}")
                await session.rollback()

    async def get_sync_status(self) -> dict:
        """Get current sync status."""
        async with async_session() as session:
            # Last sync
            result = await session.execute(
                select(SyncLog)
                .order_by(SyncLog.id.desc())
                .limit(1)
            )
            last_log = result.scalar_one_or_none()

            # Total tickets in DB
            result = await session.execute(select(func.count(Ticket.id)))
            total_in_db = result.scalar() or 0

            return {
                "last_sync": last_log.finished_at if last_log else None,
                "last_sync_type": last_log.sync_type if last_log else None,
                "last_status": last_log.status if last_log else None,
                "tickets_synced": last_log.tickets_synced if last_log else None,
                "total_in_db": total_in_db,
                "is_running": self._is_running,
            }
