"""SOC Analytics Dashboard - FastAPI Application."""

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import ai, analysts, metrics, sync, tickets, llm, threatmap

settings = get_settings()

# Logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# Scheduler for periodic sync
scheduler_task = None
full_sync_task = None
snapshot_task = None


async def _periodic_sync():
    """Background task for periodic incremental sync."""
    from app.routers.sync import get_sync_service
    import httpx

    sync_svc = get_sync_service()
    interval = settings.SYNC_INTERVAL_MINUTES * 60

    # Wait a bit before first sync to let the app fully start
    await asyncio.sleep(10)

    consecutive_failures = 0
    max_backoff = 600  # 10 min max — SOC needs near-real-time data

    while True:
        try:
            logger.info("Starting periodic incremental sync")
            await sync_svc.run_incremental_sync()
            if consecutive_failures > 0:
                logger.info(
                    f"Sync recovered after {consecutive_failures} consecutive failures"
                )
            consecutive_failures = 0  # Reset on success
        except (httpx.ConnectTimeout, httpx.ConnectError, OSError) as e:
            consecutive_failures += 1
            # Linear backoff capped at max_backoff (much gentler than exponential)
            backoff = min(interval + (60 * consecutive_failures), max_backoff)
            logger.warning(
                f"SDP unreachable ({type(e).__name__}), "
                f"retry in {backoff}s (failure #{consecutive_failures})"
            )
            await asyncio.sleep(backoff)
            continue
        except Exception as e:
            logger.error(f"Periodic sync error: {type(e).__name__}: {repr(e)}")
        await asyncio.sleep(interval)


async def _weekly_snapshot():
    """Background task: create weekly analyst score snapshots every Sunday 01:00 WIB."""
    from datetime import datetime, timezone, timedelta, date
    from app.database import async_session
    from app.services.analyst_service import AnalystScoringService

    WIB = timezone(timedelta(hours=7))

    # Wait for app to start
    await asyncio.sleep(30)

    while True:
        now_wib = datetime.now(WIB)
        # Next Sunday 01:00 WIB
        days_until_sunday = (6 - now_wib.weekday()) % 7
        if days_until_sunday == 0 and now_wib.hour >= 1:
            days_until_sunday = 7
        next_run = now_wib.replace(hour=1, minute=0, second=0, microsecond=0) + timedelta(days=days_until_sunday)
        wait_seconds = (next_run - now_wib).total_seconds()

        logger.info(
            f"Weekly snapshot scheduled in {wait_seconds/3600:.1f}h "
            f"(next: {next_run.strftime('%Y-%m-%d %H:%M WIB')})"
        )
        await asyncio.sleep(wait_seconds)

        try:
            logger.info("Starting weekly analyst snapshot")
            async with async_session() as db:
                svc = AnalystScoringService(db)
                # Snapshot for the past week
                today = date.today()
                period_end = today
                period_start = today - timedelta(days=7)
                count = await svc.create_snapshot(period_start, period_end, "weekly")
                logger.info(f"Weekly snapshot complete: {count} analysts")
        except Exception as e:
            logger.error(f"Weekly snapshot error: {type(e).__name__}: {repr(e)}")


async def _daily_full_sync():
    """Background task: full re-sync every day at 00:00 WIB (17:00 UTC)."""
    from app.routers.sync import get_sync_service
    from datetime import datetime, timezone, timedelta

    sync_svc = get_sync_service()
    WIB = timezone(timedelta(hours=7))

    while True:
        # Calculate seconds until next 00:00 WIB
        now_wib = datetime.now(WIB)
        next_midnight = now_wib.replace(hour=0, minute=0, second=0, microsecond=0)
        if next_midnight <= now_wib:
            next_midnight += timedelta(days=1)
        wait_seconds = (next_midnight - now_wib).total_seconds()

        logger.info(
            f"Daily full sync scheduled in {wait_seconds/3600:.1f}h "
            f"(next: {next_midnight.strftime('%Y-%m-%d %H:%M WIB')})"
        )
        await asyncio.sleep(wait_seconds)

        try:
            logger.info("Starting daily full re-sync (00:00 WIB)")
            await sync_svc.run_initial_sync()
            logger.info("Daily full re-sync completed")
        except Exception as e:
            logger.error(f"Daily full sync error: {type(e).__name__}: {repr(e)}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown."""
    global scheduler_task, full_sync_task, snapshot_task

    logger.info("SOC Analytics Dashboard starting up")
    logger.info(f"SDP URL: {settings.SDP_BASE_URL}")
    logger.info(f"Sync interval: {settings.SYNC_INTERVAL_MINUTES} minutes")
    logger.info(f"AI enabled: {bool(settings.CLAUDE_API_KEY)}")

    # Start periodic sync + daily full sync + weekly snapshot
    scheduler_task = asyncio.create_task(_periodic_sync())
    full_sync_task = asyncio.create_task(_daily_full_sync())
    snapshot_task = asyncio.create_task(_weekly_snapshot())

    yield

    # Shutdown
    for task in (scheduler_task, full_sync_task, snapshot_task):
        if task:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
    logger.info("SOC Analytics Dashboard shut down")


# Create FastAPI app
app = FastAPI(
    title=settings.APP_TITLE,
    description="AI-Powered SOC Analytics Dashboard for MTM MSSP",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS
origins = [o.strip() for o in settings.CORS_ORIGINS.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(metrics.router)
app.include_router(analysts.router)
app.include_router(tickets.router)
app.include_router(sync.router)
app.include_router(ai.router)
app.include_router(llm.router)
app.include_router(threatmap.router)


@app.get("/api/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "ok",
        "service": "soc-analytics-api",
        "version": "0.1.0",
    }


@app.get("/api/filters/options")
async def get_filter_options(
    customer: Optional[str] = None,
):
    """Get available filter options for the frontend dropdowns."""
    from sqlalchemy import distinct, select
    from app.database import async_session
    from app.models import Ticket

    async with async_session() as db:
        # Get unique values for each filter
        customers = (
            await db.execute(
                select(distinct(Ticket.customer))
                .where(Ticket.customer != None)
                .order_by(Ticket.customer)
            )
        ).scalars().all()

        priorities = (
            await db.execute(
                select(distinct(Ticket.priority))
                .where(Ticket.priority != None)
                .order_by(Ticket.priority)
            )
        ).scalars().all()

        statuses = (
            await db.execute(
                select(distinct(Ticket.status))
                .where(Ticket.status != None)
                .order_by(Ticket.status)
            )
        ).scalars().all()

        technicians = (
            await db.execute(
                select(distinct(Ticket.technician))
                .where(Ticket.technician != None)
                .order_by(Ticket.technician)
            )
        ).scalars().all()

        # Asset names — cascade with customer filter
        asset_q = (
            select(distinct(Ticket.asset_name))
            .where(Ticket.asset_name != None, Ticket.asset_name != "")
        )
        if customer:
            asset_q = asset_q.where(Ticket.customer == customer)
        asset_names = (
            await db.execute(asset_q.order_by(Ticket.asset_name))
        ).scalars().all()

    return {
        "customers": customers,
        "priorities": priorities,
        "statuses": statuses,
        "technicians": technicians,
        "validations": ["True Positive", "False Positive", "Not Specified"],
        "asset_names": asset_names,
    }
