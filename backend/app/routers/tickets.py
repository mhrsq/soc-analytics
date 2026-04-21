"""Ticket API endpoints."""

from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, cast, func, select, Date
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Ticket
from app.schemas import PaginatedTickets, TicketDetail, TicketListItem

router = APIRouter(prefix="/api/tickets", tags=["tickets"])


def _parse_time_param(value: str) -> tuple:
    """Parse a time param as ISO datetime first, fallback to date.
    Returns (parsed_value, is_datetime)."""
    import re as _re
    # Date-only check FIRST (YYYY-MM-DD) — must come before fromisoformat
    # because Python 3.12 fromisoformat parses "2026-03-04" as datetime(2026,3,4,0,0)
    if len(value) == 10 and _re.match(r"^\d{4}-\d{2}-\d{2}$", value):
        try:
            return date.fromisoformat(value), False
        except ValueError:
            pass
    # Try full ISO datetime (e.g. 2026-03-04T07:22:36.317Z)
    for fmt in ("%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S.%f+00:00", "%Y-%m-%dT%H:%M:%S+00:00"):
        try:
            return datetime.strptime(value, fmt).replace(tzinfo=timezone.utc), True
        except ValueError:
            continue
    # Try ISO with timezone offset via fromisoformat
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt, True
    except ValueError:
        pass
    return None, False


@router.get("", response_model=PaginatedTickets)
async def list_tickets(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    customer: Optional[str] = Query(None),
    validation: Optional[str] = Query(None),
    technician: Optional[str] = Query(None),
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
    search: Optional[str] = Query(None, description="Search in subject"),
    has_mttd: Optional[str] = Query(None, description="Filter to tickets with MTTD data"),
    has_sla: Optional[str] = Query(None, description="Filter to tickets with SLA data"),
    sort: Optional[str] = Query(None, description="Sort field: created_time, mttd_seconds"),
    order: Optional[str] = Query(None, description="Sort order: asc, desc"),
    db: AsyncSession = Depends(get_db),
):
    """List tickets with filtering and pagination."""
    filters = []
    if status:
        # "Open" includes Assigned and In Progress for drilldown
        open_statuses = {"Open", "Assigned", "In Progress"}
        if status in open_statuses:
            filters.append(Ticket.status.in_(open_statuses))
        else:
            filters.append(Ticket.status == status)
    if priority:
        filters.append(Ticket.priority == priority)
    if customer:
        filters.append(Ticket.customer == customer)
    if validation:
        if validation == "Not Specified":
            filters.append(
                (Ticket.validation == None) | (Ticket.validation == "Not Specified")
            )
        else:
            filters.append(Ticket.validation == validation)
    if technician:
        filters.append(Ticket.technician == technician)
    if start:
        val, is_dt = _parse_time_param(start)
        if val:
            if is_dt:
                filters.append(Ticket.created_time >= val)
            else:
                filters.append(cast(Ticket.created_time, Date) >= val)
    if end:
        val, is_dt = _parse_time_param(end)
        if val:
            if is_dt:
                filters.append(Ticket.created_time <= val)
            else:
                filters.append(cast(Ticket.created_time, Date) <= val)
    if search:
        # Escape SQL LIKE wildcards to prevent wildcard injection
        safe_search = search.replace("%", "\\%").replace("_", "\\_")
        filters.append(Ticket.subject.ilike(f"%{safe_search}%"))
    if has_mttd and has_mttd.lower() == "true":
        filters.append(Ticket.mttd_seconds != None)  # noqa: E711
        filters.append(Ticket.mttd_seconds > 0)
    if has_sla and has_sla.lower() == "true":
        filters.append(Ticket.sla_met != None)  # noqa: E711

    # Count total
    count_q = select(func.count(Ticket.id)).where(*filters)
    total = (await db.execute(count_q)).scalar() or 0

    # Determine sort order
    sort_col = Ticket.created_time  # default
    if sort == "mttd_seconds":
        sort_col = Ticket.mttd_seconds
    order_func = sort_col.desc() if (order or "desc") == "desc" else sort_col.asc()

    # Fetch page
    offset = (page - 1) * page_size
    q = (
        select(Ticket)
        .where(*filters)
        .order_by(order_func)
        .offset(offset)
        .limit(page_size)
    )
    result = await db.execute(q)
    tickets = result.scalars().all()

    total_pages = max(1, (total + page_size - 1) // page_size)

    return {
        "tickets": [
            {
                "id": t.id,
                "subject": t.subject,
                "status": t.status or "",
                "priority": t.priority or "",
                "technician": t.technician,
                "customer": t.customer,
                "validation": t.validation,
                "case_type": t.case_type,
                "created_time": t.created_time,
                "mttd_seconds": t.mttd_seconds,
                "sla_met": t.sla_met,
                "asset_name": t.asset_name,
            }
            for t in tickets
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


@router.get("/recent")
async def recent_tickets(
    since: Optional[str] = Query(None, description="ISO datetime — return tickets synced after this time"),
    limit: int = Query(30, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Return tickets that were synced into the DB after `since`.

    Used by the frontend notification system to detect new tickets
    that arrived via SDP sync.
    """
    filters = []
    if since:
        try:
            since_dt = datetime.fromisoformat(since.replace("Z", "+00:00"))
            filters.append(Ticket.synced_at > since_dt)
        except ValueError:
            pass  # ignore bad dates, return latest

    q = (
        select(Ticket)
        .where(*filters)
        .order_by(Ticket.synced_at.desc())
        .limit(limit)
    )
    result = await db.execute(q)
    tickets = result.scalars().all()

    return {
        "tickets": [
            {
                "id": t.id,
                "subject": t.subject,
                "priority": t.priority or "",
                "customer": t.customer,
                "created_time": t.created_time.isoformat() if t.created_time else None,
                "synced_at": t.synced_at.isoformat() if t.synced_at else None,
            }
            for t in tickets
        ],
        "count": len(tickets),
    }


@router.get("/{ticket_id}", response_model=TicketDetail)
async def get_ticket(
    ticket_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get full ticket detail."""
    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    return {
        "id": ticket.id,
        "subject": ticket.subject,
        "description": ticket.description,
        "status": ticket.status or "",
        "priority": ticket.priority or "",
        "technician": ticket.technician,
        "group_name": ticket.group_name,
        "site_name": ticket.site_name,
        "customer": ticket.customer,
        "validation": ticket.validation,
        "attack_category": ticket.attack_category,
        "case_type": ticket.case_type,
        "asset_name": ticket.asset_name,
        "ip_address": ticket.ip_address,
        "alert_time": ticket.alert_time,
        "first_notif": ticket.first_notif,
        "created_time": ticket.created_time,
        "completed_time": ticket.completed_time,
        "mttd_seconds": ticket.mttd_seconds,
        "mttr_seconds": ticket.mttr_seconds,
        "sla_met": ticket.sla_met,
        "wazuh_rule_id": ticket.wazuh_rule_id,
        "wazuh_rule_name": ticket.wazuh_rule_name,
    }
