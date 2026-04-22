#!/usr/bin/env python3
"""Dry-run and execute high-confidence backfill for finding 14.

Scope:
  - High-confidence subject normalization only
  - Priority mismatch is reported to review output, not auto-updated

Input:
  - .tmp/exports/soc_car/summary/tickets_summary.ndjson

Output:
  - .tmp/ops/soc_car_backfill_finding_14/
"""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import re
import sys
import threading
import time
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import requests
import urllib3


urllib3.disable_warnings()


DEFAULT_BASE_URL = os.getenv("SDP_BASE_URL", "https://10.20.24.9:8050")
DEFAULT_API_KEY = os.getenv("SDP_API_KEY", "43372DE1-9F20-46C5-A981-D783246CD911")
DEFAULT_SUMMARY_PATH = Path(".tmp/exports/soc_car/summary/tickets_summary.ndjson")
DEFAULT_OUT_DIR = Path(".tmp/ops/soc_car_backfill_finding_14")
DEFAULT_WORKERS = 4
DEFAULT_SLEEP_SECONDS = 0.05
DEFAULT_MAX_RETRIES = 6

PREFIX_RE = re.compile(r"^\[(SE|SI|TI|TH|NS)\]$")
ATTACHED_PREFIX_RE = re.compile(r"^(\[(SE|SI|TI|TH|NS)\])\s+(.+)$")
UNBRACKETED_PREFIX_RE = re.compile(r"^(SE|SI|TI|TH|NS)$")
SEVERITY_TOKENS = {"Critical", "High", "Medium", "Low", "CRITICAL", "HIGH", "MEDIUM", "LOW"}


def compact_json(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))


def pretty_json(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2)


def utc_now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


@dataclass
class Candidate:
    ticket_id: str
    current_subject: str
    target_subject: str
    priority: str | None
    bucket: str
    notes: list[str]

    def to_dict(self) -> dict[str, Any]:
        return {
            "ticket_id": self.ticket_id,
            "current_subject": self.current_subject,
            "target_subject": self.target_subject,
            "priority": self.priority,
            "bucket": self.bucket,
            "notes": self.notes,
        }


class Planner:
    def __init__(self, summary_path: Path):
        self.summary_path = summary_path
        self.candidates: list[Candidate] = []
        self.review_items: list[dict[str, Any]] = []
        self.summary = Counter()
        self.samples = defaultdict(list)

    def run(self) -> None:
        with self.summary_path.open("r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                row = json.loads(line)
                self._plan_row(row)

    def _plan_row(self, row: dict[str, Any]) -> None:
        ticket_id = str(row["id"])
        subject = (row.get("subject") or "").strip()
        priority = row.get("priority")
        self.summary["tickets_total"] += 1
        if not subject:
            self._add_review(
                {
                    "ticket_id": ticket_id,
                    "reason": "empty_subject",
                    "priority": priority,
                }
            )
            return

        segs = [part.strip() for part in subject.split("|")]
        normalized: str | None = None
        bucket: str | None = None
        notes: list[str] = []

        if len(segs) == 4:
            attached = ATTACHED_PREFIX_RE.match(segs[0])
            if attached:
                prefix = attached.group(1)
                rest = attached.group(3).strip()
                normalized = " | ".join([prefix, rest, segs[1], segs[2], segs[3]])
                bucket = "subject_insert_pipe_after_prefix_4seg"
            elif PREFIX_RE.fullmatch(segs[0]):
                cleaned = " | ".join(segs)
                if cleaned != subject and "||" not in subject:
                    normalized = cleaned
                    bucket = "subject_spacing_cleanup_4seg"
        elif len(segs) == 5:
            attached = ATTACHED_PREFIX_RE.match(segs[0])
            if attached and attached.group(3).strip() == segs[1]:
                normalized = " | ".join([attached.group(1), segs[1], segs[2], segs[3], segs[4]])
                bucket = "subject_dedupe_customer_after_prefix"
            elif UNBRACKETED_PREFIX_RE.fullmatch(segs[0]):
                normalized = " | ".join([f"[{segs[0]}]", segs[1], segs[2], segs[3], segs[4]])
                bucket = "subject_wrap_prefix_5seg"
            elif PREFIX_RE.fullmatch(segs[0]):
                cleaned = " | ".join(segs)
                if cleaned != subject and "||" not in subject:
                    normalized = cleaned
                    bucket = "subject_spacing_cleanup_5seg"
        elif len(segs) == 3:
            attached = ATTACHED_PREFIX_RE.match(segs[0])
            if attached and segs[1] in SEVERITY_TOKENS:
                self._add_review(
                    {
                        "ticket_id": ticket_id,
                        "reason": "subject_insert_pipe_after_prefix_3seg_no_attack_needs_manual_review",
                        "subject": subject,
                        "priority": priority,
                        "suggested_normalization": " | ".join([attached.group(1), attached.group(3).strip(), segs[1], segs[2]]),
                    }
                )
        elif len(segs) in {1, 7}:
            self._add_review(
                {
                    "ticket_id": ticket_id,
                    "reason": f"unexpected_segment_count_{len(segs)}",
                    "subject": subject,
                    "priority": priority,
                }
            )

        if bucket and normalized and normalized != subject:
            candidate = Candidate(
                ticket_id=ticket_id,
                current_subject=subject,
                target_subject=normalized,
                priority=priority,
                bucket=bucket,
                notes=notes,
            )
            self.candidates.append(candidate)
            self.summary["candidates_total"] += 1
            self.summary[bucket] += 1
            if len(self.samples[bucket]) < 10:
                self.samples[bucket].append(candidate.to_dict())

        # Review-only priority mismatch
        severity = self._extract_subject_severity(subject)
        if severity == "Critical" and priority != "P1 - Critical":
            self._add_review(
                {
                    "ticket_id": ticket_id,
                    "reason": "priority_critical_mismatch",
                    "subject": subject,
                    "priority": priority,
                    "suggested_priority": "P1 - Critical",
                }
            )
        if severity == "Low" and priority != "P4 - Low":
            self._add_review(
                {
                    "ticket_id": ticket_id,
                    "reason": "priority_low_mismatch",
                    "subject": subject,
                    "priority": priority,
                    "suggested_priority": "P4 - Low",
                }
            )

    def _extract_subject_severity(self, subject: str) -> str | None:
        segs = [part.strip() for part in subject.split("|")]
        sev = None
        if len(segs) == 5:
            if PREFIX_RE.fullmatch(segs[0]) or ATTACHED_PREFIX_RE.match(segs[0]) or UNBRACKETED_PREFIX_RE.fullmatch(segs[0]):
                sev = segs[3]
        elif len(segs) == 4:
            if ATTACHED_PREFIX_RE.match(segs[0]) or PREFIX_RE.fullmatch(segs[0]):
                sev = segs[2]
        elif len(segs) == 3 and ATTACHED_PREFIX_RE.match(segs[0]):
            sev = segs[1]
        if sev is None:
            return None
        sev = sev.strip().title()
        return sev if sev in {"Critical", "High", "Medium", "Low"} else None

    def _add_review(self, item: dict[str, Any]) -> None:
        self.review_items.append(item)
        reason = item["reason"]
        self.summary[f"review_{reason}"] += 1
        if len(self.samples[f"review_{reason}"]) < 10:
            self.samples[f"review_{reason}"].append(item)


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
        samples_path = self.out_dir / "dry_run_samples.json"
        summary_path = self.out_dir / "dry_run_summary.json"

        self.write_ndjson(candidates_path, [item.to_dict() for item in planner.candidates])
        self.write_ndjson(review_path, planner.review_items)
        samples_path.write_text(pretty_json(planner.samples), encoding="utf-8")
        summary_path.write_text(
            pretty_json(
                {
                    "generated_at": utc_now_iso(),
                    "mode": "dry-run",
                    "base_url": args.base_url,
                    "source_summary_path": str(args.summary_path),
                    "counts": dict(planner.summary),
                    "files": {
                        "candidates": str(candidates_path),
                        "review": str(review_path),
                        "samples": str(samples_path),
                    },
                }
            ),
            encoding="utf-8",
        )

    def append_result(self, row: dict[str, Any]) -> None:
        path = self.out_dir / "execute_results.ndjson"
        with self._lock:
            with path.open("a", encoding="utf-8") as handle:
                handle.write(compact_json(row))
                handle.write("\n")

    def write_progress(self, payload: dict[str, Any]) -> None:
        with self._lock:
            (self.out_dir / "execute_progress.json").write_text(pretty_json(payload), encoding="utf-8")


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
                row = json.loads(line)
                if row.get("ok"):
                    ids.add(str(row["ticket_id"]))
        return ids

    def run(self) -> int:
        selected = self.candidates
        if self.args.limit is not None:
            selected = selected[: self.args.limit]
        selected = [item for item in selected if item.ticket_id not in self.done_ids]
        total_selected = len(selected)
        self.stats["skipped_already_done"] += (len(self.candidates[: self.args.limit] if self.args.limit is not None else self.candidates) - total_selected)

        with concurrent.futures.ThreadPoolExecutor(max_workers=self.args.workers) as pool:
            futures = {pool.submit(self._update_candidate, item): item.ticket_id for item in selected}
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
                        "workers": self.args.workers,
                        "sleep_seconds": self.args.sleep_seconds,
                        "limit": self.args.limit,
                        "processed": self.stats["processed"],
                        "updated_ok": self.stats["updated_ok"],
                        "updated_failed": self.stats["updated_failed"],
                        "skipped_already_done": self.stats["skipped_already_done"],
                        "selected_total": total_selected,
                    }
                self.writer.write_progress(snapshot)

        self.writer.write_progress(
            {
                "updated_at": utc_now_iso(),
                "base_url": self.args.base_url,
                "mode": "execute",
                "workers": self.args.workers,
                "sleep_seconds": self.args.sleep_seconds,
                "limit": self.args.limit,
                "selected_total": total_selected,
                "stats": dict(self.stats),
            }
        )
        return 0 if self.stats["updated_failed"] == 0 else 1

    def _update_candidate(self, candidate: Candidate) -> dict[str, Any]:
        session = self._get_session()
        payload = {"request": {"subject": candidate.target_subject}}
        url = f"{self.args.base_url.rstrip('/')}/api/v3/requests/{candidate.ticket_id}"
        last_error = None
        for attempt in range(1, self.args.max_retries + 1):
            try:
                response = session.put(
                    url,
                    data={"input_data": json.dumps(payload, ensure_ascii=False)},
                    verify=False,
                    timeout=45,
                )
                data = response.json()
                if response.status_code >= 400:
                    raise RuntimeError(data.get("response_status") or data)
                actual_subject = (data.get("request") or {}).get("subject")
                if actual_subject != candidate.target_subject:
                    raise RuntimeError(
                        {
                            "type": "verification_mismatch",
                            "expected": candidate.target_subject,
                            "actual": actual_subject,
                        }
                    )
                return {
                    "timestamp": utc_now_iso(),
                    "ticket_id": candidate.ticket_id,
                    "ok": True,
                    "bucket": candidate.bucket,
                    "current_subject": candidate.current_subject,
                    "target_subject": candidate.target_subject,
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
            "bucket": candidate.bucket,
            "current_subject": candidate.current_subject,
            "target_subject": candidate.target_subject,
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
    parser.add_argument("--summary-path", type=Path, default=DEFAULT_SUMMARY_PATH)
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    parser.add_argument("--workers", type=int, default=DEFAULT_WORKERS)
    parser.add_argument("--sleep-seconds", type=float, default=DEFAULT_SLEEP_SECONDS)
    parser.add_argument("--max-retries", type=int, default=DEFAULT_MAX_RETRIES)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--execute", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    writer = Writer(args.out_dir)
    planner = Planner(args.summary_path)
    planner.run()
    writer.write_plan(planner, args)
    if not args.execute:
        print(pretty_json({"mode": "dry-run", "counts": dict(planner.summary), "out_dir": str(args.out_dir)}))
        return 0
    executor = Executor(args, planner.candidates, writer)
    return executor.run()


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
