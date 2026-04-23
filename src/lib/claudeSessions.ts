import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'

const CLAUDE_SESSIONS_DIR = '/root/.claude/sessions'

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

export function readClaudeSessions(): ClaudeSessionState[] {
  if (!existsSync(CLAUDE_SESSIONS_DIR)) return []
  let entries: string[] = []
  try {
    entries = readdirSync(CLAUDE_SESSIONS_DIR)
  } catch {
    return []
  }
  const out: ClaudeSessionState[] = []
  for (const name of entries) {
    if (!name.endsWith('.json')) continue
    const abs = join(CLAUDE_SESSIONS_DIR, name)
    let raw: string
    try {
      raw = readFileSync(abs, 'utf-8')
    } catch {
      continue
    }
    let parsed: Partial<ClaudeSessionState>
    try {
      parsed = JSON.parse(raw)
    } catch {
      continue
    }
    if (!parsed.pid || !parsed.cwd || !parsed.sessionId) continue
    if (!processAlive(parsed.pid)) continue
    const bridgeUrl = parsed.bridgeSessionId
      ? `https://claude.ai/code/${parsed.bridgeSessionId}`
      : undefined
    out.push({
      pid: parsed.pid,
      sessionId: parsed.sessionId,
      cwd: parsed.cwd.replace(/\/$/, ''),
      startedAt: parsed.startedAt ?? 0,
      version: parsed.version ?? '',
      kind: parsed.kind ?? 'unknown',
      bridgeSessionId: parsed.bridgeSessionId,
      bridgeUrl,
    })
  }
  return out
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
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
): CorrelatedSession {
  const normalizedCwd = cwd.replace(/\/$/, '')
  const all = readClaudeSessions()
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
