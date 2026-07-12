#!/usr/bin/env bash
# Build an immutable release and atomically point the service at it.
#
# The 2026-07-12 outage: `next build` ran in the live working directory while the
# service was running. Next rewrote .next in place, the process kept serving the
# previous build's HTML/manifests, and route chunks 404'd — a split brain that a
# health check cannot see. Guarding the build was not enough, because any bare
# `next build` reintroduces it.
#
# So the service no longer reads the working directory at all. It runs from
# <RELEASES>/current, an immutable release tree. A stray build in the repo can
# only touch the repo's own .next, which nothing serves.
#
# Invariants:
#   - builds happen in a throwaway git worktree, never in the live tree
#   - a release directory is never mutated after `current` points at it
#   - `current` moves by rename(2) — a reader sees the old or the new tree, never a mix
#   - dist/.version records the true SHA and dirty state, not just `git rev-parse HEAD`
#   - smoke failure rolls `current` back to the previous release
set -euo pipefail

REPO=/opt/workspace/projects/command
RELEASES=/opt/workspace/runtime/releases/command
KEEP=5
SERVICE=command

cd "$REPO"
SHA=$(git rev-parse HEAD)
SHORT=$(git rev-parse --short HEAD)
# Three modes, because "the tree is dirty" has two legitimate answers and one wrong one:
#   (default)      refuse — deployed must equal committed
#   HEAD_ONLY=1    release committed HEAD, ignoring working-tree changes. Clean and
#                  truthful: the release contains exactly HEAD. This is the incident
#                  path — restore the committed state without discarding WIP.
#   ALLOW_DIRTY=1  release the working tree as it stands, recorded dirty:true and
#                  reported as such by /api/health. Never silently labelled clean.
DIRTY=false
if [ -n "$(git status --porcelain)" ]; then
  if [ "${ALLOW_DIRTY:-0}" = "1" ]; then
    DIRTY=true
  elif [ "${HEAD_ONLY:-0}" = "1" ]; then
    echo "note: working tree has uncommitted changes; releasing committed HEAD only" >&2
  else
    echo "ERROR: working tree is dirty. Commit first, or:" >&2
    echo "  HEAD_ONLY=1   release committed HEAD, leaving your WIP untouched" >&2
    echo "  ALLOW_DIRTY=1 release the tree as-is (recorded and reported as dirty)" >&2
    git status --porcelain >&2
    exit 1
  fi
fi

TS=$(date -u +%Y%m%dT%H%M%SZ)
RELEASE_ID="$TS-$SHORT"; [ "$DIRTY" = true ] && RELEASE_ID="$RELEASE_ID-dirty"
RELEASE="$RELEASES/$RELEASE_ID"
STAGE=$(mktemp -d /opt/workspace/runtime/staging/command-build.XXXXXX)
DEPS_STAGE=""

cleanup() { cd "$REPO"; git worktree remove --force "$STAGE" 2>/dev/null || rm -rf "$STAGE"; [ -z "$DEPS_STAGE" ] || rm -rf "$DEPS_STAGE"; }
trap cleanup EXIT

echo "==> building $RELEASE_ID (sha=$SHORT dirty=$DIRTY) in an isolated worktree"
mkdir -p "$RELEASES" /opt/workspace/runtime/staging
rm -rf "$STAGE"
git worktree add --detach "$STAGE" HEAD >/dev/null
if [ "$DIRTY" = true ]; then
  # Incident builds must reproduce what is actually in the tree, not just HEAD.
  git diff HEAD | (cd "$STAGE" && git apply --allow-empty -)
fi
cp "$REPO/.env.local" "$STAGE/.env.local" 2>/dev/null || true

# Compute from the staged release source, never the mutable working tree. The
# cache contains full dependencies because this exact tree must build and run
# the staged lockfile; using repo dependencies for the build recreates the same
# cross-version contamination class as using them at runtime.
LOCK_HASH=$(sha256sum "$STAGE/package-lock.json" | cut -d' ' -f1)
DEPS="$RELEASES/.deps-v2-$LOCK_HASH"
if [ ! -d "$DEPS/node_modules" ]; then
  DEPS_STAGE=$(mktemp -d /opt/workspace/runtime/staging/command-deps.XXXXXX)
  cp "$STAGE/package.json" "$STAGE/package-lock.json" "$DEPS_STAGE/"
  ( cd "$DEPS_STAGE" && npm ci )
  chmod -R a-w "$DEPS_STAGE/node_modules"
  mv "$DEPS_STAGE" "$DEPS"
  DEPS_STAGE=""
fi
ln -s "$DEPS/node_modules" "$STAGE/node_modules"

( cd "$STAGE" && npm run build )

echo "==> assembling immutable release"
mkdir -p "$RELEASE"
mv "$STAGE/.next" "$RELEASE/.next"
mv "$STAGE/dist"  "$RELEASE/dist"
cp "$STAGE/package.json" "$STAGE/next.config.js" "$RELEASE/"
ln -s "$DEPS/node_modules" "$RELEASE/node_modules"

VERSION="$SHA"; [ "$DIRTY" = true ] && VERSION="$SHA-dirty"
printf '%s\n' "$VERSION" > "$RELEASE/dist/.version"
cat > "$RELEASE/RELEASE.json" <<EOF
{"releaseId":"$RELEASE_ID","sha":"$SHA","dirty":$DIRTY,"builtAt":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
EOF
chmod -R a-w "$RELEASE/.next" "$RELEASE/dist"

PREV=""
[ -L "$RELEASES/current" ] && PREV=$(readlink -f "$RELEASES/current")

echo "==> pointing current -> $RELEASE_ID and restarting"
ln -sfn "$RELEASE" "$RELEASES/current.tmp"
mv -Tf "$RELEASES/current.tmp" "$RELEASES/current"   # rename(2): atomic
[ -n "$PREV" ] && ln -sfn "$PREV" "$RELEASES/previous.tmp" && mv -Tf "$RELEASES/previous.tmp" "$RELEASES/previous"
systemctl restart "$SERVICE"

wait_for_service() {
  for _ in $(seq 1 15); do
    if systemctl is-active --quiet "$SERVICE" && [ "$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3100/login 2>/dev/null || true)" = "200" ]; then return 0; fi
    sleep 1
  done
  return 1
}

if wait_for_service && ( cd "$REPO" && npm run smoke ); then
  echo "==> release $RELEASE_ID live and smoked"
else
  echo "!! new release failed service/login health or smoke" >&2
  echo "!! smoke FAILED — rolling back to $(basename "${PREV:-none}")" >&2
  if [ -n "$PREV" ]; then
    ln -sfn "$PREV" "$RELEASES/current.tmp"; mv -Tf "$RELEASES/current.tmp" "$RELEASES/current"
    systemctl restart "$SERVICE"
    if wait_for_service; then
      echo "!! rolled back and verified service active with /login=200." >&2
    else
      echo "!! ROLLBACK TARGET UNHEALTHY: $(basename "$PREV")" >&2
      exit 2
    fi
  fi
  exit 1
fi

# Keep the last KEEP releases; never reap current/previous.
cd "$RELEASES"
ls -1dt */ 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
  old=${old%/}
  [ "$RELEASES/$old" = "$(readlink -f current)" ] && continue
  [ -L previous ] && [ "$RELEASES/$old" = "$(readlink -f previous)" ] && continue
  chmod -R u+w "$old" 2>/dev/null || true
  rm -rf "$old"
done
