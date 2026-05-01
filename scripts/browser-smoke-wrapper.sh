#!/usr/bin/env bash
# Sets required env vars and invokes browser-smoke.ts.
# PLAYWRIGHT_BROWSERS_PATH must be set before node starts (playwright reads it
# at module init, not lazily). Shell wrapper is the only clean way to do this
# while keeping the TypeScript side free of env bootstrapping.

set -euo pipefail

LIBS=/tmp/browser-libs
MARKER="$LIBS/usr/lib/x86_64-linux-gnu/libnspr4.so"

if [ ! -f "$MARKER" ]; then
  echo "Browser system libs not found at $LIBS."
  echo "Run: npm run browser:setup  (re-run after each host reboot)"
  exit 1
fi

CHROMIUM_BIN=$(find node_modules/playwright-core/.local-browsers -name "chrome-headless-shell" -type f 2>/dev/null | head -1)
if [ -z "$CHROMIUM_BIN" ]; then
  echo "Chromium binary not found in node_modules."
  echo "Run: PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium"
  exit 1
fi

export PLAYWRIGHT_BROWSERS_PATH=0
export LD_LIBRARY_PATH="$LIBS/usr/lib/x86_64-linux-gnu:$LIBS/usr/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

exec npx tsx "$(dirname "$0")/browser-smoke.ts" "$@"
