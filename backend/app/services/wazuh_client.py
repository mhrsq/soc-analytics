"""Wazuh Indexer (OpenSearch) client for real-time attack data."""

import logging
from datetime import datetime, timezone
from typing import Optional

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class WazuhClient:
    """Query Wazuh Indexer (OpenSearch) for alerts with GeoIP data."""

    def __init__(self):
        self.base_url = settings.WAZUH_INDEXER_URL.rstrip("/")
        self.auth = (settings.WAZUH_INDEXER_USER, settings.WAZUH_INDEXER_PASS)
        self.index = "wazuh-alerts-*"

    def _get_client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=self.base_url,
            auth=self.auth,
            verify=False,
            timeout=15.0,
        )

    async def get_recent_events(self, minutes: int = 5, size: int = 20) -> list[dict]:
        """Get recent alerts with source IP and GeoLocation."""
        query = {
            "size": size,
            "sort": [{"timestamp": {"order": "desc"}}],
            "query": {
                "bool": {
                    "must": [
                        {"exists": {"field": "data.srcip"}},
                        {"exists": {"field": "GeoLocation"}},
                    ],
                    "filter": [
                        {"range": {"timestamp": {"gte": f"now-{minutes}m"}}},
                    ],
                }
            },
            "_source": [
                "timestamp", "data.srcip", "data.dstport", "data.protocol",
                "rule.id", "rule.description", "rule.level",
                "GeoLocation.country_name", "GeoLocation.location",
                "agent.name", "agent.ip",
            ],
        }
        try:
            async with self._get_client() as client:
                resp = await client.post(f"/{self.index}/_search", json=query)
                data = resp.json()
                hits = data.get("hits", {}).get("hits", [])
                return [self._parse_hit(h) for h in hits]
        except Exception as e:
            logger.error(f"Wazuh query failed: {e}")
            return []

    async def get_map_summary(self, hours: int = 24) -> dict:
        """Get aggregated attack data for map visualization."""
        query = {
            "size": 0,
            "query": {
                "bool": {
                    "must": [
                        {"exists": {"field": "data.srcip"}},
                        {"exists": {"field": "GeoLocation"}},
                    ],
                    "filter": [
                        {"range": {"timestamp": {"gte": f"now-{hours}h"}}},
                    ],
                }
            },
            "aggs": {
                "total": {"value_count": {"field": "data.srcip"}},
                "by_country": {
                    "terms": {"field": "GeoLocation.country_name", "size": 50},
                    "aggs": {
                        "coords": {
                            "top_hits": {
                                "size": 1,
                                "_source": ["GeoLocation.location"],
                            }
                        }
                    }
                },
                "by_port": {
                    "terms": {"field": "data.dstport", "size": 20},
                },
                "by_agent": {
                    "terms": {"field": "agent.name", "size": 20},
                },
                "unique_ips": {
                    "cardinality": {"field": "data.srcip"},
                },
            },
        }
        try:
            async with self._get_client() as client:
                resp = await client.post(f"/{self.index}/_search", json=query)
                data = resp.json()
                aggs = data.get("aggregations", {})

                # Parse country buckets with coordinates
                countries = []
                for b in aggs.get("by_country", {}).get("buckets", []):
                    coords_hits = b.get("coords", {}).get("hits", {}).get("hits", [])
                    loc = {}
                    if coords_hits:
                        loc = coords_hits[0].get("_source", {}).get("GeoLocation", {}).get("location", {})
                    countries.append({
                        "country": b["key"],
                        "count": b["doc_count"],
                        "lat": loc.get("lat", 0),
                        "lng": loc.get("lon", 0),
                    })

                # Port → protocol mapping
                PORT_PROTO = {
                    "22": "ssh", "80": "http", "443": "https", "21": "ftp",
                    "23": "telnet", "25": "smtp", "53": "dns", "3389": "rdp",
                    "445": "smb", "5060": "sip", "5900": "vnc", "8080": "http",
                    "8443": "https", "3306": "mysql", "5432": "postgres",
                }
                protocols = []
                for b in aggs.get("by_port", {}).get("buckets", []):
                    port = str(b["key"])
                    protocols.append({
                        "port": port,
                        "protocol": PORT_PROTO.get(port, f"port-{port}"),
                        "count": b["doc_count"],
                    })

                return {
                    "total_events": aggs.get("total", {}).get("value", 0),
                    "unique_ips": aggs.get("unique_ips", {}).get("value", 0),
                    "active_countries": len(countries),
                    "top_source": countries[0]["country"] if countries else "—",
                    "countries": countries,
                    "protocols": protocols,
                    "agents": [
                        {"name": b["key"], "count": b["doc_count"]}
                        for b in aggs.get("by_agent", {}).get("buckets", [])
                    ],
                }
        except Exception as e:
            logger.error(f"Wazuh summary failed: {e}")
            return {
                "total_events": 0, "unique_ips": 0, "active_countries": 0,
                "top_source": "—", "countries": [], "protocols": [], "agents": [],
            }

    def _parse_hit(self, hit: dict) -> dict:
        """Parse an OpenSearch hit into a clean event dict."""
        src = hit.get("_source", {})
        geo = src.get("GeoLocation", {})
        loc = geo.get("location", {})
        data = src.get("data", {})
        rule = src.get("rule", {})
        agent = src.get("agent", {})

        # Port → protocol
        port = str(data.get("dstport", ""))
        PORT_PROTO = {
            "22": "ssh", "80": "http", "443": "https", "21": "ftp",
            "23": "telnet", "3389": "rdp", "445": "smb", "5060": "sip",
            "5900": "vnc", "8080": "http",
        }

        return {
            "id": hit.get("_id", ""),
            "time": src.get("timestamp", ""),
            "source_ip": data.get("srcip", ""),
            "source_country": geo.get("country_name", ""),
            "source_lat": loc.get("lat", 0),
            "source_lng": loc.get("lon", 0),
            "port": port,
            "protocol": data.get("protocol") or PORT_PROTO.get(port, "tcp"),
            "rule_id": str(rule.get("id", "")),
            "rule_desc": rule.get("description", ""),
            "rule_level": rule.get("level", 0),
            "agent_name": agent.get("name", ""),
            "agent_ip": agent.get("ip", ""),
        }
