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
if grep -q 'ln -s "$REPO/node_modules"' scripts/release.sh; then
  echo 'mutable repo node_modules is still referenced by release assembly' >&2
  exit 1
fi

echo 'cross-version release and rollback dependency invariants passed'
