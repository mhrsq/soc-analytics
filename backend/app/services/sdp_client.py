"""SDP API client for fetching ticket data."""

import asyncio
import json
import logging
import re
from datetime import datetime, timezone
from typing import Any, Optional
from urllib.parse import quote

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class SDPClient:
    """Async client for ManageEngine ServiceDesk Plus REST API v3."""

    SOC_ACCOUNT = "Cyber Security"
    SOC_TEMPLATE_ID = "1802"

    # UDF field mapping: SDP key → our DB column name
    UDF_MAP = {
        "udf_pick_1805": "validation",
        "udf_pick_1806": "attack_category",
        "udf_pick_1819": "case_type",
        "udf_pick_2704": "pic_creator",
        "udf_pick_3901": "customer",
        "udf_pick_1818": "asset_name",
        "udf_sline_1827": "ip_address",
        "udf_date_2701": "alert_time",
        "udf_date_1807": "first_notif",
    }

    # Regex to parse Wazuh info from ticket subject
    # Pattern: [ALERT] Wazuh - Rule XXXX: rule name - asset
    RULE_PATTERN = re.compile(
        r"Rule\s+(\d+)\s*[:\-]\s*(.+?)(?:\s*-\s*[\w\-]+$|\s*$)",
        re.IGNORECASE,
    )

    def __init__(self):
        self.base_url = settings.SDP_BASE_URL.rstrip("/")
        self.api_key = settings.SDP_API_KEY
        self.semaphore = asyncio.Semaphore(settings.SDP_CONCURRENT_REQUESTS)

    def _get_client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=self.base_url,
            headers={"authtoken": self.api_key},
            verify=False,  # Self-signed cert on-prem
            timeout=30.0,
        )

    async def get_ticket_count(self) -> int:
        """Get total number of SOC tickets."""
        input_data = {
            "list_info": {
                "row_count": 1,
                "get_total_count": True,
                "search_criteria": {
                    "field": "account.name",
                    "condition": "is",
                    "value": self.SOC_ACCOUNT,
                },
            }
        }
        async with self._get_client() as client:
            resp = await client.get(
                "/api/v3/requests",
                params={"input_data": json.dumps(input_data)},
            )
            data = resp.json()
            return data.get("list_info", {}).get("total_count", 0)

    async def list_tickets(
        self,
        start_index: int = 1,
        row_count: int = 100,
        sort_field: str = "id",
        sort_order: str = "desc",
    ) -> tuple[list[dict], int]:
        """List SOC tickets (basic fields only, no UDF).
        
        Returns (tickets, total_count).
        """
        search_criteria = {
            "field": "account.name",
            "condition": "is",
            "value": self.SOC_ACCOUNT,
        }

        input_data = {
            "list_info": {
                "row_count": row_count,
                "start_index": start_index,
                "search_criteria": search_criteria,
                "sort_field": sort_field,
                "sort_order": sort_order,
            }
        }
        async with self._get_client() as client:
            resp = await client.get(
                "/api/v3/requests",
                params={"input_data": json.dumps(input_data)},
            )
            data = resp.json()
            tickets = data.get("requests", [])
            total = data.get("list_info", {}).get("total_count", 0)
            return tickets, total

    async def get_ticket_detail(self, ticket_id: int) -> Optional[dict]:
        """Get full ticket detail including UDF fields."""
        async with self.semaphore:
            try:
                async with self._get_client() as client:
                    resp = await client.get(f"/api/v3/requests/{ticket_id}")
                    data = resp.json()
                    if "request" in data:
                        return data["request"]
                    logger.warning(f"No request data for ticket {ticket_id}: {data}")
                    return None
            except Exception as e:
                logger.error(f"Error fetching ticket {ticket_id}: {e}")
                return None

    def parse_ticket(self, raw: dict) -> dict:
        """Parse raw SDP ticket response into our DB schema format."""
        udf = raw.get("udf_fields", {})

        # Check if this is a SOC ticket (has SOC UDF fields)
        if "udf_pick_1805" not in udf:
            return {}  # Not a SOC/CAR template ticket

        # Parse standard fields
        record = {
            "id": int(raw.get("id", 0)),
            "subject": raw.get("subject", ""),
            "description": raw.get("short_description", raw.get("description", "")),
            "status": self._nested_name(raw, "status"),
            "priority": self._nested_name(raw, "priority"),
            "technician": self._nested_name(raw, "technician"),
            "group_name": self._nested_name(raw, "group"),
            "account_name": self._nested_name(raw, "account"),
            "site_name": self._nested_name(raw, "site"),
            "created_time": self._parse_epoch(raw.get("created_time")),
            "completed_time": self._parse_epoch(raw.get("completed_time")),
        }

        # Parse UDF fields
        for udf_key, db_field in self.UDF_MAP.items():
            value = udf.get(udf_key)
            if value is None:
                record[db_field] = None
            elif isinstance(value, dict):
                # Date fields come as {"display_value": "...", "value": "epoch_ms"}
                epoch = value.get("value")
                if epoch:
                    record[db_field] = self._epoch_to_datetime(int(epoch))
                else:
                    record[db_field] = None
            elif isinstance(value, list):
                record[db_field] = ", ".join(value) if value else None
            else:
                record[db_field] = str(value) if value else None

        # Compute MTTD — only for non-FP tickets (FP = false alarm, MTTD irrelevant)
        is_fp = str(record.get("validation", "") or "").lower() == "false positive"
        if not is_fp and record.get("first_notif") and record.get("alert_time"):
            delta = record["first_notif"] - record["alert_time"]
            record["mttd_seconds"] = max(0, int(delta.total_seconds()))
            record["sla_met"] = record["mttd_seconds"] <= settings.MTTD_SLA_SECONDS
        else:
            record["mttd_seconds"] = None
            record["sla_met"] = None

        # Compute MTTR
        if record.get("completed_time") and record.get("created_time"):
            delta = record["completed_time"] - record["created_time"]
            record["mttr_seconds"] = max(0, int(delta.total_seconds()))
        else:
            record["mttr_seconds"] = None

        # Parse Wazuh rule from subject
        rule_id, rule_name = self._parse_wazuh_rule(record.get("subject", ""))
        record["wazuh_rule_id"] = rule_id
        record["wazuh_rule_name"] = rule_name

        # Store raw JSON
        record["raw_json"] = raw
        record["synced_at"] = datetime.now(timezone.utc)

        return record

    @staticmethod
    def _nested_name(obj: dict, field: str) -> Optional[str]:
        """Extract name from nested SDP object like {\"name\": \"value\", \"id\": \"123\"}."""
        val = obj.get(field)
        if isinstance(val, dict):
            return val.get("name")
        return val

    @staticmethod
    def _parse_epoch(value: Any) -> Optional[datetime]:
        """Parse SDP epoch format {\"value\": \"epoch_ms\", \"display_value\": \"...\"}."""
        if isinstance(value, dict):
            epoch = value.get("value")
            if epoch:
                return datetime.fromtimestamp(int(epoch) / 1000, tz=timezone.utc)
        return None

    @staticmethod
    def _epoch_to_datetime(epoch_ms: int) -> datetime:
        return datetime.fromtimestamp(epoch_ms / 1000, tz=timezone.utc)

    @classmethod
    def _parse_wazuh_rule(cls, subject: str) -> tuple[Optional[str], Optional[str]]:
        """Extract Wazuh rule ID and name from ticket subject."""
        match = cls.RULE_PATTERN.search(subject)
        if match:
            return match.group(1), match.group(2).strip()
        return None, None
