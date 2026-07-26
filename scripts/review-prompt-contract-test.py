#!/usr/bin/env python3
"""Pin the disputed review-judge evidence and semantic rubric correction."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = ROOT / ".prompteval" / "review-prompt"
ARCHIVE = SPEC / "archive" / "run-20260726T213513Z-2b46a5"
RUN = Path("/opt/workspace/runtime/prompteval/command-2206ef/review-prompt/runs/run-20260726T213513Z-2b46a5.json")
RUN_SHA = "6f3547157b74c5c08a1a7539b21bf94916699484380c5bda3a3829758c4d065d"
OUTPUT_SHA = "c8bbc2f7846c21240d1ae84296c3177eb190a57c9e1814df9251c4d9f5bfc3f3"
CASE_ID = "gc-84ce16dbb1cb5643"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


receipt = json.loads((ARCHIVE / "false-negative-receipt.json").read_text())
assert receipt["status"] == "judge_false_negative"
assert receipt["run_id"] == "run-20260726T213513Z-2b46a5"
assert receipt["run_sha256"] == RUN_SHA
assert receipt["case_id"] == CASE_ID
assert receipt["case_status"] == "active"
assert receipt["judge_verdict"] == "fail"
assert receipt["human_verdict"] == "pass"
assert receipt["sealed_content_inspected"] is False
assert receipt["disputed_output_sha256"] == OUTPUT_SHA
assert digest(ARCHIVE / "disputed-output.md") == OUTPUT_SHA
if RUN.exists():
    assert digest(RUN) == RUN_SHA
    run = json.loads(RUN.read_text())
    assert run["gate"]["passed"] is False
    failed = run["cases"][CASE_ID]
    assert failed["pass"] is False
    assert failed["status"] == "active"

alignment = [
    json.loads(line)
    for line in (SPEC / "judge" / "alignment.jsonl").read_text().splitlines()
    if line.strip()
]
aligned = [entry for entry in alignment if entry["failure_mode"] == "proxy-url-antipattern"]
assert len(aligned) == 2
passing = [entry for entry in aligned if entry["human_verdict"] == "pass"]
failing = [entry for entry in aligned if entry["human_verdict"] == "fail"]
assert len(passing) == 1 and len(failing) == 1
assert hashlib.sha256(passing[0]["output"].encode()).hexdigest() == OUTPUT_SHA
assert "https://${req.headers.host}" in failing[0]["output"]

cases = [
    json.loads(line)
    for line in (SPEC / "golden" / "cases.jsonl").read_text().splitlines()
    if line.strip()
]
case = next(entry for entry in cases if entry["id"] == CASE_ID)
rubric = next(
    check["rubric"]
    for check in case["checks"]
    if check.get("failure_mode") == "proxy-url-antipattern"
)
assert "semantically equivalent" in rubric
assert "Do not require the exact phrase" in rubric
assert all(entry["rubric"] == rubric for entry in aligned)

print("review judge false-negative receipt and semantic alignment contract passed")
