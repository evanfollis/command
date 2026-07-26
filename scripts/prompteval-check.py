#!/usr/bin/env python3
"""Portable fail-closed prompt baseline drift check.

The full runner lives in the workspace supervisor. This repository-owned gate
reproduces the accepted prompt/spec/golden identity checks so a clean GitHub
checkout can run `make check` without host-only tooling.
"""

from __future__ import annotations

import hashlib
import json
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

if errors:
    for error in errors:
        print(f"FAIL: {error}", file=sys.stderr)
    raise SystemExit(1)
print(f"prompteval portable check passed ({len(spec_ids)} governed prompts)")
