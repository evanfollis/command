#!/usr/bin/env python3
"""Materialize Command's reviewed prompt-evaluation harness from a pinned commit."""

from __future__ import annotations

import io
import os
import re
import stat
import subprocess
import sys
import tarfile
from pathlib import Path, PurePosixPath


ARCHIVE_PATHS = ("scripts/prompteval", "scripts/lib/prompteval")


class HarnessError(RuntimeError):
    """The configured Git object source cannot prove the reviewed harness bytes."""


def git(repo: Path, *arguments: str, text: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", "-c", "core.hooksPath=/dev/null", "-C", str(repo), *arguments],
        check=True,
        capture_output=True,
        text=text,
    )


def object_id(repo: Path, expression: str) -> str:
    try:
        return git(repo, "rev-parse", "--verify", expression).stdout.strip()
    except subprocess.CalledProcessError as error:
        raise HarnessError(f"reviewed harness object is unavailable: {expression}") from error


def validate_member(member: tarfile.TarInfo) -> None:
    path = PurePosixPath(member.name)
    if path.is_absolute() or ".." in path.parts:
        raise HarnessError(f"reviewed harness archive contains an unsafe path: {member.name}")
    if not any(path == PurePosixPath(root) or root in path.parents for root in map(PurePosixPath, ARCHIVE_PATHS)):
        # Git includes parent directory entries needed to extract the selected paths.
        if path not in {PurePosixPath("scripts"), PurePosixPath("scripts/lib")}:
            raise HarnessError(f"reviewed harness archive contains an unexpected path: {member.name}")
    if not (member.isdir() or member.isfile()):
        raise HarnessError(f"reviewed harness archive contains a non-regular entry: {member.name}")


def materialize(
    repo: Path,
    destination: Path,
    revision: str,
    library_tree: str,
    entry_blob: str,
) -> Path:
    if not re.fullmatch(r"[a-f0-9]{40}", revision):
        raise HarnessError("reviewed harness revision must be a full SHA-1 object id")
    if not re.fullmatch(r"[a-f0-9]{40}", library_tree):
        raise HarnessError("reviewed harness library tree must be a full SHA-1 object id")
    if not re.fullmatch(r"[a-f0-9]{40}", entry_blob):
        raise HarnessError("reviewed harness entry blob must be a full SHA-1 object id")
    if not repo.is_dir():
        raise HarnessError(f"harness Git object source is missing: {repo}")
    if destination.is_symlink() or not destination.is_dir():
        raise HarnessError(f"harness destination must be a real directory: {destination}")
    if any(destination.iterdir()):
        raise HarnessError(f"harness destination must be empty: {destination}")

    if object_id(repo, f"{revision}^{{commit}}") != revision:
        raise HarnessError("reviewed harness revision does not resolve to the pinned commit")
    if object_id(repo, f"{revision}:scripts/lib/prompteval") != library_tree:
        raise HarnessError("reviewed harness library differs from the pinned tree")
    if object_id(repo, f"{revision}:scripts/prompteval") != entry_blob:
        raise HarnessError("reviewed harness entrypoint differs from the pinned blob")

    try:
        archive = git(
            repo,
            "archive",
            "--format=tar",
            revision,
            "--",
            *ARCHIVE_PATHS,
            text=False,
        ).stdout
    except subprocess.CalledProcessError as error:
        raise HarnessError("reviewed harness archive could not be materialized") from error

    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:") as bundle:
        members = bundle.getmembers()
        for member in members:
            validate_member(member)
        bundle.extractall(destination, members=members, filter="data")

    entrypoint = destination / "scripts/prompteval"
    library = destination / "scripts/lib/prompteval"
    if entrypoint.is_symlink() or not entrypoint.is_file() or not os.access(entrypoint, os.X_OK):
        raise HarnessError("materialized harness entrypoint is not a regular executable")
    if library.is_symlink() or not library.is_dir():
        raise HarnessError("materialized harness library is missing")
    for path in sorted(destination.rglob("*"), reverse=True):
        if path.is_symlink():
            raise HarnessError(f"materialized harness contains a symlink: {path}")
        mode = stat.S_IMODE(path.stat().st_mode)
        path.chmod(mode & ~0o222)
    destination.chmod(stat.S_IMODE(destination.stat().st_mode) & ~0o222)
    return library


def main(arguments: list[str]) -> int:
    if len(arguments) != 5:
        print(
            "usage: prompteval_harness.py REPO DESTINATION REVISION LIBRARY_TREE ENTRY_BLOB",
            file=sys.stderr,
        )
        return 2
    try:
        materialize(
            Path(arguments[0]).resolve(),
            Path(arguments[1]).absolute(),
            arguments[2],
            arguments[3],
            arguments[4],
        )
    except (HarnessError, OSError, tarfile.TarError) as error:
        print(f"prompteval harness contract failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
