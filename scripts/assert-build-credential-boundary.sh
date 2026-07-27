#!/usr/bin/env bash
set -euo pipefail

# Verify the assembled production output does not contain either current
# credentials or the historical forgeable JWT fallback. Values are never
# printed. This scans the Next proxy/server output and custom server build
# after every production build, including isolated releases.

scan_exact() {
  local label=$1
  local value=$2
  if [ -n "$value" ] && grep -RFl -- "$value" .next dist >/dev/null 2>&1; then
    echo "ERROR: production output contains $label" >&2
    exit 1
  fi
}

scan_exact 'the historical JWT fallback' 'command-jwt-secret-change-in-production'

read_env_value() {
  local key=$1
  local value=${!key:-}
  if [ -z "$value" ] && [ -f .env.local ]; then
    value=$(awk -F= -v wanted="$key" '
      $1 == wanted {
        value = substr($0, index($0, "=") + 1)
        gsub(/^[[:space:]"'"'"' ]+|[[:space:]"'"'"' ]+$/, "", value)
        print value
        exit
      }
    ' .env.local)
  fi
  printf '%s' "$value"
}

for key in JWT_SECRET COMMAND_PASSWORD; do
  value=$(read_env_value "$key")
  scan_exact "$key" "$value"
done

# Fixed non-secret canaries make absence measurable without exposing live
# credentials to the build. Scan common exact transformations that bundlers or
# serializers could retain while still making the original value recoverable.
for canary_key in BUILD_JWT_CANARY BUILD_PASSWORD_CANARY; do
  canary_value=${!canary_key:-}
  [ -n "$canary_value" ] || {
    echo "ERROR: $canary_key is required for the production boundary scan" >&2
    exit 1
  }
  scan_exact "$canary_key" "$canary_value"
  scan_exact "$canary_key base64 encoding" "$(printf '%s' "$canary_value" | base64 -w0)"
  scan_exact "$canary_key hex encoding" "$(printf '%s' "$canary_value" | od -An -tx1 | tr -d ' \n')"
done

while IFS= read -r -d '' manifest; do
  if grep -E '"(\.\./)+(src/|AGENTS\.md|CLAUDE\.md|CURRENT_STATE\.md|next\.config\.js)' \
    "$manifest" >/dev/null; then
    echo 'ERROR: artifact route NFT manifests retain repository source or instruction files' >&2
    exit 1
  else
    status=$?
    if [ "$status" -ne 1 ]; then
      echo 'ERROR: artifact route NFT manifest could not be scanned' >&2
      exit 1
    fi
  fi
done < <(find .next/server/app/artifacts -name '*.nft.json' -type f -print0 2>/dev/null)

node scripts/assert-artifact-trace-boundary.mjs

echo 'production output contains no configured authentication secrets or historical fallback'
