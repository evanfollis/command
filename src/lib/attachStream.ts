import type { WebSocket } from 'ws'
import { capturePane } from './tmux'
import { registerClient, unregisterClient, getWriterClientId, updateHeartbeat } from './attachLock'

const POLL_MS = 200
const SCROLLBACK_LINES = 200
const REPLAY_BUFFER_SIZE = 20

const ALLOWED_SESSIONS = new Set(['general', 'general-codex'])

// Module-level ring buffer: last N snapshots per session for reconnect replay.
interface SnapshotEntry { text: string; ts: number }
const replayBuffers = new Map<string, SnapshotEntry[]>()

function pushToBuffer(sessionName: string, entry: SnapshotEntry): void {
  let buf = replayBuffers.get(sessionName) ?? []
  buf.push(entry)
  if (buf.length > REPLAY_BUFFER_SIZE) buf = buf.slice(buf.length - REPLAY_BUFFER_SIZE)
  replayBuffers.set(sessionName, buf)
}

function getEntriesSince(sessionName: string, since: number): SnapshotEntry[] {
  return (replayBuffers.get(sessionName) ?? []).filter(e => e.ts > since)
}

export function isAllowedAttach(name: string): boolean {
  return ALLOWED_SESSIONS.has(name)
}

export function attachReadStream(
  ws: WebSocket,
  sessionName: string,
  clientId: string,
  since?: number,
): void {
  if (!isAllowedAttach(sessionName)) {
    try { ws.close(1008, 'session not in attach allowlist') } catch { /* noop */ }
    return
  }

  const role = registerClient(clientId, sessionName, ws)

  const send = (data: unknown) => {
    if (ws.readyState === ws.OPEN) {
      try { ws.send(JSON.stringify(data)) } catch { /* noop */ }
    }
  }

  send({
    type: 'hello',
    session: sessionName,
    pollMs: POLL_MS,
    scrollbackLines: SCROLLBACK_LINES,
    clientId,
    role,
    writerClientId: getWriterClientId(sessionName),
  })

  // Replay buffered snapshots the client missed while disconnected
  if (since !== undefined && since > 0) {
    for (const entry of getEntriesSince(sessionName, since)) {
      send({ type: 'snapshot', text: entry.text, ts: entry.ts })
    }
  }

  let lastSnapshot: string | null = null
  const pushIfChanged = () => {
    if (ws.readyState !== ws.OPEN) return
    const text = capturePane(sessionName, SCROLLBACK_LINES)
    if (text !== lastSnapshot) {
      lastSnapshot = text
      const entry: SnapshotEntry = { text, ts: Date.now() }
      pushToBuffer(sessionName, entry)
      send({ type: 'snapshot', ...entry })
    }
  }
  pushIfChanged()
  const interval = setInterval(pushIfChanged, POLL_MS)

  // Handle messages from client (heartbeats from writer)
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString())
      if (msg.type === 'heartbeat') {
        updateHeartbeat(sessionName, clientId)
      }
    } catch { /* ignore malformed */ }
  })

  const cleanup = () => {
    clearInterval(interval)
    unregisterClient(clientId, ws)
  }
  ws.on('close', cleanup)
  ws.on('error', cleanup)
}
