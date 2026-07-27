#!/usr/bin/env python3
"""Build an atomic source/evidence receipt from a validated release binding."""

from __future__ import annotations

import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path


def write_source_receipt(
    *,
    root: Path,
    prompt_id: str,
    receipt_path: Path,
    source_commit: str,
    source_tree: str,
    started_at: str,
    profile: str,
    harness_revision: str,
    harness_library_tree: str,
    harness_entry_blob: str,
    expected_cases: int,
    binding_path: Path | None,
) -> dict:
    baseline_path = root / ".prompteval" / prompt_id / "baseline.json"
    baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
    if profile == "authoritative-claude-only":
        if binding_path is None:
            raise ValueError("authoritative receipt requires a validated binding")
        binding = json.loads(binding_path.read_text(encoding="utf-8"))
        expected_binding = {
            "schema_version": "command.prompteval-release-binding.v1",
            "status": "passed",
            "run_id": baseline["run_id"],
            "baseline_sha256": hashlib.sha256(baseline_path.read_bytes()).hexdigest(),
        }
        for key, value in expected_binding.items():
            if binding.get(key) != value:
                raise ValueError(f"release binding {key} does not match accepted evidence")
        for key in ("raw_report_sha256", "attempt_log_sha256"):
            value = binding.get(key)
            if not isinstance(value, str) or len(value) != 64:
                raise ValueError(f"release binding {key} is invalid")
    elif profile == "test-only":
        binding = {
            "baseline_sha256": hashlib.sha256(baseline_path.read_bytes()).hexdigest(),
            "raw_report_sha256": None,
            "attempt_log_sha256": None,
        }
    else:
        raise ValueError(f"unsupported evaluation profile: {profile}")

    governed_prompts = {}
    for spec_path in sorted((root / ".prompteval").glob("*/spec.json")):
        governed_baseline = json.loads(
            (spec_path.parent / "baseline.json").read_text(encoding="utf-8")
        )
        governed_prompts[spec_path.parent.name] = {
            "run_id": governed_baseline["run_id"],
            "prompt_version": governed_baseline["prompt_version"],
            "spec_hash": governed_baseline["spec_hash"],
            "golden_hash": governed_baseline["golden_hash"],
        }
    receipt = {
        "schema_version": "command.prompteval-source-revision.v1",
        "status": "passed_from_stable_clean_revision",
        "evaluation_profile": profile,
        "prompt_id": prompt_id,
        "run_id": baseline["run_id"],
        "source_commit": source_commit,
        "source_tree": source_tree,
        "worktree_clean_at_start": True,
        "source_drift_detected": False,
        "started_at": started_at,
        "completed_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "release": baseline["release"],
        "accepted_from_cache": baseline["accepted_from_cache"],
        "gate_passed": baseline["gate"]["passed"],
        "prompt_version": baseline["prompt_version"],
        "spec_hash": baseline["spec_hash"],
        "golden_hash": baseline["golden_hash"],
        "harness_revision": harness_revision,
        "harness_library_tree": harness_library_tree,
        "harness_entry_blob": harness_entry_blob,
        "expected_release_cases": expected_cases,
        "baseline_sha256": binding["baseline_sha256"],
        "raw_report_sha256": binding["raw_report_sha256"],
        "attempt_log_sha256": binding["attempt_log_sha256"],
        "release_contract_status": (
            "passed" if profile == "authoritative-claude-only" else "test-only"
        ),
        "governed_prompts": governed_prompts,
    }
    receipt_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = receipt_path.with_name(receipt_path.name + ".tmp")
    temporary.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    temporary.chmod(0o644)
    os.replace(temporary, receipt_path)
    return receipt


def main() -> int:
    if len(sys.argv) != 13:
        print(
            "usage: prompteval_source_receipt.py ROOT PROMPT_ID RECEIPT "
            "SOURCE_COMMIT SOURCE_TREE STARTED_AT PROFILE HARNESS_REVISION "
            "HARNESS_LIBRARY_TREE HARNESS_ENTRY_BLOB EXPECTED_CASES BINDING_OR_DASH",
            file=sys.stderr,
        )
        return 2
    binding_path = None if sys.argv[12] == "-" else Path(sys.argv[12])
    write_source_receipt(
        root=Path(sys.argv[1]),
        prompt_id=sys.argv[2],
        receipt_path=Path(sys.argv[3]),
        source_commit=sys.argv[4],
        source_tree=sys.argv[5],
        started_at=sys.argv[6],
        profile=sys.argv[7],
        harness_revision=sys.argv[8],
        harness_library_tree=sys.argv[9],
        harness_entry_blob=sys.argv[10],
        expected_cases=int(sys.argv[11]),
        binding_path=binding_path,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
