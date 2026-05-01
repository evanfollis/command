#!/usr/bin/env bash
# Downloads and extracts system libraries required for Chromium headless.
# Re-run after host reboot — /tmp is ephemeral.
#
# Does not install packages (dpkg cannot write to read-only /var/lib/dpkg
# in tick sessions). Extracts .deb files to /tmp/browser-libs/ and sets
# LD_LIBRARY_PATH so node's child-process chromium inherits them.

set -euo pipefail

LIBS_DIR=/tmp/browser-libs
MARKER="$LIBS_DIR/usr/lib/x86_64-linux-gnu/libnspr4.so"

if [ -f "$MARKER" ]; then
  echo "Browser libs already present at $LIBS_DIR"
  exit 0
fi

echo "Downloading browser system dependencies..."

DL_DIR=$(mktemp -d /tmp/browser-libs-dl.XXXXXX)
# shellcheck disable=SC2064
trap "rm -rf '$DL_DIR'" EXIT

mkdir -p "$DL_DIR/partial"

# All packages chromium-headless-shell needs that are not on this host.
apt-get \
  -o Dir::Cache::Archives="$DL_DIR" \
  install -y --download-only \
  libnspr4 libnss3 \
  libatk1.0-0t64 libatk-bridge2.0-0t64 libatspi2.0-0t64 \
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
  libgbm1 libasound2t64 libxext6 libxi6 libxtst6 \
  2>&1 | grep -v "^W:" || true

DEB_COUNT=$(find "$DL_DIR" -name "*.deb" | wc -l)
if [ "$DEB_COUNT" -eq 0 ]; then
  echo "ERROR: No .deb files downloaded. Check apt connectivity." >&2
  exit 1
fi

echo "Extracting $DEB_COUNT packages to $LIBS_DIR..."
mkdir -p "$LIBS_DIR"
for deb in "$DL_DIR"/*.deb; do
  dpkg-deb -x "$deb" "$LIBS_DIR/" 2>/dev/null
done

if [ ! -f "$MARKER" ]; then
  echo "ERROR: Expected marker $MARKER not found after extraction." >&2
  exit 1
fi

echo "Browser libs ready at $LIBS_DIR"
