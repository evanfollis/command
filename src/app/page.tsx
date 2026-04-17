'use client'

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
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

interface ProjectSession {
  name: string
  cwd: string
  agent: string
  role: string
  live: boolean
  lastReflection: string
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

function capabilityTone(value: string) {
  if (value === 'yes') return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100'
  if (value === 'blocked' || value === 'restricted' || value === 'no') {
    return 'border-rose-400/20 bg-rose-400/10 text-rose-100'
  }
  return 'border-white/10 bg-white/5 text-neutral-300'
}

function AgentToggle({ model, onChange }: { model: 'claude' | 'codex'; onChange: (m: 'claude' | 'codex') => void }) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1">
      {(['claude', 'codex'] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition ${
            model === m
              ? m === 'claude'
                ? 'bg-orange-500/20 text-orange-200 border border-orange-400/30'
                : 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30'
              : 'text-neutral-500 hover:text-neutral-300'
          }`}
        >
          {m === 'claude' ? 'Claude' : 'Codex'}
        </button>
      ))}
    </div>
  )
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
  const [model, setModel] = useState<'claude' | 'codex'>('codex')
  const [projectSessions, setProjectSessions] = useState<ProjectSession[]>([])
  const conversationEndRef = useRef<HTMLDivElement>(null)

  // Load model preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('executive_model')
    if (saved === 'claude' || saved === 'codex') setModel(saved)
  }, [])

  function handleModelChange(m: 'claude' | 'codex') {
    setModel(m)
    localStorage.setItem('executive_model', m)
  }

  const fetchThread = useCallback(async () => {
    try {
      const response = await fetch('/api/executive/thread')
      if (!response.ok) throw new Error(`Executive thread request failed (${response.status})`)
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
  }, [])

  const fetchProjectStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/project-status')
      const data = await res.json()
      setProjectSessions(data.sessions || [])
    } catch {
      // non-critical
    }
  }, [])

  useEffect(() => {
    fetchThread()
    fetchProjectStatus()

    const threadInterval = setInterval(() => {
      if (document.visibilityState === 'visible') fetchThread()
    }, 2000)
    const statusInterval = setInterval(() => {
      if (document.visibilityState === 'visible') fetchProjectStatus()
    }, 15000)

    function onVisible() {
      if (document.visibilityState === 'visible') {
        fetchThread()
        fetchProjectStatus()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(threadInterval)
      clearInterval(statusInterval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [fetchThread, fetchProjectStatus])

  // Scroll conversation to bottom on new messages
  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [thread?.messages.length])

  async function sendToExecutive() {
    if (!message.trim()) return
    setSending(true)
    setStatusNote('')
    setThreadError('')
    try {
      const response = await fetch('/api/executive/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, model }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to send message to executive')
      startTransition(() => {
        setThread(data)
        setLastRefreshAt(Date.now())
        setStatusNote('')
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
      if (!response.ok) throw new Error(data.output || 'Unable to ensure executive lane')
      startTransition(() => { setStatusNote(data.output || 'Executive lane ensured.') })
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
      if (!response.ok) throw new Error(data.output || 'Unable to recover session fabric')
      startTransition(() => { setStatusNote(data.output || 'Session fabric recovered.') })
      await fetchThread()
    } catch (error) {
      startTransition(() => {
        setThreadError(error instanceof Error ? error.message : 'Unable to recover session fabric')
      })
    } finally {
      setRecovering(false)
    }
  }

  const operatorAvailable = thread?.capabilities.operator_available === 'yes'
  const laneLabel = thread?.executiveCodexSession.name || 'executive-codex'
  const conversation = thread?.messages || []
  const helperText = useMemo(() => {
    if (!thread) return 'Loading executive surface.'
    if (conversation.length > 0) return `Talking to: ${model === 'claude' ? 'Claude' : 'Codex'}, rooted at /opt/workspace`
    return 'Tell the system what you want. You should get a real response here, not just a session append.'
  }, [thread, conversation.length, model])

  return (
    <Shell>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        {/* Conversation panel */}
        <section className="rounded-[2rem] border border-white/10 bg-[rgba(9,14,22,0.82)] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.24)]">
          {/* Header row: title + agent selector + meta */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold text-neutral-100">Executive</h1>
              <p className="mt-0.5 text-sm text-neutral-400">{helperText}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <AgentToggle model={model} onChange={handleModelChange} />
              <span className="text-xs text-neutral-600">refreshed {relativeTime(lastRefreshAt)}</span>
            </div>
          </div>

          {/* Conversation transcript */}
          <div className="mb-4 max-h-[40rem] space-y-3 overflow-y-auto rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-4">
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
                  {entry.role === 'assistant' ? (model === 'claude' ? 'Claude' : 'Codex') : 'You'}
                </div>
                <div className="whitespace-pre-wrap text-sm leading-7">{entry.content}</div>
              </div>
            )) : (
              <div className="rounded-[1.25rem] border border-dashed border-white/10 bg-white/5 px-4 py-6 text-sm text-neutral-400">
                No replies yet. Send a message below.
              </div>
            )}
            <div ref={conversationEndRef} />
          </div>

          {/* Send area */}
          <div className="space-y-2">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendToExecutive()
              }}
              placeholder="Tell the system what you want, what feels off, or what structure you are pushing toward."
              rows={4}
              disabled={sending}
              className="w-full resize-none rounded-[1.5rem] border border-neutral-700 bg-surface-2 px-4 py-4 text-sm text-neutral-200 placeholder-neutral-500 focus:border-sky-400/40 focus:outline-none focus:ring-1 focus:ring-sky-400/30 disabled:opacity-60"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-neutral-500">Cmd/Ctrl+Enter to send</p>
              <button
                type="button"
                onClick={sendToExecutive}
                disabled={sending || !message.trim()}
                className="rounded-full border border-sky-400/25 bg-sky-400/10 px-5 py-2 text-sm font-medium text-sky-100 transition hover:border-sky-300/30 disabled:opacity-50"
              >
                {sending ? 'Sending…' : `Send to ${model === 'claude' ? 'Claude' : 'Codex'}`}
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
        </section>

        {/* Project status strip */}
        <section className="rounded-[2rem] border border-white/10 bg-[rgba(9,14,22,0.78)] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
          <div className="mb-4 text-[11px] uppercase tracking-[0.26em] text-neutral-500">Project sessions</div>
          <div className="space-y-2">
            {projectSessions.length === 0 ? (
              <p className="text-sm text-neutral-500">Loading session status…</p>
            ) : projectSessions.map((s) => (
              <div
                key={s.name}
                className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3"
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${s.live ? 'bg-emerald-400' : 'bg-neutral-600'}`} />
                <span className="w-28 shrink-0 font-mono text-sm text-neutral-200">{s.name}</span>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${
                  s.live
                    ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
                    : 'border-neutral-700 bg-neutral-800 text-neutral-500'
                }`}>
                  {s.live ? 'live' : 'offline'}
                </span>
                <span className="flex-1 truncate text-xs text-neutral-500" title={s.lastReflection}>
                  {s.lastReflection}
                </span>
                <Link
                  href={`/sessions/${s.name}`}
                  className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-300 transition hover:border-white/20 hover:text-white"
                >
                  Talk to PM
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* Operator tools (collapsed, shown only when operator available) */}
        {operatorAvailable && (
          <details className="rounded-[2rem] border border-white/10 bg-[rgba(9,14,22,0.78)] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
            <summary className="cursor-pointer text-[11px] uppercase tracking-[0.26em] text-neutral-500 hover:text-neutral-400">
              Operator tools
            </summary>
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap gap-2">
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
              <div className="flex flex-wrap gap-2 text-xs">
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
              <p className="text-sm text-neutral-500">
                Operator lane <span className="font-mono text-neutral-400">{laneLabel}</span> is available for recovery and debugging.
              </p>
              <div className="flex flex-col gap-2 text-sm">
                <Link href="/orchestrate" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-neutral-300 transition hover:border-white/20 hover:text-white">
                  Dispatch: route explicit work into a lane
                </Link>
                <Link href="/sessions" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-neutral-300 transition hover:border-white/20 hover:text-white">
                  Sessions: inspect live lanes and pane output
                </Link>
                <Link href="/terminal" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-neutral-300 transition hover:border-white/20 hover:text-white">
                  Console: direct shell access
                </Link>
              </div>
            </div>
          </details>
        )}
      </div>
    </Shell>
  )
}
