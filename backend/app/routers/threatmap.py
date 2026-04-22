"""Threat Map API endpoints — attack arcs, asset locations, SIEM locations."""

import logging
from datetime import date, datetime, timezone
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
from app.routers.auth import require_auth, require_admin
from app.models import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/threatmap", tags=["Threat Map"])


def _parse_time(value: Optional[str]):
    """Parse ISO datetime or date string to a proper datetime/date object."""
    if not value:
        return None
    if len(value) == 10 and value[4] == "-" and value[7] == "-":
        try:
            return date.fromisoformat(value)
        except ValueError:
            return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return None


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
    parsed_start = _parse_time(start)
    if parsed_start:
        filters.append(Ticket.created_time >= parsed_start)
    parsed_end = _parse_time(end)
    if parsed_end:
        filters.append(Ticket.created_time <= parsed_end)

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

    # Get topology nodes for target location matching (by hostname/asset_name)
    topo_q = select(TopologyNode).where(TopologyNode.lat.isnot(None), TopologyNode.lng.isnot(None))
    topo_result = await db.execute(topo_q)
    topo_map: dict[str, TopologyNode] = {}
    # Also build a per-customer fallback (first node with coords for each customer)
    customer_fallback: dict[str, TopologyNode] = {}
    for n in topo_result.scalars().all():
        if n.hostname:
            topo_map[f"{n.customer}:{n.hostname}"] = n
        if n.customer and n.customer not in customer_fallback:
            customer_fallback[n.customer] = n

    # Build attack arcs
    arcs = []
    for r in rows:
        ip = r.ip_address
        private = is_private_ip(ip)
        geo = geo_data.get(ip)

        # Find target location from topology nodes (exact match, then customer fallback)
        topo_key = f"{r.customer}:{r.asset_name}" if r.customer and r.asset_name else None
        node = topo_map.get(topo_key) if topo_key else None
        if not node and r.customer:
            node = customer_fallback.get(r.customer)

        arc = AttackArc(
            ticket_id=r.id,
            source_ip=ip,
            source_lat=geo["lat"] if geo else 0,
            source_lng=geo["lng"] if geo else 0,
            source_country=geo.get("country") if geo else None,
            source_city=geo.get("city") if geo else None,
            target_asset=r.asset_name,
            target_lat=node.lat if node else None,
            target_lng=node.lng if node else None,
            priority=r.priority,
            attack_category=r.attack_category,
            validation=r.validation,
            created_time=r.created_time,
            is_private_ip=private,
        )
        arcs.append(arc)

    return arcs


def _short_subject(subject: Optional[str]) -> Optional[str]:
    """Extract a short description from ticket subject like '[SE] | CMWI | CPUUsage | Medium | ...'"""
    if not subject:
        return None
    parts = subject.split("|")
    if len(parts) >= 5:
        return parts[-1].strip()[:80]  # Last part is usually the description
    return subject[:80]


# ── Attack Feed (lightweight recent attacks) ────────────────────

@router.get("/feed")
async def get_attack_feed(
    customer: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
    asset: Optional[str] = None,
    limit: int = Query(50, ge=10, le=500),
    db: AsyncSession = Depends(get_db),
):
    """Get recent tickets for the live feed ticker. Shows ALL tickets, not just ones with IPs."""
    filters: list = []
    if customer:
        filters.append(Ticket.customer == customer)
    parsed_start = _parse_time(start)
    if parsed_start:
        filters.append(Ticket.created_time >= parsed_start)
    parsed_end = _parse_time(end)
    if parsed_end:
        filters.append(Ticket.created_time <= parsed_end)
    if asset:
        filters.append(Ticket.asset_name.ilike(f"%{asset}%"))

    q = select(
        Ticket.id, Ticket.subject, Ticket.ip_address, Ticket.asset_name,
        Ticket.customer, Ticket.priority, Ticket.attack_category,
        Ticket.validation, Ticket.status, Ticket.created_time,
        Ticket.wazuh_rule_id, Ticket.wazuh_rule_name,
    )
    if filters:
        q = q.where(and_(*filters))
    q = q.order_by(Ticket.created_time.desc()).limit(limit)
    result = await db.execute(q)
    return [
        {
            "id": r.id,
            "ip": r.ip_address,
            "asset": r.asset_name,
            "customer": r.customer,
            "priority": r.priority,
            "category": r.attack_category,
            "validation": r.validation,
            "status": r.status,
            "time": r.created_time.isoformat() if r.created_time else None,
            "rule_id": r.wazuh_rule_id,
            "rule_name": r.wazuh_rule_name,
            "subject": _short_subject(r.subject),
            "is_private": is_private_ip(r.ip_address) if r.ip_address else True,
        }
        for r in result.all()
    ]


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
    user: User = Depends(require_admin),
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


# ═══════════════════════════════════════════════════════════
# Attack Map — Live Wazuh Data
# ═══════════════════════════════════════════════════════════

@router.get("/attack-map/events")
async def get_attack_map_events(
    minutes: int = Query(5, ge=1, le=60),
    size: int = Query(20, ge=1, le=100),
    user: User = Depends(require_auth),
):
    """Get recent attack events from Wazuh with GeoIP for map visualization."""
    from app.services.wazuh_client import WazuhClient
    wazuh = WazuhClient()
    events = await wazuh.get_recent_events(minutes=minutes, size=size)
    return {"items": events}


@router.get("/attack-map/data")
async def get_attack_map_data(
    hours: int = Query(24, ge=1, le=168),
    user: User = Depends(require_auth),
):
    """Get aggregated attack map data (countries, protocols, agents)."""
    from app.services.wazuh_client import WazuhClient
    wazuh = WazuhClient()
    return await wazuh.get_map_summary(hours=hours) 
    await db.refresh(asset)
    return asset


@router.delete("/assets/{asset_id}")
async def delete_asset_location(
    asset_id: int,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    q = select(AssetLocation).where(AssetLocation.id == asset_id)
    result = await db.execute(q)
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset location not found")
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
    user: User = Depends(require_admin),
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
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    q = select(SiemLocation).where(SiemLocation.id == siem_id)
    result = await db.execute(q)
    siem = result.scalar_one_or_none()
    if not siem:
        raise HTTPException(status_code=404, detail="SIEM location not found")
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
async def create_topology_node(body: TopologyNodeCreate, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
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
async def update_topology_node(node_id: int, body: TopologyNodeUpdate, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
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
async def delete_topology_node(node_id: int, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    q = select(TopologyNode).where(TopologyNode.id == node_id)
    result = await db.execute(q)
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(status_code=404, detail="Topology node not found")
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
async def create_topology_link(body: TopologyLinkCreate, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
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
async def update_topology_link(link_id: int, body: TopologyLinkUpdate, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    q = select(TopologyLink).where(TopologyLink.id == link_id)
    result = await db.execute(q)
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    for field, val in body.model_dump(exclude_unset=True).items():
        if field == "metadata":
            link.metadata_ = val
        else:
            setattr(link, field, val)
    await db.commit()
    await db.refresh(link)
    return TopologyLinkOut(
        id=link.id, source_id=link.source_id, target_id=link.target_id,
        link_type=link.link_type, label=link.label, bandwidth=link.bandwidth,
        metadata=link.metadata_,
    )


@router.delete("/topology/links/{link_id}")
async def delete_topology_link(link_id: int, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    q = select(TopologyLink).where(TopologyLink.id == link_id)
    result = await db.execute(q)
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Topology link not found")
    await db.delete(link)
    await db.commit()
    return {"message": "Deleted"}


# ── Bulk position update (for topology editor drag) ──

@router.put("/topology/positions")
async def update_topology_positions(
    positions: list[dict],
    user: User = Depends(require_admin),
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