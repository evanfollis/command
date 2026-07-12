#!/usr/bin/env bash
set -euo pipefail

ROOT=$(mktemp -d /tmp/command-release-test.XXXXXX)
trap 'rm -rf "$ROOT"' EXIT
mkdir -p "$ROOT/releases/a" "$ROOT/releases/b" "$ROOT/releases/.deps-a/node_modules" "$ROOT/releases/.deps-b/node_modules"
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
ln -sfn "$ROOT/releases/a" "$ROOT/releases/current.tmp"; mv -Tf "$ROOT/releases/current.tmp" "$ROOT/releases/current"
smoke_runtime_match

grep -q 'sha256sum "$STAGE/package-lock.json"' scripts/release.sh
grep -q 'ln -s "$DEPS/node_modules" "$STAGE/node_modules"' scripts/release.sh
if grep -q 'ln -s "$REPO/node_modules"' scripts/release.sh; then
  echo 'mutable repo node_modules is still referenced by release assembly' >&2
  exit 1
fi

echo 'cross-version release and rollback dependency invariants passed'
