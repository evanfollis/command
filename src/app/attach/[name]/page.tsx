'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Shell from '@/components/Shell'
import type { ContextUsage } from '@/lib/contextUsage'

interface PageProps {
  params: { name: string }
}

interface HelloMsg {
  type: 'hello'
  session: string
  pollMs: number
  scrollbackLines: number
  clientId: string
  role: 'writer' | 'observer'
  writerClientId: string | null
}

interface SnapshotMsg {
  type: 'snapshot'
  text: string
  ts: number
}

interface WriterChangedMsg {
  type: 'writer-changed'
  writerClientId: string | null
  youAre: 'writer' | 'observer'
}

interface TakeWriteRequestMsg {
  type: 'take-write-request'
  requestorClientId: string
  expiresAt: number
}

interface TransferDeclinedMsg {
  type: 'transfer-declined'
  youAre: 'writer' | 'observer'
}

type StreamMsg = HelloMsg | SnapshotMsg | WriterChangedMsg | TakeWriteRequestMsg | TransferDeclinedMsg

function randomClientId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `cli-${Math.random().toString(36).slice(2)}-${Date.now()}`
}

const RECONNECT_DELAYS = [2000, 4000, 8000, 10000]

export default function AttachPage({ params }: PageProps) {
  const { name } = params
  const [text, setText] = useState<string>('')
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed' | 'gone'>('connecting')
  const [lastSnapshotAt, setLastSnapshotAt] = useState<number | null>(null)
  const [role, setRole] = useState<'writer' | 'observer' | null>(null)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [takingWrite, setTakingWrite] = useState(false)
  const [transferPending, setTransferPending] = useState(false)
  const [incomingTransfer, setIncomingTransfer] = useState<{ requestorClientId: string; expiresAt: number } | null>(null)
  const [contextUsage, setContextUsage] = useState<ContextUsage | null>(null)
  const paneRef = useRef<HTMLPreElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const clientIdRef = useRef<string>('')
  const lastSnapshotTsRef = useRef<number>(0)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)
  const reconnectAttemptRef = useRef(0)

  if (!clientIdRef.current) clientIdRef.current = randomClientId()

  useEffect(() => {
    mountedRef.current = true

    const connect = (since?: number) => {
      if (!mountedRef.current) return
      const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const sinceParam = since ? `&since=${since}` : ''
      const url = `${scheme}://${window.location.host}/api/attach/${encodeURIComponent(name)}/stream?clientId=${encodeURIComponent(clientIdRef.current)}${sinceParam}`
      setStatus('connecting')
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        setStatus('open')
        reconnectAttemptRef.current = 0
      }

      ws.onclose = () => {
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current)
          heartbeatRef.current = null
        }
        if (!mountedRef.current) return
        const attempt = reconnectAttemptRef.current
        if (attempt < RECONNECT_DELAYS.length) {
          setStatus('closed')
          const delay = RECONNECT_DELAYS[attempt] + Math.random() * 300
          reconnectAttemptRef.current = attempt + 1
          reconnectTimerRef.current = setTimeout(() => {
            connect(lastSnapshotTsRef.current > 0 ? lastSnapshotTsRef.current : undefined)
          }, delay)
        } else {
          setStatus('gone')
        }
      }

      ws.onerror = () => { /* close fires after error; handled there */ }

      ws.onmessage = (event) => {
        try {
          const msg: StreamMsg = JSON.parse(event.data)
          if (msg.type === 'snapshot') {
            setText(msg.text)
            setLastSnapshotAt(msg.ts)
            lastSnapshotTsRef.current = msg.ts
          } else if (msg.type === 'hello') {
            setRole(msg.role)
            if (msg.role === 'writer') startHeartbeat(ws)
          } else if (msg.type === 'writer-changed') {
            setRole(msg.youAre)
            setTransferPending(false)
            setIncomingTransfer(null)
            if (msg.youAre === 'writer') startHeartbeat(ws)
            else {
              if (heartbeatRef.current) {
                clearInterval(heartbeatRef.current)
                heartbeatRef.current = null
              }
            }
          } else if (msg.type === 'take-write-request') {
            setIncomingTransfer({ requestorClientId: msg.requestorClientId, expiresAt: msg.expiresAt })
          } else if (msg.type === 'transfer-declined') {
            setTransferPending(false)
            setTakingWrite(false)
          }
        } catch { /* ignore malformed */ }
      }
    }

    const startHeartbeat = (ws: WebSocket) => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      heartbeatRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          try { ws.send(JSON.stringify({ type: 'heartbeat' })) } catch { /* noop */ }
        }
      }, 15000)
    }

    connect()

    return () => {
      mountedRef.current = false
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      try { wsRef.current?.close() } catch { /* noop */ }
    }
  }, [name])

  useEffect(() => {
    if (paneRef.current) {
      paneRef.current.scrollTop = paneRef.current.scrollHeight
    }
  }, [text])

  // Fetch context usage once when the connection opens (or reopens after reconnect).
  // No tight polling — session-level snapshot, not per-turn.
  useEffect(() => {
    if (status !== 'open') return
    fetch(`/api/context-usage/${encodeURIComponent(name)}`)
      .then((r) => r.json())
      .then((data: ContextUsage) => setContextUsage(data))
      .catch(() => { /* graceful: keep showing null */ })
  }, [name, status])

  const handleSend = useCallback(async () => {
    if (!message.trim() || sending) return
    setSending(true)
    setSendError('')
    const payload = message
    try {
      const res = await fetch(`/api/attach/${encodeURIComponent(name)}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: payload, submit: true, clientId: clientIdRef.current }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSendError(data?.error || `send failed (${res.status})`)
        if (data?.role === 'observer') setRole('observer')
        return
      }
      setRole('writer')
      setMessage('')
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'send failed')
    } finally {
      setSending(false)
    }
  }, [message, sending, name])

  const handleTakeWrite = useCallback(async () => {
    if (takingWrite) return
    setTakingWrite(true)
    setTransferPending(false)
    try {
      const res = await fetch(`/api/attach/${encodeURIComponent(name)}/take-write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: clientIdRef.current }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 200 && data.granted) {
        setRole('writer')
        setTakingWrite(false)
      } else if (res.status === 202) {
        setTransferPending(true)
        setTakingWrite(false)
      } else {
        setSendError(data?.error || `take-write failed (${res.status})`)
        setTakingWrite(false)
      }
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'take-write failed')
      setTakingWrite(false)
    }
  }, [takingWrite, name])

  const handleDeclineTransfer = useCallback(async () => {
    setIncomingTransfer(null)
    try {
      await fetch(`/api/attach/${encodeURIComponent(name)}/decline-transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: clientIdRef.current }),
      })
    } catch { /* noop */ }
  }, [name])

  const statusLabel = {
    connecting: 'connecting…',
    open: 'live',
    closed: 'reconnecting…',
    gone: 'disconnected',
  }[status]
  const statusTone = {
    connecting: 'border-amber-400/20 bg-amber-400/10 text-amber-200',
    open: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200',
    closed: 'border-amber-400/20 bg-amber-400/10 text-amber-200',
    gone: 'border-rose-400/25 bg-rose-400/10 text-rose-200',
  }[status]

  const roleTone = role === 'writer'
    ? 'border-sky-400/30 bg-sky-400/10 text-sky-100'
    : role === 'observer'
      ? 'border-neutral-700 bg-neutral-800 text-neutral-400'
      : 'border-neutral-700 bg-neutral-800 text-neutral-400'

  const ago = lastSnapshotAt ? `${Math.max(0, Math.round((Date.now() - lastSnapshotAt) / 1000))}s ago` : '—'

  const freshnessLabel = contextUsage?.available
    ? `${Math.round(contextUsage.contextPercent)}% · ${contextUsage.freshness}`
    : '—'
  const freshnessTone = !contextUsage?.available
    ? 'border-neutral-800 bg-neutral-900 text-neutral-600'
    : contextUsage.freshness === 'fresh'
      ? 'border-emerald-400/20 bg-emerald-400/5 text-emerald-400'
      : contextUsage.freshness === 'mid'
        ? 'border-amber-400/20 bg-amber-400/5 text-amber-300'
        : 'border-rose-400/20 bg-rose-400/5 text-rose-300'

  const canSend = status === 'open' && message.trim().length > 0 && !sending && role === 'writer'

  return (
    <Shell>
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-neutral-500">
              <Link href="/" className="hover:text-neutral-300">← Home</Link>
              <span className="text-neutral-700">/</span>
              <span className="font-mono text-neutral-300">attach</span>
              <span className="text-neutral-700">/</span>
              <span className="font-mono text-neutral-300">{name}</span>
            </div>
            <h1 className="mt-2 text-lg font-semibold text-neutral-100">
              Attached to <span className="font-mono">{name}</span>
            </h1>
            <p className="mt-1 text-sm text-neutral-400">
              Streaming view of the supervised tmux session. Writer lock is per-connection; first client to
              connect claims it.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-xs">
            <span className={`rounded-full border px-3 py-1 ${statusTone}`}>{statusLabel}</span>
            <span className={`rounded-full border px-3 py-1 ${roleTone}`}>{role ?? 'connecting'}</span>
            <span className={`rounded-full border px-2.5 py-1 font-mono ${freshnessTone}`} title="Context window usage (last turn input tokens / 200K window)">ctx {freshnessLabel}</span>
            <span className="text-neutral-600">snapshot {ago}</span>
          </div>
        </div>

        {/* Incoming transfer request — shown to writer when an observer wants the lock */}
        {incomingTransfer && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-400/25 bg-amber-400/10 px-4 py-3">
            <p className="text-sm text-amber-200">Another client is requesting write access.</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDeclineTransfer}
                className="rounded-full border border-neutral-600 bg-neutral-800 px-4 py-1.5 text-xs font-medium text-neutral-200 hover:border-neutral-500"
              >
                Decline
              </button>
              <button
                type="button"
                onClick={() => setIncomingTransfer(null)}
                className="rounded-full border border-neutral-600 bg-neutral-800 px-4 py-1.5 text-xs font-medium text-neutral-400 hover:border-neutral-500"
              >
                Ignore (auto-transfers in 10s)
              </button>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-neutral-800 bg-black/40 overflow-hidden">
          <div className="border-b border-neutral-800 px-4 py-2 text-[11px] uppercase tracking-widest text-neutral-600">
            Live pane
          </div>
          <pre
            ref={paneRef}
            className="p-4 text-xs font-mono text-neutral-300 max-h-[60vh] overflow-x-auto overflow-y-auto whitespace-pre"
          >
            {text || (status === 'open' ? 'Waiting for first snapshot…' : status === 'gone' ? 'Disconnected — refresh to retry.' : 'Reconnecting…')}
          </pre>
        </div>

        {role === 'observer' ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-3">
              <p className="text-sm text-neutral-400">
                {transferPending
                  ? 'Transfer requested — waiting for current writer to confirm (auto-grants in 10s).'
                  : 'Another client holds the writer lock.'}
              </p>
              {!transferPending && (
                <button
                  type="button"
                  onClick={handleTakeWrite}
                  disabled={takingWrite || status !== 'open'}
                  className="rounded-full border border-sky-400/25 bg-sky-400/10 px-4 py-1.5 text-xs font-medium text-sky-100 hover:border-sky-300/30 disabled:opacity-50"
                >
                  {takingWrite ? 'Requesting…' : 'Take write'}
                </button>
              )}
            </div>
            {sendError && (
              <div className="rounded-lg border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-sm text-rose-100">
                {sendError}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend()
              }}
              placeholder={`Send to ${name}… (Cmd/Ctrl+Enter to submit)`}
              rows={3}
              disabled={sending || status !== 'open'}
              className="w-full resize-none rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm text-neutral-200 placeholder-neutral-500 focus:border-sky-400/40 focus:outline-none focus:ring-1 focus:ring-sky-400/30 disabled:opacity-60"
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-neutral-500">
                Cmd/Ctrl+Enter to submit · writer is per-connection.
              </p>
              <button
                type="button"
                onClick={handleSend}
                disabled={!canSend}
                className="rounded-full border border-sky-400/25 bg-sky-400/10 px-5 py-2 text-sm font-medium text-sky-100 hover:border-sky-300/30 disabled:opacity-50"
              >
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
            {sendError && (
              <div className="rounded-lg border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-sm text-rose-100">
                {sendError}
              </div>
            )}
          </div>
        )}

        {status === 'gone' && (
          <div className="rounded-lg border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            Connection lost after multiple retries. Refresh to reconnect.
          </div>
        )}
      </div>
    </Shell>
  )
}
