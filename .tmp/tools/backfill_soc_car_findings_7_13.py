#!/usr/bin/env python3
"""Dry-run and execute high-confidence backfill for findings 7 and 13.

Finding 7:
  - Populate index document into udf_sline_1816 using format CASE-SOCYYYY-MM-TICKETID

Finding 13:
  - Mirror analyst_pic (udf_pick_2704) from technician when current value is default SOC
    and the technician name has been verified as a valid picklist option via API tests.

This tool only reads from the existing raw export in .tmp and writes new artifacts under:

  .tmp/ops/soc_car_backfill_findings_7_13/

Default mode is dry-run. Use --execute to apply updates to SDP.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import sys
import time
from collections import Counter
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
import threading
from typing import Any
from zoneinfo import ZoneInfo

import requests
import urllib3


urllib3.disable_warnings()


DEFAULT_BASE_URL = os.getenv("SDP_BASE_URL", "https://10.20.24.9:8050")
DEFAULT_API_KEY = os.getenv("SDP_API_KEY", "43372DE1-9F20-46C5-A981-D783246CD911")
DEFAULT_EXPORT_DIR = Path(".tmp/exports/soc_car/raw")
DEFAULT_OUT_DIR = Path(".tmp/ops/soc_car_backfill_findings_7_13")
DEFAULT_TIMEZONE = "Asia/Jakarta"
DEFAULT_SLEEP_SECONDS = 0.20
DEFAULT_MAX_RETRIES = 6
DEFAULT_WORKERS = 4


ACCEPTED_ANALYST_TECHNICIANS = {
    "Muhammad Ilham Alghifari",
    "Jeffri Wahyu Putra Sitompul",
    "Ramadhanty Sadewi",
    "Muhammad Atalarik Syach Ajay",
    "Lukman Ardiyansyah",
    "Kristian Andrianto",
    "Nia Efriana",
    "Dika Verdiana Sari",
}

SPECIAL_TECHNICIAN_SKIP = {
    None,
    "SOC MTM",
    "Internship",
}


def compact_json(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))


def pretty_json(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2)


def utc_now_iso() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


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


def build_index_document(created_time: Any, ticket_id: str, tz_name: str) -> str:
    epoch_ms = sdp_epoch_ms(created_time)
    if epoch_ms is None:
        raise ValueError(f"Ticket {ticket_id} missing created_time.value")
    dt = datetime.fromtimestamp(epoch_ms / 1000, tz=ZoneInfo(tz_name))
    return f"CASE-SOC{dt:%Y-%m}-{ticket_id}"


@dataclass
class Candidate:
    ticket_id: str
    year_month: str
    subject: str | None
    site: str | None
    status: str | None
    technician: str | None
    current_analyst_pic: str | None
    current_index_document: str | None
    target_udf_fields: dict[str, Any]
    reasons: list[str]

    def to_dict(self) -> dict[str, Any]:
        return {
            "ticket_id": self.ticket_id,
            "year_month": self.year_month,
            "subject": self.subject,
            "site": self.site,
            "status": self.status,
            "technician": self.technician,
            "current_analyst_pic": self.current_analyst_pic,
            "current_index_document": self.current_index_document,
            "target_udf_fields": self.target_udf_fields,
            "reasons": self.reasons,
        }


class Planner:
    def __init__(self, export_dir: Path, tz_name: str):
        self.export_dir = export_dir
        self.tz_name = tz_name
        self.candidates: list[Candidate] = []
        self.review_items: list[dict[str, Any]] = []
        self.summary = Counter()

    def run(self) -> None:
        for path in sorted(self.export_dir.glob("*.ndjson")):
            with path.open("r", encoding="utf-8") as handle:
                for line in handle:
                    line = line.strip()
                    if not line:
                        continue
                    record = json.loads(line)
                    self._plan_record(record)

    def _plan_record(self, record: dict[str, Any]) -> None:
        request = record["request"]
        udf = request.get("udf_fields") or {}
        ticket_id = str(request["id"])
        technician = (request.get("technician") or {}).get("name")
        analyst_pic = udf.get("udf_pick_2704")
        index_document = udf.get("udf_sline_1816")
        subject = request.get("subject")
        site = (request.get("site") or {}).get("name")
        status = (request.get("status") or {}).get("name")
        year_month = record.get("derived", {}).get("year_month", "unknown")

        target_udf_fields: dict[str, Any] = {}
        reasons: list[str] = []

        expected_index_document = build_index_document(request.get("created_time"), ticket_id, self.tz_name)
        if index_document in (None, ""):
            target_udf_fields["udf_sline_1816"] = expected_index_document
            reasons.append("finding_7_blank_index_document")
            self.summary["finding_7_fill_index_document"] += 1
        elif index_document != expected_index_document:
            self.review_items.append(
                {
                    "ticket_id": ticket_id,
                    "reason": "finding_7_nonblank_index_document_mismatch",
                    "current_index_document": index_document,
                    "expected_index_document": expected_index_document,
                    "subject": subject,
                    "site": site,
                }
            )
            self.summary["review_finding_7_nonblank_index_document_mismatch"] += 1

        if analyst_pic == "SOC":
            if technician in ACCEPTED_ANALYST_TECHNICIANS:
                target_udf_fields["udf_pick_2704"] = technician
                reasons.append("finding_13_soc_to_technician")
                self.summary["finding_13_sync_analyst_pic"] += 1
            elif technician not in SPECIAL_TECHNICIAN_SKIP:
                self.review_items.append(
                    {
                        "ticket_id": ticket_id,
                        "reason": "finding_13_technician_not_in_verified_picklist",
                        "technician": technician,
                        "current_analyst_pic": analyst_pic,
                        "subject": subject,
                        "site": site,
                    }
                )
                self.summary["review_finding_13_technician_not_in_verified_picklist"] += 1
            else:
                self.summary["skip_finding_13_special_technician"] += 1
        elif technician not in SPECIAL_TECHNICIAN_SKIP and analyst_pic != technician:
            self.review_items.append(
                {
                    "ticket_id": ticket_id,
                    "reason": "finding_13_nondefault_mismatch",
                    "technician": technician,
                    "current_analyst_pic": analyst_pic,
                    "subject": subject,
                    "site": site,
                }
            )
            self.summary["review_finding_13_nondefault_mismatch"] += 1

        if target_udf_fields:
            self.candidates.append(
                Candidate(
                    ticket_id=ticket_id,
                    year_month=year_month,
                    subject=subject,
                    site=site,
                    status=status,
                    technician=technician,
                    current_analyst_pic=analyst_pic,
                    current_index_document=index_document,
                    target_udf_fields=target_udf_fields,
                    reasons=reasons,
                )
            )
            self.summary["candidates_total"] += 1

        self.summary["tickets_total"] += 1


class Writer:
    def __init__(self, out_dir: Path):
        self.out_dir = out_dir
        self.out_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

    def write_ndjson(self, path: Path, rows: list[dict[str, Any]]) -> None:
        with path.open("w", encoding="utf-8") as handle:
            for row in rows:
                handle.write(compact_json(row))
                handle.write("\n")

    def write_plan(self, planner: Planner, args: argparse.Namespace) -> None:
        candidates_path = self.out_dir / "dry_run_candidates.ndjson"
        review_path = self.out_dir / "dry_run_review.ndjson"
        summary_path = self.out_dir / "dry_run_summary.json"

        self.write_ndjson(candidates_path, [item.to_dict() for item in planner.candidates])
        self.write_ndjson(review_path, planner.review_items)
        summary = {
            "generated_at": utc_now_iso(),
            "mode": "dry-run",
            "base_url": args.base_url,
            "timezone": args.timezone,
            "source_export_dir": str(args.export_dir),
            "accepted_technicians": sorted(ACCEPTED_ANALYST_TECHNICIANS),
            "counts": dict(planner.summary),
            "files": {
                "candidates": str(candidates_path),
                "review": str(review_path),
            },
        }
        summary_path.write_text(pretty_json(summary), encoding="utf-8")

    def write_progress(self, payload: dict[str, Any]) -> None:
        with self._lock:
            (self.out_dir / "execute_progress.json").write_text(pretty_json(payload), encoding="utf-8")

    def append_result(self, row: dict[str, Any]) -> None:
        path = self.out_dir / "execute_results.ndjson"
        with self._lock:
            with path.open("a", encoding="utf-8") as handle:
                handle.write(compact_json(row))
                handle.write("\n")


class Executor:
    def __init__(self, args: argparse.Namespace, candidates: list[Candidate], writer: Writer):
        self.args = args
        self.candidates = candidates
        self.writer = writer
        self._thread_local = threading.local()
        self.done_ids = self._load_done_ids()
        self.stats = Counter()
        self.stats["existing_done_ids"] = len(self.done_ids)
        self._stats_lock = threading.Lock()

    def _load_done_ids(self) -> set[str]:
        path = self.writer.out_dir / "execute_results.ndjson"
        if not path.exists():
            return set()
        ids: set[str] = set()
        with path.open("r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    row = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if row.get("ok"):
                    ids.add(str(row.get("ticket_id")))
        return ids

    def run(self) -> int:
        selected = self.candidates
        if self.args.limit is not None:
            selected = selected[: self.args.limit]
        selected = [candidate for candidate in selected if candidate.ticket_id not in self.done_ids]

        total_selected = len(selected)
        self.stats["skipped_already_done"] += len(self.candidates[: self.args.limit] if self.args.limit is not None else self.candidates) - total_selected

        with concurrent.futures.ThreadPoolExecutor(max_workers=self.args.workers) as pool:
            futures = {pool.submit(self._update_candidate, candidate): candidate.ticket_id for candidate in selected}
            for future in concurrent.futures.as_completed(futures):
                result = future.result()
                self.writer.append_result(result)
                with self._stats_lock:
                    if result["ok"]:
                        self.done_ids.add(result["ticket_id"])
                        self.stats["updated_ok"] += 1
                    else:
                        self.stats["updated_failed"] += 1
                    self.stats["processed"] += 1
                    snapshot = {
                        "updated_at": utc_now_iso(),
                        "base_url": self.args.base_url,
                        "mode": "execute",
                        "limit": self.args.limit,
                        "workers": self.args.workers,
                        "sleep_seconds": self.args.sleep_seconds,
                        "processed": self.stats["processed"],
                        "updated_ok": self.stats["updated_ok"],
                        "updated_failed": self.stats["updated_failed"],
                        "skipped_already_done": self.stats["skipped_already_done"],
                        "selected_total": total_selected,
                    }
                self.writer.write_progress(snapshot)

        final = {
            "updated_at": utc_now_iso(),
            "base_url": self.args.base_url,
            "mode": "execute",
            "limit": self.args.limit,
            "workers": self.args.workers,
            "sleep_seconds": self.args.sleep_seconds,
            "selected_total": total_selected,
            "stats": dict(self.stats),
        }
        self.writer.write_progress(final)
        return 0 if self.stats["updated_failed"] == 0 else 1

    def _update_candidate(self, candidate: Candidate) -> dict[str, Any]:
        payload = {"request": {"udf_fields": candidate.target_udf_fields}}
        path = f"{self.args.base_url.rstrip('/')}/api/v3/requests/{candidate.ticket_id}"
        session = self._get_session()

        last_error: str | None = None
        for attempt in range(1, self.args.max_retries + 1):
            try:
                response = session.put(
                    path,
                    data={"input_data": json.dumps(payload, ensure_ascii=False)},
                    verify=False,
                    timeout=45,
                )
                data = response.json()
                if response.status_code >= 400:
                    raise RuntimeError(data.get("response_status") or data)
                request = data.get("request") or {}
                updated_udf = request.get("udf_fields") or {}
                mismatches = {}
                for key, value in candidate.target_udf_fields.items():
                    if updated_udf.get(key) != value:
                        mismatches[key] = {"expected": value, "actual": updated_udf.get(key)}
                if mismatches:
                    raise RuntimeError({"type": "verification_mismatch", "mismatches": mismatches})
                return {
                    "timestamp": utc_now_iso(),
                    "ticket_id": candidate.ticket_id,
                    "ok": True,
                    "reasons": candidate.reasons,
                    "target_udf_fields": candidate.target_udf_fields,
                }
            except Exception as exc:  # noqa: BLE001
                last_error = str(exc)
                if "maximum access limit" in last_error.lower():
                    time.sleep(min(15 * attempt, 90))
                else:
                    time.sleep(min(2 * attempt, 15))
            if self.args.sleep_seconds > 0:
                time.sleep(self.args.sleep_seconds)
        return {
            "timestamp": utc_now_iso(),
            "ticket_id": candidate.ticket_id,
            "ok": False,
            "reasons": candidate.reasons,
            "target_udf_fields": candidate.target_udf_fields,
            "error": last_error,
        }

    def _get_session(self) -> requests.Session:
        session = getattr(self._thread_local, "session", None)
        if session is None:
            session = requests.Session()
            session.headers.update(
                {
                    "authtoken": self.args.api_key,
                    "Accept": "application/vnd.manageengine.sdp.v3+json",
                }
            )
            self._thread_local.session = session
        return session


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--api-key", default=DEFAULT_API_KEY)
    parser.add_argument("--export-dir", type=Path, default=DEFAULT_EXPORT_DIR)
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    parser.add_argument("--timezone", default=DEFAULT_TIMEZONE)
    parser.add_argument("--sleep-seconds", type=float, default=DEFAULT_SLEEP_SECONDS)
    parser.add_argument("--max-retries", type=int, default=DEFAULT_MAX_RETRIES)
    parser.add_argument("--workers", type=int, default=DEFAULT_WORKERS)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--execute", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    writer = Writer(args.out_dir)
    planner = Planner(args.export_dir, args.timezone)
    planner.run()
    writer.write_plan(planner, args)
    if not args.execute:
        print(pretty_json({"mode": "dry-run", "counts": dict(planner.summary), "out_dir": str(args.out_dir)}))
        return 0
    executor = Executor(args, planner.candidates, writer)
    return executor.run()


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
