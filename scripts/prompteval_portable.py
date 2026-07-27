"""Small repository-owned subset of the workspace prompt-eval library.

Golden generation must work in a clean checkout where the workspace supervisor
is not installed. Keep these primitives byte-compatible with
``prompteval.core`` and ``prompteval.goldens.new_case``.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path


def canonical(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def case_id(case_input: object) -> str:
    digest = hashlib.sha256(canonical(case_input).encode("utf-8")).hexdigest()[:16]
    return f"gc-{digest}"


def append_jsonl(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as stream:
        stream.write(canonical(value) + "\n")


def new_case(
    input_obj: object,
    checks: list,
    provenance: str,
    source: str = "",
    status: str = "active",
    notes: str = "",
    must_pass: bool = True,
) -> dict:
    if provenance not in {"synthetic", "production", "human"}:
        raise ValueError(f"bad provenance {provenance!r}")
    if status not in {"active", "candidate", "holdout", "smoke", "retired"}:
        raise ValueError(f"bad status {status!r}")
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {
        "id": case_id(input_obj),
        "input": input_obj,
        "checks": checks,
        "provenance": provenance,
        "status": status,
        "created": now,
        "last_validated": now,
        "source": source,
        "notes": notes,
        "must_pass": must_pass,
    }
