'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Shell from '@/components/Shell'

interface PageProps {
  params: { name: string }
}

interface HelloMsg {
  type: 'hello'
  session: string
  pollMs: number
  scrollbackLines: number
}

interface SnapshotMsg {
  type: 'snapshot'
  text: string
  ts: number
}

type StreamMsg = HelloMsg | SnapshotMsg

export default function AttachPage({ params }: PageProps) {
  const { name } = params
  const [text, setText] = useState<string>('')
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed' | 'error'>('connecting')
  const [lastSnapshotAt, setLastSnapshotAt] = useState<number | null>(null)
  const paneRef = useRef<HTMLPreElement>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const url = `${scheme}://${window.location.host}/api/attach/${encodeURIComponent(name)}/stream`
    const ws = new WebSocket(url)
    wsRef.current = ws
    ws.onopen = () => setStatus('open')
    ws.onclose = () => setStatus('closed')
    ws.onerror = () => setStatus('error')
    ws.onmessage = (event) => {
      try {
        const msg: StreamMsg = JSON.parse(event.data)
        if (msg.type === 'snapshot') {
          setText(msg.text)
          setLastSnapshotAt(msg.ts)
        }
      } catch {
        // ignore malformed frames
      }
    }
    return () => {
      try { ws.close() } catch { /* noop */ }
    }
  }, [name])

  useEffect(() => {
    if (paneRef.current) {
      paneRef.current.scrollTop = paneRef.current.scrollHeight
    }
  }, [text])

  const statusLabel = {
    connecting: 'connecting…',
    open: 'live',
    closed: 'disconnected',
    error: 'error',
  }[status]

  const statusTone = {
    connecting: 'border-amber-400/20 bg-amber-400/10 text-amber-200',
    open: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200',
    closed: 'border-neutral-700 bg-neutral-800 text-neutral-400',
    error: 'border-rose-400/25 bg-rose-400/10 text-rose-200',
  }[status]

  const ago = lastSnapshotAt ? `${Math.max(0, Math.round((Date.now() - lastSnapshotAt) / 1000))}s ago` : '—'

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
              Read-only streaming view of the supervised tmux session. Write path lands in a follow-up.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-xs">
            <span className={`rounded-full border px-3 py-1 ${statusTone}`}>{statusLabel}</span>
            <span className="text-neutral-600">snapshot {ago}</span>
          </div>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-black/40 overflow-hidden">
          <div className="border-b border-neutral-800 px-4 py-2 text-[11px] uppercase tracking-widest text-neutral-600">
            Live pane
          </div>
          <pre
            ref={paneRef}
            className="p-4 text-xs font-mono text-neutral-300 max-h-[70vh] overflow-x-auto overflow-y-auto whitespace-pre"
          >
            {text || (status === 'open' ? 'Waiting for first snapshot…' : 'Not yet connected.')}
          </pre>
        </div>
      </div>
    </Shell>
  )
}
