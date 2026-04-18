'use client'

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Shell from '@/components/Shell'
import PortfolioCard, { type PortfolioProject, type ProjectMetrics } from '@/components/PortfolioCard'

const SESSION_TO_METRICS_KEY: Record<string, string> = {
  general: 'admin',
}

function metricsKeyForSession(sessionName: string): string {
  return SESSION_TO_METRICS_KEY[sessionName] ?? sessionName
}

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

type ThreadModel = 'claude' | 'codex'

interface ThreadMeta {
  id: string
  title: string
  model: ThreadModel
  created_at: number
  last_activity_at: number
  claude_session_id?: string
  codex_session_id?: string
}

interface ThreadMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}


function relativeTime(timestamp: number | null) {
  if (!timestamp) return 'waiting'
  const diff = Math.max(0, Math.round((Date.now() - timestamp) / 1000))
  if (diff < 5) return 'just now'
  if (diff < 60) return `${diff}s ago`
  const minutes = Math.round(diff / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

function capabilityTone(value: string) {
  if (value === 'yes') return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100'
  if (value === 'blocked' || value === 'restricted' || value === 'no') {
    return 'border-rose-400/20 bg-rose-400/10 text-rose-100'
  }
  return 'border-white/10 bg-white/5 text-neutral-300'
}

function modelBadge(model: ThreadModel) {
  return model === 'claude'
    ? 'bg-orange-500/15 text-orange-200 border-orange-400/25'
    : 'bg-emerald-500/15 text-emerald-200 border-emerald-400/25'
}

export default function ExecutivePage() {
  const [threads, setThreads] = useState<ThreadMeta[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [threadError, setThreadError] = useState('')
  const [projects, setProjects] = useState<PortfolioProject[]>([])
  const [metricsByProject, setMetricsByProject] = useState<Record<string, ProjectMetrics>>({})
  const [metricsGeneratedAt, setMetricsGeneratedAt] = useState<string | null>(null)
  const [capabilities, setCapabilities] = useState<ExecutiveCapabilities | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [newThreadModel, setNewThreadModel] = useState<ThreadModel>('codex')
  const [lastRefreshAt, setLastRefreshAt] = useState<number | null>(null)
  const [ensuring, setEnsuring] = useState(false)
  const [recovering, setRecovering] = useState(false)
  const [statusNote, setStatusNote] = useState('')
  const conversationEndRef = useRef<HTMLDivElement>(null)

  const active = useMemo(() => threads.find((t) => t.id === activeId) || null, [threads, activeId])

  const fetchThreads = useCallback(async () => {
    try {
      const res = await fetch('/api/threads')
      const data = await res.json()
      const list: ThreadMeta[] = data.threads || []
      setThreads(list)
      setActiveId((prev) => prev && list.find((t) => t.id === prev) ? prev : list[0]?.id ?? null)
    } catch {
      // non-critical
    }
  }, [])

  const fetchMessages = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/threads/${id}/messages`)
      if (!res.ok) return
      const data = await res.json()
      setMessages(data.messages || [])
      setLastRefreshAt(Date.now())
    } catch {
      // non-critical
    }
  }, [])

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/project-status')
      const data = await res.json()
      setProjects(data.sessions || [])
    } catch {
      // non-critical
    }
  }, [])

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch('/api/metrics/summary')
      if (!res.ok) return
      const data = await res.json()
      setMetricsByProject(data.projects || {})
      setMetricsGeneratedAt(data.generated_at || null)
    } catch {
      // non-critical
    }
  }, [])

  const fetchCapabilities = useCallback(async () => {
    try {
      const res = await fetch('/api/executive/thread')
      if (!res.ok) return
      const data = await res.json()
      if (data.capabilities) setCapabilities(data.capabilities)
    } catch {
      // non-critical
    }
  }, [])

  useEffect(() => {
    fetchThreads()
    fetchProjects()
    fetchCapabilities()
    fetchMetrics()
    const projectInterval = setInterval(() => {
      if (document.visibilityState === 'visible') fetchProjects()
    }, 15000)
    const metricsInterval = setInterval(() => {
      if (document.visibilityState === 'visible') fetchMetrics()
    }, 60000)
    return () => {
      clearInterval(projectInterval)
      clearInterval(metricsInterval)
    }
  }, [fetchThreads, fetchProjects, fetchCapabilities, fetchMetrics])

  useEffect(() => {
    if (!activeId) {
      setMessages([])
      return
    }
    fetchMessages(activeId)
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') fetchMessages(activeId)
    }, 3000)
    return () => clearInterval(interval)
  }, [activeId, fetchMessages])

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  async function createThread() {
    const title = `New ${newThreadModel} thread`
    try {
      const res = await fetch('/api/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, model: newThreadModel }),
      })
      const data = await res.json()
      if (data.thread) {
        await fetchThreads()
        setActiveId(data.thread.id)
        setRenamingId(data.thread.id)
        setRenameValue(data.thread.title)
      }
    } catch (e) {
      setThreadError(e instanceof Error ? e.message : 'Unable to create thread')
    }
  }

  async function commitRename(id: string) {
    const newTitle = renameValue.trim()
    setRenamingId(null)
    if (!newTitle) return
    try {
      await fetch(`/api/threads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      })
      fetchThreads()
    } catch {
      // non-critical
    }
  }

  async function deleteThread(id: string) {
    if (!confirm('Delete this thread? The native Claude/Codex session file will remain resumable via CLI.')) return
    try {
      await fetch(`/api/threads/${id}`, { method: 'DELETE' })
      if (activeId === id) setActiveId(null)
      fetchThreads()
    } catch {
      // non-critical
    }
  }

  async function sendMessage() {
    if (!active || !message.trim()) return
    setSending(true)
    setThreadError('')
    const payload = message.trim()
    setMessage('')
    try {
      const res = await fetch(`/api/threads/${active.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: payload }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Unable to send message')
      startTransition(() => {
        setMessages(data.messages || [])
        setLastRefreshAt(Date.now())
      })
      fetchThreads()
    } catch (e) {
      setThreadError(e instanceof Error ? e.message : 'Unable to send message')
      setMessage(payload)
    } finally {
      setSending(false)
    }
  }

  async function ensureExecutive() {
    setEnsuring(true)
    setStatusNote('')
    try {
      const res = await fetch('/api/executive/ensure', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.output || 'Unable to ensure executive lane')
      setStatusNote(data.output || 'Executive lane ensured.')
      fetchCapabilities()
    } catch (e) {
      setThreadError(e instanceof Error ? e.message : 'Unable to ensure executive lane')
    } finally {
      setEnsuring(false)
    }
  }

  async function recoverFabric() {
    setRecovering(true)
    setStatusNote('')
    try {
      const res = await fetch('/api/executive/recover', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.output || 'Unable to recover session fabric')
      setStatusNote(data.output || 'Session fabric recovered.')
      fetchCapabilities()
    } catch (e) {
      setThreadError(e instanceof Error ? e.message : 'Unable to recover session fabric')
    } finally {
      setRecovering(false)
    }
  }

  const operatorAvailable = capabilities?.operator_available === 'yes'

  return (
    <Shell>
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-4 py-6 sm:px-6 md:grid-cols-[16rem_1fr]">
        {/* Sidebar: threads */}
        <aside className="space-y-3 min-w-0">
          <div className="rounded-2xl border border-white/10 bg-[rgba(9,14,22,0.82)] p-3">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">Threads</div>
              <select
                value={newThreadModel}
                onChange={(e) => setNewThreadModel(e.target.value as ThreadModel)}
                className="rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-neutral-300"
              >
                <option value="codex">Codex</option>
                <option value="claude">Claude</option>
              </select>
            </div>
            <button
              type="button"
              onClick={createThread}
              className="mb-3 w-full rounded-xl border border-sky-400/25 bg-sky-400/10 px-3 py-2 text-sm text-sky-100 hover:border-sky-300/30"
            >
              + New thread
            </button>
            <div className="space-y-1">
              {threads.length === 0 && (
                <div className="px-3 py-4 text-xs text-neutral-500">No threads yet.</div>
              )}
              {threads.map((t) => {
                const isActive = t.id === activeId
                const isRenaming = renamingId === t.id
                return (
                  <div
                    key={t.id}
                    className={`group flex items-center gap-2 rounded-xl border px-2 py-2 text-sm ${
                      isActive
                        ? 'border-sky-400/30 bg-sky-400/10 text-sky-50'
                        : 'border-transparent text-neutral-300 hover:border-white/10 hover:bg-white/5'
                    }`}
                  >
                    <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${modelBadge(t.model)}`}>
                      {t.model === 'claude' ? 'C' : 'X'}
                    </span>
                    {isRenaming ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => commitRename(t.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename(t.id)
                          if (e.key === 'Escape') setRenamingId(null)
                        }}
                        className="flex-1 rounded bg-black/40 px-2 py-1 text-sm text-neutral-100 outline-none"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setActiveId(t.id)}
                        onDoubleClick={() => {
                          setRenamingId(t.id)
                          setRenameValue(t.title)
                        }}
                        className="flex-1 truncate text-left"
                        title={`double-click to rename · ${relativeTime(t.last_activity_at)}`}
                      >
                        {t.title}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => deleteThread(t.id)}
                      className="shrink-0 rounded px-1 text-[11px] text-neutral-600 opacity-0 group-hover:opacity-100 hover:text-rose-300"
                      title="Delete thread"
                    >
                      ✕
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </aside>

        {/* Main column */}
        <div className="space-y-6 min-w-0">
          {/* Chat panel */}
          <section className="rounded-[2rem] border border-white/10 bg-[rgba(9,14,22,0.82)] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.24)]">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold text-neutral-100">
                  {active ? active.title : 'Executive'}
                </h1>
                <p className="mt-0.5 truncate text-sm text-neutral-400">
                  {active
                    ? `${active.model === 'claude' ? 'Claude' : 'Codex'} · rooted at /opt/workspace`
                    : 'Create a thread to start talking to the workspace executive.'}
                </p>
              </div>
              {active && (
                <span className="text-xs text-neutral-600">refreshed {relativeTime(lastRefreshAt)}</span>
              )}
            </div>

            <div className="mb-4 max-h-[36rem] space-y-3 overflow-y-auto rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-4">
              {!active ? (
                <div className="rounded-[1.25rem] border border-dashed border-white/10 bg-white/5 px-4 py-8 text-center text-sm text-neutral-400">
                  Pick a thread on the left, or create a new one.
                </div>
              ) : messages.length === 0 ? (
                <div className="rounded-[1.25rem] border border-dashed border-white/10 bg-white/5 px-4 py-8 text-center text-sm text-neutral-400">
                  Empty thread. Send the first message below. The session will be resumable from the CLI via
                  {active.model === 'claude' ? ' claude --resume <id>' : ' codex exec resume <id>'}.
                </div>
              ) : (
                messages.map((entry, index) => (
                  <div
                    key={`${entry.timestamp}-${index}`}
                    className={`rounded-[1.25rem] border px-4 py-3 ${
                      entry.role === 'assistant'
                        ? 'border-sky-400/20 bg-sky-400/10 text-sky-50'
                        : 'border-white/10 bg-white/5 text-neutral-200'
                    }`}
                  >
                    <div className="mb-2 text-[11px] uppercase tracking-[0.22em] text-neutral-400">
                      {entry.role === 'assistant'
                        ? active.model === 'claude' ? 'Claude' : 'Codex'
                        : 'You'}
                    </div>
                    <div className="whitespace-pre-wrap text-sm leading-7">{entry.content}</div>
                  </div>
                ))
              )}
              <div ref={conversationEndRef} />
            </div>

            <div className="space-y-2">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendMessage()
                }}
                placeholder={active ? 'Tell the system what you want, what feels off, or what structure you are pushing toward.' : 'Create or select a thread first.'}
                rows={4}
                disabled={!active || sending}
                className="w-full resize-none rounded-[1.5rem] border border-neutral-700 bg-surface-2 px-4 py-4 text-sm text-neutral-200 placeholder-neutral-500 focus:border-sky-400/40 focus:outline-none focus:ring-1 focus:ring-sky-400/30 disabled:opacity-60"
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-neutral-500">Cmd/Ctrl+Enter to send</p>
                <button
                  type="button"
                  onClick={sendMessage}
                  disabled={!active || sending || !message.trim()}
                  className="rounded-full border border-sky-400/25 bg-sky-400/10 px-5 py-2 text-sm font-medium text-sky-100 transition hover:border-sky-300/30 disabled:opacity-50"
                >
                  {sending ? 'Sending…' : active ? `Send to ${active.model === 'claude' ? 'Claude' : 'Codex'}` : 'Send'}
                </button>
              </div>
              {threadError && (
                <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                  {threadError}
                </div>
              )}
              {statusNote && (
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                  {statusNote}
                </div>
              )}
            </div>
          </section>

          {/* Portfolio */}
          <section className="rounded-[2rem] border border-white/10 bg-[rgba(9,14,22,0.78)] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
            <div className="mb-4 flex items-center justify-between text-[11px] uppercase tracking-[0.26em] text-neutral-500">
              <span>Portfolio</span>
              <span className="text-neutral-600 normal-case tracking-normal text-[10px]">
                {metricsGeneratedAt
                  ? `metrics as of ${relativeTime(Date.parse(metricsGeneratedAt))}`
                  : 'metrics loading…'}
              </span>
            </div>
            <div className="space-y-3">
              {projects.length === 0 && (
                <p className="text-sm text-neutral-500">Loading projects…</p>
              )}
              {projects.map((p) => (
                <PortfolioCard
                  key={p.name}
                  project={p}
                  metrics={metricsByProject[metricsKeyForSession(p.name)] ?? null}
                />
              ))}
            </div>
          </section>

          {/* Operator tools (collapsed) */}
          {operatorAvailable && (
            <details className="rounded-[2rem] border border-white/10 bg-[rgba(9,14,22,0.78)] p-5">
              <summary className="cursor-pointer text-[11px] uppercase tracking-[0.26em] text-neutral-500 hover:text-neutral-400">
                Operator tools
              </summary>
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={ensureExecutive}
                    disabled={ensuring}
                    className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-sm font-medium text-emerald-100 hover:border-emerald-300/30 disabled:opacity-60"
                  >
                    {ensuring ? 'Ensuring…' : 'Ensure executive online'}
                  </button>
                  <button
                    type="button"
                    onClick={recoverFabric}
                    disabled={recovering}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-neutral-200 hover:border-white/20 disabled:opacity-60"
                  >
                    {recovering ? 'Recovering…' : 'Recover session fabric'}
                  </button>
                </div>
                {capabilities && (
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className={`rounded-full border px-3 py-1 ${capabilityTone(capabilities.host_tmux_control)}`}>tmux: {capabilities.host_tmux_control}</span>
                    <span className={`rounded-full border px-3 py-1 ${capabilityTone(capabilities.host_systemd_control)}`}>systemd: {capabilities.host_systemd_control}</span>
                    <span className={`rounded-full border px-3 py-1 ${capabilityTone(capabilities.runtime_write)}`}>runtime: {capabilities.runtime_write}</span>
                    <span className={`rounded-full border px-3 py-1 ${capabilityTone(capabilities.project_mutation)}`}>project mutation: {capabilities.project_mutation}</span>
                  </div>
                )}
              </div>
            </details>
          )}
        </div>
      </div>
    </Shell>
  )
}
