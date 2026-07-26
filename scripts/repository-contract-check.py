#!/usr/bin/env python3
"""Portable ADR-0050 front-door check used locally and in GitHub Actions."""

from __future__ import annotations

import subprocess
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = ("README.md", "repo.toml", "Makefile", "AGENTS.md", "CLAUDE.md", "docs/architecture.md")
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
