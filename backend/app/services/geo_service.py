"""Geolocation service with Redis caching for IP → lat/lng resolution."""

import ipaddress
import logging
import asyncio
from typing import Optional

import httpx
import redis.asyncio as aioredis
import orjson

from app.config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()

# Module-level Redis pool (lazy init)
_redis: Optional[aioredis.Redis] = None
GEO_CACHE_TTL = 60 * 60 * 24 * 7  # 7 days


async def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis


def is_private_ip(ip_str: str) -> bool:
    """Check if an IP address is private/reserved."""
    try:
        addr = ipaddress.ip_address(ip_str.strip())
        return addr.is_private or addr.is_reserved or addr.is_loopback
    except ValueError:
        return True  # If it's not a valid IP, treat as private


async def geolocate_ip(ip: str) -> Optional[dict]:
    """Resolve a single IP to geo data, with Redis cache."""
    ip = ip.strip()

    if is_private_ip(ip):
        return None

    # Check cache
    try:
        r = await get_redis()
        cached = await r.get(f"geo:{ip}")
        if cached:
            return orjson.loads(cached)
    except Exception as e:
        logger.debug(f"Redis cache miss for {ip}: {e}")

    # Call ip-api.com (free, 45 req/min for non-commercial)
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"http://ip-api.com/json/{ip}",
                params={"fields": "status,lat,lon,country,city,isp"},
            )
            data = resp.json()

        if data.get("status") != "success":
            return None

        result = {
            "lat": data["lat"],
            "lng": data["lon"],
            "country": data.get("country"),
            "city": data.get("city"),
            "isp": data.get("isp"),
        }

        # Cache in Redis
        try:
            r = await get_redis()
            await r.set(f"geo:{ip}", orjson.dumps(result), ex=GEO_CACHE_TTL)
        except Exception as e:
            logger.debug(f"Redis cache set failed for {ip}: {e}")

        return result

    except Exception as e:
        logger.warning(f"Geolocation failed for {ip}: {e}")
        return None


async def batch_geolocate(ips: list[str], max_concurrent: int = 10) -> dict[str, dict]:
    """Resolve multiple IPs concurrently with rate limiting.

    ip-api.com allows 45 req/min. We use a semaphore to limit concurrency
    and add a small delay between batches.
    """
    results: dict[str, dict] = {}
    unique_ips = list({ip.strip() for ip in ips if ip and ip.strip()})

    # Separate private and public IPs
    public_ips = [ip for ip in unique_ips if not is_private_ip(ip)]

    # Check cache first
    uncached = []
    try:
        r = await get_redis()
        for ip in public_ips:
            cached = await r.get(f"geo:{ip}")
            if cached:
                results[ip] = orjson.loads(cached)
            else:
                uncached.append(ip)
    except Exception:
        uncached = public_ips

    if not uncached:
        return results

    # Use ip-api.com batch endpoint (max 100 per request)
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            for i in range(0, len(uncached), 100):
                batch = uncached[i:i + 100]
                resp = await client.post(
                    "http://ip-api.com/batch",
                    json=[{"query": ip, "fields": "status,query,lat,lon,country,city,isp"} for ip in batch],
                )
                for item in resp.json():
                    if item.get("status") == "success":
                        ip = item["query"]
                        geo = {
                            "lat": item["lat"],
                            "lng": item["lon"],
                            "country": item.get("country"),
                            "city": item.get("city"),
                            "isp": item.get("isp"),
                        }
                        results[ip] = geo
                        # Cache
                        try:
                            r = await get_redis()
                            await r.set(f"geo:{ip}", orjson.dumps(geo), ex=GEO_CACHE_TTL)
                        except Exception:
                            pass

                # Rate limit: wait between batches
                if i + 100 < len(uncached):
                    await asyncio.sleep(1.5)

    except Exception as e:
        logger.warning(f"Batch geolocation failed: {e}")

    return results
