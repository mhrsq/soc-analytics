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
        self._lock = asyncio.Lock()

    @property
    def is_running(self) -> bool:
        return self._is_running

    async def run_initial_sync(self) -> int:
        """Full sync of all SOC tickets. Returns sync_log ID."""
        if not self._lock.locked():
            async with self._lock:
                return await self._do_initial_sync()
        else:
            logger.warning("Sync already running, skipping")
            return -1

    async def _do_initial_sync(self) -> int:
        """Resumable full sync — picks up from where it left off using max_id in DB."""
        self._is_running = True
        sync_id = None

        try:
            # Get current max_id to resume from
            async with async_session() as session:
                result = await session.execute(select(func.count(Ticket.id)))
                existing_count = result.scalar() or 0

                log = SyncLog(
                    started_at=datetime.now(timezone.utc),
                    sync_type="full",
                    status="running",
                )
                session.add(log)
                await session.commit()
                sync_id = log.id

            # Get total count from SDP
            total = await self.sdp.get_ticket_count()
            remaining = total - existing_count
            logger.info(f"Full sync: {total} in SDP, {existing_count} in DB, ~{remaining} to fetch")

            synced = 0
            errors = 0
            consecutive_page_errors = 0
            page_size = 500  # Bigger batches for speed

            for start in range(1, total + 1, page_size):
                try:
                    tickets, _ = await self.sdp.list_tickets(
                        start_index=start,
                        row_count=page_size,
                        sort_field="id",
                        sort_order="asc",
                    )

                    # Skip tickets already in DB for speed (resume)
                    # Still fetch details for all to handle updates
                    detail_tasks = [
                        self.sdp.get_ticket_detail(t["id"])
                        for t in tickets
                    ]
                    details = await asyncio.gather(*detail_tasks, return_exceptions=True)

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
                        consecutive_page_errors = 0

                    # Update progress every batch
                    async with async_session() as session:
                        log_entry = await session.get(SyncLog, sync_id)
                        if log_entry:
                            log_entry.tickets_synced = synced
                            log_entry.tickets_total = total
                            log_entry.errors = errors
                            await session.commit()

                    logger.info(f"Full sync progress: {start + len(tickets) - 1}/{total} fetched, {synced} upserted ({errors} errors)")

                except Exception as e:
                    logger.error(f"Error syncing page at {start}: {type(e).__name__}: {e}")
                    errors += 1
                    consecutive_page_errors += 1
                    if consecutive_page_errors >= 3:
                        logger.error(f"Aborting full sync: {consecutive_page_errors} consecutive failures")
                        break

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

            logger.info(f"Full sync completed: {synced} tickets upserted, {errors} errors")
            return sync_id

        except Exception as e:
            logger.error(f"Full sync failed: {type(e).__name__}: {repr(e)}")
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

    # Statuses considered "open" — these tickets get re-synced every cycle
    OPEN_STATUSES = ["Open", "Assigned", "In Progress"]

    async def run_incremental_sync(self) -> int:
        """Sync new tickets AND re-sync all currently-open tickets.

        Two-phase approach:
        1. Fetch new tickets (id > max_id in DB)
        2. Re-fetch ALL tickets that are still Open/Assigned/In Progress in our DB
           to pick up status changes, validation updates, MTTD/SLA, etc.

        Returns sync_log ID.
        """
        if not self._lock.locked():
            async with self._lock:
                return await self._do_incremental_sync()
        else:
            logger.warning("Sync already running, skipping")
            return -1

    async def _do_incremental_sync(self) -> int:
        self._is_running = True
        sync_id = None

        try:
            async with async_session() as session:
                # Get max ticket ID in our DB
                result = await session.execute(select(func.max(Ticket.id)))
                max_id = result.scalar() or 0

                # Get IDs of all tickets that are still open in our DB
                result = await session.execute(
                    select(Ticket.id).where(
                        Ticket.status.in_(self.OPEN_STATUSES)
                    )
                )
                open_ticket_ids = [row[0] for row in result.fetchall()]

                # Create sync log
                log = SyncLog(
                    started_at=datetime.now(timezone.utc),
                    sync_type="incremental",
                    status="running",
                )
                session.add(log)
                await session.commit()
                sync_id = log.id

            logger.info(
                f"Incremental sync: max_id={max_id}, "
                f"{len(open_ticket_ids)} open tickets to re-sync"
            )

            # ── Phase 1: New tickets (id > max_id) ──
            new_ids: list[int] = []
            try:
                tickets, _ = await self.sdp.list_tickets(
                    start_index=1,
                    row_count=100,
                    sort_field="id",
                    sort_order="desc",
                )
                new_ids = [int(t["id"]) for t in tickets if int(t["id"]) > max_id]
                logger.info(f"Phase 1: {len(new_ids)} new tickets found")
            except Exception as e:
                logger.error(f"Phase 1 (new tickets) failed: {e}")

            # ── Phase 2: Re-sync open tickets from our DB ──
            # Exclude any that are already in new_ids (no need to fetch twice)
            new_id_set = set(new_ids)
            resync_ids = [tid for tid in open_ticket_ids if tid not in new_id_set]
            logger.info(f"Phase 2: {len(resync_ids)} open tickets to re-fetch from SDP")

            all_ids = new_ids + resync_ids

            if not all_ids:
                logger.info("Incremental sync: nothing to sync")
                async with async_session() as session:
                    log_entry = await session.get(SyncLog, sync_id)
                    if log_entry:
                        log_entry.finished_at = datetime.now(timezone.utc)
                        log_entry.tickets_synced = 0
                        log_entry.tickets_total = 0
                        log_entry.status = "completed"
                        log_entry.details = {"new": 0, "resync_open": 0}
                        await session.commit()
                return sync_id

            # Fetch details in batches to avoid overwhelming SDP
            BATCH_SIZE = 50
            records = []
            errors = 0

            for i in range(0, len(all_ids), BATCH_SIZE):
                batch = all_ids[i : i + BATCH_SIZE]
                detail_tasks = [self.sdp.get_ticket_detail(tid) for tid in batch]
                details = await asyncio.gather(*detail_tasks, return_exceptions=True)

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

                logger.info(
                    f"Incremental sync progress: {min(i + BATCH_SIZE, len(all_ids))}/{len(all_ids)} "
                    f"details fetched"
                )

            if records:
                await self._upsert_tickets(records)

            new_count = sum(1 for r in records if r["id"] in new_id_set)
            resync_count = len(records) - new_count

            # Finalize
            async with async_session() as session:
                log_entry = await session.get(SyncLog, sync_id)
                if log_entry:
                    log_entry.finished_at = datetime.now(timezone.utc)
                    log_entry.tickets_synced = len(records)
                    log_entry.tickets_total = len(all_ids)
                    log_entry.errors = errors
                    log_entry.status = "completed"
                    log_entry.details = {"new": new_count, "resync_open": resync_count}
                    await session.commit()

            # Refresh materialized views
            await self._refresh_views()

            logger.info(
                f"Incremental sync completed: {new_count} new, "
                f"{resync_count} open tickets re-synced, {errors} errors"
            )
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
