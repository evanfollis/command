#!/usr/bin/env python3
"""Print an allowlisted prompt-evaluation run summary without case payloads."""

from __future__ import annotations

import argparse
import json
import os
import stat
import sys
from pathlib import Path
from typing import Any


MAX_RUN_BYTES = 32 * 1024 * 1024
TOP_LEVEL_FIELDS = (
    "run_id", "ts", "prompt_id", "project", "prompt_version", "spec_hash",
    "golden_hash", "model", "judge_model", "release", "trials",
    "cached_allowed", "aggregate", "required_aggregate", "judge_unknown_ratio",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run", type=Path, help="prompt-evaluation run JSON")
    return parser.parse_args()


def read_bounded_json(path: Path) -> dict[str, Any]:
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(path, flags)
    try:
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode):
            raise ValueError("run evidence is not a regular file")
        if before.st_size > MAX_RUN_BYTES:
            raise ValueError(f"run evidence exceeds {MAX_RUN_BYTES} bytes")
        chunks: list[bytes] = []
        remaining = MAX_RUN_BYTES + 1
        while remaining:
            chunk = os.read(descriptor, min(1024 * 1024, remaining))
            if not chunk:
                break
            chunks.append(chunk)
            remaining -= len(chunk)
        if remaining == 0:
            raise ValueError(f"run evidence exceeds {MAX_RUN_BYTES} bytes")
        after = os.fstat(descriptor)
        if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) != (
            after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns,
        ):
            raise ValueError("run evidence changed during read")
    finally:
        os.close(descriptor)
    value = json.loads(b"".join(chunks))
    if not isinstance(value, dict):
        raise ValueError("run evidence must contain a JSON object")
    return value


def summarize(run: dict[str, Any]) -> dict[str, Any]:
    cases = run.get("cases")
    if not isinstance(cases, dict):
        cases = {}
    status_counts: dict[str, dict[str, int]] = {}
    for result in cases.values():
        if not isinstance(result, dict):
            continue
        status = result.get("status")
        label = status if isinstance(status, str) and status else "unknown"
        counts = status_counts.setdefault(label, {"total": 0, "passed": 0, "failed": 0})
        counts["total"] += 1
        if result.get("pass") is True:
            counts["passed"] += 1
        else:
            counts["failed"] += 1

    gate = run.get("gate")
    safe_gate = {
        "passed": gate.get("passed") if isinstance(gate, dict) else None,
        "reason_count": len(gate.get("reasons", []))
        if isinstance(gate, dict) and isinstance(gate.get("reasons"), list)
        else 0,
    }
    provenance = run.get("provider_provenance")
    safe_provenance = {
        "schema_version": provenance.get("schema_version"),
        "providers": provenance.get("providers"),
        "successful_calls": provenance.get("successful_calls"),
        "fallback_successes": provenance.get("fallback_successes"),
    } if isinstance(provenance, dict) else None

    return {
        "schema_version": "command.prompteval-safe-metadata.v1",
        **{field: run.get(field) for field in TOP_LEVEL_FIELDS},
        "case_counts": status_counts,
        "gate": safe_gate,
        "provider_provenance": safe_provenance,
    }


def main() -> int:
    args = parse_args()
    try:
        run = read_bounded_json(args.run)
        print(json.dumps(summarize(run), indent=2, sort_keys=True))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
        print(f"safe metadata read failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
