#!/usr/bin/env bash
# Canary the tracked hardening policy against the current immutable release,
# then install it atomically with a rollback-on-smoke-failure receipt.
set -euo pipefail

ROOT=${COMMAND_REPO_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}
RUNTIME_ROOT=${RUNTIME_ROOT:-/opt/workspace/runtime}
source "$ROOT/scripts/release-lib.sh"
SYSTEMD_ROOT=${COMMAND_SYSTEMD_ROOT:-/etc/systemd/system}
SERVICE=command.service
CANARY=command-hardening-canary.service
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP_DIR="$RUNTIME_ROOT/deploy-backups/command/$STAMP"
INSTALLED="$SYSTEMD_ROOT/$SERVICE"
CANARY_INSTALLED="$SYSTEMD_ROOT/$CANARY"
LEGACY_DROPIN_DIR="$SYSTEMD_ROOT/command.service.d"
LEGACY_DROPIN="$LEGACY_DROPIN_DIR/10-immutable-release.conf"
HAD_SERVICE=false

[ "$(id -u)" -eq 0 ] || { echo 'service installation requires root' >&2; exit 1; }
"$ROOT/scripts/install-node-runtime.sh"
NODE_RUNTIME="$RUNTIME_ROOT/toolchains/node-24-current"
export PATH="$NODE_RUNTIME/bin:$PATH"
SERVICE_PORT=$(resolve_command_port "$ROOT/.env.local")
systemd-analyze verify "$ROOT/deploy/command.service" "$ROOT/deploy/command-canary.service"
mkdir -p "$BACKUP_DIR"
if [ -f "$INSTALLED" ]; then
  HAD_SERVICE=true
  cp --preserve=mode,timestamps "$INSTALLED" "$BACKUP_DIR/command.service"
fi
if [ -f "$LEGACY_DROPIN" ]; then
  cp --preserve=mode,timestamps "$LEGACY_DROPIN" "$BACKUP_DIR/10-immutable-release.conf"
fi

cleanup_canary() {
  systemctl stop "$CANARY" >/dev/null 2>&1 || true
  rm -f "$CANARY_INSTALLED"
  systemctl daemon-reload
}
trap cleanup_canary EXIT

install -m 0644 "$ROOT/deploy/command-canary.service" "$CANARY_INSTALLED"
systemctl daemon-reload
systemctl start "$CANARY"
for _ in $(seq 1 15); do
  if [ "$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3310/login 2>/dev/null || true)" = 200 ]; then
    break
  fi
  sleep 1
done
SMOKE_BASE=http://127.0.0.1:3310 npm --prefix "$ROOT" run smoke
cleanup_canary
trap - EXIT

install -m 0644 "$ROOT/deploy/command.service" "$INSTALLED.new"
mv -T "$INSTALLED.new" "$INSTALLED"
# The old deployment used a partial drop-in whose ExecStart points at
# /usr/bin/node. Leaving it installed would silently override the complete
# versioned unit and defeat the pinned-runtime migration.
rm -f "$LEGACY_DROPIN"
rmdir "$LEGACY_DROPIN_DIR" 2>/dev/null || true
systemctl daemon-reload
if [ -n "$(systemctl show "$SERVICE" --property=DropInPaths --value)" ]; then
  echo 'production unit still has unversioned drop-ins; refusing cutover' >&2
elif ! systemctl show "$SERVICE" --property=ExecStart --value | grep -Fq \
  '/opt/workspace/runtime/toolchains/node-24-current/bin/node'; then
  echo 'production unit did not resolve to the pinned Node runtime' >&2
elif systemctl restart "$SERVICE" \
  && SMOKE_BASE="http://127.0.0.1:$SERVICE_PORT" npm --prefix "$ROOT" run smoke; then
  echo "installed and verified $SERVICE; rollback unit: $BACKUP_DIR/command.service"
  exit 0
fi

echo 'production unit smoke failed; restoring previous unit' >&2
if [ -f "$BACKUP_DIR/command.service" ]; then
  install -m 0644 "$BACKUP_DIR/command.service" "$INSTALLED.new"
  mv -T "$INSTALLED.new" "$INSTALLED"
else
  rm -f "$INSTALLED"
fi
if [ -f "$BACKUP_DIR/10-immutable-release.conf" ]; then
  mkdir -p "$LEGACY_DROPIN_DIR"
  install -m 0644 "$BACKUP_DIR/10-immutable-release.conf" "$LEGACY_DROPIN"
fi
systemctl daemon-reload
if [ "$HAD_SERVICE" = true ]; then
  systemctl restart "$SERVICE"
  SMOKE_BASE="http://127.0.0.1:$SERVICE_PORT" npm --prefix "$ROOT" run smoke
else
  systemctl reset-failed "$SERVICE" >/dev/null 2>&1 || true
fi
exit 1
