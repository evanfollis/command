'use client'

import { useCallback, useEffect, useState } from 'react'
import Nav from '@/components/Nav'
import type { SymphonyState, SymphonyTaskView } from '@/lib/symphonyStore'

const STATE_COLORS: Record<SymphonyState, string> = {
  ready:    'bg-sky-500/15 text-sky-200 border-sky-400/25',
  running:  'bg-emerald-500/15 text-emerald-200 border-emerald-400/25',
  blocked:  'bg-amber-500/15 text-amber-200 border-amber-400/25',
  review:   'bg-violet-500/15 text-violet-200 border-violet-400/25',
  done:     'bg-neutral-500/15 text-neutral-400 border-neutral-400/25',
  deferred: 'bg-neutral-500/15 text-neutral-400 border-neutral-400/25',
}

const VALID_TRANSITIONS: Record<SymphonyState, SymphonyState[]> = {
  ready:    ['running'],
  running:  ['review', 'done', 'blocked', 'deferred'],
  blocked:  ['ready', 'deferred'],
  review:   ['done', 'running', 'deferred'],
  done:     [],
  deferred: ['ready'],
}

function relativeTime(ts: number) {
  const diff = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (diff < 60) return `${diff}s ago`
  const m = Math.round(diff / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

interface CreateForm {
  title: string
  description: string
  targetProject: string
  ownerSession: string
}

const EMPTY_FORM: CreateForm = { title: '', description: '', targetProject: '', ownerSession: 'general' }

export default function SymphonyPage() {
  const [tasks, setTasks] = useState<SymphonyTaskView[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM)
  const [transitioning, setTransitioning] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/symphony')
      if (!res.ok) throw new Error(`${res.status}`)
      const data = await res.json()
      setTasks(data.tasks)
      setError(null)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    try {
      const res = await fetch('/api/symphony', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error || 'create failed')
        return
      }
      setForm(EMPTY_FORM)
      setError(null)
      await load()
    } finally {
      setCreating(false)
    }
  }

  async function handleTransition(id: string, to: SymphonyState) {
    setTransitioning(id)
    try {
      const res = await fetch(`/api/symphony/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, by: 'operator' }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error || 'transition failed')
        return
      }
      setError(null)
      await load()
    } finally {
      setTransitioning(null)
    }
  }

  const stale = tasks.filter((t) => t.stale)
  const active = tasks.filter((t) => !['done', 'deferred'].includes(t.state))
  const archived = tasks.filter((t) => ['done', 'deferred'].includes(t.state))

  return (
    <div className="min-h-screen bg-[rgb(8,12,18)] text-neutral-100">
      <Nav />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-neutral-100">Symphony Tasks</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Local task state machine — ready → running → review. Max 1 running per project, 3 globally.
          </p>
        </div>

        {stale.length > 0 && (
          <div className="mb-4 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3">
            <p className="text-sm font-medium text-amber-300">
              {stale.length} stale task{stale.length > 1 ? 's' : ''} need attention
            </p>
            <ul className="mt-1 space-y-0.5">
              {stale.map((t) => (
                <li key={t.id} className="text-xs text-amber-200/70">
                  [{t.state}] {t.title} — {relativeTime(t.stateChangedAt)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-xl border border-rose-400/20 bg-rose-400/5 px-4 py-3 text-sm text-rose-300">
            {error}
          </div>
        )}

        {/* Create form */}
        <details className="mb-6 rounded-xl border border-white/10 bg-white/[0.02]">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-neutral-300 hover:text-neutral-100">
            + New task
          </summary>
          <form onSubmit={handleCreate} className="border-t border-white/10 px-4 py-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-neutral-400 mb-1">Title *</label>
                <input
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-sky-400/40 focus:outline-none"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Short task title"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-neutral-400 mb-1">Target project *</label>
                <input
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-sky-400/40 focus:outline-none"
                  value={form.targetProject}
                  onChange={(e) => setForm((f) => ({ ...f, targetProject: e.target.value }))}
                  placeholder="command, atlas, general…"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Description *</label>
              <textarea
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-sky-400/40 focus:outline-none"
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="What needs to be done and why"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Owner session *</label>
              <input
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-sky-400/40 focus:outline-none"
                value={form.ownerSession}
                onChange={(e) => setForm((f) => ({ ...f, ownerSession: e.target.value }))}
                placeholder="tmux session name (general, command…)"
                required
              />
            </div>
            <button
              type="submit"
              disabled={creating}
              className="rounded-full border border-sky-400/20 bg-sky-500/10 px-4 py-2 text-sm text-sky-200 hover:border-sky-300/30 hover:text-sky-100 disabled:opacity-40"
            >
              {creating ? 'Creating…' : 'Create task'}
            </button>
          </form>
        </details>

        {/* Active tasks */}
        {loading ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : active.length === 0 ? (
          <p className="text-sm text-neutral-500">No active tasks. Create one above.</p>
        ) : (
          <div className="space-y-2">
            {active.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                expanded={expandedId === task.id}
                onToggle={() => setExpandedId((id) => (id === task.id ? null : task.id))}
                onTransition={handleTransition}
                transitioning={transitioning === task.id}
              />
            ))}
          </div>
        )}

        {/* Archived tasks */}
        {archived.length > 0 && (
          <details className="mt-6">
            <summary className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-400">
              {archived.length} archived (done / deferred)
            </summary>
            <div className="mt-2 space-y-2">
              {archived.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  expanded={expandedId === task.id}
                  onToggle={() => setExpandedId((id) => (id === task.id ? null : task.id))}
                  onTransition={handleTransition}
                  transitioning={transitioning === task.id}
                />
              ))}
            </div>
          </details>
        )}
      </main>
    </div>
  )
}

function TaskRow({
  task,
  expanded,
  onToggle,
  onTransition,
  transitioning,
}: {
  task: SymphonyTaskView
  expanded: boolean
  onToggle: () => void
  onTransition: (id: string, to: SymphonyState) => void
  transitioning: boolean
}) {
  const allowed = VALID_TRANSITIONS[task.state]

  return (
    <div className={`rounded-xl border ${task.stale ? 'border-amber-400/20' : 'border-white/10'} bg-white/[0.02]`}>
      <button
        onClick={onToggle}
        className="flex w-full items-start gap-3 px-4 py-3 text-left"
      >
        <span className={`mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${STATE_COLORS[task.state]}`}>
          {task.state}{task.stale ? ' ⚠' : ''}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block truncate text-sm font-medium text-neutral-200">{task.title}</span>
          <span className="text-xs text-neutral-500">{task.targetProject} · {task.ownerSession} · {relativeTime(task.createdAt)}</span>
        </span>
      </button>

      {expanded && (
        <div className="border-t border-white/10 px-4 py-3 space-y-3">
          <p className="text-sm text-neutral-300 whitespace-pre-wrap">{task.description}</p>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
            <div>
              <dt className="text-neutral-500">ID</dt>
              <dd className="font-mono text-neutral-400">{task.id.slice(0, 8)}…</dd>
            </div>
            {task.agentSessionId && (
              <div>
                <dt className="text-neutral-500">Agent session</dt>
                <dd className="font-mono text-neutral-400 truncate">{task.agentSessionId.slice(0, 12)}…</dd>
              </div>
            )}
            {task.threadId && (
              <div>
                <dt className="text-neutral-500">Thread</dt>
                <dd className="font-mono text-neutral-400 truncate">{task.threadId.slice(0, 8)}…</dd>
              </div>
            )}
            {task.worktreeIdentity && (
              <div>
                <dt className="text-neutral-500">Worktree</dt>
                <dd className="text-neutral-400 truncate">{task.worktreeIdentity}</dd>
              </div>
            )}
            {task.blockedBy && (
              <div>
                <dt className="text-neutral-500">Blocked by</dt>
                <dd className="font-mono text-amber-400 truncate">{task.blockedBy.slice(0, 8)}…</dd>
              </div>
            )}
          </dl>

          {task.reviewArtifacts && task.reviewArtifacts.length > 0 && (
            <div>
              <p className="text-xs text-neutral-500 mb-1">Review artifacts</p>
              <ul className="space-y-0.5">
                {task.reviewArtifacts.map((a) => (
                  <li key={a} className="font-mono text-xs text-violet-300">{a}</li>
                ))}
              </ul>
            </div>
          )}

          {/* State history */}
          <div>
            <p className="text-xs text-neutral-500 mb-1">History</p>
            <ol className="space-y-0.5">
              {task.stateHistory.map((h, i) => (
                <li key={i} className="text-xs text-neutral-400">
                  {h.from ? `${h.from} → ` : ''}<span className="text-neutral-200">{h.to}</span>
                  {' '}by {h.by}
                  {h.reason ? ` — ${h.reason}` : ''}
                  <span className="ml-1 text-neutral-600">{relativeTime(h.timestamp)}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Transition buttons */}
          {allowed.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {allowed.map((to) => (
                <button
                  key={to}
                  disabled={transitioning}
                  onClick={() => onTransition(task.id, to)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${STATE_COLORS[to]} hover:brightness-125`}
                >
                  → {to}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
