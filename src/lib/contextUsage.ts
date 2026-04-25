import { createReadStream, existsSync, statSync } from 'fs'
import { createInterface } from 'readline'
import { readClaudeSessions } from './claudeSessions'

export interface ContextUsage {
  available: boolean
  model: string | null
  // From last assistant turn: input_tokens + cache_read + cache_creation
  // This is the current context window size, not a running sum.
  contextTokens: number
  userTurns: number
  assistantTurns: number
  toolUses: number
  contextWindowSize: number
  contextPercent: number
  freshness: 'fresh' | 'mid' | 'stretched' | 'unknown'
  sessionId: string | null
}

function encodeCwd(cwd: string): string {
  return cwd.replace(/\//g, '-')
}

// Conservative 200K default — correct for all current models.
// Per advisor: don't trust handoff claims of 1M without verified source.
function getContextWindowSize(_model: string | null): number {
  return 200_000
}

function computeFreshness(pct: number): 'fresh' | 'mid' | 'stretched' {
  if (pct < 20) return 'fresh'
  if (pct < 60) return 'mid'
  return 'stretched'
}

const UNKNOWN: ContextUsage = {
  available: false,
  model: null,
  contextTokens: 0,
  userTurns: 0,
  assistantTurns: 0,
  toolUses: 0,
  contextWindowSize: 200_000,
  contextPercent: 0,
  freshness: 'unknown',
  sessionId: null,
}

export async function getContextUsage(
  _sessionName: string,
  cwd: string,
  agent: string,
  supervisedPid?: number | null,
): Promise<ContextUsage> {
  if (agent === 'codex') return UNKNOWN

  const normalized = cwd.replace(/\/$/, '')
  const allSessions = readClaudeSessions()
  const matches = allSessions.filter((s) => s.cwd === normalized)
  if (matches.length === 0) return UNKNOWN

  const encodedCwd = encodeCwd(normalized)
  type Candidate = { sessionId: string; path: string; mtime: number; isSupervised: boolean }
  const candidates: Candidate[] = []
  for (const s of matches) {
    const p = `/root/.claude/projects/${encodedCwd}/${s.sessionId}.jsonl`
    if (!existsSync(p)) continue
    try {
      const mtime = statSync(p).mtimeMs
      // Prefer the session whose PID matches the supervised tmux pane PID.
      // This avoids picking a tick/ad-hoc Claude process that shares the cwd
      // and happens to have a more recent JSONL.
      candidates.push({ sessionId: s.sessionId, path: p, mtime, isSupervised: s.pid === supervisedPid })
    } catch { /* skip */ }
  }
  if (candidates.length === 0) return UNKNOWN

  // Supervised PID wins; fall back to most-recently-modified JSONL.
  const supervised = candidates.find((c) => c.isSupervised)
  const best = supervised ?? candidates.sort((a, b) => b.mtime - a.mtime)[0]
  const { sessionId, path: jsonlPath } = best

  let model: string | null = null
  let lastUsage: { input_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number } | null = null
  let userTurns = 0
  let assistantTurns = 0
  let toolUses = 0

  const rl = createInterface({ input: createReadStream(jsonlPath), crlfDelay: Infinity })

  for await (const line of rl) {
    if (!line.trim()) continue
    let obj: Record<string, unknown>
    try {
      obj = JSON.parse(line)
    } catch {
      continue
    }

    if (obj.type === 'user') {
      userTurns++
      continue
    }

    const msg = obj.message as Record<string, unknown> | undefined
    if (!msg) continue

    const usage = msg.usage as Record<string, number> | undefined
    if (!usage) continue

    assistantTurns++

    // Skip <synthetic> entries — these are session-end summaries / compaction
    // artifacts and carry all-zero token counts that would clobber real data.
    const msgModel = typeof msg.model === 'string' ? msg.model : null
    if (msgModel === '<synthetic>') continue

    if (msgModel) model = msgModel
    const candidate = {
      input_tokens: usage.input_tokens ?? 0,
      cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
    }
    // Only treat as real usage if at least one count is nonzero
    if (candidate.input_tokens + candidate.cache_read_input_tokens + candidate.cache_creation_input_tokens > 0) {
      lastUsage = candidate
    }

    const content = msg.content as Array<Record<string, unknown>> | undefined
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'tool_use') toolUses++
      }
    }
  }

  if (!lastUsage) {
    // Session exists but no assistant turns yet
    return {
      ...UNKNOWN,
      available: true,
      sessionId,
      userTurns,
      assistantTurns,
      toolUses,
      freshness: 'fresh',
    }
  }

  const contextTokens =
    lastUsage.input_tokens +
    lastUsage.cache_read_input_tokens +
    lastUsage.cache_creation_input_tokens
  const contextWindowSize = getContextWindowSize(model)
  const contextPercent = Math.min(100, (contextTokens / contextWindowSize) * 100)

  return {
    available: true,
    model,
    contextTokens,
    userTurns,
    assistantTurns,
    toolUses,
    contextWindowSize,
    contextPercent,
    freshness: computeFreshness(contextPercent),
    sessionId,
  }
}
