"""SOC Analytics Dashboard - FastAPI Application."""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import ai, metrics, sync, tickets, llm

settings = get_settings()

# Logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# Scheduler for periodic sync
scheduler_task = None


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


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown."""
    global scheduler_task

    logger.info("SOC Analytics Dashboard starting up")
    logger.info(f"SDP URL: {settings.SDP_BASE_URL}")
    logger.info(f"Sync interval: {settings.SYNC_INTERVAL_MINUTES} minutes")
    logger.info(f"AI enabled: {bool(settings.CLAUDE_API_KEY)}")

    # Start periodic sync
    scheduler_task = asyncio.create_task(_periodic_sync())

    yield

    # Shutdown
    if scheduler_task:
        scheduler_task.cancel()
        try:
            await scheduler_task
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
app.include_router(tickets.router)
app.include_router(sync.router)
app.include_router(ai.router)
app.include_router(llm.router)


@app.get("/api/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "ok",
        "service": "soc-analytics-api",
        "version": "0.1.0",
    }


@app.get("/api/filters/options")
async def get_filter_options():
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

    return {
        "customers": customers,
        "priorities": priorities,
        "statuses": statuses,
        "technicians": technicians,
        "validations": ["True Positive", "False Positive", "Not Specified"],
    }
