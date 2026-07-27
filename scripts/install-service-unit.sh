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
CANARY_ENV=/run/command-hardening-canary.env
LEGACY_DROPIN_DIR="$SYSTEMD_ROOT/command.service.d"
LEGACY_DROPIN="$LEGACY_DROPIN_DIR/10-immutable-release.conf"
HAD_SERVICE=false
SERVICE_USER=command

[ "$(id -u)" -eq 0 ] || { echo 'service installation requires root' >&2; exit 1; }
[ -f "$ROOT/.env.local" ] || { echo 'service installation requires .env.local' >&2; exit 1; }
[ "$(stat -c '%U:%G' "$ROOT/.env.local")" = 'root:root' ] \
  || { echo '.env.local must be owned by root:root' >&2; exit 1; }
[ $((8#$(stat -c '%a' "$ROOT/.env.local") & 8#077)) -eq 0 ] \
  || { echo '.env.local must not be accessible by group or other users' >&2; exit 1; }
for required_key in COMMAND_ORIGIN JWT_SECRET COMMAND_PASSWORD; do
  grep -Eq "^${required_key}=.+" "$ROOT/.env.local" \
    || { echo ".env.local must define non-empty ${required_key}" >&2; exit 1; }
done
acquire_command_deploy_lock "$RUNTIME_ROOT/deploy-locks/command.lock"

if ! getent passwd "$SERVICE_USER" >/dev/null; then
  useradd --system --user-group --home-dir /nonexistent --shell /usr/sbin/nologin "$SERVICE_USER"
fi
SERVICE_ACCOUNT=$(getent passwd "$SERVICE_USER")
[ "$(printf '%s' "$SERVICE_ACCOUNT" | cut -d: -f6)" = '/nonexistent' ] \
  || { echo 'command service account must use /nonexistent as its home' >&2; exit 1; }
[ "$(printf '%s' "$SERVICE_ACCOUNT" | cut -d: -f7)" = '/usr/sbin/nologin' ] \
  || { echo 'command service account must use the nologin shell' >&2; exit 1; }
[ "$(id -gn "$SERVICE_USER")" = "$SERVICE_USER" ] \
  || { echo 'command service account must use its dedicated primary group' >&2; exit 1; }
[ "$(id -Gn "$SERVICE_USER")" = "$SERVICE_USER" ] \
  || { echo 'command service account must not have supplementary groups' >&2; exit 1; }

# Grant only the evidence and write paths the observatory actually consumes.
# Claude session files can be created with mode 0600, so both existing and
# future records receive an explicit read ACL. The process never receives
# broad root, docker, or privileged-group membership.
setfacl -m "u:$SERVICE_USER:--x" /root
setfacl -m "u:$SERVICE_USER:--x" /root/.claude
setfacl -m "u:$SERVICE_USER:r-x,d:u:$SERVICE_USER:r-x" /root/.claude/sessions
find /root/.claude/sessions -maxdepth 1 -type f -exec setfacl -m "u:$SERVICE_USER:r--" {} +
mkdir -p "$RUNTIME_ROOT/.telemetry"
setfacl -m "u:$SERVICE_USER:rwx,d:u:$SERVICE_USER:rwx" "$RUNTIME_ROOT/.telemetry"
if [ -f "$RUNTIME_ROOT/.telemetry/events.jsonl" ]; then
  setfacl -m "u:$SERVICE_USER:rw-" "$RUNTIME_ROOT/.telemetry/events.jsonl"
fi

# Eval reports are an explicitly declassified observability surface. Expose
# only visible project/prompt directories and their run JSON reports; caches,
# transcripts, provenance, and repository holdouts remain inaccessible.
PROMPTEVAL_ROOT="$RUNTIME_ROOT/prompteval"
if [ -d "$PROMPTEVAL_ROOT" ]; then
  setfacl -m "u:$SERVICE_USER:r-x" "$PROMPTEVAL_ROOT"
  while IFS= read -r -d '' project_dir; do
    setfacl -m "u:$SERVICE_USER:r-x" "$project_dir"
    while IFS= read -r -d '' prompt_dir; do
      setfacl -m "u:$SERVICE_USER:r-x" "$prompt_dir"
      runs_dir="$prompt_dir/runs"
      [ -d "$runs_dir" ] || continue
      # Reports created later in this already-approved projection inherit the
      # same read-only service ACL. No default is placed on the eval root,
      # project, or prompt directory, so novel trees remain fail-closed.
      setfacl -m "u:$SERVICE_USER:r-x,d:u:$SERVICE_USER:r-x" "$runs_dir"
      find "$runs_dir" -maxdepth 1 -type f -name '*.json' \
        -exec setfacl -m "u:$SERVICE_USER:r--" {} +
    done < <(find "$project_dir" -mindepth 1 -maxdepth 1 -type d ! -name '.*' -print0)
  done < <(find "$PROMPTEVAL_ROOT" -mindepth 1 -maxdepth 1 -type d ! -name '.*' -print0)
fi
bash "$ROOT/scripts/install-node-runtime.sh"
NODE_RUNTIME="$RUNTIME_ROOT/toolchains/node-24-current"
NODE_RUNTIME_REAL=$(readlink -f "$NODE_RUNTIME")
CURRENT_RELEASE=$(readlink -f "$RUNTIME_ROOT/releases/command/current")
CURRENT_DEPS=$(readlink -f "$CURRENT_RELEASE/node_modules")
[ -d "$NODE_RUNTIME_REAL" ] || { echo 'pinned Node runtime target is missing' >&2; exit 1; }
[ -d "$CURRENT_RELEASE" ] || { echo 'current immutable release target is missing' >&2; exit 1; }
[ -d "$CURRENT_DEPS" ] || { echo 'current immutable dependency target is missing' >&2; exit 1; }

# Runtime artifacts remain root-owned and immutable. Named ACLs expose only
# read/traverse access to the dedicated process identity, including the
# dependency cache reached through the release's node_modules symlink.
setfacl -m "u:$SERVICE_USER:--x" \
  "$RUNTIME_ROOT/toolchains" "$RUNTIME_ROOT/releases" "$RUNTIME_ROOT/releases/command"
setfacl -R -m "u:$SERVICE_USER:r-X" "$NODE_RUNTIME_REAL" "$CURRENT_RELEASE"
setfacl -m "u:$SERVICE_USER:--x" "$(dirname "$CURRENT_DEPS")"
setfacl -R -m "u:$SERVICE_USER:r-X" "$CURRENT_DEPS"
export PATH="$NODE_RUNTIME/bin:$PATH"
runuser -u "$SERVICE_USER" -- test -x "$NODE_RUNTIME/bin/node"
runuser -u "$SERVICE_USER" -- test -r "$CURRENT_RELEASE/dist/server.js"
runuser -u "$SERVICE_USER" -- test -r "$CURRENT_DEPS/next/package.json"
runuser -u "$SERVICE_USER" -- test -w "$RUNTIME_ROOT/.telemetry"
if [ -d "$PROMPTEVAL_ROOT/.provenance" ] \
  && runuser -u "$SERVICE_USER" -- test -r "$PROMPTEVAL_ROOT/.provenance"; then
  echo 'command service account must not read eval provenance' >&2
  exit 1
fi
if runuser -u "$SERVICE_USER" -- test -r "$ROOT/.env.local"; then
  echo 'command service account must not read the runtime environment file' >&2
  exit 1
fi
SERVICE_PORT=$(resolve_command_port "$ROOT/.env.local")
CURRENT_VERSION=$(cat "$CURRENT_RELEASE/dist/.version")
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
  rm -f "$CANARY_ENV"
  systemctl daemon-reload
}
trap cleanup_canary EXIT

printf 'PORT=3310\n' > "$CANARY_ENV"
chmod 0600 "$CANARY_ENV"
install -m 0644 "$ROOT/deploy/command-canary.service" "$CANARY_INSTALLED"
systemctl daemon-reload
systemctl start "$CANARY"
for _ in $(seq 1 15); do
  if [ "$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3310/login 2>/dev/null || true)" = 200 ]; then
    break
  fi
  sleep 1
done
if [ "$CURRENT_VERSION" = 'fde91bef34827c18572465b37557201fe7535eb1' ]; then
  # This immutable predecessor scans hidden eval provenance before the
  # dedicated-identity projection boundary existed and predates the complete
  # response-header contract. Do not grant broader evidence access. Name both
  # predecessor exceptions explicitly; all newer releases receive neither.
  SMOKE_ALLOW_LEGACY_EVAL_ACL_FAILURE=1 \
    SMOKE_ALLOW_PRE_CSP_RELEASE=1 \
    SMOKE_BASE=http://127.0.0.1:3310 npm --prefix "$ROOT" run smoke
else
  SMOKE_BASE=http://127.0.0.1:3310 npm --prefix "$ROOT" run smoke
fi
cleanup_canary
trap - EXIT
if [ "${CANARY_ONLY:-0}" = '1' ]; then
  echo 'dedicated-identity canary and authenticated smoke passed; production unit unchanged'
  exit 0
fi

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
