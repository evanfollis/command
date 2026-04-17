'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Shell from '@/components/Shell'

export default function PMSessionPage({ params }: { params: { name: string } }) {
  const { name } = params
  const [output, setOutput] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null)
  const outputRef = useRef<HTMLPreElement>(null)

  const fetchOutput = useCallback(async () => {
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(name)}`)
      const data = await res.json()
      setOutput(data.output || '')
      setLastRefreshedAt(Date.now())
    } catch {
      // silent — auto-refresh will retry
    }
  }, [name])

  useEffect(() => {
    fetchOutput()
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') fetchOutput()
    }, 3000)
    return () => clearInterval(interval)
  }, [fetchOutput])

  // Scroll output to bottom on new content
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output])

  async function handleSend() {
    if (!message.trim()) return
    setSending(true)
    try {
      await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session: name, message }),
      })
      setMessage('')
      setTimeout(fetchOutput, 1500)
    } finally {
      setSending(false)
    }
  }

  const ago = lastRefreshedAt
    ? Math.round((Date.now() - lastRefreshedAt) / 1000) + 's ago'
    : 'waiting'

  return (
    <Shell>
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
              >
                ← Executive
              </Link>
              <span className="text-neutral-700">/</span>
              <span className="font-mono text-sm text-neutral-300">{name}</span>
            </div>
            <h1 className="mt-2 text-lg font-semibold text-neutral-100">
              Project session: <span className="font-mono">{name}</span>
            </h1>
            <p className="mt-1 text-sm text-amber-300/80">
              You are talking to the <span className="font-mono">{name}</span> project session, not the executive.
              Switch to <Link href="/" className="underline hover:text-amber-200">executive</Link> for workspace-level questions.
            </p>
          </div>
          <div className="shrink-0 text-xs text-neutral-600">
            refreshed {ago}
          </div>
        </div>

        {/* Pane output */}
        <div className="rounded-xl border border-neutral-800 bg-black/40 overflow-hidden">
          <div className="border-b border-neutral-800 px-4 py-2 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-widest text-neutral-600">Pane output</span>
            <button
              onClick={fetchOutput}
              className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors"
            >
              Refresh
            </button>
          </div>
          <pre
            ref={outputRef}
            className="p-4 text-xs font-mono text-neutral-300 overflow-x-auto max-h-[60vh] overflow-y-auto whitespace-pre"
          >
            {output || 'No output captured yet'}
          </pre>
        </div>

        {/* Send */}
        <div className="flex gap-2">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend()
            }}
            placeholder={`Send message to ${name} session… (Cmd/Ctrl+Enter)`}
            rows={3}
            disabled={sending}
            className="flex-1 resize-none rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm text-neutral-200 placeholder-neutral-500 focus:border-sky-400/40 focus:outline-none focus:ring-1 focus:ring-sky-400/30 disabled:opacity-60"
          />
          <button
            onClick={handleSend}
            disabled={sending || !message.trim()}
            className="self-end rounded-lg border border-sky-400/25 bg-sky-400/10 px-5 py-2.5 text-sm font-medium text-sky-100 transition hover:border-sky-300/30 disabled:opacity-50"
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </Shell>
  )
}
