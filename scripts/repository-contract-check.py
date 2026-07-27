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
    search = subprocess.run(
        ["rg", "--files", "--hidden", str(ROOT)],
        check=False,
        text=True,
        capture_output=True,
    )
    if search.returncode not in (0, 1):
        errors.append(f"ripgrep sealed-search regression failed with exit {search.returncode}")
    else:
        exposed = [
            path
            for path in search.stdout.splitlines()
            if (
                path.endswith("/golden/holdout.jsonl")
                or (
                    "/archive/" in path
                    and (path.endswith(".jsonl") or path.endswith("/failed-run.json"))
                )
            )
        ]
        if exposed:
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
