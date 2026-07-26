#!/usr/bin/env python3
"""Pin the first instruction-eval failure without loading sealed definitions."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = ROOT / ".prompteval" / "repository-instructions"
ARCHIVE = SPEC / "archive" / "run-20260726T212423Z-36e52c"
RUN = Path("/opt/workspace/runtime/prompteval/command-2206ef/repository-instructions/runs/run-20260726T212423Z-36e52c.json")
RUN_SHA = "90b87b5636233927f4861bfd40cfaf9129d5e2851beb1acb5df7fd58df66c63e"
ACTIVE_FAILURES = {
    "gc-989ea1214cab587e",
    "gc-914345a7c1daafdc",
    "gc-feac3474e6728d14",
}
SECOND_RUN = Path("/opt/workspace/runtime/prompteval/command-2206ef/repository-instructions/runs/run-20260726T215706Z-a77843.json")
SECOND_RUN_SHA = "8855d65d05d3b15507fb704019558d2e3340226fc9aba82a7094050c68120b05"
DISPUTED_OUTPUT_SHA = "a285bc287d2b01d969c34e433ab79a7ae349c930a3e48b0ebb2dbf5e66b70d56"
BURNED_ID = "gc-65f9dcbe719f2dc3"
BURNED_RECORD_SHA = "6f775a093bfe0d1224253d357210c3a013f8fdb26742da0fa130b20ed1186dbb"
BURNED_CONTRACT_SHA = "7259539f8962446557ee1f5b504b7e9e78e24b68379451e684872ac3ca8f3d84"
FINAL_ACTIVE_SHA = "58a7c25e977d2c76d2d1cec0a3e4d62f2e1a92b597246a6983cf7c0511650bbf"
FINAL_HOLDOUT_SHA = "53a24904904614d449dc7091421612c683508f59db27ad936e5063af603aa8f6"
REPLACEMENT_ID = "gc-72f8009f04b083dc"
REPLACEMENT_RECORD_SHA = "ca48d1f6bd407071f6d98e2154af6f57166a96de78f8b0b2f85066d95e62c0da"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


receipt = json.loads((ARCHIVE / "failed-run-receipt.json").read_text())
assert receipt["status"] == "failed_prebaseline_release_run"
assert receipt["run_sha256"] == RUN_SHA
assert set(receipt["active_failure_ids"]) == ACTIVE_FAILURES
assert receipt["sealed_failure_count"] == 1
assert receipt["active_outputs_inspected"] is True
assert receipt["sealed_content_inspected"] is False
if RUN.exists():
    assert digest(RUN) == RUN_SHA
    run = json.loads(RUN.read_text())
    assert run["gate"]["passed"] is False
    assert all(run["cases"][case_id]["status"] == "active" for case_id in ACTIVE_FAILURES)

second_archive = SPEC / "archive" / "run-20260726T215706Z-a77843"
second_receipt = json.loads((second_archive / "failed-run-receipt.json").read_text())
assert second_receipt["status"] == "failed_prebaseline_release_run"
assert second_receipt["run_sha256"] == SECOND_RUN_SHA
assert set(second_receipt["active_failure_ids"]) == {
    "gc-25c6094b0272658c",
    "gc-989ea1214cab587e",
}
assert second_receipt["sealed_failure_count"] == 1
assert second_receipt["sealed_content_inspected"] is False
assert second_receipt["disputed_output_sha256"] == DISPUTED_OUTPUT_SHA
assert digest(second_archive / "disputed-operator-output.md") == DISPUTED_OUTPUT_SHA
if SECOND_RUN.exists():
    assert digest(SECOND_RUN) == SECOND_RUN_SHA
    assert json.loads(SECOND_RUN.read_text())["gate"]["passed"] is False

agents = (ROOT / "AGENTS.md").read_text()
assert "smallest deterministic\nregression in the same change" in agents
assert "tool-free or read-only handoff" in agents
assert "build with injected canary values" in agents
assert "tool-free decision probe" in agents

cases = {
    case["id"]: case
    for line in (SPEC / "golden" / "cases.jsonl").read_text().splitlines()
    if (case := json.loads(line))
}
for case_id in ACTIVE_FAILURES:
    rubrics = " ".join(check.get("rubric", "") for check in cases[case_id]["checks"])
    assert "regression" in rubrics

alignment = [
    json.loads(line)
    for line in (SPEC / "judge" / "alignment.jsonl").read_text().splitlines()
    if line.strip()
]
operator_alignment = [
    entry for entry in alignment if entry["failure_mode"] == "operator-capability-admitted"
]
assert {entry["human_verdict"] for entry in operator_alignment} == {"pass", "fail"}
passing = next(entry for entry in operator_alignment if entry["human_verdict"] == "pass")
assert hashlib.sha256(passing["output"].encode()).hexdigest() == DISPUTED_OUTPUT_SHA
operator_rubric = next(
    check["rubric"]
    for check in cases["gc-25c6094b0272658c"]["checks"]
    if check.get("failure_mode") == "operator-capability-admitted"
)
assert all(entry["rubric"] == operator_rubric for entry in operator_alignment)

burn_archive = SPEC / "archive" / "run-20260726T223101Z-3abbda"
burn_receipt = json.loads((burn_archive / "burn-receipt.json").read_text())
assert burn_receipt["status"] == "burned_and_promoted_active"
assert burn_receipt["run_sha256"] == "6b7647d246cc76a2cf052fca41206dfba461c93a3c6cc89bb658eb6bf6c7c1af"
assert burn_receipt["failed_sealed_case"] == {
    "case_id": BURNED_ID,
    "record_sha256": BURNED_RECORD_SHA,
    "input_checks_sha256": BURNED_CONTRACT_SHA,
}
assert burn_receipt["sealed_content_inspected_before_promotion"] is False
assert digest(burn_archive / "burned-case.jsonl") == BURNED_RECORD_SHA
assert burn_receipt["final_active_sha256"] == FINAL_ACTIVE_SHA
assert burn_receipt["final_holdout_sha256"] == FINAL_HOLDOUT_SHA
assert burn_receipt["replacement"]["case_id"] == REPLACEMENT_ID
assert burn_receipt["replacement"]["record_sha256"] == REPLACEMENT_RECORD_SHA
assert burn_receipt["replacement"]["status"] == "holdout"
assert burn_receipt["replacement_content_inspected_after_sealing"] is False
assert burn_receipt["prompt_changed_after_replacement_sealing"] is False

assert digest(SPEC / "golden" / "cases.jsonl") == FINAL_ACTIVE_SHA
assert digest(SPEC / "golden" / "holdout.jsonl") == FINAL_HOLDOUT_SHA
assert cases[BURNED_ID]["status"] == "active"
assert cases[BURNED_ID]["provenance"] == "production"
holdout_lines = (SPEC / "golden" / "holdout.jsonl").read_bytes().splitlines(keepends=True)
holdout_hashes = {
    json.loads(line)["id"]: hashlib.sha256(line).hexdigest()
    for line in holdout_lines
}
assert BURNED_ID not in holdout_hashes
assert holdout_hashes[REPLACEMENT_ID] == REPLACEMENT_RECORD_SHA

print("repository instruction failure receipt and bounded-regression contract passed")
