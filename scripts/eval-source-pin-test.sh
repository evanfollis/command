#!/usr/bin/env bash
set -euo pipefail

ROOT=$(mktemp -d)
SHIM_DIR=$(mktemp -d)
TEST_RECEIPT="$ROOT/.prompteval/codex-task-prompt/source-revision.test.json"
cleanup() {
  [ -z "${RUN_PID:-}" ] || kill "$RUN_PID" 2>/dev/null || true
  rm -rf "$ROOT"
  rm -rf "$SHIM_DIR"
}
trap cleanup EXIT

mkdir -p "$ROOT/.prompteval/codex-task-prompt"
mkdir -p "$ROOT/executor-fixture"
printf 'stable\n' > "$ROOT/source.txt"
printf '{"judge":{"model":"opus","trials":3},"gate":{"trials":1,"max_unknown_ratio":0}}\n' \
  > "$ROOT/.prompteval/codex-task-prompt/spec.json"
printf '%s\n' '{"run_id":"run-test","release":true,"passed":true,"all_cases_passed":true,"accepted_from_cache":false,"judge_unknown_ratio":0,"gate":{"passed":true},"prompt_version":"pv-test","spec_hash":"sh-test","golden_hash":"gh-test","cases":{"case-1":{"pass":true}},"provider_provenance":{"schema_version":"prompteval.provider-provenance.v1","run_id":"run-test","providers":["claude"],"successful_calls":2,"fallback_successes":0,"routes":[{"role":"executor-adapter","provider":"claude","status":"success","calls":1},{"role":"judge","provider":"claude","status":"success","calls":1}]}}' \
  > "$ROOT/.prompteval/codex-task-prompt/baseline.json"
printf '%s\n' 'VALUE = "sibling-import-passed"' > "$ROOT/executor-fixture/sibling.py"
printf '%s\n' \
  'import sys' \
  'from pathlib import Path' \
  'sys.path.insert(0, str(Path(__file__).resolve().parent))' \
  'from sibling import VALUE' \
  'assert VALUE == "sibling-import-passed"' \
  > "$ROOT/executor-fixture/entry.py"
git -C "$ROOT" init -q
git -C "$ROOT" config user.email test@example.invalid
git -C "$ROOT" config user.name 'Command eval source test'
git -C "$ROOT" add .
git -C "$ROOT" commit -qm 'fixture'

RUNNER="$ROOT/dummy-runner"
cat > "$RUNNER" <<'SH'
#!/usr/bin/env bash
set +e
codex >/dev/null 2>&1
CODEX_STATUS=$?
set -e
[ "$CODEX_STATUS" -eq 75 ]
[ -z "${ANTHROPIC_API_KEY+x}" ]
[ -z "${PYTHONPATH+x}" ]
[ -z "${PYTHONOPTIMIZE+x}" ]
python3 -B -I -P executor-fixture/entry.py
[ -z "${COMMAND_EVAL_TEST_STATUS_FAIL_MARKER:-}" ] \
  || : > "$COMMAND_EVAL_TEST_STATUS_FAIL_MARKER"
[ -z "${COMMAND_EVAL_TEST_WATCHER_BLOCK_MARKER:-}" ] || {
  : > "$COMMAND_EVAL_TEST_WATCHER_BLOCK_MARKER"
  sleep 0.3
  exit 0
}
sleep 2
SH
chmod +x "$RUNNER"
git -C "$ROOT" add dummy-runner
git -C "$ROOT" commit -qm 'runner'

SHIM="$SHIM_DIR/codex"
printf '%s\n' \
  '#!/bin/sh' \
  'echo "Codex fallback disabled for this Claude-only authoritative evaluation." >&2' \
  'exit 75' > "$SHIM"
chmod 0700 "$SHIM"

FAKE_HOME="$SHIM_DIR/home"
PYTHON_VERSION=$(python3 -I -P -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
USER_SITE="$FAKE_HOME/.local/lib/python$PYTHON_VERSION/site-packages"
USERCUSTOMIZE_MARKER="$SHIM_DIR/usercustomize-ran"
mkdir -p "$USER_SITE"
printf '%s\n' \
  'from pathlib import Path' \
  "Path('$USERCUSTOMIZE_MARKER').write_text('unsafe startup hook ran\\n')" \
  > "$USER_SITE/usercustomize.py"

GIT_STATUS_FAIL_MARKER="$SHIM_DIR/git-status-fail"
GIT_TRANSIENT_DRIFT_MARKER="$SHIM_DIR/git-transient-drift"
GIT_TRANSIENT_OUTPUT="$SHIM_DIR/git-transient-output"
GIT_WATCHER_BLOCK_MARKER="$SHIM_DIR/git-watcher-block"
GIT_WATCHER_ORPHAN_MARKER="$SHIM_DIR/git-watcher-orphan"
GIT_SHIM="$SHIM_DIR/git"
printf '%s\n' \
  '#!/usr/bin/env bash' \
  'if [ "${1:-}" = status ] && [ -n "${COMMAND_EVAL_TEST_WATCHER_BLOCK_MARKER:-}" ] && [ -e "$COMMAND_EVAL_TEST_WATCHER_BLOCK_MARKER" ]; then' \
  '  rm -f "$COMMAND_EVAL_TEST_WATCHER_BLOCK_MARKER"' \
  '  sleep 1' \
  '  : > "$COMMAND_EVAL_TEST_WATCHER_ORPHAN_MARKER"' \
  'fi' \
  'if [ "${1:-}" = status ] && [ -n "${COMMAND_EVAL_TEST_TRANSIENT_DRIFT_MARKER:-}" ] && [ -e "$COMMAND_EVAL_TEST_TRANSIENT_DRIFT_MARKER" ]; then' \
  '  printf "changed transiently\n" > "$COMMAND_EVAL_TEST_TRANSIENT_SOURCE"' \
  '  /usr/bin/git "$@" > "$COMMAND_EVAL_TEST_TRANSIENT_OUTPUT"' \
  '  status=$?' \
  '  /usr/bin/git checkout -q -- "$COMMAND_EVAL_TEST_TRANSIENT_SOURCE"' \
  '  rm -f "$COMMAND_EVAL_TEST_TRANSIENT_DRIFT_MARKER"' \
  '  cat "$COMMAND_EVAL_TEST_TRANSIENT_OUTPUT"' \
  '  exit "$status"' \
  'fi' \
  'if [ "${1:-}" = status ] && [ -n "${COMMAND_EVAL_TEST_STATUS_FAIL_MARKER:-}" ] && [ -e "$COMMAND_EVAL_TEST_STATUS_FAIL_MARKER" ]; then' \
  '  rm -f "$COMMAND_EVAL_TEST_STATUS_FAIL_MARKER"' \
  '  echo "synthetic git status failure" >&2' \
  '  exit 42' \
  'fi' \
  'exec /usr/bin/git "$@"' \
  > "$GIT_SHIM"
chmod 0700 "$GIT_SHIM"

DRIFT_STDERR="$SHIM_DIR/drift.stderr"
HOME="$FAKE_HOME" \
COMMAND_EVAL_REPO_ROOT="$ROOT" \
COMMAND_EVAL_RUNNER="$RUNNER" \
COMMAND_EVAL_CODEX_SHIM="$SHIM" \
COMMAND_EVAL_GIT_BIN="$GIT_SHIM" \
COMMAND_EVAL_TEST_TRANSIENT_DRIFT_MARKER="$GIT_TRANSIENT_DRIFT_MARKER" \
COMMAND_EVAL_TEST_TRANSIENT_SOURCE=source.txt \
COMMAND_EVAL_TEST_TRANSIENT_OUTPUT="$GIT_TRANSIENT_OUTPUT" \
COMMAND_EVAL_TEST_ONLY=1 \
COMMAND_EVAL_RECEIPT="$TEST_RECEIPT" \
COMMAND_EVAL_POLL_SECONDS=0.1 \
ANTHROPIC_API_KEY=forbidden-metered-canary \
PYTHONPATH=/forbidden/import/path \
PYTHONOPTIMIZE=1 \
bash scripts/run-release-eval.sh >/dev/null 2>"$DRIFT_STDERR" &
RUN_PID=$!
sleep 0.5
: > "$GIT_TRANSIENT_DRIFT_MARKER"
if wait "$RUN_PID"; then
  echo 'transient source drift must be caught by the watcher' >&2
  exit 1
fi
RUN_PID=
test "$(cat "$ROOT/source.txt")" = stable
test ! -e "$GIT_TRANSIENT_DRIFT_MARKER"
test -z "$(git -C "$ROOT" status --porcelain=v1 --untracked-files=all)"
test ! -e "$TEST_RECEIPT"
grep -q 'release eval invalidated: source revision or worktree changed during the run' \
  "$DRIFT_STDERR"

HOME="$FAKE_HOME" \
COMMAND_EVAL_REPO_ROOT="$ROOT" \
COMMAND_EVAL_RUNNER="$RUNNER" \
COMMAND_EVAL_CODEX_SHIM="$SHIM" \
COMMAND_EVAL_GIT_BIN="$GIT_SHIM" \
COMMAND_EVAL_TEST_WATCHER_BLOCK_MARKER="$GIT_WATCHER_BLOCK_MARKER" \
COMMAND_EVAL_TEST_WATCHER_ORPHAN_MARKER="$GIT_WATCHER_ORPHAN_MARKER" \
COMMAND_EVAL_TEST_ONLY=1 \
COMMAND_EVAL_RECEIPT="$TEST_RECEIPT" \
COMMAND_EVAL_POLL_SECONDS=0.05 \
bash scripts/run-release-eval.sh >/dev/null
sleep 1.1
test ! -e "$GIT_WATCHER_BLOCK_MARKER"
test ! -e "$GIT_WATCHER_ORPHAN_MARKER"

rm -f "$DRIFT_STDERR"
HOME="$FAKE_HOME" \
COMMAND_EVAL_REPO_ROOT="$ROOT" \
COMMAND_EVAL_RUNNER="$RUNNER" \
COMMAND_EVAL_CODEX_SHIM="$SHIM" \
COMMAND_EVAL_TEST_ONLY=receipt \
COMMAND_EVAL_RECEIPT="$TEST_RECEIPT" \
COMMAND_EVAL_POLL_SECONDS=0.1 \
ANTHROPIC_API_KEY=forbidden-metered-canary \
PYTHONPATH=/forbidden/import/path \
PYTHONOPTIMIZE=1 \
bash scripts/run-release-eval.sh >/dev/null

test ! -e "$USERCUSTOMIZE_MARKER"
python3 - "$TEST_RECEIPT" <<'PY'
import json
import sys
from pathlib import Path

receipt = json.loads(Path(sys.argv[1]).read_text())
assert receipt["evaluation_profile"] == "test-only"
assert receipt["harness_revision"] == "8a0c0e329d67f6be2cd248acf028406fb53927b7"
assert receipt["harness_library_tree"] == "7ddfbbd2de03ee419272bedcf0089321ecd3ac86"
assert receipt["harness_entry_blob"] == "5606220807dc51c6c84be92afe7f2de3c3acc302"
assert receipt["expected_release_cases"] == 18
assert len(receipt["baseline_sha256"]) == 64
assert receipt["raw_report_sha256"] is None
assert receipt["attempt_log_sha256"] is None
assert receipt["release_contract_status"] == "test-only"
assert receipt["source_drift_detected"] is False
PY

OVERWRITE_STDERR="$SHIM_DIR/overwrite.stderr"
HOME="$FAKE_HOME" \
COMMAND_EVAL_REPO_ROOT="$ROOT" \
COMMAND_EVAL_RUNNER="$RUNNER" \
COMMAND_EVAL_CODEX_SHIM="$SHIM" \
COMMAND_EVAL_TEST_ONLY=receipt \
bash scripts/run-release-eval.sh >/dev/null 2>"$OVERWRITE_STDERR" \
  || OVERWRITE_REFUSED=1
test "${OVERWRITE_REFUSED:-0}" -eq 1
grep -q 'test-only eval must not target the authoritative source receipt' \
  "$OVERWRITE_STDERR"
test ! -e "$ROOT/.prompteval/codex-task-prompt/source-revision.json"

rm -f "$TEST_RECEIPT"
STATUS_STDERR="$SHIM_DIR/status.stderr"
HOME="$FAKE_HOME" \
COMMAND_EVAL_REPO_ROOT="$ROOT" \
COMMAND_EVAL_RUNNER="$RUNNER" \
COMMAND_EVAL_CODEX_SHIM="$SHIM" \
COMMAND_EVAL_GIT_BIN="$GIT_SHIM" \
COMMAND_EVAL_TEST_STATUS_FAIL_MARKER="$GIT_STATUS_FAIL_MARKER" \
COMMAND_EVAL_TEST_ONLY=receipt \
COMMAND_EVAL_RECEIPT="$TEST_RECEIPT" \
COMMAND_EVAL_POLL_SECONDS=0.1 \
bash scripts/run-release-eval.sh >/dev/null 2>"$STATUS_STDERR" &
RUN_PID=$!
if wait "$RUN_PID"; then
  echo 'transient git status failure must be caught by the watcher' >&2
  exit 1
fi
RUN_PID=
test ! -e "$GIT_STATUS_FAIL_MARKER"
test ! -e "$TEST_RECEIPT"
grep -q 'synthetic git status failure' "$STATUS_STDERR"
grep -q 'release eval invalidated: source revision or worktree changed during the run' \
  "$STATUS_STDERR"
test ! -e "$USERCUSTOMIZE_MARKER"

echo 'release eval source pin rejects drift/status errors and preserves isolated sibling imports'
