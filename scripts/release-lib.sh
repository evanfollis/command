#!/usr/bin/env bash

resolve_command_port() {
  local env_file=${1:-}
  local configured=${COMMAND_PORT:-${PORT:-}}
  if [ -z "$configured" ] && [ -f "$env_file" ]; then
    configured=$(awk -F= '$1 == "PORT" { value=$2; gsub(/^[[:space:]"'\'' ]+|[[:space:]"'\'' ]+$/, "", value); print value; exit }' "$env_file")
  fi
  configured=${configured:-3100}
  [[ "$configured" =~ ^[0-9]+$ ]] && [ "$configured" -ge 1 ] && [ "$configured" -le 65535 ] || return 1
  printf '%s\n' "$configured"
}
