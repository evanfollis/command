#!/usr/bin/env bash
set -euo pipefail

# Verify the assembled production output does not contain either current
# credentials or the historical forgeable JWT fallback. Values are never
# printed. This scans the Next proxy/server output and custom server build
# after every production build, including isolated releases.

forbidden_name='command-jwt-secret-change-in-production'
if grep -RFl -- "$forbidden_name" .next dist >/dev/null 2>&1; then
  echo 'ERROR: production output contains the historical JWT fallback' >&2
  exit 1
fi

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
  if [ -n "$value" ] && grep -RFl -- "$value" .next dist >/dev/null 2>&1; then
    echo "ERROR: production output contains $key" >&2
    exit 1
  fi
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

echo 'production output contains no configured authentication secrets or historical fallback'
