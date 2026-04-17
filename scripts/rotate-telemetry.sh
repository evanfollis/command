#!/usr/bin/env bash
# Rotate events.jsonl nightly. Compresses today's log to events-YYYY-MM-DD.jsonl.gz
# in the same directory, then truncates events.jsonl. Keeps 30 days of archives.
#
# Intended to run as a cron job (e.g. 00:05 daily). The meta-scan continues
# reading events.jsonl as the rolling 24h surface; archives are for deeper queries.

set -euo pipefail

TELEMETRY_DIR="${WORKSPACE_ROOT:-/opt/workspace}/runtime/.telemetry"
EVENTS_FILE="$TELEMETRY_DIR/events.jsonl"
ARCHIVE_NAME="events-$(date -u +%Y-%m-%d).jsonl.gz"
ARCHIVE_PATH="$TELEMETRY_DIR/$ARCHIVE_NAME"
KEEP_DAYS=30

if [[ ! -f "$EVENTS_FILE" ]]; then
  echo "rotate-telemetry: $EVENTS_FILE not found, nothing to rotate"
  exit 0
fi

if [[ ! -s "$EVENTS_FILE" ]]; then
  echo "rotate-telemetry: $EVENTS_FILE is empty, skipping"
  exit 0
fi

# Compress current log
gzip -c "$EVENTS_FILE" > "$ARCHIVE_PATH"
echo "rotate-telemetry: archived to $ARCHIVE_PATH"

# Truncate rolling surface (do not delete — avoids racing the writer)
> "$EVENTS_FILE"
echo "rotate-telemetry: truncated $EVENTS_FILE"

# Prune archives older than KEEP_DAYS
find "$TELEMETRY_DIR" -name 'events-*.jsonl.gz' -mtime "+$KEEP_DAYS" -delete
echo "rotate-telemetry: pruned archives older than ${KEEP_DAYS} days"
