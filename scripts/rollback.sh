#!/usr/bin/env bash
# Repoint `current` at the previous release and restart. Used when a bad release
# is already live; release.sh rolls back automatically on smoke failure.
set -euo pipefail
source "$(dirname "$0")/release-lib.sh"
RELEASES=/opt/workspace/runtime/releases/command
SERVICE_PORT=$(resolve_command_port /opt/workspace/projects/command/.env.local)
[ -L "$RELEASES/previous" ] || { echo "no previous release to roll back to" >&2; exit 1; }
PREV=$(readlink -f "$RELEASES/previous")
CUR=$(readlink -f "$RELEASES/current")
ln -sfn "$PREV" "$RELEASES/current.tmp"; mv -Tf "$RELEASES/current.tmp" "$RELEASES/current"
ln -sfn "$CUR"  "$RELEASES/previous.tmp"; mv -Tf "$RELEASES/previous.tmp" "$RELEASES/previous"
systemctl restart command
for _ in $(seq 1 15); do
  if systemctl is-active --quiet command && [ "$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${SERVICE_PORT}/login" 2>/dev/null || true)" = "200" ]; then
    echo "rolled back to $(basename "$PREV"); service active and /login=200"
    exit 0
  fi
  sleep 1
done
echo "ROLLBACK TARGET UNHEALTHY: $(basename "$PREV")" >&2
exit 2
