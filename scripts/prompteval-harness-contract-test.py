#!/usr/bin/env python3
"""Regression for immutable harness materialization from a moving repository."""

from __future__ import annotations

import shutil
import stat
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from prompteval_harness import HarnessError, materialize  # noqa: E402

if not __debug__:
    raise SystemExit("prompteval harness contract requires assertions enabled")


def run(*arguments: str, cwd: Path) -> str:
    return subprocess.run(
        list(arguments), cwd=cwd, check=True, capture_output=True, text=True
    ).stdout.strip()


with TemporaryDirectory(prefix="command-harness-source-") as source_directory, TemporaryDirectory(
    prefix="command-harness-output-"
) as output_directory:
    source = Path(source_directory)
    output = Path(output_directory)
    (source / "scripts/lib/prompteval").mkdir(parents=True)
    entrypoint = source / "scripts/prompteval"
    entrypoint.write_text("#!/bin/sh\nprintf 'reviewed\\n'\n", encoding="utf-8")
    entrypoint.chmod(0o755)
    library_file = source / "scripts/lib/prompteval/contract.py"
    library_file.write_text('VALUE = "reviewed"\n', encoding="utf-8")
    run("git", "init", "-q", cwd=source)
    run("git", "config", "user.email", "test@example.invalid", cwd=source)
    run("git", "config", "user.name", "Command harness test", cwd=source)
    run("git", "add", ".", cwd=source)
    run("git", "commit", "-qm", "reviewed harness", cwd=source)
    revision = run("git", "rev-parse", "HEAD", cwd=source)
    library_tree = run(
        "git", "rev-parse", "HEAD:scripts/lib/prompteval", cwd=source
    )
    entry_blob = run("git", "rev-parse", "HEAD:scripts/prompteval", cwd=source)

    entrypoint.write_text("#!/bin/sh\nprintf 'mutable head\\n'\n", encoding="utf-8")
    library_file.write_text('VALUE = "mutable-head"\n', encoding="utf-8")
    run("git", "add", ".", cwd=source)
    run("git", "commit", "-qm", "advance mutable head", cwd=source)
    assert run("git", "rev-parse", "HEAD", cwd=source) != revision
    library_file.write_text('VALUE = "dirty-mutable-head"\n', encoding="utf-8")

    materialize(source, output, revision, library_tree, entry_blob)
    assert (output / "scripts/lib/prompteval/contract.py").read_text() == 'VALUE = "reviewed"\n'
    assert run(str(output / "scripts/prompteval"), cwd=output) == "reviewed"
    for path in (output, *output.rglob("*")):
        assert stat.S_IMODE(path.stat().st_mode) & 0o222 == 0

    for path in sorted(output.rglob("*"), reverse=True):
        path.chmod(stat.S_IMODE(path.stat().st_mode) | stat.S_IWUSR)
    output.chmod(stat.S_IMODE(output.stat().st_mode) | stat.S_IWUSR)
    for child in list(output.iterdir()):
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()
    try:
        materialize(source, output, revision, "0" * 40, entry_blob)
    except HarnessError as error:
        assert "library differs" in str(error)
    else:
        raise AssertionError("an unreviewed harness tree must be rejected")

print("pinned harness materialization ignores mutable HEAD and rejects unreviewed bytes")
