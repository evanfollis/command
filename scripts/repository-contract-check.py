#!/usr/bin/env python3
"""Portable ADR-0050 front-door check used locally and in GitHub Actions."""

from __future__ import annotations

import json
import subprocess
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = (
    "README.md",
    "repo.toml",
    "Makefile",
    "AGENTS.md",
    "CLAUDE.md",
    ".ignore",
    ".verification/test-collection.json",
    "docs/architecture.md",
)
ALLOWED = {
    "shape": {"service", "application", "library", "monorepo", "contract", "context", "control-plane", "profile"},
    "lifecycle": {"active", "maintained", "case-study", "archived"},
    "agentic_risk": {"none", "model-assisted", "agentic"},
}

errors: list[str] = []
for relative in REQUIRED:
    if not (ROOT / relative).exists():
        errors.append(f"required path missing: {relative}")

try:
    with (ROOT / "repo.toml").open("rb") as handle:
        declaration = tomllib.load(handle)
except (OSError, tomllib.TOMLDecodeError) as error:
    errors.append(f"repo.toml invalid: {error}")
    declaration = {}

if declaration.get("schema_version") != 1:
    errors.append("repo.toml schema_version must be 1")
if declaration.get("name") != "command":
    errors.append("repo.toml name must be command")
for key, allowed in ALLOWED.items():
    if declaration.get(key) not in allowed:
        errors.append(f"repo.toml {key} must be one of {sorted(allowed)}")
if declaration.get("canonical_repository") != "https://github.com/evanfollis/command":
    errors.append("canonical_repository does not match the public repository")

try:
    witness = json.loads(
        (ROOT / ".verification" / "test-collection.json").read_text(encoding="utf-8")
    )
    collectors = witness.get("collectors", [])
    if witness.get("schema_version") != 1 or not collectors:
        errors.append("test-collection witness must declare schema-v1 collectors")
    else:
        for collector in collectors:
            expected = collector.get("files", [])
            discovered = sorted(
                {
                    path.relative_to(ROOT).as_posix()
                    for pattern in collector.get("include", [])
                    for root in collector.get("roots", [])
                    for path in (ROOT / root).rglob(pattern)
                    if path.is_file() and not path.is_symlink()
                }
            )
            if collector.get("mode") != "files" or expected != discovered:
                errors.append(
                    f"test-collection witness differs for {collector.get('id', 'unknown')}"
                )
except (OSError, json.JSONDecodeError, AttributeError, TypeError) as error:
    errors.append(f"test-collection witness invalid: {error}")

baseline_keys = {
    "accepted_from_cache",
    "advisory_cases",
    "aggregate",
    "all_cases_passed",
    "all_pass_streak",
    "cases",
    "gate",
    "gate_policy",
    "golden_hash",
    "judge_model",
    "judge_unknown_ratio",
    "model",
    "params",
    "passed",
    "prompt_version",
    "provider_provenance",
    "release",
    "required_aggregate",
    "required_cases",
    "run_id",
    "spec_hash",
    "ts",
}
payload_keys = {"input", "output", "checks", "rubric", "detail", "trial_results"}


def nested_payload_keys(value: object) -> set[str]:
    found: set[str] = set()
    if isinstance(value, dict):
        for key, child in value.items():
            if key in payload_keys:
                found.add(key)
            found |= nested_payload_keys(child)
    elif isinstance(value, list):
        for child in value:
            found |= nested_payload_keys(child)
    return found


for baseline_path in sorted((ROOT / ".prompteval").glob("*/baseline.json")):
    try:
        baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
        if set(baseline) != baseline_keys:
            errors.append(f"{baseline_path.relative_to(ROOT)} has an unapproved baseline schema")
        if nested_payload_keys(baseline):
            errors.append(f"{baseline_path.relative_to(ROOT)} contains case payload keys")
        cases = baseline.get("cases", {})
        if not isinstance(cases, dict) or any(
            not isinstance(result, dict) or set(result) != {"must_pass", "pass"}
            for result in cases.values()
        ):
            errors.append(f"{baseline_path.relative_to(ROOT)} cases are not payload-free pass summaries")
    except (OSError, json.JSONDecodeError, AttributeError, TypeError) as error:
        errors.append(f"{baseline_path.relative_to(ROOT)} baseline safety check failed: {error}")

sealed_search_rules = {
    ".prompteval/**/golden/holdout.jsonl",
    ".prompteval/**/archive/**/*.jsonl",
    ".prompteval/**/archive/**/failed-run.json",
}
try:
    ignore_lines = {
        line.strip()
        for line in (ROOT / ".ignore").read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    }
except OSError as error:
    errors.append(f".ignore could not be read: {error}")
    ignore_lines = set()
if not sealed_search_rules <= ignore_lines:
    errors.append(".ignore must exclude sealed and raw eval payloads from broad repository search")
else:
    unignored = subprocess.run(
        ["rg", "--no-ignore", "--files", "--hidden", str(ROOT / ".prompteval")],
        check=False,
        text=True,
        capture_output=True,
    )
    search = subprocess.run(
        ["rg", "--files", "--hidden", str(ROOT)],
        check=False,
        text=True,
        capture_output=True,
    )
    if unignored.returncode not in (0, 1):
        errors.append(f"ripgrep raw eval inventory failed with exit {unignored.returncode}")
    elif search.returncode not in (0, 1):
        errors.append(f"ripgrep sealed-search regression failed with exit {search.returncode}")
    else:
        protected = {
            path
            for path in unignored.stdout.splitlines()
            if (
                path.endswith("/golden/holdout.jsonl")
                or (
                    "/archive/" in path
                    and (path.endswith(".jsonl") or path.endswith("/failed-run.json"))
                )
            )
        }
        visible = set(search.stdout.splitlines())
        if protected & visible:
            errors.append("default broad repository search exposes sealed or raw eval payloads")

for role in ("generated", "runtime"):
    for relative in declaration.get("artifacts", {}).get(role, []):
        ignored = subprocess.run(
            ["git", "-C", str(ROOT), "check-ignore", "--quiet", "--", relative],
            check=False,
        ).returncode == 0
        if not ignored:
            errors.append(f"artifacts.{role} path is not gitignored: {relative}")

if errors:
    for error in errors:
        print(f"FAIL: {error}", file=sys.stderr)
    raise SystemExit(1)
print("repository-contract: command front doors and declaration passed")
