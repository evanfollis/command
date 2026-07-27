#!/usr/bin/env bash

acquire_command_deploy_lock() {
  local lock_path=${1:?deployment lock path is required}
  mkdir -p -- "$(dirname "$lock_path")"
  exec 9>"$lock_path"
  if ! flock -n 9; then
    echo "another Command deploy, rollback, or service-policy operation holds $lock_path" >&2
    return 1
  fi
}

set_command_release_link() {
  local releases=${1:?release root is required}
  local name=${2:?release link name is required}
  local target=${3:?release target is required}
  local releases_real target_real
  case "$name" in
    current|previous) ;;
    *) echo "invalid Command release link: $name" >&2; return 1 ;;
  esac
  releases_real=$(readlink -f "$releases")
  target_real=$(readlink -f "$target")
  [ -d "$target_real" ] || { echo "release target is not a directory: $target" >&2; return 1; }
  case "$target_real/" in
    "$releases_real"/*/) ;;
    *) echo "release target escapes $releases_real: $target_real" >&2; return 1 ;;
  esac
  ln -sfn "$target_real" "$releases/$name.tmp"
  mv -Tf "$releases/$name.tmp" "$releases/$name"
}

restore_command_release_links() {
  local releases=${1:?release root is required}
  local current=${2:?current release is required}
  local previous=${3:-}
  set_command_release_link "$releases" current "$current"
  if [ -n "$previous" ]; then
    set_command_release_link "$releases" previous "$previous"
  else
    rm -f -- "$releases/previous"
  fi
}

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
