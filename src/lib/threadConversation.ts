import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { getThread, touchThread, updateThread, type ThreadMeta } from './threads'
import { WORKSPACE_PATHS } from './workspacePaths'

export interface ThreadMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

const TRANSCRIPT_DIR = `${WORKSPACE_PATHS.runtimeRoot}/.threads`
const CODEX_SESSIONS_DIR = '/root/.codex/sessions'
const CLAUDE_SESSIONS_DIR = '/root/.claude/projects/-opt-workspace'
const TURN_TIMEOUT_MS = 240_000

// First-turn system frame per ADR-0020. Injected only when the thread's
// native session is being created; subsequent turns resume the session
// and the frame is already in the session's context.
const THREAD_OPENING_FRAME = [
  'You are running in an executive steering thread rooted at /opt/workspace with full access.',
  'Default to reversible action: edit files, run commands, commit with why-messages, update CURRENT_STATE.md, write handoffs.',
  'Preserve epistemic structure — commits carry why, front doors carry what-is-true-now, friction records close when work lands.',
  'Reserve asks for decisions only the principal can make.',
  'For pure assessment or inspection questions, answer diagnostically without forcing action.',
].join(' ')

function transcriptPath(id: string) {
  return join(TRANSCRIPT_DIR, `${id}.transcript.jsonl`)
}

function ensureDir() {
  if (!existsSync(TRANSCRIPT_DIR)) mkdirSync(TRANSCRIPT_DIR, { recursive: true })
}

export function getTranscript(threadId: string): ThreadMessage[] {
  ensureDir()
  const p = transcriptPath(threadId)
  if (!existsSync(p)) return []
  const raw = readFileSync(p, 'utf-8')
  const out: ThreadMessage[] = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      out.push(JSON.parse(line) as ThreadMessage)
    } catch {
      // skip
    }
  }
  return out
}

function appendTranscript(threadId: string, msg: ThreadMessage) {
  ensureDir()
  const p = transcriptPath(threadId)
  const line = JSON.stringify(msg) + '\n'
  if (!existsSync(p)) writeFileSync(p, line)
  else writeFileSync(p, readFileSync(p, 'utf-8') + line)
}

function listCodexSessionFiles(): Set<string> {
  const out = new Set<string>()
  if (!existsSync(CODEX_SESSIONS_DIR)) return out
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name)
      if (entry.isDirectory()) walk(p)
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) out.add(p)
    }
  }
  walk(CODEX_SESSIONS_DIR)
  return out
}

function extractCodexSessionId(newFiles: string[]): string | null {
  // Pick the newest by mtime; read session_meta.payload.id from first line.
  let best: { path: string; mtime: number } | null = null
  for (const f of newFiles) {
    try {
      const m = statSync(f).mtimeMs
      if (!best || m > best.mtime) best = { path: f, mtime: m }
    } catch {
      // skip
    }
  }
  if (!best) return null
  try {
    const first = readFileSync(best.path, 'utf-8').split('\n', 1)[0]
    const parsed = JSON.parse(first)
    if (parsed?.type === 'session_meta' && typeof parsed.payload?.id === 'string') {
      return parsed.payload.id
    }
  } catch {
    // ignore
  }
  return null
}

function runClaudeTurn(message: string, sessionId: string | undefined): { response: string; sessionId: string } {
  const args: string[] = ['-p']
  let assignedId = sessionId
  if (sessionId) {
    args.push('--resume', sessionId)
  } else {
    // Pre-assign so we know the id up front
    assignedId = cryptoRandomUuid()
    args.push('--session-id', assignedId)
    args.push('--append-system-prompt', THREAD_OPENING_FRAME)
  }
  args.push(message)

  const stdout = execFileSync('claude', args, {
    encoding: 'utf-8',
    cwd: WORKSPACE_PATHS.workspaceRoot,
    timeout: TURN_TIMEOUT_MS,
    maxBuffer: 1024 * 1024 * 8,
    env: process.env,
  }).trim()

  return { response: stdout || 'No response produced.', sessionId: assignedId! }
}

function runCodexTurn(message: string, sessionId: string | undefined): { response: string; sessionId: string | null } {
  const outputFile = join(tmpdir(), `thread-codex-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`)
  let sessionIdResolved: string | null = sessionId ?? null

  let args: string[]
  let snapshot: Set<string> | null = null

  if (sessionId) {
    args = [
      'exec', 'resume', sessionId,
      '--skip-git-repo-check',
      '--dangerously-bypass-approvals-and-sandbox',
      '--output-last-message', outputFile,
      '-',
    ]
  } else {
    snapshot = listCodexSessionFiles()
    args = [
      'exec',
      '-C', WORKSPACE_PATHS.workspaceRoot,
      '--skip-git-repo-check',
      '--dangerously-bypass-approvals-and-sandbox',
      '--output-last-message', outputFile,
      '-',
    ]
  }

  // Codex has no session-level system-prompt append. On first turn, prepend
  // the thread-opening frame to the user message so it lands in the session's
  // durable history; subsequent turns inherit it naturally.
  const effectiveInput = sessionId
    ? message
    : `[thread frame] ${THREAD_OPENING_FRAME}\n\n[first message from principal]\n${message}`

  const stdout = execFileSync('codex', args, {
    encoding: 'utf-8',
    cwd: WORKSPACE_PATHS.workspaceRoot,
    input: effectiveInput,
    timeout: TURN_TIMEOUT_MS,
    maxBuffer: 1024 * 1024 * 8,
    env: process.env,
  })

  let response = ''
  try {
    response = readFileSync(outputFile, 'utf-8').trim()
  } catch {
    response = stdout.trim()
  }

  if (!sessionIdResolved && snapshot) {
    const after = listCodexSessionFiles()
    const newFiles: string[] = []
    for (const f of after) if (!snapshot.has(f)) newFiles.push(f)
    sessionIdResolved = extractCodexSessionId(newFiles)
  }

  return { response: response || 'No response produced.', sessionId: sessionIdResolved }
}

function cryptoRandomUuid(): string {
  // Local wrapper so the runtime import stays tidy
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { randomUUID } = require('crypto') as { randomUUID: () => string }
  return randomUUID()
}

// Per-thread in-flight lock
const inFlight = new Map<string, Promise<ThreadMessage>>()

export function runThreadTurn(threadId: string, userMessage: string): Promise<ThreadMessage> {
  const existing = inFlight.get(threadId)
  if (existing) {
    return Promise.reject(new Error('A turn is already in flight for this thread'))
  }

  const task = (async (): Promise<ThreadMessage> => {
    const meta = getThread(threadId)
    if (!meta) throw new Error('Thread not found')

    const now = Date.now()
    const userMsg: ThreadMessage = { role: 'user', content: userMessage, timestamp: now }
    appendTranscript(threadId, userMsg)

    let response: string
    let updatedMeta: Partial<ThreadMeta> = { last_activity_at: now }

    if (meta.model === 'claude') {
      const result = runClaudeTurn(userMessage, meta.claude_session_id)
      response = result.response
      if (!meta.claude_session_id) updatedMeta.claude_session_id = result.sessionId
    } else {
      const result = runCodexTurn(userMessage, meta.codex_session_id)
      response = result.response
      if (!meta.codex_session_id && result.sessionId) {
        updatedMeta.codex_session_id = result.sessionId
      }
    }

    const assistantMsg: ThreadMessage = {
      role: 'assistant',
      content: response,
      timestamp: Date.now(),
    }
    appendTranscript(threadId, assistantMsg)
    updateThread(threadId, updatedMeta)
    touchThread(threadId)

    return assistantMsg
  })()

  inFlight.set(threadId, task)
  task.finally(() => inFlight.delete(threadId))
  return task
}
