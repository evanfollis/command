import type { WebSocket } from 'ws'

export type AttachRole = 'writer' | 'observer'

interface LockState {
  writerClientId: string | null
  heldSince: number | null
  lastHeartbeat: number | null
  transferPendingUntil?: number
  transferRequestorClientId?: string
}

interface ClientInfo {
  sessionName: string
  ws: WebSocket
}

const locks = new Map<string, LockState>()
const clients = new Map<string, ClientInfo>()

const HEARTBEAT_STALE_MS = 60_000
const TRANSFER_WINDOW_MS = 10_000

function ensureLock(sessionName: string): LockState {
  let state = locks.get(sessionName)
  if (!state) {
    state = { writerClientId: null, heldSince: null, lastHeartbeat: null }
    locks.set(sessionName, state)
  }
  return state
}

function isLockStale(state: LockState): boolean {
  if (!state.writerClientId) return false
  if (state.lastHeartbeat === null) {
    // No heartbeat yet — stale after 60s from heldSince
    return state.heldSince !== null && Date.now() - state.heldSince > HEARTBEAT_STALE_MS
  }
  return Date.now() - state.lastHeartbeat > HEARTBEAT_STALE_MS
}

export function registerClient(clientId: string, sessionName: string, ws: WebSocket): AttachRole {
  clients.set(clientId, { sessionName, ws })
  const state = ensureLock(sessionName)
  if (!state.writerClientId || isLockStale(state)) {
    if (state.writerClientId && isLockStale(state)) {
      broadcastWriterChanged(sessionName, null)
    }
    state.writerClientId = clientId
    state.heldSince = Date.now()
    state.lastHeartbeat = null
    delete state.transferPendingUntil
    delete state.transferRequestorClientId
    return 'writer'
  }
  return state.writerClientId === clientId ? 'writer' : 'observer'
}

export function unregisterClient(clientId: string, ws: WebSocket): void {
  const info = clients.get(clientId)
  if (!info) return
  if (info.ws !== ws) return
  clients.delete(clientId)
  const state = locks.get(info.sessionName)
  if (!state) return
  if (state.writerClientId === clientId) {
    // If a transfer was pending, grant to the requestor immediately
    const requestor = state.transferRequestorClientId
    if (requestor && clients.has(requestor)) {
      state.writerClientId = requestor
      state.heldSince = Date.now()
      state.lastHeartbeat = null
      delete state.transferPendingUntil
      delete state.transferRequestorClientId
      broadcastWriterChanged(info.sessionName, requestor)
    } else {
      state.writerClientId = null
      state.heldSince = null
      state.lastHeartbeat = null
      delete state.transferPendingUntil
      delete state.transferRequestorClientId
      broadcastWriterChanged(info.sessionName, null)
    }
  } else if (state.transferRequestorClientId === clientId) {
    delete state.transferPendingUntil
    delete state.transferRequestorClientId
  }
}

export function getWriterClientId(sessionName: string): string | null {
  return locks.get(sessionName)?.writerClientId ?? null
}

export function isWriter(sessionName: string, clientId: string): boolean {
  return getWriterClientId(sessionName) === clientId
}

// Auto-claim: if no writer holds the lock (or lock is stale), grant to caller.
// Requires an active ws registration so the lock has a lifecycle to release it.
export function claimIfUnheld(sessionName: string, clientId: string): boolean {
  const info = clients.get(clientId)
  if (!info || info.sessionName !== sessionName) return false
  const state = ensureLock(sessionName)
  if (!state.writerClientId || isLockStale(state)) {
    if (state.writerClientId && isLockStale(state)) {
      broadcastWriterChanged(sessionName, null)
    }
    state.writerClientId = clientId
    state.heldSince = Date.now()
    state.lastHeartbeat = null
    delete state.transferPendingUntil
    delete state.transferRequestorClientId
    broadcastWriterChanged(sessionName, clientId)
    return true
  }
  return state.writerClientId === clientId
}

export function updateHeartbeat(sessionName: string, clientId: string): void {
  const state = locks.get(sessionName)
  if (state && state.writerClientId === clientId) {
    state.lastHeartbeat = Date.now()
  }
}

// Request write-ownership transfer from an observer.
// Returns whether the grant was immediate (no current writer or stale writer).
export function requestTransfer(
  sessionName: string,
  requestorClientId: string,
): { granted: boolean; alreadyPending: boolean; notRegistered?: boolean } {
  const requestorInfo = clients.get(requestorClientId)
  if (!requestorInfo || requestorInfo.sessionName !== sessionName) {
    return { granted: false, alreadyPending: false, notRegistered: true }
  }
  const state = ensureLock(sessionName)

  if (!state.writerClientId || isLockStale(state)) {
    state.writerClientId = requestorClientId
    state.heldSince = Date.now()
    state.lastHeartbeat = null
    delete state.transferPendingUntil
    delete state.transferRequestorClientId
    broadcastWriterChanged(sessionName, requestorClientId)
    return { granted: true, alreadyPending: false }
  }

  if (state.transferPendingUntil && Date.now() < state.transferPendingUntil) {
    return { granted: false, alreadyPending: true }
  }

  state.transferPendingUntil = Date.now() + TRANSFER_WINDOW_MS
  state.transferRequestorClientId = requestorClientId

  const writerInfo = clients.get(state.writerClientId)
  if (writerInfo && writerInfo.ws.readyState === writerInfo.ws.OPEN) {
    try {
      writerInfo.ws.send(JSON.stringify({
        type: 'take-write-request',
        requestorClientId,
        expiresAt: state.transferPendingUntil,
      }))
    } catch { /* noop */ }
  }

  // Auto-execute transfer if writer doesn't decline within the window
  const capturedRequestor = requestorClientId
  setTimeout(() => {
    const s = locks.get(sessionName)
    if (
      s &&
      s.transferRequestorClientId === capturedRequestor &&
      s.transferPendingUntil &&
      Date.now() >= s.transferPendingUntil
    ) {
      s.writerClientId = capturedRequestor
      s.heldSince = Date.now()
      s.lastHeartbeat = null
      delete s.transferPendingUntil
      delete s.transferRequestorClientId
      broadcastWriterChanged(sessionName, capturedRequestor)
    }
  }, TRANSFER_WINDOW_MS + 50)

  return { granted: false, alreadyPending: false }
}

// Cancel a pending transfer. Only the current writer can decline.
export function declineTransfer(sessionName: string, writerId: string): boolean {
  const state = locks.get(sessionName)
  if (!state || state.writerClientId !== writerId) return false
  if (!state.transferPendingUntil) return false
  const requestorId = state.transferRequestorClientId
  delete state.transferPendingUntil
  delete state.transferRequestorClientId
  // Notify all clients that transfer was cancelled
  for (const { clientId, ws } of clientsForSession(sessionName)) {
    if (ws.readyState !== ws.OPEN) continue
    try {
      ws.send(JSON.stringify({
        type: 'transfer-declined',
        youAre: clientId === writerId ? 'writer' : clientId === requestorId ? 'observer' : 'observer',
      }))
    } catch { /* noop */ }
  }
  return true
}

function clientsForSession(sessionName: string): Array<{ clientId: string; ws: WebSocket }> {
  const out: Array<{ clientId: string; ws: WebSocket }> = []
  for (const [clientId, info] of clients) {
    if (info.sessionName === sessionName) out.push({ clientId, ws: info.ws })
  }
  return out
}

function broadcastWriterChanged(sessionName: string, newWriterClientId: string | null): void {
  for (const { clientId, ws } of clientsForSession(sessionName)) {
    if (ws.readyState !== ws.OPEN) continue
    try {
      ws.send(JSON.stringify({
        type: 'writer-changed',
        writerClientId: newWriterClientId,
        youAre: newWriterClientId && clientId === newWriterClientId ? 'writer' : 'observer',
      }))
    } catch { /* noop */ }
  }
}
