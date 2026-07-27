#!/usr/bin/env bash
# Run the authoritative Codex-task release eval against one mechanically pinned
# clean source revision, failing if any non-evidence worktree byte changes.
set -euo pipefail

ROOT=${COMMAND_EVAL_REPO_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}
SCRIPT_REPO=$(cd "$(dirname "$0")/.." && pwd)
PROMPT_ID=${COMMAND_EVAL_PROMPT_ID:-codex-task-prompt}
EVAL_RUNNER=${COMMAND_EVAL_RUNNER:-/opt/workspace/supervisor/scripts/prompteval}
RECEIPT=${COMMAND_EVAL_RECEIPT:-"$ROOT/.prompteval/$PROMPT_ID/source-revision.json"}
POLL_SECONDS=${COMMAND_EVAL_POLL_SECONDS:-1}
TEST_ONLY=${COMMAND_EVAL_TEST_ONLY:-0}
GIT_BIN=${COMMAND_EVAL_GIT_BIN:-git}
TEST_STATUS_FAIL_MARKER=${COMMAND_EVAL_TEST_STATUS_FAIL_MARKER:-}
TEST_WATCHER_BLOCK_MARKER=${COMMAND_EVAL_TEST_WATCHER_BLOCK_MARKER:-}
PROMPTEVAL_RUNTIME=/opt/workspace/runtime/prompteval
CODEX_SHIM=${COMMAND_EVAL_CODEX_SHIM:?COMMAND_EVAL_CODEX_SHIM must name the Claude-only codex shim}
CODEX_SHIM_SHA256=06d3b8fb3da19afbbd80ef849b1a4abf28efeccaad469f7631254f27c10e7e9e
HARNESS_REVISION=8a0c0e329d67f6be2cd248acf028406fb53927b7
HARNESS_LIBRARY_TREE=7ddfbbd2de03ee419272bedcf0089321ecd3ac86
HARNESS_ENTRY_BLOB=5606220807dc51c6c84be92afe7f2de3c3acc302
PYTHON_SHA256=1643dacd9feaedc58f3cc581e4d22577dfe25c09b10282936186ccf0f2e61118
CLAUDE_SHA256=674f61f20ff306f3100cf9200e4c36c4b70278b5bef2884549819b942a89c863
NODE_SHA256=1bec56ef7cfa9a76f3e0b7c0a87f220eb73f23102b9c0b4c7529a3f7c3ce7c31
NPX_SHA256=237adf8f3747cad8b9b62fcfd0d9c8d509a64e550337707f55100afcb79e8900
DRIFT_MARKER=$(mktemp)
STATUS_STATE_DIR=$(mktemp -d)
EVAL_BIN_DIR=$(mktemp -d)
HARNESS_EVAL_DIR=$(mktemp -d)
EXPECTED_CASES=18
CONTRACT_BINDING=
rm -f "$DRIFT_MARKER"
cleanup() {
  rm -f "$DRIFT_MARKER"
  rm -rf "$STATUS_STATE_DIR"
  rm -rf "$EVAL_BIN_DIR"
  chmod -R u+w "$HARNESS_EVAL_DIR" 2>/dev/null || true
  rm -rf "$HARNESS_EVAL_DIR"
  [ -z "$CONTRACT_BINDING" ] || rm -f "$CONTRACT_BINDING"
}
trap cleanup EXIT

case "$TEST_ONLY" in
  0|1|receipt) ;;
  *)
    echo 'COMMAND_EVAL_TEST_ONLY must be 0, 1, or receipt' >&2
    exit 1
    ;;
esac
[ "$TEST_ONLY" != 0 ] || [ "$GIT_BIN" = git ] || {
  echo 'COMMAND_EVAL_GIT_BIN is available only to test-only runs' >&2
  exit 1
}
[ "$TEST_ONLY" != 0 ] || [ -z "$TEST_STATUS_FAIL_MARKER" ] || {
  echo 'COMMAND_EVAL_TEST_STATUS_FAIL_MARKER is available only to test-only runs' >&2
  exit 1
}
[ "$TEST_ONLY" != 0 ] || [ -z "$TEST_WATCHER_BLOCK_MARKER" ] || {
  echo 'COMMAND_EVAL_TEST_WATCHER_BLOCK_MARKER is available only to test-only runs' >&2
  exit 1
}
AUTHORITATIVE_RECEIPT="$ROOT/.prompteval/$PROMPT_ID/source-revision.json"
[ "$TEST_ONLY" = 0 ] || [ "$RECEIPT" != "$AUTHORITATIVE_RECEIPT" ] || {
  echo 'test-only eval must not target the authoritative source receipt' >&2
  exit 1
}

case "$CODEX_SHIM" in
  /*/codex) ;;
  *)
    echo 'COMMAND_EVAL_CODEX_SHIM must be an absolute path named codex' >&2
    exit 1
    ;;
esac
[ -f "$CODEX_SHIM" ] && [ ! -L "$CODEX_SHIM" ] && [ -x "$CODEX_SHIM" ] || {
  echo 'Claude-only codex shim must be a regular executable file' >&2
  exit 1
}
[ "$(stat -c '%u:%a' "$CODEX_SHIM")" = "$(id -u):700" ] || {
  echo 'Claude-only codex shim must be owned by the evaluator and mode 0700' >&2
  exit 1
}
[ "$(sha256sum "$CODEX_SHIM" | cut -d' ' -f1)" = "$CODEX_SHIM_SHA256" ] || {
  echo 'Claude-only codex shim differs from the reviewed fail-closed program' >&2
  exit 1
}
install -m 0700 "$CODEX_SHIM" "$EVAL_BIN_DIR/codex"
[ -f "$EVAL_BIN_DIR/codex" ] && [ ! -L "$EVAL_BIN_DIR/codex" ] \
  && [ "$(stat -c '%u:%a' "$EVAL_BIN_DIR/codex")" = "$(id -u):700" ] \
  && [ "$(sha256sum "$EVAL_BIN_DIR/codex" | cut -d' ' -f1)" = "$CODEX_SHIM_SHA256" ] || {
  echo 'installed Claude-only codex shim differs from the reviewed program' >&2
  exit 1
}
[ "$(find "$EVAL_BIN_DIR" -mindepth 1 -maxdepth 1 -printf '%f\n')" = codex ] || {
  echo 'private evaluator shim directory contains an unexpected executable' >&2
  exit 1
}
if [ "$TEST_ONLY" = 0 ]; then
  BASE_PATH=/root/.nvm/versions/node/v22.22.0/bin:/usr/bin:/bin
  PYTHON_BIN=/usr/bin/python3
  PYTHON_ACTUAL_SHA256=$(
    "$PYTHON_BIN" -I -P -c \
      'import hashlib,pathlib,sys; print(hashlib.sha256(pathlib.Path(sys.argv[1]).resolve(strict=True).read_bytes()).hexdigest())' \
      "$PYTHON_BIN"
  )
  [ "$PYTHON_ACTUAL_SHA256" = "$PYTHON_SHA256" ] || {
    echo 'authoritative Python executable differs from the reviewed toolchain' >&2
    exit 1
  }
  env -i \
    HOME="$HOME" USER="${USER:-$(id -un)}" LOGNAME="${LOGNAME:-$(id -un)}" \
    LANG=C.UTF-8 LC_ALL=C.UTF-8 PATH="$BASE_PATH" \
    PYTHONDONTWRITEBYTECODE=1 PYTHONNOUSERSITE=1 PYTHONSAFEPATH=1 \
    "$PYTHON_BIN" -I -P "$SCRIPT_REPO/scripts/prompteval_toolchain_contract.py" \
    "$BASE_PATH" \
    "$PYTHON_BIN" "$PYTHON_SHA256" \
    /root/.nvm/versions/node/v22.22.0/bin/claude "$CLAUDE_SHA256" \
    /root/.nvm/versions/node/v22.22.0/bin/node "$NODE_SHA256" \
    /root/.nvm/versions/node/v22.22.0/bin/npx "$NPX_SHA256" || {
      echo 'authoritative evaluator executable set differs from the reviewed toolchain' >&2
      exit 1
    }
  HARNESS_REPO=$(cd "$(dirname "$EVAL_RUNNER")/.." && pwd)
  [ "$(realpath "$EVAL_RUNNER")" = "$HARNESS_REPO/scripts/prompteval" ] \
    && [ -f "$EVAL_RUNNER" ] && [ ! -L "$EVAL_RUNNER" ] && [ -x "$EVAL_RUNNER" ] || {
      echo 'authoritative evaluator entrypoint is not the reviewed harness executable' >&2
      exit 1
    }
  [ "$("$GIT_BIN" -C "$HARNESS_REPO" rev-parse HEAD)" = "$HARNESS_REVISION" ] \
    && [ "$("$GIT_BIN" -C "$HARNESS_REPO" rev-parse HEAD:scripts/lib/prompteval)" = "$HARNESS_LIBRARY_TREE" ] \
    && [ "$("$GIT_BIN" -C "$HARNESS_REPO" rev-parse HEAD:scripts/prompteval)" = "$HARNESS_ENTRY_BLOB" ] || {
      echo 'authoritative evaluator harness revision differs from the reviewed contract' >&2
      exit 1
    }
  if ! HARNESS_STATUS=$(
    "$GIT_BIN" -C "$HARNESS_REPO" status --porcelain=v1 --untracked-files=all -- \
      scripts/prompteval scripts/lib/prompteval
  ); then
    echo 'authoritative evaluator harness status could not be verified' >&2
    exit 1
  fi
  [ -z "$HARNESS_STATUS" ] || {
      echo 'authoritative evaluator harness bytes are not an immutable reviewed checkout' >&2
      exit 1
    }
  "$GIT_BIN" -C "$HARNESS_REPO" archive "$HARNESS_REVISION" \
    scripts/prompteval scripts/lib/prompteval \
    | tar -x -C "$HARNESS_EVAL_DIR"
  chmod -R a-w "$HARNESS_EVAL_DIR"
  EVAL_RUNNER="$HARNESS_EVAL_DIR/scripts/prompteval"
  PROMPTEVAL_LIB="$HARNESS_EVAL_DIR/scripts/lib"
  EVAL_COMMAND=("$EVAL_RUNNER")
else
  BASE_PATH=$PATH
  PYTHON_BIN=$(command -v python3)
  PROMPTEVAL_LIB=${PROMPTEVAL_LIB:-/opt/workspace/supervisor/scripts/lib}
  EVAL_COMMAND=("$EVAL_RUNNER")
fi

EVAL_PATH="$EVAL_BIN_DIR:$BASE_PATH"
[ "$(PATH="$EVAL_PATH" command -v codex)" = "$EVAL_BIN_DIR/codex" ] || {
  echo 'Claude-only codex shim does not shadow the provider executable' >&2
  exit 1
}

cd "$ROOT"
"$GIT_BIN" rev-parse --is-inside-work-tree >/dev/null
if ! INITIAL_STATUS=$("$GIT_BIN" status --porcelain=v1 --untracked-files=all); then
  echo 'release eval could not verify initial worktree status' >&2
  exit 1
fi
[ -z "$INITIAL_STATUS" ] || {
  echo 'release eval requires a clean worktree' >&2
  exit 1
}

SOURCE_COMMIT=$("$GIT_BIN" rev-parse HEAD)
SOURCE_TREE=$("$GIT_BIN" rev-parse HEAD^{tree})
STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)

source_state() {
  local snapshot state
  if ! snapshot=$(mktemp "$STATUS_STATE_DIR/status.XXXXXX"); then
    printf 'status-snapshot-error\n'
    return 0
  fi
  if ! "$GIT_BIN" status --porcelain=v1 -z --untracked-files=all -- \
    . \
    ":(exclude,glob).prompteval/$PROMPT_ID/baseline.json*" \
    ':(exclude,glob).prompteval/inventory.json*' \
    ":(exclude,glob).prompteval/$PROMPT_ID/source-revision.json*" \
    > "$snapshot"; then
    rm -f "$snapshot"
    printf 'git-status-error\n'
    return 0
  fi
  if ! state=$(sha256sum "$snapshot" | cut -d' ' -f1); then
    rm -f "$snapshot"
    printf 'status-hash-error\n'
    return 0
  fi
  rm -f "$snapshot"
  printf '%s\n' "$state"
}

EMPTY_STATE=$(printf '' | sha256sum | cut -d' ' -f1)
[ "$(source_state)" = "$EMPTY_STATE" ] || {
  echo 'release eval source fingerprint is not clean' >&2
  exit 1
}

env -i \
  HOME="$HOME" USER="${USER:-$(id -un)}" LOGNAME="${LOGNAME:-$(id -un)}" \
  LANG=C.UTF-8 LC_ALL=C.UTF-8 PATH="$EVAL_PATH" \
  PROMPTEVAL_LIB="$PROMPTEVAL_LIB" PROMPTEVAL_RUNTIME="$PROMPTEVAL_RUNTIME" \
  PYTHONDONTWRITEBYTECODE=1 PYTHONNOUSERSITE=1 PYTHONSAFEPATH=1 \
  COMMAND_EVAL_TEST_STATUS_FAIL_MARKER="$TEST_STATUS_FAIL_MARKER" \
  COMMAND_EVAL_TEST_WATCHER_BLOCK_MARKER="$TEST_WATCHER_BLOCK_MARKER" \
  setsid --wait "${EVAL_COMMAND[@]}" run "$ROOT" --id "$PROMPT_ID" \
  --release --update-baseline --no-cache --yes &
EVAL_PID=$!

export -f source_state
export GIT_BIN STATUS_STATE_DIR PROMPT_ID EVAL_PID SOURCE_COMMIT SOURCE_TREE
export EMPTY_STATE DRIFT_MARKER POLL_SECONDS
setsid bash -c '
  while kill -0 "$EVAL_PID" 2>/dev/null; do
    if [ "$("$GIT_BIN" rev-parse HEAD)" != "$SOURCE_COMMIT" ] \
      || [ "$("$GIT_BIN" rev-parse HEAD^{tree})" != "$SOURCE_TREE" ] \
      || [ "$(source_state)" != "$EMPTY_STATE" ]; then
      : > "$DRIFT_MARKER"
      kill -TERM -- "-$EVAL_PID" 2>/dev/null || true
      exit 0
    fi
    sleep "$POLL_SECONDS"
  done
' &
WATCHER_PID=$!

set +e
wait "$EVAL_PID"
EVAL_STATUS=$?
set -e
kill -TERM -- "-$WATCHER_PID" 2>/dev/null || true
wait "$WATCHER_PID" 2>/dev/null || true

if [ -e "$DRIFT_MARKER" ] \
  || [ "$("$GIT_BIN" rev-parse HEAD)" != "$SOURCE_COMMIT" ] \
  || [ "$("$GIT_BIN" rev-parse HEAD^{tree})" != "$SOURCE_TREE" ] \
  || [ "$(source_state)" != "$EMPTY_STATE" ]; then
  echo 'release eval invalidated: source revision or worktree changed during the run' >&2
  exit 1
fi
[ "$EVAL_STATUS" -eq 0 ] || exit "$EVAL_STATUS"

if [ "$TEST_ONLY" = 1 ]; then
  test ! -e "$RECEIPT"
  exit 0
fi

CONTRACT_BINDING=$(mktemp)
rm -f "$CONTRACT_BINDING"
if [ "$TEST_ONLY" = 0 ]; then
  env -i \
    HOME="$HOME" USER="${USER:-$(id -un)}" LOGNAME="${LOGNAME:-$(id -un)}" \
    LANG=C.UTF-8 LC_ALL=C.UTF-8 PATH="$EVAL_PATH" \
    PYTHONDONTWRITEBYTECODE=1 PYTHONNOUSERSITE=1 PYTHONSAFEPATH=1 \
    "$PYTHON_BIN" -I -P "$SCRIPT_REPO/scripts/prompteval_release_contract.py" \
    "$ROOT" "$PROMPT_ID" "$EXPECTED_CASES" "$PROMPTEVAL_RUNTIME" \
    "$CONTRACT_BINDING"
fi

PROFILE=$([ "$TEST_ONLY" = 0 ] && printf authoritative-claude-only || printf test-only)
BINDING_ARG=$([ "$TEST_ONLY" = 0 ] && printf %s "$CONTRACT_BINDING" || printf -- -)
env -i \
  HOME="$HOME" USER="${USER:-$(id -un)}" LOGNAME="${LOGNAME:-$(id -un)}" \
  LANG=C.UTF-8 LC_ALL=C.UTF-8 PATH="$EVAL_PATH" \
  PYTHONDONTWRITEBYTECODE=1 PYTHONNOUSERSITE=1 PYTHONSAFEPATH=1 \
  "$PYTHON_BIN" -I -P "$SCRIPT_REPO/scripts/prompteval_source_receipt.py" \
  "$ROOT" "$PROMPT_ID" "$RECEIPT" "$SOURCE_COMMIT" "$SOURCE_TREE" \
  "$STARTED_AT" "$PROFILE" "$HARNESS_REVISION" "$HARNESS_LIBRARY_TREE" \
  "$HARNESS_ENTRY_BLOB" "$EXPECTED_CASES" "$BINDING_ARG"
echo "release eval source revision recorded: commit=$SOURCE_COMMIT run=$("$PYTHON_BIN" -I -P -c 'import json,sys; print(json.load(open(sys.argv[1]))["run_id"])' "$RECEIPT")"
