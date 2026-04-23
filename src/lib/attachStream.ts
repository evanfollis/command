import type { WebSocket } from 'ws'
import { capturePane } from './tmux'

const POLL_MS = 200
const SCROLLBACK_LINES = 200

// Phase C prototype: durable attach is initially only wired for the two
// supervised executive tmux sessions. Extending to other sessions is
// intentionally deferred to the writer-lock work — project sessions
// share cwd with PM agents, and read-only streaming without a write path
// is lower value there.
const ALLOWED_SESSIONS = new Set(['general', 'general-codex'])

export function isAllowedAttach(name: string): boolean {
  return ALLOWED_SESSIONS.has(name)
}

export function attachReadStream(ws: WebSocket, sessionName: string): void {
  if (!isAllowedAttach(sessionName)) {
    try { ws.close(1008, 'session not in attach allowlist') } catch { /* noop */ }
    return
  }

  const send = (data: unknown) => {
    if (ws.readyState === ws.OPEN) {
      try { ws.send(JSON.stringify(data)) } catch { /* noop */ }
    }
  }

  send({ type: 'hello', session: sessionName, pollMs: POLL_MS, scrollbackLines: SCROLLBACK_LINES })

  let lastSnapshot: string | null = null
  const pushIfChanged = () => {
    if (ws.readyState !== ws.OPEN) return
    const text = capturePane(sessionName, SCROLLBACK_LINES)
    if (text !== lastSnapshot) {
      lastSnapshot = text
      send({ type: 'snapshot', text, ts: Date.now() })
    }
  }
  // Push the initial snapshot immediately so clients (and smoke) see the
  // current pane state without waiting for a content change.
  pushIfChanged()
  const interval = setInterval(pushIfChanged, POLL_MS)

  const cleanup = () => clearInterval(interval)
  ws.on('close', cleanup)
  ws.on('error', cleanup)
}
