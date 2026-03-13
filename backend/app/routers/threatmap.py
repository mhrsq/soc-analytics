"""Threat Map API endpoints — attack arcs, asset locations, SIEM locations."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Ticket, AssetLocation, SiemLocation
from app.schemas import (
    AssetLocationCreate, AssetLocationOut,
    SiemLocationCreate, SiemLocationOut,
    AttackArc,
)
from app.services.geo_service import batch_geolocate, is_private_ip

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/threatmap", tags=["Threat Map"])


# ── Attack Data ─────────────────────────────────────────────────

@router.get("/attacks", response_model=list[AttackArc])
async def get_attacks(
    customer: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
    limit: int = Query(200, ge=10, le=1000),
    db: AsyncSession = Depends(get_db),
):
    """Get recent attacks with geolocation data for threat map visualization."""

    # Build query for tickets with IP addresses
    filters = [Ticket.ip_address.isnot(None), Ticket.ip_address != ""]
    if customer:
        filters.append(Ticket.customer == customer)
    if start:
        filters.append(Ticket.created_time >= start)
    if end:
        filters.append(Ticket.created_time <= end)

    q = (
        select(
            Ticket.id,
            Ticket.ip_address,
            Ticket.asset_name,
            Ticket.customer,
            Ticket.priority,
            Ticket.attack_category,
            Ticket.validation,
            Ticket.created_time,
        )
        .where(and_(*filters))
        .order_by(Ticket.created_time.desc())
        .limit(limit)
    )

    result = await db.execute(q)
    rows = result.all()

    if not rows:
        return []

    # Collect all unique IPs for batch geolocation
    all_ips = list({r.ip_address for r in rows if r.ip_address})
    geo_data = await batch_geolocate(all_ips)

    # Get asset locations for matching
    customer_names = list({r.customer for r in rows if r.customer})
    asset_q = select(AssetLocation).where(AssetLocation.customer.in_(customer_names)) if customer_names else select(AssetLocation)
    asset_result = await db.execute(asset_q)
    asset_map: dict[str, AssetLocation] = {}
    for a in asset_result.scalars().all():
        asset_map[f"{a.customer}:{a.asset_name}"] = a

    # Build attack arcs
    arcs = []
    for r in rows:
        ip = r.ip_address
        private = is_private_ip(ip)
        geo = geo_data.get(ip)

        # Find target asset location
        asset_key = f"{r.customer}:{r.asset_name}" if r.customer and r.asset_name else None
        asset = asset_map.get(asset_key) if asset_key else None

        arc = AttackArc(
            ticket_id=r.id,
            source_ip=ip,
            source_lat=geo["lat"] if geo else 0,
            source_lng=geo["lng"] if geo else 0,
            source_country=geo.get("country") if geo else None,
            source_city=geo.get("city") if geo else None,
            target_asset=r.asset_name,
            target_lat=asset.lat if asset else None,
            target_lng=asset.lng if asset else None,
            priority=r.priority,
            attack_category=r.attack_category,
            validation=r.validation,
            created_time=r.created_time,
            is_private_ip=private,
        )
        arcs.append(arc)

    return arcs


# ── Asset Locations ─────────────────────────────────────────────

@router.get("/assets", response_model=list[AssetLocationOut])
async def get_asset_locations(
    customer: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """Get all configured asset locations, optionally filtered by customer."""
    q = select(AssetLocation)
    if customer:
        q = q.where(AssetLocation.customer == customer)
    q = q.order_by(AssetLocation.customer, AssetLocation.asset_name)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("/assets", response_model=AssetLocationOut)
async def upsert_asset_location(
    body: AssetLocationCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create or update an asset location (upsert by customer + asset_name)."""
    # Check if exists
    q = select(AssetLocation).where(
        AssetLocation.customer == body.customer,
        AssetLocation.asset_name == body.asset_name,
    )
    result = await db.execute(q)
    existing = result.scalar_one_or_none()

    if existing:
        existing.lat = body.lat
        existing.lng = body.lng
        existing.label = body.label
        existing.icon_type = body.icon_type
        await db.commit()
        await db.refresh(existing)
        return existing

    asset = AssetLocation(
        customer=body.customer,
        asset_name=body.asset_name,
        label=body.label,
        lat=body.lat,
        lng=body.lng,
        icon_type=body.icon_type,
    )
    db.add(asset)
    await db.commit()
    await db.refresh(asset)
    return asset


@router.delete("/assets/{asset_id}")
async def delete_asset_location(
    asset_id: int,
    db: AsyncSession = Depends(get_db),
):
    q = select(AssetLocation).where(AssetLocation.id == asset_id)
    result = await db.execute(q)
    asset = result.scalar_one_or_none()
    if not asset:
        return {"message": "Not found"}
    await db.delete(asset)
    await db.commit()
    return {"message": "Deleted"}


# ── SIEM Locations ──────────────────────────────────────────────

@router.get("/siems", response_model=list[SiemLocationOut])
async def get_siem_locations(
    customer: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """Get SIEM locations. If customer is given, returns that customer's + shared (NULL customer)."""
    q = select(SiemLocation)
    if customer:
        q = q.where((SiemLocation.customer == customer) | (SiemLocation.customer.is_(None)))
    q = q.order_by(SiemLocation.label)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("/siems", response_model=SiemLocationOut)
async def upsert_siem_location(
    body: SiemLocationCreate,
    db: AsyncSession = Depends(get_db),
):
    siem = SiemLocation(
        customer=body.customer,
        label=body.label,
        location_type=body.location_type,
        lat=body.lat,
        lng=body.lng,
    )
    db.add(siem)
    await db.commit()
    await db.refresh(siem)
    return siem


@router.delete("/siems/{siem_id}")
async def delete_siem_location(
    siem_id: int,
    db: AsyncSession = Depends(get_db),
):
    q = select(SiemLocation).where(SiemLocation.id == siem_id)
    result = await db.execute(q)
    siem = result.scalar_one_or_none()
    if not siem:
        return {"message": "Not found"}
    await db.delete(siem)
    await db.commit()
    return {"message": "Deleted"}


# ── Utility: Distinct asset names from tickets (for config helper) ──

@router.get("/ticket-assets")
async def get_ticket_assets(
    customer: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """Get distinct asset names from tickets to help configure locations."""
    q = select(Ticket.asset_name, func.count(Ticket.id).label("count")).where(
        Ticket.asset_name.isnot(None), Ticket.asset_name != ""
    ).group_by(Ticket.asset_name).order_by(func.count(Ticket.id).desc())

    if customer:
        q = q.where(Ticket.customer == customer)

    result = await db.execute(q)
    return [{"asset_name": r.asset_name, "count": r.count} for r in result.all()]
