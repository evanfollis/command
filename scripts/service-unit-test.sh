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
  grep -q '^PrivateDevices=yes$' "$unit"
  grep -q '^RestrictNamespaces=yes$' "$unit"
  grep -q '^UMask=0077$' "$unit"
  grep -q '^ReadOnlyPaths=/opt/workspace$' "$unit"
  grep -q '^ReadWritePaths=/opt/workspace/runtime/.telemetry$' "$unit"
  grep -q '^InaccessiblePaths=.*runtime/.secrets' "$unit"
  grep -q '^ExecStart=/opt/workspace/runtime/toolchains/node-24-current/bin/node dist/server.js$' "$unit"
done

grep -q '^WorkingDirectory=/opt/workspace/runtime/releases/command/current$' deploy/command.service
grep -q '^Environment=PORT=3310$' deploy/command-canary.service
grep -q 'rm -f "$LEGACY_DROPIN"' scripts/install-service-unit.sh
grep -q 'property=DropInPaths' scripts/install-service-unit.sh
grep -q 'node-24-current/bin/node' scripts/install-service-unit.sh
grep -q '.env.local must be owned by root:root' scripts/install-service-unit.sh
grep -q '.env.local must not be accessible by group or other users' scripts/install-service-unit.sh
grep -q 'tar --no-same-owner' scripts/install-node-runtime.sh
grep -q 'chown -R root:root "$TARGET"' scripts/install-node-runtime.sh
grep -q '"version": "24.18.0"' deploy/node-runtime-v24.18.0.json
grep -q '"sha256": "55aa7153f9d88f28d765fcdad5ae6945b5c0f98a36881703817e4c450fa76742"' deploy/node-runtime-v24.18.0.json
if grep -Eq '^PrivateTmp=yes$|^User=(command|command-observatory)$' deploy/command.service; then
  echo 'root/session-observation exception changed without projection cutover evidence' >&2
  exit 1
fi

echo 'versioned systemd unit and bounded containment-exception contracts passed'
