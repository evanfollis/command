#!/usr/bin/env bash
# Install Command's pinned supported Node LTS without changing the host-wide
# /usr/bin/node used by unrelated services.
set -euo pipefail

ROOT=${COMMAND_REPO_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}
RUNTIME_ROOT=${RUNTIME_ROOT:-/opt/workspace/runtime}
VERSION=24.18.0
ARCHIVE="node-v${VERSION}-linux-x64"
EXPECTED_SHA256=55aa7153f9d88f28d765fcdad5ae6945b5c0f98a36881703817e4c450fa76742
TOOLCHAINS="$RUNTIME_ROOT/toolchains"
TARGET="$TOOLCHAINS/$ARCHIVE"
CURRENT="$TOOLCHAINS/node-24-current"
RECEIPT="$TOOLCHAINS/$ARCHIVE.receipt.json"

mkdir -p "$TOOLCHAINS"
if [ ! -x "$TARGET/bin/node" ]; then
  [ ! -e "$TARGET" ] || {
    echo "ERROR: incomplete Node runtime already exists at $TARGET" >&2
    exit 1
  }
  STAGE=$(mktemp -d "$TOOLCHAINS/node-24-install.XXXXXX")
  cleanup() { rm -rf "$STAGE"; }
  trap cleanup EXIT
  curl --fail --silent --show-error --location \
    "https://nodejs.org/dist/v${VERSION}/${ARCHIVE}.tar.xz" \
    --output "$STAGE/$ARCHIVE.tar.xz"
  printf '%s  %s\n' "$EXPECTED_SHA256" "$STAGE/$ARCHIVE.tar.xz" | sha256sum --check --status
  tar --no-same-owner -xJf "$STAGE/$ARCHIVE.tar.xz" -C "$STAGE"
  mv "$STAGE/$ARCHIVE" "$TARGET"
  trap - EXIT
  cleanup
fi

chown -R root:root "$TARGET"
chmod -R go-w "$TARGET"
[ "$("$TARGET/bin/node" --version)" = "v$VERSION" ] || {
  echo "ERROR: $TARGET does not provide Node v$VERSION" >&2
  exit 1
}
ln -sfn "$TARGET" "$CURRENT.tmp"
mv -Tf "$CURRENT.tmp" "$CURRENT"
install -m 0444 "$ROOT/deploy/node-runtime-v24.18.0.json" "$RECEIPT.tmp"
mv -Tf "$RECEIPT.tmp" "$RECEIPT"
echo "Node v$VERSION is available at $CURRENT/bin/node"
