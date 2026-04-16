'use client'

import { startTransition, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import PageHeader from '@/components/PageHeader'
import Shell from '@/components/Shell'

interface ExecutiveCapabilities {
  posture: string
  effective_role: string
  workspace_write: string
  supervisor_write: string
  runtime_write: string
  project_mutation: string
  host_tmux_control: string
  host_systemd_control: string
  network_egress: string
  operator_available: string
}

interface ExecutiveThreadState {
  capabilities: ExecutiveCapabilities
  liveSessions: string[]
  executiveCodexSession: {
    name: string
    present: boolean
  }
  messages: {
    role: 'user' | 'assistant'
    content: string
    timestamp: number
  }[]
  agentActivity: string
}

function capabilityTone(value: string) {
  if (value === 'yes') return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100'
  if (value === 'blocked' || value === 'restricted' || value === 'no') {
    return 'border-rose-400/20 bg-rose-400/10 text-rose-100'
  }
  return 'border-white/10 bg-white/5 text-neutral-300'
}

function relativeTime(timestamp: number | null) {
  if (!timestamp) return 'waiting'
  const diff = Math.max(0, Math.round((Date.now() - timestamp) / 1000))
  if (diff < 5) return 'just now'
  if (diff < 60) return `${diff}s ago`
  const minutes = Math.round(diff / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  return `${hours}h ago`
}

export default function ExecutivePage() {
  const [thread, setThread] = useState<ExecutiveThreadState | null>(null)
  const [threadError, setThreadError] = useState<string>('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [ensuring, setEnsuring] = useState(false)
  const [recovering, setRecovering] = useState(false)
  const [statusNote, setStatusNote] = useState('')
  const [lastRefreshAt, setLastRefreshAt] = useState<number | null>(null)

  async function fetchThread() {
    try {
      const response = await fetch('/api/executive/thread')
      if (!response.ok) {
        throw new Error(`Executive thread request failed (${response.status})`)
      }
      const data = await response.json() as ExecutiveThreadState
      startTransition(() => {
        setThread(data)
        setThreadError('')
        setLastRefreshAt(Date.now())
      })
    } catch (error) {
      startTransition(() => {
        setThreadError(error instanceof Error ? error.message : 'Unable to load executive thread')
      })
    }
  }

  useEffect(() => {
    fetchThread()
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchThread()
      }
    }, 2000)

    function onVisible() {
      if (document.visibilityState === 'visible') {
        fetchThread()
      }
    }

    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  async function sendToExecutive() {
    if (!message.trim()) return
    setSending(true)
    setStatusNote('')
    setThreadError('')

    try {
      const response = await fetch('/api/executive/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Unable to send message to executive')
      }
      startTransition(() => {
        setThread(data)
        setLastRefreshAt(Date.now())
        setStatusNote('Executive responded.')
        setMessage('')
      })
    } catch (error) {
      startTransition(() => {
        setThreadError(error instanceof Error ? error.message : 'Unable to send message to executive')
      })
    } finally {
      setSending(false)
    }
  }

  async function ensureExecutive() {
    setEnsuring(true)
    setStatusNote('')
    try {
      const response = await fetch('/api/executive/ensure', { method: 'POST' })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.output || 'Unable to ensure executive lane')
      }
      startTransition(() => {
        setStatusNote(data.output || 'Executive lane ensured.')
      })
      await fetchThread()
    } catch (error) {
      startTransition(() => {
        setThreadError(error instanceof Error ? error.message : 'Unable to ensure executive lane')
      })
    } finally {
      setEnsuring(false)
    }
  }

  async function recoverFabric() {
    setRecovering(true)
    setStatusNote('')
    try {
      const response = await fetch('/api/executive/recover', { method: 'POST' })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.output || 'Unable to recover session fabric')
      }
      startTransition(() => {
        setStatusNote(data.output || 'Session fabric recovered.')
      })
      await fetchThread()
    } catch (error) {
      startTransition(() => {
        setThreadError(error instanceof Error ? error.message : 'Unable to recover session fabric')
      })
    } finally {
      setRecovering(false)
    }
  }

  const effectiveRole = thread?.capabilities.effective_role || 'loading'
  const operatorAvailable = thread?.capabilities.operator_available === 'yes'
  const executivePresent = Boolean(thread?.executiveCodexSession.present)
  const laneLabel = thread?.executiveCodexSession.name || 'executive-codex'
  const sessionCount = thread?.liveSessions.length || 0
  const conversation = thread?.messages || []
  const helperText = useMemo(() => {
    if (!thread) return 'Loading executive surface.'
    if (conversation.length > 0) return 'The executive is responding directly here in the browser. Sessions are secondary surfaces.'
    return 'Tell the system what you want. You should get a real response here, not just a session append.'
  }, [thread, conversation.length])

  return (
    <Shell>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        <PageHeader
          eyebrow="Executive"
          title="Talk to the system here."
          description="This is the principal-facing executive surface. Use it to speak to the workspace directly. Sessions are for debugging, not for figuring out where to start."
          actions={(
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={ensureExecutive}
                disabled={ensuring}
                className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:border-emerald-300/30 disabled:opacity-60"
              >
                {ensuring ? 'Ensuring…' : 'Ensure executive online'}
              </button>
              <button
                type="button"
                onClick={recoverFabric}
                disabled={recovering}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-neutral-200 transition hover:border-white/20 disabled:opacity-60"
              >
                {recovering ? 'Recovering…' : 'Recover session fabric'}
              </button>
            </div>
          )}
        />

        <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
          <section className="space-y-4 rounded-[2rem] border border-white/10 bg-[rgba(9,14,22,0.82)] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.24)]">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-full border px-3 py-1 ${operatorAvailable ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100' : 'border-amber-400/20 bg-amber-400/10 text-amber-100'}`}>
                  {effectiveRole}
                </span>
                <span className={`rounded-full border px-3 py-1 ${executivePresent ? 'border-sky-400/20 bg-sky-400/10 text-sky-100' : 'border-rose-400/20 bg-rose-400/10 text-rose-100'}`}>
                  {laneLabel}: {executivePresent ? 'online' : 'offline'}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-neutral-300">
                  {sessionCount} live session{sessionCount === 1 ? '' : 's'}
                </span>
              </div>
              <p className="text-sm leading-7 text-neutral-400">
                {helperText}
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="executive-message" className="text-sm font-medium text-neutral-200">
                Message the executive
              </label>
              <textarea
                id="executive-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                    sendToExecutive()
                  }
                }}
                placeholder="Tell the system what you want, what feels off, or what structure you are pushing toward."
                rows={4}
                disabled={sending}
                className="w-full resize-none rounded-[1.5rem] border border-neutral-700 bg-surface-2 px-4 py-4 text-sm text-neutral-200 placeholder-neutral-500 focus:border-sky-400/40 focus:outline-none focus:ring-1 focus:ring-sky-400/30 disabled:opacity-60"
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-neutral-500">
                  `Cmd/Ctrl+Enter` sends directly to the executive conversation surface.
                </p>
                <button
                  type="button"
                  onClick={sendToExecutive}
                  disabled={sending || !message.trim()}
                  className="rounded-full border border-sky-400/25 bg-sky-400/10 px-5 py-2 text-sm font-medium text-sky-100 transition hover:border-sky-300/30 disabled:opacity-50"
                >
                  {sending ? 'Sending…' : 'Send to executive'}
                </button>
              </div>
              {statusNote && (
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                  {statusNote}
                </div>
              )}
              {threadError && (
                <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                  {threadError}
                </div>
              )}
            </div>

            <div className="rounded-[1.5rem] border border-white/10 bg-black/20">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.26em] text-neutral-500">Executive conversation</div>
                  <div className="mt-1 text-sm text-neutral-300">
                    Direct browser conversation with the executive
                  </div>
                </div>
                <div className="text-xs text-neutral-500">
                  refreshed {relativeTime(lastRefreshAt)}
                </div>
              </div>
              <div className="max-h-[34rem] space-y-3 overflow-y-auto px-4 py-4">
                {conversation.length > 0 ? conversation.map((entry, index) => (
                  <div
                    key={`${entry.timestamp}-${index}`}
                    className={`rounded-[1.25rem] border px-4 py-3 ${
                      entry.role === 'assistant'
                        ? 'border-sky-400/20 bg-sky-400/10 text-sky-50'
                        : 'border-white/10 bg-white/5 text-neutral-200'
                    }`}
                  >
                    <div className="mb-2 text-[11px] uppercase tracking-[0.22em] text-neutral-400">
                      {entry.role === 'assistant' ? 'Executive' : 'You'}
                    </div>
                    <div className="whitespace-pre-wrap text-sm leading-7">
                      {entry.content}
                    </div>
                  </div>
                )) : (
                  <div className="rounded-[1.25rem] border border-dashed border-white/10 bg-white/5 px-4 py-6 text-sm text-neutral-400">
                    No executive replies yet. Send a message above and the response should appear here.
                  </div>
                )}
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <section className="rounded-[2rem] border border-white/10 bg-[rgba(9,14,22,0.78)] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
              <div className="text-[11px] uppercase tracking-[0.26em] text-neutral-500">Authority</div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className={`rounded-full border px-3 py-1 ${capabilityTone(thread?.capabilities.host_tmux_control || 'unknown')}`}>
                  tmux: {thread?.capabilities.host_tmux_control || 'unknown'}
                </span>
                <span className={`rounded-full border px-3 py-1 ${capabilityTone(thread?.capabilities.host_systemd_control || 'unknown')}`}>
                  systemd: {thread?.capabilities.host_systemd_control || 'unknown'}
                </span>
                <span className={`rounded-full border px-3 py-1 ${capabilityTone(thread?.capabilities.runtime_write || 'unknown')}`}>
                  runtime: {thread?.capabilities.runtime_write || 'unknown'}
                </span>
                <span className={`rounded-full border px-3 py-1 ${capabilityTone(thread?.capabilities.project_mutation || 'unknown')}`}>
                  project mutation: {thread?.capabilities.project_mutation || 'unknown'}
                </span>
              </div>
              <p className="mt-4 text-sm leading-7 text-neutral-400">
                The executive should be the normal point of contact. The operator lane <span className="font-mono text-neutral-300">{laneLabel}</span> may still be online for recovery and debugging, but it is not your primary conversation surface.
              </p>
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-[rgba(9,14,22,0.78)] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
              <div className="text-[11px] uppercase tracking-[0.26em] text-neutral-500">Mechanism surfaces</div>
              <div className="mt-4 space-y-3 text-sm text-neutral-300">
                <p>
                  Use these only when you are inspecting or debugging the system, not as the default interaction path.
                </p>
                <div className="flex flex-col gap-2">
                  <Link
                    href="/orchestrate"
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 transition hover:border-white/20 hover:text-white"
                  >
                    Dispatch: route explicit work into a lane
                  </Link>
                  <Link
                    href="/sessions"
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 transition hover:border-white/20 hover:text-white"
                  >
                    Sessions: inspect live lanes and pane output
                  </Link>
                  <Link
                    href="/terminal"
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 transition hover:border-white/20 hover:text-white"
                  >
                    Console: direct shell access when operator work is justified
                  </Link>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </Shell>
  )
}
