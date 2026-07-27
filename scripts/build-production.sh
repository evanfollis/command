#!/usr/bin/env bash
# Build with non-secret credential canaries, then prove no credential-shaped
# build input was retained in generated client or server output.
set -euo pipefail

JWT_CANARY=command-build-canary-jwt-7b96d21a
PASSWORD_CANARY=command-build-canary-password-c4e81f37

[ "$(node --version)" = 'v24.18.0' ] || {
  echo 'ERROR: production builds require the pinned Node v24.18.0 runtime' >&2
  exit 1
}

rm -rf .next dist
JWT_SECRET="$JWT_CANARY" COMMAND_PASSWORD="$PASSWORD_CANARY" npx --no-install next build
npx --no-install tsc -p tsconfig.server.json
rm -f .next/trace
rm -rf .next/cache
BUILD_JWT_CANARY="$JWT_CANARY" BUILD_PASSWORD_CANARY="$PASSWORD_CANARY" \
  bash scripts/assert-build-credential-boundary.sh
git rev-parse HEAD > dist/.version
