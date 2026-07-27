#!/usr/bin/env bash
# Repoint `current` at the previous release and restart. Used when a bad release
# is already live; release.sh rolls back automatically on smoke failure.
set -euo pipefail
source "$(dirname "$0")/release-lib.sh"
WORKSPACE_ROOT=${WORKSPACE_ROOT:-/opt/workspace}
PROJECTS_ROOT=${PROJECTS_ROOT:-"$WORKSPACE_ROOT/projects"}
RUNTIME_ROOT=${RUNTIME_ROOT:-"$WORKSPACE_ROOT/runtime"}
RELEASES=${COMMAND_RELEASE_ROOT:-"$RUNTIME_ROOT/releases/command"}
REPO=${COMMAND_REPO_ROOT:-"$PROJECTS_ROOT/command"}
[ "$(id -u)" -eq 0 ] || { echo "rollback requires root" >&2; exit 1; }
acquire_command_deploy_lock "$RUNTIME_ROOT/deploy-locks/command.lock"
SERVICE_PORT=$(resolve_command_port "$REPO/.env.local")
[ -L "$RELEASES/previous" ] || { echo "no previous release to roll back to" >&2; exit 1; }
PREV=$(readlink -f "$RELEASES/previous")
CUR=$(readlink -f "$RELEASES/current")
set_command_release_link "$RELEASES" current "$PREV"
set_command_release_link "$RELEASES" previous "$CUR"
systemctl restart command
for _ in $(seq 1 15); do
  if systemctl is-active --quiet command && [ "$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${SERVICE_PORT}/login" 2>/dev/null || true)" = "200" ]; then
    if SMOKE_BASE="http://127.0.0.1:${SERVICE_PORT}" npm --prefix "$REPO" run smoke; then
      echo "rolled back to $(basename "$PREV"); recovered authenticated health verified"
      exit 0
    fi
    break
  fi
  sleep 1
done
echo "ROLLBACK TARGET UNHEALTHY: $(basename "$PREV")" >&2
exit 2
