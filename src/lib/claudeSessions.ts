import { existsSync, readdirSync } from 'fs'
import { join } from 'path'

import { readBoundedUtf8File } from './boundedFile'
import { WORKSPACE_PATHS } from './workspacePaths'

const CLAUDE_SESSIONS_DIR = join(WORKSPACE_PATHS.claudeStateRoot, 'sessions')
const MAX_SESSION_METADATA_BYTES = 64_000
const MAX_SESSION_METADATA_FILES = 1_000
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const BRIDGE_ID = /^[A-Za-z0-9_-]{1,256}$/

export interface ClaudeSessionState {
  pid: number
  sessionId: string
  cwd: string
  startedAt: number
  version: string
  kind: string
  bridgeSessionId?: string
  bridgeUrl?: string
}

export interface CorrelatedSession {
  sessionName: string | null
  cwd: string
  role: string | null
  pid: number | null
  bridgeUrl: string | null
  bridgeSessionId: string | null
  startedAt: number | null
  alive: boolean
  conflictingPids: number[]
}

export interface ClaudeSessionObservation {
  status: 'observed' | 'unknown'
  value: ClaudeSessionState[]
  issue: string | null
}

export function parseClaudeSessionState(value: unknown): ClaudeSessionState | null {
  if (!value || typeof value !== 'object') return null
  const parsed = value as Record<string, unknown>
  if (
    !Number.isSafeInteger(parsed.pid)
    || Number(parsed.pid) < 1
    || typeof parsed.sessionId !== 'string'
    || !SESSION_ID.test(parsed.sessionId)
    || typeof parsed.cwd !== 'string'
    || !parsed.cwd.startsWith('/')
    || parsed.cwd.includes('\0')
    || typeof parsed.startedAt !== 'number'
    || !Number.isFinite(parsed.startedAt)
    || parsed.startedAt < 0
    || typeof parsed.version !== 'string'
    || typeof parsed.kind !== 'string'
    || (
      parsed.bridgeSessionId !== undefined
      && (
        typeof parsed.bridgeSessionId !== 'string'
        || !BRIDGE_ID.test(parsed.bridgeSessionId)
      )
    )
  ) {
    return null
  }
  return {
    pid: Number(parsed.pid),
    sessionId: parsed.sessionId,
    cwd: parsed.cwd === '/' ? '/' : parsed.cwd.replace(/\/$/, ''),
    startedAt: parsed.startedAt,
    version: parsed.version,
    kind: parsed.kind,
    ...(typeof parsed.bridgeSessionId === 'string'
      ? {
          bridgeSessionId: parsed.bridgeSessionId,
          bridgeUrl: `https://claude.ai/code/${encodeURIComponent(parsed.bridgeSessionId)}`,
        }
      : {}),
  }
}

export function observeClaudeSessions(
  directory = CLAUDE_SESSIONS_DIR,
  readEntries: (path: string) => string[] = readdirSync,
): ClaudeSessionObservation {
  if (!existsSync(directory)) {
    return { status: 'unknown', value: [], issue: 'claude-sessions-unavailable' }
  }
  let entries: string[] = []
  try {
    entries = readEntries(directory)
      .filter((name) => name.endsWith('.json'))
      .sort()
      .slice(-MAX_SESSION_METADATA_FILES)
  } catch {
    return { status: 'unknown', value: [], issue: 'claude-sessions-unavailable' }
  }
  const out: ClaudeSessionState[] = []
  for (const name of entries) {
    const abs = join(directory, name)
    let raw: string
    try {
      raw = readBoundedUtf8File(abs, MAX_SESSION_METADATA_BYTES).text
    } catch {
      continue
    }
    let parsed: ClaudeSessionState | null
    try {
      parsed = parseClaudeSessionState(JSON.parse(raw))
    } catch {
      continue
    }
    if (!parsed) continue
    if (!processAlive(parsed.pid)) continue
    out.push(parsed)
  }
  return { status: 'observed', value: out, issue: null }
}

export function readClaudeSessions(): ClaudeSessionState[] {
  return observeClaudeSessions().value
}

export function processAlive(
  pid: number,
  probe: (pid: number, signal: 0) => boolean = process.kill,
): boolean {
  try {
    probe(pid, 0)
    return true
  } catch (error) {
    // The dedicated observatory identity cannot signal root-owned agent
    // processes. EPERM proves the PID exists while preserving that boundary.
    if ((error as NodeJS.ErrnoException).code === 'EPERM') return true
    return false
  }
}

// Given a tmux session name + declared cwd, find the supervising claude
// process and surface any other claude processes sharing the same cwd —
// those are the duplicate/ad-hoc instances the principal's handoff
// warned about (e.g. a stray `claude` spawned from WSL while SSH'd in).
export function correlateSession(
  sessionName: string,
  cwd: string,
  role: string,
  supervisedPid: number | null,
  all: ClaudeSessionState[] = readClaudeSessions(),
): CorrelatedSession {
  const normalizedCwd = cwd.replace(/\/$/, '')
  const matches = all.filter((s) => s.cwd === normalizedCwd)
  // Prefer the supervised PID if the caller knows it; otherwise pick the
  // oldest match (supervised is usually the first one started).
  let primary: ClaudeSessionState | null = null
  if (supervisedPid) {
    primary = matches.find((s) => s.pid === supervisedPid) ?? null
  }
  if (!primary) {
    primary = matches.sort((a, b) => a.startedAt - b.startedAt)[0] ?? null
  }
  const conflicts = matches.filter((s) => primary && s.pid !== primary.pid).map((s) => s.pid)
  return {
    sessionName,
    cwd: normalizedCwd,
    role,
    pid: primary?.pid ?? null,
    bridgeUrl: primary?.bridgeUrl ?? null,
    bridgeSessionId: primary?.bridgeSessionId ?? null,
    startedAt: primary?.startedAt ?? null,
    alive: Boolean(primary),
    conflictingPids: conflicts,
  }
}

export function listAllCorrelated(
  declared: Array<{ name: string; cwd: string; role: string }>,
  supervisedPidByName: Record<string, number | null>,
): CorrelatedSession[] {
  return declared.map((row) => correlateSession(
    row.name,
    row.cwd,
    row.role,
    supervisedPidByName[row.name] ?? null,
  ))
}
