'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Shell from '@/components/Shell'
import PageHeader from '@/components/PageHeader'

interface TaskSignals {
  description: string
  project?: string
  scope?: string
  intent?: string
  risk?: string
}

interface MatchedRule {
  name: string
  matched: boolean
  weight: number
  effect: string
}

interface RoutingDecision {
  platform: 'claude' | 'codex'
  model: string
  reasoning: 'low' | 'medium' | 'high'
  session: string
  environmentId: string
  rationale: string
  rules: MatchedRule[]
}

interface TaskEvent {
  id: string
  type: string
  message: string
  timestamp: number
}

interface EnvironmentProfile {
  id: string
  label: string
  trustClass: string
  capabilities: string[]
}

interface Task {
  id: string
  sessionId: string
  description: string
  signals: TaskSignals
  decision: RoutingDecision
  environmentId: string
  overrides?: Partial<RoutingDecision>
  status: 'analyzed' | 'dispatched' | 'completed' | 'failed'
  output?: string
  reviewStatus: 'none' | 'pending' | 'complete'
  reviewResult?: string
  reviewSession?: string
  createdAt: number
  dispatchedAt?: number
  completedAt?: number
  events: TaskEvent[]
}

interface DispatchResponse {
  taskId: string
  signals: TaskSignals
  decision: RoutingDecision
  environment?: EnvironmentProfile
  status: string
  configLog?: string[]
  error?: string
}

export default function OrchestratePage() {
  const [description, setDescription] = useState('')
  const [dispatching, setDispatching] = useState(false)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [signals, setSignals] = useState<TaskSignals | null>(null)
  const [decision, setDecision] = useState<RoutingDecision | null>(null)
  const [environment, setEnvironment] = useState<EnvironmentProfile | null>(null)
  const [configLog, setConfigLog] = useState<string[]>([])
  const [task, setTask] = useState<Task | null>(null)
  const [agentActivity, setAgentActivity] = useState<string>('')
  const [showRules, setShowRules] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<DispatchResponse[]>([])
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const pollTask = useCallback(async (id: string) => {
    const res = await fetch(`/api/orchestrate/${id}`)
    if (!res.ok) return
    const data = await res.json()
    setTask(data.task)
    setEnvironment(data.environment || null)
    if (data.agentActivity) setAgentActivity(data.agentActivity)
    if (data.task.status === 'completed' || data.task.status === 'failed') {
      stopPolling()
    }
  }, [stopPolling])

  useEffect(() => {
    return () => stopPolling()
  }, [stopPolling])

  // --- Primary action: single-shot dispatch ---
  async function handleDispatch() {
    if (!description.trim()) return
    setDispatching(true)
    setError(null)
    setTaskId(null)
    setTask(null)
    setSignals(null)
    setDecision(null)
    setEnvironment(null)
    setConfigLog([])
    setAgentActivity('')
    stopPolling()

    const res = await fetch('/api/orchestrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dispatch', description }),
    })
    const data: DispatchResponse = await res.json()
    setDispatching(false)

    if (data.taskId) {
      setTaskId(data.taskId)
      setSignals(data.signals)
      setDecision(data.decision)
      setEnvironment(data.environment || null)
      setConfigLog(data.configLog || [])
      setHistory((prev) => [data, ...prev].slice(0, 20))
      setDescription('')

      if (data.status === 'dispatched') {
        // Start polling for task updates
        pollRef.current = setInterval(() => pollTask(data.taskId), 3000)
        pollTask(data.taskId)
      }
    }

    if (data.error) {
      setError(data.error)
    }
  }

  // --- Manual review trigger ---
  async function handleReview() {
    if (!taskId || !decision) return
    const reviewer = decision.platform === 'claude' ? 'codex' : 'claude'
    const session = decision.session || 'general'
    await fetch('/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session, reviewer, taskId }),
    })
    // Poll will pick up the review result via task updates
    if (taskId) pollTask(taskId)
  }

  return (
    <Shell>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <PageHeader
          eyebrow="Dispatch"
          title="Route work without becoming the relay."
          description="Describe the outcome. Command classifies the work, chooses the right lane, and preserves the reasoning behind that dispatch."
        />

        {/* Task input — the only thing the user touches */}
        <div className="space-y-2">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleDispatch()
            }}
            placeholder="Describe the outcome you want."
            rows={2}
            disabled={dispatching}
            className="w-full px-4 py-3 bg-surface-2 border border-neutral-700 rounded-lg
                       text-sm text-neutral-200 placeholder-neutral-500 resize-none
                       focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent
                       disabled:opacity-50"
          />
          <button
            onClick={handleDispatch}
            disabled={dispatching || !description.trim()}
            className="w-full px-5 py-3 bg-accent hover:bg-blue-600 disabled:opacity-40
                       rounded-lg text-sm font-medium transition-colors"
          >
            {dispatching ? 'Routing & dispatching...' : 'Go'}
          </button>
        </div>

        {error && (
          <div className="bg-red-950/30 border border-red-800/30 rounded-lg px-4 py-3">
            <p className="text-xs text-red-300">{error}</p>
          </div>
        )}

        {/* Live dispatch feed — system's decisions rendered as they happen */}
        {decision && (
          <div className="space-y-4">

            {/* Routing decision */}
            <div className="bg-surface-1 border border-neutral-800 rounded-lg p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <PlatformPill platform={decision.platform} />
                <InfoChip label="Model" value={decision.model} />
                <InfoChip
                  label="Effort"
                  value={decision.reasoning === 'high' ? '● high' : decision.reasoning === 'medium' ? '◐ medium' : '○ low'}
                  className={decision.reasoning === 'high' ? 'text-orange-300' : decision.reasoning === 'medium' ? 'text-yellow-300' : 'text-neutral-400'}
                />
                <InfoChip label="Session" value={decision.session} mono />
                {environment && <InfoChip label="Env" value={environment.label} />}
                {signals?.risk === 'high' && (
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border bg-red-900/40 text-red-300 border-red-800/50">
                    high risk — auto-review
                  </span>
                )}
              </div>

              <p className="text-xs text-neutral-400">{decision.rationale}</p>
              {environment && (
                <p className="text-xs text-neutral-500">
                  Trust class: <span className="text-neutral-300">{environment.trustClass}</span> · Capabilities: {environment.capabilities.join(', ')}
                </p>
              )}

              {/* Signals */}
              {signals && (
                <div className="flex flex-wrap gap-2">
                  {signals.intent && signals.intent !== 'unknown' && <SignalPill label="Intent" value={signals.intent} />}
                  {signals.scope && signals.scope !== 'unknown' && <SignalPill label="Scope" value={signals.scope} />}
                  {signals.project && <SignalPill label="Project" value={signals.project} />}
                </div>
              )}

              {/* Collapsible: matched rules */}
              <button
                onClick={() => setShowRules(!showRules)}
                className="text-[10px] text-neutral-600 hover:text-neutral-400 uppercase tracking-wide transition-colors"
              >
                {showRules ? '▾ Hide rules' : '▸ Rules fired'}
              </button>
              {showRules && (
                <div className="space-y-1">
                  {decision.rules.filter((r) => r.matched).map((r) => (
                    <div key={r.name} className="flex items-center gap-2 text-xs">
                      <span className="text-ok">&#10003;</span>
                      <span className="text-neutral-400 font-mono">{r.name}</span>
                      <span className="text-neutral-600">{r.effect}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Configuration log — what the executor did before dispatching */}
            {configLog.length > 0 && (
              <div>
                <button
                  onClick={() => setShowConfig(!showConfig)}
                  className="text-[10px] text-neutral-600 hover:text-neutral-400 uppercase tracking-wide transition-colors"
                >
                  {showConfig ? '▾ Hide config log' : '▸ Session configuration'}
                </button>
                {showConfig && (
                  <div className="mt-2 bg-surface-0 border border-neutral-800 rounded-lg p-3 space-y-1">
                    {configLog.map((line, i) => (
                      <div key={i} className="text-xs font-mono text-neutral-400 flex items-start gap-2">
                        <span className="text-neutral-600 select-none">{i + 1}.</span>
                        <span>{line}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Task status + output */}
            {task && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <StatusBadge status={task.status} />
                  {task.status === 'dispatched' && agentActivity && (
                    <span className="text-xs text-neutral-500">{agentActivity}</span>
                  )}
                  {decision.platform === 'claude' && task.status === 'dispatched' && (
                    <a
                      href={`/sessions?focus=${decision.session}`}
                      className="text-xs text-accent hover:underline ml-auto"
                    >
                      View session
                    </a>
                  )}
                </div>

                {task.output && (
                  <div className="bg-surface-0 border border-neutral-800 rounded-lg overflow-hidden">
                    <pre className="p-4 text-xs font-mono text-neutral-300 overflow-x-auto max-h-[40vh] overflow-y-auto whitespace-pre">
                      {task.output}
                    </pre>
                  </div>
                )}

                {task.events?.length > 0 && (
                  <div className="bg-surface-0 border border-neutral-800 rounded-lg overflow-hidden">
                    <div className="px-4 py-2 border-b border-neutral-800">
                      <span className="text-xs font-medium text-neutral-400">Event Log</span>
                    </div>
                    <div className="p-4 space-y-2 max-h-[24vh] overflow-y-auto">
                      {task.events.slice().reverse().map((event) => (
                        <div key={event.id} className="text-xs">
                          <div className="text-neutral-300">{event.message}</div>
                          <div className="text-neutral-600 font-mono">
                            {new Date(event.timestamp).toLocaleString()} · {event.type}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Review results (from auto-review or manual trigger) */}
                {task.reviewStatus === 'complete' && task.reviewResult && (
                  <div className="bg-purple-950/30 border border-purple-800/30 rounded-lg overflow-hidden">
                    <div className="px-4 py-2 border-b border-purple-800/30">
                      <span className="text-xs font-medium text-purple-300">Adversarial Review</span>
                    </div>
                    <pre className="p-4 text-xs font-mono text-neutral-300 overflow-x-auto max-h-[40vh] overflow-y-auto whitespace-pre-wrap">
                      {task.reviewResult}
                    </pre>
                  </div>
                )}
                {task.reviewStatus === 'pending' && task.reviewSession && (
                  <div className="bg-purple-950/20 border border-purple-800/20 rounded-lg px-4 py-3">
                    <p className="text-xs text-purple-300">
                      Review running in <a href={`/sessions?focus=${task.reviewSession}`} className="text-accent hover:underline">{task.reviewSession}</a> session
                    </p>
                  </div>
                )}

                {/* Manual review button (only if auto-review didn't fire) */}
                {task.reviewStatus === 'none' && (task.status === 'dispatched' || task.status === 'completed') && (
                  <button
                    onClick={handleReview}
                    className="px-4 py-2 bg-purple-800/60 hover:bg-purple-700/60
                               rounded-lg text-xs font-medium transition-colors border border-purple-700/40"
                  >
                    Request adversarial review ({decision.platform === 'claude' ? 'Codex' : 'Claude'})
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Recent dispatch history */}
        {history.length > 1 && (
          <div className="pt-4 border-t border-neutral-800">
            <h2 className="text-xs text-neutral-500 uppercase tracking-wide mb-3">Recent</h2>
            <div className="space-y-2">
              {history.slice(1).map((h) => (
                <div key={h.taskId} className="flex items-center gap-3 text-xs text-neutral-500">
                  <PlatformPill platform={h.decision.platform} />
                  <span className="text-neutral-400 truncate flex-1">{h.signals.description}</span>
                  <span className="font-mono text-neutral-600">{h.decision.session}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Shell>
  )
}

// --- Shared components ---

function PlatformPill({ platform }: { platform: string }) {
  const styles: Record<string, string> = {
    claude: 'bg-orange-900/40 text-orange-300 border-orange-800/50',
    codex: 'bg-emerald-900/40 text-emerald-300 border-emerald-800/50',
  }
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
      styles[platform] || 'bg-neutral-800 text-neutral-500 border-neutral-700'
    }`}>
      {platform}
    </span>
  )
}

function InfoChip({ label, value, className, mono }: { label: string; value: string; className?: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-neutral-500 uppercase">{label}</span>
      <span className={`text-sm font-medium ${className || 'text-neutral-200'} ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}

function SignalPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-[10px] bg-surface-2 border border-neutral-700 rounded px-2 py-0.5">
      <span className="text-neutral-500">{label}: </span>
      <span className="text-neutral-300">{value}</span>
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    analyzed: 'bg-blue-900/40 text-blue-300 border-blue-800/50',
    dispatched: 'bg-yellow-900/40 text-yellow-300 border-yellow-800/50',
    completed: 'bg-emerald-900/40 text-emerald-300 border-emerald-800/50',
    failed: 'bg-red-900/40 text-red-300 border-red-800/50',
  }
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${
      styles[status] || 'bg-neutral-800 text-neutral-500 border-neutral-700'
    }`}>
      {status === 'dispatched' ? 'running' : status}
    </span>
  )
}
