"""Threat Map API endpoints — attack arcs, asset locations, SIEM locations."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Ticket, AssetLocation, SiemLocation, TopologyNode, TopologyLink
from app.schemas import (
    AssetLocationCreate, AssetLocationOut,
    SiemLocationCreate, SiemLocationOut,
    AttackArc,
    TopologyNodeCreate, TopologyNodeUpdate, TopologyNodeOut,
    TopologyLinkCreate, TopologyLinkUpdate, TopologyLinkOut,
)
from app.services.geo_service import batch_geolocate, is_private_ip

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/threatmap", tags=["Threat Map"])


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

# ── Topology Nodes ──────────────────────────────────────────────

@router.get("/topology/nodes", response_model=list[TopologyNodeOut])
async def get_topology_nodes(db: AsyncSession = Depends(get_db)):
    q = select(TopologyNode).order_by(TopologyNode.id)
    result = await db.execute(q)
    rows = result.scalars().all()
    return [
        TopologyNodeOut(
            id=n.id, label=n.label, hostname=n.hostname, customer=n.customer,
            node_type=n.node_type, lat=n.lat, lng=n.lng,
            pos_x=n.pos_x, pos_y=n.pos_y, metadata=n.metadata_,
        ) for n in rows
    ]


@router.post("/topology/nodes", response_model=TopologyNodeOut)
async def create_topology_node(body: TopologyNodeCreate, db: AsyncSession = Depends(get_db)):
    node = TopologyNode(
        label=body.label, hostname=body.hostname, customer=body.customer,
        node_type=body.node_type, lat=body.lat, lng=body.lng,
        pos_x=body.pos_x, pos_y=body.pos_y, metadata_=body.metadata or {},
    )
    db.add(node)
    await db.commit()
    await db.refresh(node)
    return TopologyNodeOut(
        id=node.id, label=node.label, hostname=node.hostname, customer=node.customer,
        node_type=node.node_type, lat=node.lat, lng=node.lng,
        pos_x=node.pos_x, pos_y=node.pos_y, metadata=node.metadata_,
    )


@router.put("/topology/nodes/{node_id}", response_model=TopologyNodeOut)
async def update_topology_node(node_id: int, body: TopologyNodeUpdate, db: AsyncSession = Depends(get_db)):
    q = select(TopologyNode).where(TopologyNode.id == node_id)
    result = await db.execute(q)
    node = result.scalar_one_or_none()
    if not node:
        from fastapi import HTTPException
        raise HTTPException(404, "Node not found")
    for field, val in body.model_dump(exclude_unset=True).items():
        if field == "metadata":
            node.metadata_ = val
        else:
            setattr(node, field, val)
    await db.commit()
    await db.refresh(node)
    return TopologyNodeOut(
        id=node.id, label=node.label, hostname=node.hostname, customer=node.customer,
        node_type=node.node_type, lat=node.lat, lng=node.lng,
        pos_x=node.pos_x, pos_y=node.pos_y, metadata=node.metadata_,
    )


@router.delete("/topology/nodes/{node_id}")
async def delete_topology_node(node_id: int, db: AsyncSession = Depends(get_db)):
    q = select(TopologyNode).where(TopologyNode.id == node_id)
    result = await db.execute(q)
    node = result.scalar_one_or_none()
    if not node:
        return {"message": "Not found"}
    # Also delete links referencing this node
    link_q = select(TopologyLink).where(
        (TopologyLink.source_id == node_id) | (TopologyLink.target_id == node_id)
    )
    link_result = await db.execute(link_q)
    for link in link_result.scalars().all():
        await db.delete(link)
    await db.delete(node)
    await db.commit()
    return {"message": "Deleted"}


# ── Topology Links ──────────────────────────────────────────────

@router.get("/topology/links", response_model=list[TopologyLinkOut])
async def get_topology_links(db: AsyncSession = Depends(get_db)):
    q = select(TopologyLink).order_by(TopologyLink.id)
    result = await db.execute(q)
    rows = result.scalars().all()
    return [
        TopologyLinkOut(
            id=l.id, source_id=l.source_id, target_id=l.target_id,
            link_type=l.link_type, label=l.label, bandwidth=l.bandwidth,
            metadata=l.metadata_,
        ) for l in rows
    ]


@router.post("/topology/links", response_model=TopologyLinkOut)
async def create_topology_link(body: TopologyLinkCreate, db: AsyncSession = Depends(get_db)):
    link = TopologyLink(
        source_id=body.source_id, target_id=body.target_id,
        link_type=body.link_type, label=body.label,
        bandwidth=body.bandwidth, metadata_=body.metadata or {},
    )
    db.add(link)
    await db.commit()
    await db.refresh(link)
    return TopologyLinkOut(
        id=link.id, source_id=link.source_id, target_id=link.target_id,
        link_type=link.link_type, label=link.label, bandwidth=link.bandwidth,
        metadata=link.metadata_,
    )


@router.put("/topology/links/{link_id}", response_model=TopologyLinkOut)
async def update_topology_link(link_id: int, body: TopologyLinkUpdate, db: AsyncSession = Depends(get_db)):
    q = select(TopologyLink).where(TopologyLink.id == link_id)
    result = await db.execute(q)
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    for field in ["link_type", "label", "bandwidth", "metadata"]:
        val = getattr(body, field if field != "metadata" else field, None)
        if val is not None:
            setattr(link, "metadata_" if field == "metadata" else field, val)
    await db.commit()
    await db.refresh(link)
    return TopologyLinkOut(
        id=link.id, source_id=link.source_id, target_id=link.target_id,
        link_type=link.link_type, label=link.label, bandwidth=link.bandwidth,
        metadata=link.metadata_,
    )


@router.delete("/topology/links/{link_id}")
async def delete_topology_link(link_id: int, db: AsyncSession = Depends(get_db)):
    q = select(TopologyLink).where(TopologyLink.id == link_id)
    result = await db.execute(q)
    link = result.scalar_one_or_none()
    if not link:
        return {"message": "Not found"}
    await db.delete(link)
    await db.commit()
    return {"message": "Deleted"}


# ── Bulk position update (for topology editor drag) ──

@router.put("/topology/positions")
async def update_topology_positions(
    positions: list[dict],
    db: AsyncSession = Depends(get_db),
):
    """Bulk update node positions. Input: [{id, pos_x, pos_y}, ...]"""
    for p in positions:
        node_id = p.get("id")
        if node_id is None:
            continue
        q = select(TopologyNode).where(TopologyNode.id == node_id)
        result = await db.execute(q)
        node = result.scalar_one_or_none()
        if node:
            if "pos_x" in p:
                node.pos_x = p["pos_x"]
            if "pos_y" in p:
                node.pos_y = p["pos_y"]
    await db.commit()
    return {"message": "Positions updated"}