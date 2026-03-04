#!/usr/bin/env python3
"""
Local SDP → Database Sync Script.

Runs locally (where SDP is accessible) and pushes data directly
to the PostgreSQL database (local Docker or remote VPS).

Usage:
    pip install httpx psycopg2-binary
    python local_sync.py              # auto-detect: localhost first, then VPS
    python local_sync.py --local      # force localhost (Mini PC)
    python local_sync.py --vps        # force VPS
"""

import asyncio
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from typing import Optional, Any

import httpx

# ── Config ──────────────────────────────────────────────────────
SDP_BASE_URL = "https://sdp-ioc.mtm.id:8050"
SDP_API_KEY = "3E3F178A-42A4-421A-9619-3B22A930B8A7"
SOC_ACCOUNT = "Cyber Security"

# Database connection — auto-detect or override via CLI flags
_LOCAL_DB_HOST = "localhost"
_VPS_DB_HOST = "178.128.222.1"

def _detect_db_host() -> str:
    """Pick DB host: --local / --vps flag, or env var, or auto-detect."""
    if "--local" in sys.argv:
        return _LOCAL_DB_HOST
    if "--vps" in sys.argv:
        return _VPS_DB_HOST
    env = os.environ.get("SYNC_DB_HOST")
    if env:
        return env
    # Auto-detect: try localhost first (Mini PC with Docker running)
    import socket
    try:
        s = socket.create_connection((_LOCAL_DB_HOST, 5433), timeout=2)
        s.close()
        return _LOCAL_DB_HOST
    except OSError:
        return _VPS_DB_HOST

DB_HOST = _detect_db_host()
DB_PORT = 5433
DB_NAME = "soc_analytics"
DB_USER = "soc"
DB_PASS = "soc_s3cur3_pwd"

CONCURRENT_REQUESTS = 10
PAGE_SIZE = 100
MTTD_SLA_SECONDS = 900  # 15 minutes

# UDF field mapping
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

RULE_PATTERN = re.compile(
    r"Rule\s+(\d+)\s*[:\-]\s*(.+?)(?:\s*-\s*[\w\-]+$|\s*$)",
    re.IGNORECASE,
)


# ── Helpers ─────────────────────────────────────────────────────
def nested_name(obj: dict, field: str) -> Optional[str]:
    val = obj.get(field)
    if isinstance(val, dict):
        return val.get("name")
    return val


def parse_epoch(value: Any) -> Optional[datetime]:
    if isinstance(value, dict):
        epoch = value.get("value")
        if epoch:
            return datetime.fromtimestamp(int(epoch) / 1000, tz=timezone.utc)
    return None


def epoch_to_dt(epoch_ms: int) -> datetime:
    return datetime.fromtimestamp(epoch_ms / 1000, tz=timezone.utc)


def parse_wazuh_rule(subject: str) -> tuple[Optional[str], Optional[str]]:
    match = RULE_PATTERN.search(subject)
    if match:
        return match.group(1), match.group(2).strip()
    return None, None


def parse_ticket(raw: dict) -> Optional[dict]:
    """Parse raw SDP ticket into DB record."""
    udf = raw.get("udf_fields", {})
    if "udf_pick_1805" not in udf:
        return None  # Not SOC template

    record = {
        "id": int(raw.get("id", 0)),
        "subject": raw.get("subject", ""),
        "description": raw.get("short_description", raw.get("description", "")),
        "status": nested_name(raw, "status"),
        "priority": nested_name(raw, "priority"),
        "technician": nested_name(raw, "technician"),
        "group_name": nested_name(raw, "group"),
        "account_name": nested_name(raw, "account"),
        "site_name": nested_name(raw, "site"),
        "created_time": parse_epoch(raw.get("created_time")),
        "completed_time": parse_epoch(raw.get("completed_time")),
    }

    for udf_key, db_field in UDF_MAP.items():
        value = udf.get(udf_key)
        if value is None:
            record[db_field] = None
        elif isinstance(value, dict):
            epoch = value.get("value")
            record[db_field] = epoch_to_dt(int(epoch)) if epoch else None
        elif isinstance(value, list):
            record[db_field] = ", ".join(value) if value else None
        else:
            record[db_field] = str(value) if value else None

    # MTTD
    if record.get("first_notif") and record.get("alert_time"):
        delta = record["first_notif"] - record["alert_time"]
        record["mttd_seconds"] = max(0, int(delta.total_seconds()))
        record["sla_met"] = record["mttd_seconds"] <= MTTD_SLA_SECONDS
    else:
        record["mttd_seconds"] = None
        record["sla_met"] = None

    # MTTR
    if record.get("completed_time") and record.get("created_time"):
        delta = record["completed_time"] - record["created_time"]
        record["mttr_seconds"] = max(0, int(delta.total_seconds()))
    else:
        record["mttr_seconds"] = None

    # Wazuh rule
    rule_id, rule_name = parse_wazuh_rule(record.get("subject", ""))
    record["wazuh_rule_id"] = rule_id
    record["wazuh_rule_name"] = rule_name

    record["raw_json"] = json.dumps(raw, default=str)
    record["synced_at"] = datetime.now(timezone.utc)

    return record


# ── SDP API ─────────────────────────────────────────────────────
async def sdp_get_count(client: httpx.AsyncClient) -> int:
    input_data = {
        "list_info": {
            "row_count": 1,
            "get_total_count": True,
            "search_criteria": {
                "field": "account.name",
                "condition": "is",
                "value": SOC_ACCOUNT,
            },
        }
    }
    resp = await client.get(
        "/api/v3/requests",
        params={"input_data": json.dumps(input_data)},
    )
    data = resp.json()
    return data.get("list_info", {}).get("total_count", 0)


async def sdp_list_tickets(
    client: httpx.AsyncClient, start: int, count: int
) -> list[dict]:
    input_data = {
        "list_info": {
            "row_count": count,
            "start_index": start,
            "search_criteria": {
                "field": "account.name",
                "condition": "is",
                "value": SOC_ACCOUNT,
            },
            "sort_field": "id",
            "sort_order": "asc",
        }
    }
    resp = await client.get(
        "/api/v3/requests",
        params={"input_data": json.dumps(input_data)},
    )
    data = resp.json()
    return data.get("requests", [])


async def sdp_get_detail(
    client: httpx.AsyncClient, ticket_id: int, sem: asyncio.Semaphore
) -> Optional[dict]:
    async with sem:
        try:
            resp = await client.get(f"/api/v3/requests/{ticket_id}")
            data = resp.json()
            return data.get("request")
        except Exception as e:
            print(f"  [WARN] Error fetching ticket {ticket_id}: {e}")
            return None


# ── Database ────────────────────────────────────────────────────
def get_db_conn():
    import psycopg2
    return psycopg2.connect(
        host=DB_HOST, port=DB_PORT, dbname=DB_NAME,
        user=DB_USER, password=DB_PASS,
    )


def get_max_id(conn) -> int:
    cur = conn.cursor()
    cur.execute("SELECT COALESCE(MAX(id), 0) FROM tickets")
    result = cur.fetchone()[0]
    cur.close()
    return result


def get_ticket_count(conn) -> int:
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM tickets")
    result = cur.fetchone()[0]
    cur.close()
    return result


def upsert_tickets(conn, records: list[dict]):
    """Upsert records into tickets table."""
    if not records:
        return

    columns = [
        "id", "subject", "description", "status", "priority",
        "technician", "group_name", "account_name", "site_name",
        "created_time", "completed_time",
        "validation", "attack_category", "case_type", "pic_creator",
        "customer", "asset_name", "ip_address", "alert_time", "first_notif",
        "mttd_seconds", "mttr_seconds", "sla_met",
        "wazuh_rule_id", "wazuh_rule_name",
        "synced_at", "raw_json",
    ]

    placeholders = ", ".join(["%s"] * len(columns))
    col_names = ", ".join(columns)
    update_set = ", ".join(
        f"{c} = EXCLUDED.{c}" for c in columns if c != "id"
    )

    sql = f"""
        INSERT INTO tickets ({col_names})
        VALUES ({placeholders})
        ON CONFLICT (id) DO UPDATE SET {update_set}
    """

    cur = conn.cursor()
    for rec in records:
        values = [rec.get(c) for c in columns]
        cur.execute(sql, values)
    conn.commit()
    cur.close()


def refresh_views(conn):
    """Refresh materialized views."""
    cur = conn.cursor()
    for view in ["mv_daily_metrics", "mv_customer_daily", "mv_analyst_daily"]:
        try:
            cur.execute(f"REFRESH MATERIALIZED VIEW CONCURRENTLY {view}")
            print(f"  ✓ Refreshed {view}")
        except Exception as e:
            conn.rollback()
            # Try non-concurrent (works on empty views)
            try:
                cur.execute(f"REFRESH MATERIALIZED VIEW {view}")
                print(f"  ✓ Refreshed {view} (non-concurrent)")
            except Exception as e2:
                print(f"  ✗ Failed to refresh {view}: {e2}")
                conn.rollback()
    conn.commit()
    cur.close()


def add_sync_log(conn, synced: int, total: int, errors: int, sync_type: str):
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO sync_log (started_at, finished_at, tickets_synced, tickets_total, errors, sync_type, status)
        VALUES (NOW(), NOW(), %s, %s, %s, %s, 'completed')
    """, (synced, total, errors, sync_type))
    conn.commit()
    cur.close()


# ── Main ────────────────────────────────────────────────────────
async def main():
    target = "LOCAL (Mini PC)" if DB_HOST in ("localhost", "127.0.0.1") else f"VPS ({DB_HOST})"
    print("=" * 60)
    print(f"  SDP → {target} Database Sync")
    print("=" * 60)
    print(f"  DB target: {DB_HOST}:{DB_PORT}")

    # Test DB connection
    print(f"\n[1] Connecting to {target} PostgreSQL...")
    try:
        conn = get_db_conn()
        max_id = get_max_id(conn)
        print(f"  ✓ Connected. Current max ticket ID in DB: {max_id}")
    except Exception as e:
        print(f"  ✗ DB connection failed: {e}")
        print(f"  Make sure port {DB_PORT} is accessible on {DB_HOST}.")
        sys.exit(1)

    # Test SDP connection
    print("\n[2] Connecting to SDP API...")
    async with httpx.AsyncClient(
        base_url=SDP_BASE_URL,
        headers={"authtoken": SDP_API_KEY},
        verify=False,
        timeout=60.0,
    ) as sdp_client:
        try:
            total_tickets = await sdp_get_count(sdp_client)
            print(f"  ✓ Connected. Total SOC tickets: {total_tickets}")
        except Exception as e:
            print(f"  ✗ SDP connection failed: {e}")
            sys.exit(1)

        # Determine sync mode  
        # Use --full flag or auto-detect based on DB state
        force_full = "--full" in sys.argv
        if max_id == 0 or force_full:
            print(f"\n[3] FULL SYNC: Fetching all {total_tickets} tickets...")
            sync_type = "initial"
            max_id = 0  # Reset for full sync
        else:
            print(f"\n[3] INCREMENTAL SYNC: Fetching tickets with ID > {max_id}...")
            sync_type = "incremental"

        sem = asyncio.Semaphore(CONCURRENT_REQUESTS)
        synced = 0
        errors = 0
        start_time = time.time()

        # For incremental sync, skip pages we already have.
        # Tickets sorted by ID asc, so existing tickets are at the start.
        # Get count of tickets already in DB and start from there.
        if sync_type == "incremental":
            db_count = get_ticket_count(conn)
            estimated_new = total_tickets - db_count
            # Binary search for the SDP offset where ID > max_id starts
            # This avoids scanning thousands of already-synced pages
            lo_idx, hi_idx = 1, total_tickets
            print(f"  DB has {db_count} tickets (max ID {max_id}), SDP has {total_tickets}. ~{estimated_new} new.")
            print(f"  Finding start offset via binary search...")
            while lo_idx < hi_idx:
                mid_idx = (lo_idx + hi_idx) // 2
                try:
                    probe = await sdp_list_tickets(sdp_client, mid_idx, 1)
                except Exception:
                    hi_idx = mid_idx
                    continue
                if not probe:
                    hi_idx = mid_idx
                    continue
                if int(probe[0]["id"]) <= max_id:
                    lo_idx = mid_idx + 1
                else:
                    hi_idx = mid_idx
            skip_start = max(1, lo_idx - 100)  # small overlap for safety
            print(f"  New tickets start at SDP index ~{lo_idx}, syncing from {skip_start}...")
        else:
            skip_start = 1

        consecutive_empty = 0
        for page_start in range(skip_start, total_tickets + 1, PAGE_SIZE):
            # List tickets for this page
            try:
                tickets = await sdp_list_tickets(sdp_client, page_start, PAGE_SIZE)
            except Exception as e:
                print(f"  [ERROR] Failed to list page at {page_start}: {e}")
                errors += 1
                continue

            if not tickets:
                break

            # For incremental, filter to only new tickets
            if sync_type == "incremental":
                new_tickets = [t for t in tickets if int(t["id"]) > max_id]
                if not new_tickets:
                    consecutive_empty += 1
                    # Allow a few empty pages before stopping (handles gaps)
                    if consecutive_empty >= 5:
                        print(f"  No new tickets in 5 consecutive pages, stopping.")
                        break
                    continue
                else:
                    consecutive_empty = 0
                    tickets = new_tickets

            # Fetch details in parallel
            detail_tasks = [
                sdp_get_detail(sdp_client, int(t["id"]), sem) for t in tickets
            ]
            details = await asyncio.gather(*detail_tasks, return_exceptions=True)

            # Parse
            records = []
            for d in details:
                if isinstance(d, Exception):
                    errors += 1
                    continue
                if d is None:
                    errors += 1
                    continue
                parsed = parse_ticket(d)
                if parsed:
                    records.append(parsed)

            # Upsert to VPS DB
            if records:
                try:
                    upsert_tickets(conn, records)
                    synced += len(records)
                except Exception as e:
                    print(f"  [ERROR] DB upsert failed: {e}")
                    errors += len(records)

            elapsed = time.time() - start_time
            pct = min(100, (page_start + PAGE_SIZE - 1) / total_tickets * 100)
            print(
                f"  Progress: {synced} synced | page {page_start}-{page_start+PAGE_SIZE-1} | "
                f"{pct:.0f}% | {errors} errors | {elapsed:.0f}s elapsed"
            )

    # Refresh views
    print(f"\n[4] Refreshing materialized views...")
    refresh_views(conn)

    # Log sync
    add_sync_log(conn, synced, total_tickets, errors, sync_type)
    
    elapsed = time.time() - start_time
    print(f"\n{'=' * 60}")
    print(f"  SYNC COMPLETE")
    print(f"  Tickets synced: {synced}")
    print(f"  Errors: {errors}")
    print(f"  Time: {elapsed:.0f}s")
    print(f"{'=' * 60}")

    conn.close()


if __name__ == "__main__":
    import warnings
    warnings.filterwarnings("ignore")  # Suppress SSL warnings
    asyncio.run(main())
