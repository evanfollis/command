#!/usr/bin/env bash
# Run the full host evaluator from Command's immutable reviewed harness bytes.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
HARNESS_REPO=${PROMPTEVAL_HARNESS_REPO:-/opt/workspace/supervisor}
HARNESS_REVISION=8a0c0e329d67f6be2cd248acf028406fb53927b7
HARNESS_LIBRARY_TREE=7ddfbbd2de03ee419272bedcf0089321ecd3ac86
HARNESS_ENTRY_BLOB=5606220807dc51c6c84be92afe7f2de3c3acc302
HARNESS_ROOT=$(mktemp -d)
cleanup() {
  chmod -R u+w "$HARNESS_ROOT" 2>/dev/null || true
  rm -rf "$HARNESS_ROOT"
}
trap cleanup EXIT

python3 -I -P "$ROOT/scripts/prompteval_harness.py" \
  "$HARNESS_REPO" "$HARNESS_ROOT" "$HARNESS_REVISION" \
  "$HARNESS_LIBRARY_TREE" "$HARNESS_ENTRY_BLOB"
PROMPTEVAL_LIB="$HARNESS_ROOT/scripts/lib" \
  "$HARNESS_ROOT/scripts/prompteval" check "$ROOT"
