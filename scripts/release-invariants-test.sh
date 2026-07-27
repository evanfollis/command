#!/usr/bin/env bash
set -euo pipefail

ROOT=$(mktemp -d /tmp/command-release-test.XXXXXX)
trap 'rm -rf "$ROOT"' EXIT
mkdir -p "$ROOT/releases/a" "$ROOT/releases/b" "$ROOT/releases/.deps-a/node_modules" "$ROOT/releases/.deps-b/node_modules"
printf '{"lockfileVersion":3,"packages":{"":{"name":"a"}}}\n' > "$ROOT/a.lock"
printf '{"lockfileVersion":3,"packages":{"":{"name":"b"}}}\n' > "$ROOT/b.lock"
LOCK_A=$(sha256sum "$ROOT/a.lock" | cut -d' ' -f1)
LOCK_B=$(sha256sum "$ROOT/b.lock" | cut -d' ' -f1)
[ "$LOCK_A" != "$LOCK_B" ]
printf '14.2.35\n' > "$ROOT/releases/.deps-a/node_modules/runtime-version"
printf '15.5.18\n' > "$ROOT/releases/.deps-b/node_modules/runtime-version"
printf '14.2.35\n' > "$ROOT/releases/a/manifest-version"
printf '15.5.18\n' > "$ROOT/releases/b/manifest-version"
ln -s "$ROOT/releases/.deps-a/node_modules" "$ROOT/releases/a/node_modules"
ln -s "$ROOT/releases/.deps-b/node_modules" "$ROOT/releases/b/node_modules"
ln -s "$ROOT/releases/a" "$ROOT/releases/current"

smoke_runtime_match() {
  diff -q "$ROOT/releases/current/manifest-version" "$ROOT/releases/current/node_modules/runtime-version" >/dev/null
}

smoke_runtime_match
ln -sfn "$ROOT/releases/b" "$ROOT/releases/current.tmp"; mv -Tf "$ROOT/releases/current.tmp" "$ROOT/releases/current"
smoke_runtime_match

source scripts/release-lib.sh
printf 'PORT=4310\n' > "$ROOT/release.env"
[ "$(resolve_command_port "$ROOT/release.env")" = "4310" ]
[ "$(COMMAND_PORT=4320 resolve_command_port "$ROOT/release.env")" = "4320" ]

LOCK_PATH="$ROOT/deploy-locks/command.lock"
LOCK_READY="$ROOT/deploy-locks/ready"
mkdir -p "$(dirname "$LOCK_PATH")"
(
  exec 8>"$LOCK_PATH"
  flock 8
  : > "$LOCK_READY"
  sleep 5
) &
LOCK_HOLDER=$!
for _ in $(seq 1 50); do
  [ -f "$LOCK_READY" ] && break
  sleep 0.02
done
[ -f "$LOCK_READY" ]
if (acquire_command_deploy_lock "$LOCK_PATH") >/dev/null 2>&1; then
  echo 'concurrent Command deployment lock did not fail closed' >&2
  exit 1
fi
kill "$LOCK_HOLDER"
wait "$LOCK_HOLDER" 2>/dev/null || true
(acquire_command_deploy_lock "$LOCK_PATH")

set_command_release_link "$ROOT/releases" current "$ROOT/releases/b"
[ "$(readlink -f "$ROOT/releases/current")" = "$ROOT/releases/b" ]
set_command_release_link "$ROOT/releases" previous "$ROOT/releases/a"
restore_command_release_links \
  "$ROOT/releases" "$ROOT/releases/a" "$ROOT/releases/b"
[ "$(readlink -f "$ROOT/releases/current")" = "$ROOT/releases/a" ]
[ "$(readlink -f "$ROOT/releases/previous")" = "$ROOT/releases/b" ]
mkdir "$ROOT/outside-release"
if set_command_release_link "$ROOT/releases" current "$ROOT/outside-release" >/dev/null 2>&1; then
  echo 'release pointer accepted a target outside the immutable release root' >&2
  exit 1
fi

mkdir "$ROOT/dirty-repo"
git -C "$ROOT/dirty-repo" init -q
git -C "$ROOT/dirty-repo" config user.email test@example.invalid
git -C "$ROOT/dirty-repo" config user.name test
printf 'tracked\n' > "$ROOT/dirty-repo/tracked"
git -C "$ROOT/dirty-repo" add tracked
git -C "$ROOT/dirty-repo" commit -qm initial
bash scripts/assert-dirty-release-inputs.sh "$ROOT/dirty-repo"
printf 'untracked\n' > "$ROOT/dirty-repo/untracked"
if bash scripts/assert-dirty-release-inputs.sh "$ROOT/dirty-repo" >/dev/null 2>&1; then
  echo 'ALLOW_DIRTY untracked-input guard did not fail closed' >&2
  exit 1
fi
ln -sfn "$ROOT/releases/a" "$ROOT/releases/current.tmp"; mv -Tf "$ROOT/releases/current.tmp" "$ROOT/releases/current"
smoke_runtime_match

grep -q 'sha256sum "$STAGE/package-lock.json"' scripts/release.sh
grep -q 'ln -s "$DEPS/node_modules" "$STAGE/node_modules"' scripts/release.sh
grep -q 'SMOKE_BASE="http://127.0.0.1:${SERVICE_PORT}" npm run smoke' scripts/release.sh
grep -q 'recovered authenticated health' scripts/release.sh
grep -q 'FAILURE_RECEIPTS="$RELEASES/.failures"' scripts/release.sh
grep -q 'restore_command_release_links "$RELEASES" "$PREV" "$PREVIOUS_BEFORE"' scripts/release.sh
grep -q 'chmod a-w "$RELEASE/package.json" "$RELEASE/next.config.js" "$RELEASE/RELEASE.json" "$RELEASE"' scripts/release.sh
grep -q 'SMOKE_BASE="http://127.0.0.1:${SERVICE_PORT}" npm --prefix "$REPO" run smoke' scripts/rollback.sh
grep -q 'acquire_command_deploy_lock' scripts/release.sh
grep -q 'acquire_command_deploy_lock' scripts/rollback.sh
grep -q 'acquire_command_deploy_lock' scripts/install-service-unit.sh
if grep -q 'ln -s "$REPO/node_modules"' scripts/release.sh; then
  echo 'mutable repo node_modules is still referenced by release assembly' >&2
  exit 1
fi

echo 'cross-version release and rollback dependency invariants passed'
