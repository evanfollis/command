#!/usr/bin/env bash
set -euo pipefail

[ ! -e deploy/command.service.d/10-immutable-release.conf ] || {
  echo 'legacy partial unit drop-in must not coexist with the complete versioned unit' >&2
  exit 1
}

for unit in deploy/command.service deploy/command-canary.service; do
  systemd-analyze verify "$unit"
  grep -q '^NoNewPrivileges=yes$' "$unit"
  grep -q '^CapabilityBoundingSet=$' "$unit"
  grep -q '^ProtectSystem=strict$' "$unit"
  grep -q '^ProtectKernelModules=yes$' "$unit"
  grep -q '^ProtectProc=invisible$' "$unit"
  grep -q '^ProcSubset=pid$' "$unit"
  grep -q '^PrivateDevices=yes$' "$unit"
  grep -q '^PrivateMounts=yes$' "$unit"
  grep -q '^PrivateTmp=yes$' "$unit"
  grep -q '^RestrictNamespaces=yes$' "$unit"
  grep -q '^KeyringMode=private$' "$unit"
  grep -q '^SystemCallFilter=~@clock @cpu-emulation @debug @module @mount @privileged @raw-io @reboot @swap$' "$unit"
  grep -q '^IPAddressDeny=any$' "$unit"
  grep -q '^IPAddressAllow=localhost$' "$unit"
  grep -q '^UMask=0077$' "$unit"
  grep -q '^ReadOnlyPaths=/opt/workspace$' "$unit"
  grep -q '^ReadWritePaths=/opt/workspace/runtime/.telemetry$' "$unit"
  grep -q '^InaccessiblePaths=.*runtime/.secrets' "$unit"
  grep -q '^InaccessiblePaths=.*prompteval/.provenance.*prompteval/.transcripts' "$unit"
  grep -q '^InaccessiblePaths=.*projects/command/.env.local' "$unit"
  grep -q '^InaccessiblePaths=.*root/.claude.json.*root/.claude/.credentials.json' "$unit"
  grep -q '^ExecStart=/opt/workspace/runtime/toolchains/node-24-current/bin/node dist/server.js$' "$unit"
  grep -q '^ExecStartPre=/usr/bin/test ! -r /opt/workspace/projects/command/.env.local$' "$unit"
  grep -q '^ExecStartPre=/usr/bin/test ! -r /opt/workspace/runtime/prompteval/.provenance$' "$unit"
  grep -q '^User=command$' "$unit"
  grep -q '^Group=command$' "$unit"
done

grep -q '^WorkingDirectory=/opt/workspace/runtime/releases/command/current$' deploy/command.service
grep -q '^EnvironmentFile=/run/command-hardening-canary.env$' deploy/command-canary.service
grep -q 'rm -f "$LEGACY_DROPIN"' scripts/install-service-unit.sh
grep -q 'property=DropInPaths' scripts/install-service-unit.sh
grep -q 'node-24-current/bin/node' scripts/install-service-unit.sh
grep -q '.env.local must be owned by root:root' scripts/install-service-unit.sh
grep -q '.env.local must not be accessible by group or other users' scripts/install-service-unit.sh
grep -q 'useradd --system --user-group --home-dir /nonexistent --shell /usr/sbin/nologin' scripts/install-service-unit.sh
grep -q 'setfacl -m "u:$SERVICE_USER:--x" /root' scripts/install-service-unit.sh
grep -q 'd:u:$SERVICE_USER:r-x" /root/.claude/sessions' scripts/install-service-unit.sh
grep -q 'd:u:$SERVICE_USER:rwx" "$RUNTIME_ROOT/.telemetry"' scripts/install-service-unit.sh
grep -Fq 'find "$PROMPTEVAL_ROOT" -mindepth 1 -maxdepth 1 -type d ! -name '\''.*'\'' -print0' scripts/install-service-unit.sh
grep -Fq 'find "$runs_dir" -maxdepth 1 -type f -name '\''*.json'\''' scripts/install-service-unit.sh
grep -q 'd:u:$SERVICE_USER:r-x" "$runs_dir"' scripts/install-service-unit.sh
grep -q 'command service account must not read eval provenance' scripts/install-service-unit.sh
grep -q 'setfacl -R -m "u:$SERVICE_USER:r-X" "$NODE_RUNTIME_REAL" "$CURRENT_RELEASE"' scripts/install-service-unit.sh
grep -q 'setfacl -R -m "u:$SERVICE_USER:r-X" "$CURRENT_DEPS"' scripts/install-service-unit.sh
if grep -Eq 'server-access|/tmp/tmux-0|COMMAND_TMUX_SOCKET' scripts/install-service-unit.sh deploy/command.service deploy/command-canary.service; then
  echo 'dedicated observatory identity must not receive a mutable tmux socket' >&2
  exit 1
fi
grep -q 'runuser -u "$SERVICE_USER" -- test -r "$CURRENT_RELEASE/dist/server.js"' scripts/install-service-unit.sh
grep -q 'runuser -u "$SERVICE_USER" -- test -r "$CURRENT_DEPS/next/package.json"' scripts/install-service-unit.sh
grep -q 'runuser -u "$SERVICE_USER" -- test -w "$RUNTIME_ROOT/.telemetry"' scripts/install-service-unit.sh
grep -q 'runuser -u "$SERVICE_USER" -- test -r "$ROOT/.env.local"' scripts/install-service-unit.sh
grep -q 'CANARY_ONLY:-0' scripts/install-service-unit.sh
grep -q "CURRENT_VERSION.*CURRENT_RELEASE/dist/.version" scripts/install-service-unit.sh
grep -q "CURRENT_VERSION.*fde91bef34827c18572465b37557201fe7535eb1" scripts/install-service-unit.sh
grep -q 'SMOKE_ALLOW_LEGACY_EVAL_ACL_FAILURE=1' scripts/install-service-unit.sh
grep -q "path === '/api/evals/summary'" scripts/smoke.ts
grep -q "response.status === 500" scripts/smoke.ts
grep -Fq "printf 'PORT=3310\\n' > \"\$CANARY_ENV\"" scripts/install-service-unit.sh
grep -q 'rm -f "$CANARY_ENV"' scripts/install-service-unit.sh
grep -q 'production unit unchanged' scripts/install-service-unit.sh
if grep -Eq 'usermod.*docker|SupplementaryGroups=.*(docker|root)' scripts/install-service-unit.sh deploy/command.service; then
  echo 'dedicated observatory identity gained a privileged group' >&2
  exit 1
fi
grep -q 'getent passwd "$SERVICE_USER"' scripts/release.sh
grep -q 'setfacl -R -m "u:$SERVICE_USER:r-X" "$RELEASE" "$DEPS/node_modules"' scripts/release.sh
grep -q 'tar --no-same-owner' scripts/install-node-runtime.sh
grep -q 'chown -R root:root "$TARGET"' scripts/install-node-runtime.sh
grep -q '"version": "24.18.0"' deploy/node-runtime-v24.18.0.json
grep -q '"sha256": "55aa7153f9d88f28d765fcdad5ae6945b5c0f98a36881703817e4c450fa76742"' deploy/node-runtime-v24.18.0.json
if grep -q '^User=root$' deploy/command.service deploy/command-canary.service; then
  echo 'observatory units must not retain root identity' >&2
  exit 1
fi

echo 'versioned dedicated-identity systemd and bounded evidence ACL contracts passed'
