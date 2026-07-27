#!/usr/bin/env bash
set -euo pipefail

ROOT=$(mktemp -d)
cleanup() {
  [ -z "${RUN_PID:-}" ] || kill "$RUN_PID" 2>/dev/null || true
  rm -rf "$ROOT"
}
trap cleanup EXIT

mkdir -p "$ROOT/.prompteval/codex-task-prompt"
printf 'stable\n' > "$ROOT/source.txt"
printf '{}\n' > "$ROOT/.prompteval/codex-task-prompt/spec.json"
printf '{"run_id":"run-test","release":true,"accepted_from_cache":false,"gate":{"passed":true},"prompt_version":"pv-test","spec_hash":"sh-test","golden_hash":"gh-test"}\n' \
  > "$ROOT/.prompteval/codex-task-prompt/baseline.json"
git -C "$ROOT" init -q
git -C "$ROOT" config user.email test@example.invalid
git -C "$ROOT" config user.name 'Command eval source test'
git -C "$ROOT" add .
git -C "$ROOT" commit -qm 'fixture'

RUNNER="$ROOT/dummy-runner"
cat > "$RUNNER" <<'SH'
#!/usr/bin/env bash
sleep "${DUMMY_DELAY:-0}"
SH
chmod +x "$RUNNER"
git -C "$ROOT" add dummy-runner
git -C "$ROOT" commit -qm 'runner'

COMMAND_EVAL_REPO_ROOT="$ROOT" \
COMMAND_EVAL_RUNNER="$RUNNER" \
COMMAND_EVAL_RECEIPT="$ROOT/.prompteval/codex-task-prompt/source-revision.json" \
COMMAND_EVAL_POLL_SECONDS=0.1 \
DUMMY_DELAY=5 \
bash scripts/run-release-eval.sh >/dev/null 2>&1 &
RUN_PID=$!
sleep 0.5
printf 'changed\n' > "$ROOT/source.txt"
if wait "$RUN_PID"; then
  echo 'source drift must invalidate the release eval' >&2
  exit 1
fi
RUN_PID=
test ! -e "$ROOT/.prompteval/codex-task-prompt/source-revision.json"

git -C "$ROOT" checkout -q -- source.txt
COMMAND_EVAL_REPO_ROOT="$ROOT" \
COMMAND_EVAL_RUNNER="$RUNNER" \
COMMAND_EVAL_RECEIPT="$ROOT/.prompteval/codex-task-prompt/source-revision.json" \
COMMAND_EVAL_POLL_SECONDS=0.1 \
bash scripts/run-release-eval.sh >/dev/null

python3 - "$ROOT" <<'PY'
import json
import stat
import subprocess
import sys
from pathlib import Path

root = Path(sys.argv[1])
receipt = json.loads(
    (root / ".prompteval/codex-task-prompt/source-revision.json").read_text()
)
assert receipt["status"] == "passed_from_stable_clean_revision"
assert receipt["source_commit"] == subprocess.check_output(
    ["git", "-C", str(root), "rev-parse", "HEAD"], text=True
).strip()
assert receipt["source_tree"] == subprocess.check_output(
    ["git", "-C", str(root), "rev-parse", "HEAD^{tree}"], text=True
).strip()
assert receipt["source_drift_detected"] is False
assert receipt["gate_passed"] is True
assert receipt["prompt_version"] == "pv-test"
assert receipt["spec_hash"] == "sh-test"
assert receipt["golden_hash"] == "gh-test"
assert receipt["governed_prompts"] == {
    "codex-task-prompt": {
        "run_id": "run-test",
        "prompt_version": "pv-test",
        "spec_hash": "sh-test",
        "golden_hash": "gh-test",
    }
}
assert stat.S_IMODE(
    (root / ".prompteval/codex-task-prompt/source-revision.json").stat().st_mode
) == 0o644
PY

echo 'release eval source revision pin detects mid-run drift'
