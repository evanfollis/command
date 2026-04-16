#!/usr/bin/env tsx
/**
 * Telemetry anomaly scanner. Reads the runtime telemetry log and
 * surfaces patterns that would have caught prior incidents:
 *   - paired connect/disconnect events with sub-second lifespans (WS crash loops)
 *   - error-rate spikes per source
 *   - repeated auth.login_failed from the same window
 *
 * Writes a dated summary to the runtime meta directory and appends to
 * an append-only observation log. Intended to be run hourly via cron.
 *
 * This makes telemetry *consulted* rather than just collected — the gap that
 * let terminal sessions disconnect 2ms after connecting, for days, unnoticed.
 */
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'fs'
import { WORKSPACE_PATHS } from '../src/lib/workspacePaths'

const TELEMETRY = WORKSPACE_PATHS.telemetryLog
const META_DIR = WORKSPACE_PATHS.metaDir
const OBSERVATIONS = `${META_DIR}/observations.md`
const LOG = `${META_DIR}/scan.jsonl`

// Sessions whose connect→disconnect lifespan is under this are treated as
// immediate failures (not normal user disconnects).
const FAILURE_LIFESPAN_MS = 1000

interface Event {
  project: string
  source: string
  eventType: string
  level: string
  sessionId?: string
  timestamp: number
  details?: Record<string, unknown>
}

function readEvents(sinceMs: number): Event[] {
  if (!existsSync(TELEMETRY)) return []
  const raw = readFileSync(TELEMETRY, 'utf8')
  const events: Event[] = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      const e = JSON.parse(line) as Event
      if (e.timestamp >= sinceMs) events.push(e)
    } catch { /* skip malformed */ }
  }
  return events
}

function analyzeSessionLifespans(events: Event[]) {
  const opens = new Map<string, Event>()
  const shortLived: Array<{ source: string; sessionId: string; lifespanMs: number }> = []
  for (const e of events) {
    if (!e.sessionId) continue
    if (e.eventType.endsWith('.connected')) opens.set(e.sessionId, e)
    else if (e.eventType.endsWith('.disconnected')) {
      const open = opens.get(e.sessionId)
      if (!open) continue
      const lifespan = e.timestamp - open.timestamp
      if (lifespan < FAILURE_LIFESPAN_MS) {
        shortLived.push({ source: e.source, sessionId: e.sessionId, lifespanMs: lifespan })
      }
      opens.delete(e.sessionId)
    }
  }
  return shortLived
}

function countByKey<T>(items: T[], key: (t: T) => string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const item of items) {
    const k = key(item)
    counts.set(k, (counts.get(k) || 0) + 1)
  }
  return counts
}

function fmtCounts(counts: Map<string, number>, limit = 10): string {
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)
  if (entries.length === 0) return '_(none)_'
  return entries.map(([k, v]) => `- \`${k}\`: ${v}`).join('\n')
}

function main() {
  mkdirSync(META_DIR, { recursive: true })
  const now = Date.now()
  const windowMs = 24 * 60 * 60 * 1000 // 24h
  const events = readEvents(now - windowMs)

  const shortLived = analyzeSessionLifespans(events)
  const shortLivedBySource = countByKey(shortLived, (x) => x.source)
  const errors = events.filter((e) => e.level === 'error' || e.level === 'warn')
  const errorsBySource = countByKey(errors, (e) => `${e.source} :: ${e.eventType}`)
  const loginFailures = events.filter((e) => e.eventType === 'auth.login_failed').length

  const findings: string[] = []
  if (shortLived.length > 0) {
    findings.push(`**Short-lived sessions (<${FAILURE_LIFESPAN_MS}ms): ${shortLived.length}** — ` +
      `indicates handshake failure or immediate crash. Investigate the source and recent deploys.`)
  }
  if (loginFailures >= 5) {
    findings.push(`**${loginFailures} login failures in 24h** — possible brute force or stale cookie loop.`)
  }
  for (const [key, count] of errorsBySource) {
    if (count >= 10) findings.push(`**${count} occurrences of \`${key}\`** — recurring, likely systemic.`)
  }

  const summary = [
    `# Observations — ${new Date(now).toISOString()}`,
    '',
    `Window: last 24h. Events scanned: ${events.length}.`,
    '',
    '## Findings',
    findings.length > 0 ? findings.map((f) => `- ${f}`).join('\n') : '_No anomalies._',
    '',
    '## Short-lived sessions by source',
    fmtCounts(shortLivedBySource),
    '',
    '## Errors & warnings by source+eventType',
    fmtCounts(errorsBySource),
    '',
  ].join('\n')

  writeFileSync(OBSERVATIONS, summary)
  appendFileSync(LOG, JSON.stringify({
    timestamp: now,
    eventsScanned: events.length,
    shortLivedCount: shortLived.length,
    errorCount: errors.length,
    loginFailures,
    findings: findings.length,
  }) + '\n')

  console.log(summary)
  // Non-zero exit on findings so cron can page/alert.
  process.exit(findings.length > 0 ? 2 : 0)
}

main()
