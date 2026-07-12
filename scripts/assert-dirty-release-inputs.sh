#!/usr/bin/env bash
set -euo pipefail
REPO=${1:-.}
UNTRACKED=$(git -C "$REPO" ls-files --others --exclude-standard)
if [ -n "$UNTRACKED" ]; then
  echo "ERROR: ALLOW_DIRTY cannot truthfully materialize untracked files; commit them or use HEAD_ONLY=1:" >&2
  printf '%s\n' "$UNTRACKED" >&2
  exit 1
fi
