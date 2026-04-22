#!/usr/bin/env python3
"""Export SOC CAR case tickets from ManageEngine SDP into analysis-friendly JSON files.

Output layout:

    .tmp/exports/soc_car/
      manifest.json
      raw/
        YYYY-MM.ndjson
      summary/
        tickets_summary.ndjson
        tickets_summary.csv
        latest_100_summary.json
      refs/
        udf_alias.json
        task_template.json

Each raw NDJSON line contains:
  - full request detail
  - all tasks
  - all notes
  - derived summary fields
  - human-friendly UDF aliases
  - cleaned plain-text variants of HTML fields

The exporter is resumable. If summary/tickets_summary.ndjson already exists, ticket IDs
from that file will be skipped automatically unless --overwrite is used.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import html
import json
import os
import re
import shutil
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx


DEFAULT_BASE_URL = os.getenv("SDP_BASE_URL", "https://10.20.24.9:8050")
DEFAULT_API_KEY = os.getenv("SDP_API_KEY", "")
DEFAULT_OUT_DIR = Path(".tmp/exports/soc_car")
DEFAULT_TEMPLATE_ID = "1802"
DEFAULT_TEMPLATE_NAME = "CAR - Case Template"


UDF_ALIAS_MAP: dict[str, dict[str, str]] = {
    "udf_pick_1805": {
        "alias": "validation_result",
        "confidence": "high",
        "note": "Observed values include True Positive / False Positive.",
    },
    "udf_pick_1806": {
        "alias": "classification_reason",
        "confidence": "medium",
        "note": "Observed values include Other / SIEM Issue.",
    },
    "udf_pick_1818": {
        "alias": "asset_impacted",
        "confidence": "high",
        "note": "Observed values look like host or asset names.",
    },
    "udf_pick_1819": {
        "alias": "case_type",
        "confidence": "high",
        "note": "Observed values include Security Event / Non Security.",
    },
    "udf_pick_1822": {
        "alias": "billing_flag",
        "confidence": "high",
        "note": "Observed values include Billable.",
    },
    "udf_pick_2704": {
        "alias": "analyst_pic",
        "confidence": "high",
        "note": "Observed values look like analyst names.",
    },
    "udf_pick_3901": {
        "alias": "customer_scope",
        "confidence": "medium",
        "note": "Observed values include IOS-MTM / CMWI.",
    },
    "udf_multiselect_2101": {
        "alias": "analysts_involved",
        "confidence": "low",
        "note": "Currently often empty in sampled tickets.",
    },
    "udf_sline_1816": {
        "alias": "free_text_1816",
        "confidence": "low",
        "note": "Meaning not confirmed from API sample.",
    },
    "udf_sline_1820": {
        "alias": "free_text_1820",
        "confidence": "low",
        "note": "Meaning not confirmed from API sample.",
    },
    "udf_sline_1827": {
        "alias": "source_ip",
        "confidence": "high",
        "note": "Observed values look like IP addresses.",
    },
    "udf_mline_2102": {
        "alias": "free_text_2102",
        "confidence": "low",
        "note": "Meaning not confirmed from API sample.",
    },
    "udf_date_1807": {
        "alias": "first_notification_time",
        "confidence": "medium",
        "note": "Mapped from existing backend sync logic.",
    },
    "udf_date_1808": {
        "alias": "case_reference_time",
        "confidence": "low",
        "note": "Meaning not confirmed from API sample.",
    },
    "udf_date_2701": {
        "alias": "alert_time",
        "confidence": "high",
        "note": "Mapped from existing backend sync logic.",
    },
}


CSV_FIELDS = [
    "id",
    "year_month",
    "created_time",
    "assigned_time",
    "resolved_time",
    "completed_time",
    "last_updated_time",
    "status",
    "priority",
    "request_type",
    "account",
    "site",
    "department",
    "requester",
    "created_by",
    "technician",
    "template",
    "subject",
    "resolution_minutes",
    "task_count",
    "open_task_count",
    "notes_count",
    "case_type",
    "validation_result",
    "classification_reason",
    "asset_impacted",
    "source_ip",
    "analyst_pic",
    "customer_scope",
    "task_titles",
]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def compact_json(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))


def pretty_json(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2)


def nested_name(value: Any) -> Any:
    if isinstance(value, dict):
        return value.get("name")
    return value


def sdp_epoch_ms(value: Any) -> int | None:
    if isinstance(value, dict):
        raw = value.get("value")
        if raw is None:
            return None
        try:
            return int(raw)
        except (TypeError, ValueError):
            return None
    return None


def sdp_display(value: Any) -> str | None:
    if isinstance(value, dict):
        return value.get("display_value")
    if value is None:
        return None
    return str(value)


def year_month_from_request(request: dict[str, Any]) -> str:
    created = request.get("created_time")
    epoch_ms = sdp_epoch_ms(created)
    if epoch_ms is None:
        return "unknown"
    return datetime.fromtimestamp(epoch_ms / 1000, tz=timezone.utc).strftime("%Y-%m")


def html_to_text(value: Any) -> str:
    if not value:
        return ""
    text = str(value)
    replacements = {
        "<br />": "\n",
        "<br/>": "\n",
        "<br>": "\n",
        "</div>": "\n",
        "</li>": "\n",
        "</ul>": "\n",
        "</ol>": "\n",
        "</p>": "\n",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    text = text.replace("\u2060", "")
    text = text.replace("\xa0", " ")
    text = re.sub(r"\r\n?", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def build_udf_alias(udf_fields: dict[str, Any]) -> dict[str, Any]:
    aliased: dict[str, Any] = {}
    for key, value in udf_fields.items():
        alias = UDF_ALIAS_MAP.get(key, {}).get("alias", key)
        if isinstance(value, dict):
            aliased[alias] = value.get("display_value") or value.get("value")
        elif isinstance(value, list):
            aliased[alias] = value
        else:
            aliased[alias] = value
    return aliased


def build_derived(request: dict[str, Any], tasks: list[dict[str, Any]], notes: list[dict[str, Any]]) -> dict[str, Any]:
    created_ms = sdp_epoch_ms(request.get("created_time"))
    resolved_ms = sdp_epoch_ms(request.get("resolved_time"))
    task_statuses = Counter((task.get("status") or {}).get("name", "Unknown") for task in tasks)

    resolution_minutes = None
    if created_ms is not None and resolved_ms is not None:
        resolution_minutes = round((resolved_ms - created_ms) / 60000, 2)

    return {
        "year_month": year_month_from_request(request),
        "resolution_minutes": resolution_minutes,
        "task_count": len(tasks),
        "open_task_count": sum(1 for task in tasks if (task.get("status") or {}).get("name") == "Open"),
        "task_status_counts": dict(task_statuses),
        "notes_count": len(notes),
        "note_ids": [note.get("id") for note in notes],
        "site_name": nested_name(request.get("site")),
        "priority_name": nested_name(request.get("priority")),
        "status_name": nested_name(request.get("status")),
        "requester_name": nested_name(request.get("requester")),
        "created_by_name": nested_name(request.get("created_by")),
        "technician_name": nested_name(request.get("technician")),
        "template_name": nested_name(request.get("template")),
    }


def build_summary_row(record: dict[str, Any]) -> dict[str, Any]:
    request = record["request"]
    derived = record["derived"]
    udf = record["udf_alias"]
    tasks = record["tasks"]

    return {
        "id": request.get("id"),
        "year_month": derived["year_month"],
        "created_time": sdp_display(request.get("created_time")),
        "assigned_time": sdp_display(request.get("assigned_time")),
        "resolved_time": sdp_display(request.get("resolved_time")),
        "completed_time": sdp_display(request.get("completed_time")),
        "last_updated_time": sdp_display(request.get("last_updated_time")),
        "status": nested_name(request.get("status")),
        "priority": nested_name(request.get("priority")),
        "request_type": nested_name(request.get("request_type")),
        "account": nested_name(request.get("account")),
        "site": nested_name(request.get("site")),
        "department": nested_name(request.get("department")),
        "requester": nested_name(request.get("requester")),
        "created_by": nested_name(request.get("created_by")),
        "technician": nested_name(request.get("technician")),
        "template": nested_name(request.get("template")),
        "subject": request.get("subject"),
        "resolution_minutes": derived["resolution_minutes"],
        "task_count": derived["task_count"],
        "open_task_count": derived["open_task_count"],
        "notes_count": derived["notes_count"],
        "case_type": udf.get("case_type"),
        "validation_result": udf.get("validation_result"),
        "classification_reason": udf.get("classification_reason"),
        "asset_impacted": udf.get("asset_impacted"),
        "source_ip": udf.get("source_ip"),
        "analyst_pic": udf.get("analyst_pic"),
        "customer_scope": udf.get("customer_scope"),
        "task_titles": " | ".join(task.get("title", "") for task in sorted(tasks, key=lambda item: int(item.get("index") or 0))),
        "created_epoch_ms": sdp_epoch_ms(request.get("created_time")),
    }


class RawWriter:
    def __init__(self, out_dir: Path):
        self.raw_dir = out_dir / "raw"
        self.summary_dir = out_dir / "summary"
        self.refs_dir = out_dir / "refs"
        self.raw_dir.mkdir(parents=True, exist_ok=True)
        self.summary_dir.mkdir(parents=True, exist_ok=True)
        self.refs_dir.mkdir(parents=True, exist_ok=True)
        self.summary_ndjson = self.summary_dir / "tickets_summary.ndjson"
        self._handles: dict[Path, Any] = {}

    def append_raw(self, record: dict[str, Any]) -> None:
        path = self.raw_dir / f"{record['derived']['year_month']}.ndjson"
        self._write_line(path, record)

    def append_summary(self, row: dict[str, Any]) -> None:
        self._write_line(self.summary_ndjson, row)

    def _write_line(self, path: Path, data: dict[str, Any]) -> None:
        handle = self._handles.get(path)
        if handle is None:
            path.parent.mkdir(parents=True, exist_ok=True)
            handle = path.open("a", encoding="utf-8")
            self._handles[path] = handle
        handle.write(compact_json(data))
        handle.write("\n")
        handle.flush()

    def close(self) -> None:
        for handle in self._handles.values():
            handle.close()
        self._handles.clear()


class SDPExporter:
    def __init__(self, args: argparse.Namespace):
        self.args = args
        self.base_url = args.base_url.rstrip("/")
        self.api_key = args.api_key
        self.out_dir = Path(args.out_dir)
        self.writer = RawWriter(self.out_dir)
        self.sem = asyncio.Semaphore(args.concurrency)
        limits = httpx.Limits(
            max_keepalive_connections=args.concurrency,
            max_connections=args.concurrency,
        )
        self.client = httpx.AsyncClient(
            base_url=self.base_url,
            headers={
                "authtoken": self.api_key,
                "Accept": "application/vnd.manageengine.sdp.v3+json",
            },
            verify=False,
            timeout=45.0,
            limits=limits,
        )
        self.export_started_at = utc_now_iso()
        self.existing_ids = self._load_existing_ids()
        self.total_count = 0
        self.processed_this_run = 0
        self.skipped_existing = 0
        self.failed_ids: list[str] = []
        self.request_count = 0
        self.first_task_template_written = False

    def _load_existing_ids(self) -> set[str]:
        if self.args.overwrite:
            return set()
        summary_path = self.out_dir / "summary" / "tickets_summary.ndjson"
        if not summary_path.exists():
            return set()

        ids: set[str] = set()
        with summary_path.open("r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    item = json.loads(line)
                except json.JSONDecodeError:
                    continue
                ticket_id = item.get("id")
                if ticket_id is not None:
                    ids.add(str(ticket_id))
        return ids

    async def close(self) -> None:
        self.writer.close()
        await self.client.aclose()

    async def fetch_json(self, path: str, params: dict[str, Any] | None = None, retries: int = 3) -> dict[str, Any]:
        last_error: Exception | None = None
        for attempt in range(1, retries + 1):
            try:
                async with self.sem:
                    self.request_count += 1
                    response = await self.client.get(path, params=params)
                    response.raise_for_status()
                    data = response.json()
                response_status = data.get("response_status")
                if isinstance(response_status, dict) and response_status.get("status") == "failed":
                    raise RuntimeError(response_status)
                if isinstance(response_status, list):
                    failed = [item for item in response_status if item.get("status") == "failed"]
                    if failed:
                        raise RuntimeError(failed)
                return data
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                if attempt == retries:
                    break
                await asyncio.sleep(min(2 * attempt, 5))
        raise RuntimeError(f"Request failed for {path}: {last_error}") from last_error

    async def get_total_count(self) -> int:
        input_data = {
            "list_info": {
                "row_count": 1,
                "start_index": 1,
                "get_total_count": True,
                "search_criteria": [
                    {"field": "template.id", "condition": "is", "value": self.args.template_id}
                ],
            }
        }
        data = await self.fetch_json("/api/v3/requests", {"input_data": compact_json(input_data)})
        return int(data["list_info"]["total_count"])

    async def fetch_page(self, start_index: int) -> list[dict[str, Any]]:
        input_data = {
            "list_info": {
                "row_count": self.args.page_size,
                "start_index": start_index,
                "sort_field": "id",
                "sort_order": self.args.sort_order,
                "search_criteria": [
                    {"field": "template.id", "condition": "is", "value": self.args.template_id}
                ],
            }
        }
        data = await self.fetch_json("/api/v3/requests", {"input_data": compact_json(input_data)})
        return data.get("requests", [])

    async def fetch_ticket_bundle(self, ticket_id: str) -> dict[str, Any]:
        detail_task = self.fetch_json(f"/api/v3/requests/{ticket_id}")
        tasks_task = self.fetch_json(f"/api/v3/requests/{ticket_id}/tasks")
        notes_task = self.fetch_json(f"/api/v3/requests/{ticket_id}/notes")
        detail_data, tasks_data, notes_data = await asyncio.gather(detail_task, tasks_task, notes_task)

        request = detail_data["request"]
        tasks = tasks_data.get("tasks", [])
        notes = notes_data.get("notes", [])
        udf_fields = request.get("udf_fields", {})
        return {
            "export_meta": {
                "exported_at": utc_now_iso(),
                "base_url": self.base_url,
                "template_id": self.args.template_id,
                "template_name": self.args.template_name,
            },
            "request": request,
            "tasks": tasks,
            "notes": notes,
            "derived": build_derived(request, tasks, notes),
            "udf_alias": build_udf_alias(udf_fields),
            "text_clean": {
                "description_text": html_to_text(request.get("description")),
                "short_description_text": html_to_text(request.get("short_description")),
                "task_texts": [
                    {
                        "index": task.get("index"),
                        "title": task.get("title"),
                        "description_text": html_to_text(task.get("description")),
                    }
                    for task in sorted(tasks, key=lambda item: int(item.get("index") or 0))
                ],
                "note_texts": [
                    {
                        "id": note.get("id"),
                        "description_text": html_to_text(note.get("description")),
                    }
                    for note in notes
                ],
            },
        }

    def write_refs(self, sample_record: dict[str, Any]) -> None:
        udf_ref_path = self.out_dir / "refs" / "udf_alias.json"
        task_ref_path = self.out_dir / "refs" / "task_template.json"

        if not udf_ref_path.exists():
            udf_ref_path.write_text(
                pretty_json(
                    {
                        "template_id": self.args.template_id,
                        "template_name": self.args.template_name,
                        "aliases": UDF_ALIAS_MAP,
                    }
                ),
                encoding="utf-8",
            )

        if not task_ref_path.exists():
            task_ref_path.write_text(
                pretty_json(
                    {
                        "template_id": self.args.template_id,
                        "template_name": self.args.template_name,
                        "request_template_task_ids": sample_record["request"].get("request_template_task_ids", []),
                        "tasks": [
                            {
                                "index": task.get("index"),
                                "title": task.get("title"),
                                "description": task.get("description"),
                            }
                            for task in sorted(sample_record["tasks"], key=lambda item: int(item.get("index") or 0))
                        ],
                    }
                ),
                encoding="utf-8",
            )

    def write_manifest(self, completed: bool) -> None:
        manifest = {
            "export": {
                "started_at": self.export_started_at,
                "updated_at": utc_now_iso(),
                "completed": completed,
                "base_url": self.base_url,
                "template_id": self.args.template_id,
                "template_name": self.args.template_name,
                "page_size": self.args.page_size,
                "concurrency": self.args.concurrency,
                "limit": self.args.limit,
                "resume_detected": bool(self.existing_ids),
            },
            "counts": {
                "requested_total": self.total_count,
                "existing_before_run": len(self.existing_ids),
                "exported_this_run": self.processed_this_run,
                "skipped_existing": self.skipped_existing,
                "exported_total_after_run": len(self.existing_ids) + self.processed_this_run,
                "failed_ids": self.failed_ids,
                "http_requests_sent": self.request_count,
            },
            "files": {
                "summary_ndjson": str(self.out_dir / "summary" / "tickets_summary.ndjson"),
                "summary_csv": str(self.out_dir / "summary" / "tickets_summary.csv"),
                "latest_summary_json": str(self.out_dir / "summary" / f"latest_{self.args.latest_count}_summary.json"),
                "raw_dir": str(self.out_dir / "raw"),
                "refs_dir": str(self.out_dir / "refs"),
            },
            "api_capabilities": {
                "request_detail": True,
                "tasks": True,
                "notes": True,
                "history": False,
                "conversations": False,
            },
        }
        (self.out_dir / "manifest.json").write_text(pretty_json(manifest), encoding="utf-8")

    def rebuild_summary_artifacts(self) -> None:
        summary_ndjson = self.out_dir / "summary" / "tickets_summary.ndjson"
        if not summary_ndjson.exists():
            return

        rows: list[dict[str, Any]] = []
        with summary_ndjson.open("r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                rows.append(json.loads(line))

        rows.sort(key=lambda item: (item.get("created_epoch_ms") or 0, int(item["id"])), reverse=True)
        latest = rows[: self.args.latest_count]

        summary_csv = self.out_dir / "summary" / "tickets_summary.csv"
        with summary_csv.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=CSV_FIELDS)
            writer.writeheader()
            for row in rows:
                writer.writerow({key: row.get(key) for key in CSV_FIELDS})

        latest_json = self.out_dir / "summary" / f"latest_{self.args.latest_count}_summary.json"
        latest_json.write_text(
            pretty_json([{key: row.get(key) for key in CSV_FIELDS} for row in latest]),
            encoding="utf-8",
        )

    async def run(self) -> int:
        if self.args.known_total is not None:
            self.total_count = self.args.known_total
        else:
            self.total_count = await self.get_total_count()
        if self.args.limit is not None:
            self.total_count = min(self.total_count, self.args.limit)

        print(
            f"Export target: {self.total_count} tickets for template {self.args.template_name} ({self.args.template_id})",
            flush=True,
        )
        print(
            f"Output dir: {self.out_dir} | resume: {bool(self.existing_ids)} | existing summary IDs: {len(self.existing_ids)}",
            flush=True,
        )

        started = time.monotonic()
        target_count = self.total_count
        loop_start = max(1, self.args.start_index)
        print(f"Starting page scan from start_index={loop_start}", flush=True)

        for start_index in range(loop_start, target_count + 1, self.args.page_size):
            page = await self.fetch_page(start_index)
            if not page:
                break

            if self.args.limit is not None:
                remaining = self.args.limit - (start_index - loop_start)
                page = page[:remaining]

            candidate_ids = [str(item["id"]) for item in page]
            pending_ids = [ticket_id for ticket_id in candidate_ids if ticket_id not in self.existing_ids]
            self.skipped_existing += len(candidate_ids) - len(pending_ids)

            bundles = []
            if pending_ids:
                bundles = await asyncio.gather(
                    *(self.fetch_ticket_bundle(ticket_id) for ticket_id in pending_ids),
                    return_exceptions=True,
                )

            for ticket_id, bundle in zip(pending_ids, bundles):
                if isinstance(bundle, Exception):
                    self.failed_ids.append(ticket_id)
                    continue

                if not self.first_task_template_written:
                    self.write_refs(bundle)
                    self.first_task_template_written = True

                self.writer.append_raw(bundle)
                self.writer.append_summary(build_summary_row(bundle))
                self.processed_this_run += 1

            self.write_manifest(completed=False)

            elapsed = max(time.monotonic() - started, 1e-6)
            rate = self.processed_this_run / elapsed
            print(
                f"Page start={start_index:>5} page_size={len(page):>3} "
                f"written={self.processed_this_run:>5} skipped={self.skipped_existing:>5} "
                f"failed={len(self.failed_ids):>3} rate={rate:.2f} tickets/s",
                flush=True,
            )

            if self.args.limit is not None and (start_index - loop_start + len(page)) >= self.args.limit:
                break

        self.rebuild_summary_artifacts()
        self.write_manifest(completed=True)
        return self.processed_this_run


def ensure_output_mode(out_dir: Path, overwrite: bool) -> None:
    if overwrite and out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="ManageEngine SDP base URL.")
    parser.add_argument("--api-key", default=DEFAULT_API_KEY, help="ManageEngine SDP authtoken / API key.")
    parser.add_argument("--template-id", default=DEFAULT_TEMPLATE_ID, help="Request template ID filter.")
    parser.add_argument("--template-name", default=DEFAULT_TEMPLATE_NAME, help="Human-readable template name.")
    parser.add_argument("--out-dir", default=str(DEFAULT_OUT_DIR), help="Exporter output directory.")
    parser.add_argument("--page-size", type=int, default=100, help="SDP list page size. Max practical value is 100.")
    parser.add_argument("--concurrency", type=int, default=12, help="Maximum concurrent HTTP requests.")
    parser.add_argument("--start-index", type=int, default=1, help="Optional start index for resumable exports.")
    parser.add_argument("--known-total", type=int, default=None, help="Skip total-count query and use this known total instead.")
    parser.add_argument("--sort-order", choices=["asc", "desc"], default="asc", help="Request list sort order.")
    parser.add_argument("--limit", type=int, default=None, help="Optional limit for test exports.")
    parser.add_argument("--latest-count", type=int, default=100, help="How many latest summary rows to materialize.")
    parser.add_argument("--overwrite", action="store_true", help="Delete existing export dir before running.")
    return parser.parse_args()


async def async_main() -> int:
    args = parse_args()
    if not args.api_key:
        print("Missing API key. Set SDP_API_KEY or pass --api-key.", file=sys.stderr)
        return 2

    out_dir = Path(args.out_dir)
    ensure_output_mode(out_dir, args.overwrite)

    exporter = SDPExporter(args)
    try:
        await exporter.run()
    finally:
        await exporter.close()
    return 0


def main() -> int:
    try:
        return asyncio.run(async_main())
    except KeyboardInterrupt:
        print("Interrupted.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
