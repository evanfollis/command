#!/usr/bin/env python3
"""Fail-closed executable contract for Command's authoritative release eval."""

from __future__ import annotations

import hashlib
import os
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Tool:
    name: str
    entry_path: Path
    sha256: str
    resolve_from_path: bool = True


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_toolchain(path_value: str, tools: tuple[Tool, ...]) -> list[str]:
    errors: list[str] = []
    for tool in tools:
        entry_path = tool.entry_path
        if tool.resolve_from_path:
            discovered = shutil.which(tool.name, path=path_value)
            if discovered is None:
                errors.append(f"{tool.name}: executable is missing from the pinned PATH")
                continue
            discovered_path = Path(discovered)
            if discovered_path != entry_path:
                errors.append(
                    f"{tool.name}: resolved entry {discovered_path} != {entry_path}"
                )
                continue
        try:
            resolved = entry_path.resolve(strict=True)
        except FileNotFoundError:
            errors.append(f"{tool.name}: entry path does not exist: {entry_path}")
            continue
        if not resolved.is_file() or not os.access(resolved, os.X_OK):
            errors.append(f"{tool.name}: resolved path is not executable: {resolved}")
            continue
        actual_sha256 = file_sha256(resolved)
        if actual_sha256 != tool.sha256:
            errors.append(
                f"{tool.name}: sha256 {actual_sha256} != reviewed {tool.sha256}"
            )
    return errors


def main(argv: list[str]) -> int:
    if len(argv) != 10:
        raise SystemExit(
            "usage: prompteval_toolchain_contract.py PATH "
            "PYTHON_PATH PYTHON_SHA CLAUDE_PATH CLAUDE_SHA "
            "NODE_PATH NODE_SHA NPX_PATH NPX_SHA"
        )
    path_value = argv[1]
    tools = (
        Tool("python3", Path(argv[2]), argv[3]),
        Tool("claude", Path(argv[4]), argv[5]),
        Tool("node", Path(argv[6]), argv[7]),
        Tool("npx", Path(argv[8]), argv[9]),
    )
    errors = verify_toolchain(path_value, tools)
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
