'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export interface WindowMetrics {
  threads: number
  compute_minutes: number
  input_tokens: number
  output_tokens: number
  total_tokens: number
}

export type ProjectMetrics = Record<'1h' | '24h' | '7d' | '30d', WindowMetrics>

export interface PortfolioProject {
  name: string
  projectName: string
  cwd: string
  agent: string
  role: string
  live: boolean
  currentState: {
    path: string | null
    content: string | null
  }
  lastCommit: { subject: string; relativeTime: string } | null
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function formatMinutes(m: number): string {
  if (m >= 60) return `${(m / 60).toFixed(1)}h`
  if (m >= 1) return `${m.toFixed(1)}m`
  if (m > 0) return `${Math.round(m * 60)}s`
  return '—'
}

function MetricsTable({ metrics }: { metrics: ProjectMetrics | null }) {
  if (!metrics) {
    return <p className="text-xs text-neutral-500">No metrics data (rollup not yet generated or this project has no attributed sessions).</p>
  }
  const windows: Array<keyof ProjectMetrics> = ['1h', '24h', '7d', '30d']
  const labels: Record<keyof ProjectMetrics, string> = {
    '1h': 'past hour',
    '24h': '24 hours',
    '7d': 'week',
    '30d': 'month',
  }
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-neutral-500">
          <th className="text-left font-normal py-1">metric</th>
          {windows.map((w) => (
            <th key={w} className="text-right font-normal py-1 pr-2">{labels[w]}</th>
          ))}
        </tr>
      </thead>
      <tbody className="font-mono text-neutral-200">
        <tr className="border-t border-white/5">
          <td className="py-1 text-neutral-400">threads</td>
          {windows.map((w) => <td key={w} className="text-right py-1 pr-2">{metrics[w].threads}</td>)}
        </tr>
        <tr className="border-t border-white/5">
          <td className="py-1 text-neutral-400">compute</td>
          {windows.map((w) => <td key={w} className="text-right py-1 pr-2">{formatMinutes(metrics[w].compute_minutes)}</td>)}
        </tr>
        <tr className="border-t border-white/5">
          <td className="py-1 text-neutral-400">tokens in</td>
          {windows.map((w) => <td key={w} className="text-right py-1 pr-2">{formatTokens(metrics[w].input_tokens)}</td>)}
        </tr>
        <tr className="border-t border-white/5">
          <td className="py-1 text-neutral-400">tokens out</td>
          {windows.map((w) => <td key={w} className="text-right py-1 pr-2">{formatTokens(metrics[w].output_tokens)}</td>)}
        </tr>
      </tbody>
    </table>
  )
}

export default function PortfolioCard({ project, metrics }: { project: PortfolioProject; metrics: ProjectMetrics | null }) {
  const [open, setOpen] = useState(false)
  const [paneOutput, setPaneOutput] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [paneError, setPaneError] = useState('')
  const paneRef = useRef<HTMLPreElement>(null)

  const fetchPane = useCallback(async () => {
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(project.name)}`)
      if (!res.ok) {
        setPaneError(`pane status ${res.status}`)
        return
      }
      const data = await res.json()
      setPaneOutput(data.output || '')
      setPaneError('')
    } catch (e) {
      setPaneError(e instanceof Error ? e.message : 'pane fetch failed')
    }
  }, [project.name])

  useEffect(() => {
    if (!open) return
    fetchPane()
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') fetchPane()
    }, 3000)
    return () => clearInterval(interval)
  }, [open, fetchPane])

  useEffect(() => {
    if (paneRef.current) paneRef.current.scrollTop = paneRef.current.scrollHeight
  }, [paneOutput])

  async function handleSend() {
    if (!message.trim() || !project.live) return
    setSending(true)
    try {
      await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session: project.name, message }),
      })
      setMessage('')
      setTimeout(fetchPane, 1200)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02]"
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${project.live ? 'bg-emerald-400' : 'bg-neutral-600'}`} />
        <span className="font-mono text-sm text-neutral-100">{project.name}</span>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${
          project.live
            ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
            : 'border-neutral-700 bg-neutral-800 text-neutral-500'
        }`}>
          {project.live ? 'live' : 'offline'}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-neutral-500">
          {project.lastCommit ? `${project.lastCommit.subject} · ${project.lastCommit.relativeTime}` : '—'}
        </span>
        <span className="shrink-0 text-neutral-500">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="border-t border-white/8 px-4 py-4 space-y-4">
          {/* Metrics */}
          <section>
            <div className="mb-2 text-[11px] uppercase tracking-[0.22em] text-neutral-500">Metrics</div>
            <div className="rounded-xl border border-white/8 bg-black/30 px-4 py-3">
              <MetricsTable metrics={metrics} />
            </div>
          </section>

          {/* Context repo front door */}
          <section>
            <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.22em] text-neutral-500">
              <span>CURRENT_STATE · {project.currentState.path ? project.currentState.path.replace(/^\/opt\/workspace\//, '') : 'missing'}</span>
              <Link
                href={`/sessions/${project.name}`}
                className="text-neutral-500 hover:text-neutral-300 normal-case tracking-normal"
              >
                Full view →
              </Link>
            </div>
            <div className="rounded-xl border border-white/8 bg-black/30 px-4 py-3 max-h-96 overflow-y-auto">
              {project.currentState.content ? (
                <div className="prose prose-invert prose-sm max-w-none prose-headings:text-neutral-100 prose-p:text-neutral-300 prose-li:text-neutral-300 prose-code:text-sky-200 prose-strong:text-neutral-100 prose-a:text-sky-300">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {project.currentState.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="text-xs text-neutral-500">No CURRENT_STATE.md found for this project — the context repo front door is missing or stale.</p>
              )}
            </div>
          </section>

          {/* Project session chat */}
          <section>
            <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.22em] text-neutral-500">
              <span>{project.agent} session · {project.name}</span>
              {paneError && <span className="text-rose-300 normal-case tracking-normal">{paneError}</span>}
            </div>
            <pre
              ref={paneRef}
              className="max-h-64 overflow-auto rounded-xl border border-white/8 bg-black/40 p-3 text-[11px] font-mono text-neutral-300 whitespace-pre"
            >
              {paneOutput || (project.live ? 'Waiting for pane output…' : 'Session is offline.')}
            </pre>
            <div className="mt-2 flex gap-2">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend()
                }}
                placeholder={project.live ? `Send to ${project.name} session… (Cmd/Ctrl+Enter)` : 'Session offline — cannot send.'}
                rows={2}
                disabled={sending || !project.live}
                className="flex-1 resize-none rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-sky-400/40 focus:outline-none focus:ring-1 focus:ring-sky-400/30 disabled:opacity-60"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || !message.trim() || !project.live}
                className="self-end rounded-lg border border-sky-400/25 bg-sky-400/10 px-4 py-2 text-sm font-medium text-sky-100 hover:border-sky-300/30 disabled:opacity-50"
              >
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
