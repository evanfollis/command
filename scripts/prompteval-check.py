#!/usr/bin/env python3
"""Portable fail-closed prompt baseline drift check.

The full runner lives in the workspace supervisor. This repository-owned gate
reproduces the accepted prompt/spec/golden identity checks so a clean GitHub
checkout can run `make check` without host-only tooling.
"""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / ".prompteval"


def canonical(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def digest(value: object) -> str:
    return hashlib.sha256(canonical(value).encode()).hexdigest()[:16]


def read_json(path: Path) -> dict:
    return json.loads(path.read_text())


def read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def prompt_version(spec: dict) -> str:
    source = spec["source"]
    if source.get("type") != "whole_file":
        raise ValueError(f"portable checker requires whole_file source: {source}")
    text = (ROOT / source["file"]).read_text()
    return "pv-" + digest({"t": text, "m": spec.get("model", ""), "p": spec.get("params", {})})


def spec_hash(spec: dict) -> str:
    executor = spec.get("executor") or {}
    argv_files: dict[str, str] = {}
    for argument in executor.get("argv", []):
        path = Path(argument)
        path = path if path.is_absolute() else ROOT / path
        if path.is_file():
            argv_files[argument] = digest(path.read_text())
    dep_files: dict[str, str] = {}
    for relative in executor.get("deps", []):
        path = Path(relative)
        path = path if path.is_absolute() else ROOT / path
        dep_files[relative] = digest(path.read_text()) if path.is_file() else "missing"
    return "sh-" + digest({
        "source": spec.get("source"),
        "executor": executor,
        "argv_files": argv_files,
        "dep_files": dep_files,
        "judge": spec.get("judge"),
        "gate": spec.get("gate"),
    })


def golden_hash(spec_dir: Path, gate: dict) -> str:
    cases = read_jsonl(spec_dir / "golden" / "cases.jsonl")
    cases += read_jsonl(spec_dir / "golden" / "holdout.jsonl")
    material = sorted(
        canonical({
            "id": case.get("id"),
            "checks": case.get("checks"),
            "status": case.get("status"),
            "must_pass": case.get("must_pass", True),
            "provenance": case.get("provenance"),
        })
        for case in cases
        if case.get("status") != "retired"
    )
    return "gh-" + digest({"cases": material, "gate": gate})


inventory = read_json(REGISTRY / "inventory.json")
errors: list[str] = []
if inventory.get("enforce") is not True:
    errors.append("prompt inventory enforcement is disabled")
governed = {
    item["id"]: item["file"]
    for item in inventory.get("prompts", [])
    if item.get("status") == "governed" and item.get("id")
}
spec_ids = {path.parent.name for path in REGISTRY.glob("*/spec.json")}
if set(governed) != spec_ids:
    errors.append(f"governed inventory/spec mismatch: inventory={sorted(governed)} specs={sorted(spec_ids)}")

identity_by_prompt: dict[str, dict[str, object]] = {}
for prompt_id in sorted(spec_ids):
    spec_dir = REGISTRY / prompt_id
    spec = read_json(spec_dir / "spec.json")
    baseline_path = spec_dir / "baseline.json"
    if baseline_path.exists():
        baseline = read_json(baseline_path)
        identity_by_prompt[prompt_id] = {
            "run_id": baseline.get("run_id"),
            "prompt_version": prompt_version(spec),
            "spec_hash": spec_hash(spec),
            "golden_hash": golden_hash(spec_dir, spec.get("gate", {})),
        }

for prompt_id in sorted(spec_ids):
    spec_dir = REGISTRY / prompt_id
    spec = read_json(spec_dir / "spec.json")
    baseline_path = spec_dir / "baseline.json"
    if not baseline_path.exists():
        errors.append(f"{prompt_id}: accepted baseline is missing")
        continue
    baseline = read_json(baseline_path)
    expected = {
        "prompt_version": prompt_version(spec),
        "spec_hash": spec_hash(spec),
        "golden_hash": golden_hash(spec_dir, spec.get("gate", {})),
    }
    for key, value in expected.items():
        if baseline.get(key) != value:
            errors.append(f"{prompt_id}: {key} drifted from accepted baseline")
    if baseline.get("passed") is not True or baseline.get("release") is not True:
        errors.append(f"{prompt_id}: baseline is not a passing release run")
    if baseline.get("accepted_from_cache") is not False:
        errors.append(f"{prompt_id}: baseline was accepted from cache")
    if baseline.get("gate", {}).get("passed") is not True:
        errors.append(f"{prompt_id}: baseline gate did not pass")
    if prompt_id == "codex-task-prompt":
        cases = baseline.get("cases")
        if not isinstance(cases, dict) or len(cases) != 18:
            errors.append(f"{prompt_id}: release baseline must contain exactly 18 cases")
        elif any(result.get("pass") is not True for result in cases.values()):
            errors.append(f"{prompt_id}: every release baseline case must pass")
        if baseline.get("all_cases_passed") is not True:
            errors.append(f"{prompt_id}: release baseline is not all-case green")
        if baseline.get("judge_unknown_ratio") != 0:
            errors.append(f"{prompt_id}: release baseline contains unknown judge checks")
        provider = baseline.get("provider_provenance") or {}
        if provider.get("providers") != ["claude"]:
            errors.append(f"{prompt_id}: Claude is not the sole successful provider")
        if provider.get("fallback_successes") != 0:
            errors.append(f"{prompt_id}: fallback-provider success is forbidden")
        routes = provider.get("routes") if isinstance(provider.get("routes"), list) else []
        executor_success = sum(
            route.get("calls", 0)
            for route in routes
            if route.get("role") == "executor-adapter"
            and route.get("provider") == "claude"
            and route.get("status") == "success"
        )
        judge_success = sum(
            route.get("calls", 0)
            for route in routes
            if route.get("role") == "judge"
            and route.get("provider") == "claude"
            and route.get("status") == "success"
        )
        if executor_success < 18:
            errors.append(f"{prompt_id}: release baseline lacks Claude executor coverage")
        if judge_success < 54:
            errors.append(f"{prompt_id}: release baseline lacks minimum Claude judge coverage")
        receipt_path = spec_dir / "source-revision.json"
        if not receipt_path.exists():
            errors.append(f"{prompt_id}: stable source-revision receipt is missing")
            continue
        receipt = read_json(receipt_path)
        expected_receipt = {
            "schema_version": "command.prompteval-source-revision.v1",
            "status": "passed_from_stable_clean_revision",
            "evaluation_profile": "authoritative-claude-only",
            "prompt_id": prompt_id,
            "run_id": baseline.get("run_id"),
            "worktree_clean_at_start": True,
            "source_drift_detected": False,
            "release": True,
            "accepted_from_cache": False,
            "gate_passed": True,
            "harness_revision": "c642f112b6b87d5c5965aa00aef9ffa1fc5e154f",
            "harness_library_tree": "c435eccb82b4baff4f3efc87a22eacf3e1699bb8",
            "harness_entry_blob": "5606220807dc51c6c84be92afe7f2de3c3acc302",
            "expected_release_cases": 18,
            "baseline_sha256": hashlib.sha256(baseline_path.read_bytes()).hexdigest(),
            "release_contract_status": "passed",
            **expected,
            "governed_prompts": identity_by_prompt,
        }
        for key, value in expected_receipt.items():
            if receipt.get(key) != value:
                errors.append(f"{prompt_id}: source-revision {key} does not match accepted evidence")
        for key in ("raw_report_sha256", "attempt_log_sha256"):
            if not isinstance(receipt.get(key), str) or not re.fullmatch(
                r"[a-f0-9]{64}", receipt[key]
            ):
                errors.append(f"{prompt_id}: source-revision {key} is invalid")
        source_commit = receipt.get("source_commit")
        source_tree = receipt.get("source_tree")
        if not isinstance(source_commit, str) or not re.fullmatch(r"[a-f0-9]{40}", source_commit):
            errors.append(f"{prompt_id}: source-revision commit is invalid")
        elif not isinstance(source_tree, str) or not re.fullmatch(r"[a-f0-9]{40}", source_tree):
            errors.append(f"{prompt_id}: source-revision tree is invalid")
        else:
            resolved_tree = subprocess.run(
                ["git", "rev-parse", f"{source_commit}^{{tree}}"],
                cwd=ROOT,
                text=True,
                capture_output=True,
                check=False,
            )
            if resolved_tree.returncode == 0 and resolved_tree.stdout.strip() != source_tree:
                errors.append(f"{prompt_id}: source-revision commit/tree provenance is invalid")
            # A shallow source archive may not contain the evidence parent.
            # In that case the recomputed prompt/spec/executor/golden digests
            # above are the portable provenance check.
            # Current prompt, spec, executor-dependency, and golden bytes are
            # already recomputed above and matched to the receipt. Do not diff
            # unrelated repository or PR-merge-ref history: the evaluated
            # commit necessarily precedes the evidence-only receipt commit.

if errors:
    for error in errors:
        print(f"FAIL: {error}", file=sys.stderr)
    raise SystemExit(1)
print(f"prompteval portable check passed ({len(spec_ids)} governed prompts)")
