#!/usr/bin/env bash
# Run the authoritative Codex-task release eval against one mechanically pinned
# clean source revision, failing if any non-evidence worktree byte changes.
set -euo pipefail

ROOT=${COMMAND_EVAL_REPO_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}
PROMPT_ID=${COMMAND_EVAL_PROMPT_ID:-codex-task-prompt}
EVAL_RUNNER=${COMMAND_EVAL_RUNNER:-/opt/workspace/supervisor/scripts/prompteval}
RECEIPT=${COMMAND_EVAL_RECEIPT:-"$ROOT/.prompteval/$PROMPT_ID/source-revision.json"}
POLL_SECONDS=${COMMAND_EVAL_POLL_SECONDS:-1}
DRIFT_MARKER=$(mktemp)
rm -f "$DRIFT_MARKER"
trap 'rm -f "$DRIFT_MARKER"' EXIT

cd "$ROOT"
git rev-parse --is-inside-work-tree >/dev/null
[ -z "$(git status --porcelain=v1 --untracked-files=all)" ] || {
  echo 'release eval requires a clean worktree' >&2
  exit 1
}

SOURCE_COMMIT=$(git rev-parse HEAD)
SOURCE_TREE=$(git rev-parse HEAD^{tree})
STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)

source_state() {
  git status --porcelain=v1 -z --untracked-files=all -- \
    . \
    ":(exclude,glob).prompteval/$PROMPT_ID/baseline.json*" \
    ':(exclude,glob).prompteval/inventory.json*' \
    ":(exclude,glob).prompteval/$PROMPT_ID/source-revision.json*" \
    | sha256sum | cut -d' ' -f1
}

EMPTY_STATE=$(printf '' | sha256sum | cut -d' ' -f1)
[ "$(source_state)" = "$EMPTY_STATE" ] || {
  echo 'release eval source fingerprint is not clean' >&2
  exit 1
}

setsid "$EVAL_RUNNER" run "$ROOT" --id "$PROMPT_ID" \
  --release --update-baseline --no-cache --yes &
EVAL_PID=$!

(
  while kill -0 "$EVAL_PID" 2>/dev/null; do
    if [ "$(git rev-parse HEAD)" != "$SOURCE_COMMIT" ] \
      || [ "$(git rev-parse HEAD^{tree})" != "$SOURCE_TREE" ] \
      || [ "$(source_state)" != "$EMPTY_STATE" ]; then
      : > "$DRIFT_MARKER"
      kill -TERM -- "-$EVAL_PID" 2>/dev/null || true
      exit 0
    fi
    sleep "$POLL_SECONDS"
  done
) &
WATCHER_PID=$!

set +e
wait "$EVAL_PID"
EVAL_STATUS=$?
set -e
kill "$WATCHER_PID" 2>/dev/null || true
wait "$WATCHER_PID" 2>/dev/null || true

if [ -e "$DRIFT_MARKER" ] \
  || [ "$(git rev-parse HEAD)" != "$SOURCE_COMMIT" ] \
  || [ "$(git rev-parse HEAD^{tree})" != "$SOURCE_TREE" ] \
  || [ "$(source_state)" != "$EMPTY_STATE" ]; then
  echo 'release eval invalidated: source revision or worktree changed during the run' >&2
  exit 1
fi
[ "$EVAL_STATUS" -eq 0 ] || exit "$EVAL_STATUS"

mkdir -p "$(dirname "$RECEIPT")"
RECEIPT_TMP="$RECEIPT.tmp"
COMMAND_EVAL_RECEIPT_TMP="$RECEIPT_TMP" \
COMMAND_EVAL_SOURCE_COMMIT="$SOURCE_COMMIT" \
COMMAND_EVAL_SOURCE_TREE="$SOURCE_TREE" \
COMMAND_EVAL_STARTED_AT="$STARTED_AT" \
COMMAND_EVAL_PROMPT_ID="$PROMPT_ID" \
python3 - <<'PY'
import json
import os
from datetime import datetime, timezone
from pathlib import Path

root = Path.cwd()
prompt_id = os.environ["COMMAND_EVAL_PROMPT_ID"]
baseline = json.loads((root / ".prompteval" / prompt_id / "baseline.json").read_text())
receipt = {
    "schema_version": "command.prompteval-source-revision.v1",
    "status": "passed_from_stable_clean_revision",
    "prompt_id": prompt_id,
    "run_id": baseline["run_id"],
    "source_commit": os.environ["COMMAND_EVAL_SOURCE_COMMIT"],
    "source_tree": os.environ["COMMAND_EVAL_SOURCE_TREE"],
    "worktree_clean_at_start": True,
    "source_drift_detected": False,
    "started_at": os.environ["COMMAND_EVAL_STARTED_AT"],
    "completed_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "release": baseline["release"],
    "accepted_from_cache": baseline["accepted_from_cache"],
    "gate_passed": baseline["gate"]["passed"],
}
Path(os.environ["COMMAND_EVAL_RECEIPT_TMP"]).write_text(
    json.dumps(receipt, indent=2) + "\n"
)
PY
chmod 0600 "$RECEIPT_TMP"
mv -T "$RECEIPT_TMP" "$RECEIPT"
echo "release eval source revision recorded: commit=$SOURCE_COMMIT run=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["run_id"])' "$RECEIPT")"
