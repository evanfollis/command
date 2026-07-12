#!/usr/bin/env bash
# Repoint `current` at the previous release and restart. Used when a bad release
# is already live; release.sh rolls back automatically on smoke failure.
set -euo pipefail
RELEASES=/opt/workspace/runtime/releases/command
[ -L "$RELEASES/previous" ] || { echo "no previous release to roll back to" >&2; exit 1; }
PREV=$(readlink -f "$RELEASES/previous")
CUR=$(readlink -f "$RELEASES/current")
ln -sfn "$PREV" "$RELEASES/current.tmp"; mv -Tf "$RELEASES/current.tmp" "$RELEASES/current"
ln -sfn "$CUR"  "$RELEASES/previous.tmp"; mv -Tf "$RELEASES/previous.tmp" "$RELEASES/previous"
systemctl restart command
echo "rolled back to $(basename "$PREV")"
