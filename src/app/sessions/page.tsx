'use client'

import { Suspense, useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import Shell from '@/components/Shell'
import PageHeader from '@/components/PageHeader'

interface AgentInfo {
  platform: 'claude' | 'codex' | 'unknown'
  model: string
  activity: 'working' | 'idle' | 'plan-mode' | 'rate-limited' | 'unknown'
  activityDetail: string
  reasoning: string
  context: string
  plan: string
}

interface Session {
  name: string
  created: string
  attached: boolean
  agent: AgentInfo
}

export default function SessionsPage() {
  return (
    <Suspense>
      <SessionsContent />
    </Suspense>
  )
}

function SessionsContent() {
  const searchParams = useSearchParams()
  const [sessions, setSessions] = useState<Session[]>([])
  const [selected, setSelected] = useState<string>(searchParams.get('focus') || '')
  const [output, setOutput] = useState('')
  const [prompt, setPrompt] = useState('')
  const [sending, setSending] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [showInspector, setShowInspector] = useState(false)
  const [rawPane, setRawPane] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const [reviewResult, setReviewResult] = useState<string | null>(null)
  const [reviewInfo, setReviewInfo] = useState<string | null>(null)
  const [lastOutputAt, setLastOutputAt] = useState<number | null>(null)

  const fetchSessions = useCallback(async () => {
    const res = await fetch('/api/sessions')
    const data = await res.json()
    setSessions(data.sessions || [])
    if (!selected && data.sessions?.length > 0) {
      setSelected(data.sessions[0].name)
    }
  }, [selected])

  const fetchOutput = useCallback(async () => {
    if (!selected) return
    setRefreshing(true)
    const res = await fetch(`/api/sessions/${selected}`)
    const data = await res.json()
    setOutput(data.output || '')
    setRawPane(data.output || '')
    setLastOutputAt(Date.now())
    setRefreshing(false)
  }, [selected])

  useEffect(() => {
    fetchSessions()
    const interval = setInterval(fetchSessions, 10000)
    function onVisible() {
      if (document.visibilityState === 'visible') {
        fetchSessions()
        fetchOutput()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [fetchSessions, fetchOutput])

  useEffect(() => {
    fetchOutput()
  }, [fetchOutput])

  useEffect(() => {
    if (!selected) return

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchOutput()
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [selected, fetchOutput])

  async function handleSend() {
    if (!prompt.trim() || !selected) return
    setSending(true)
    await fetch('/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: selected, message: prompt }),
    })
    setPrompt('')
    setSending(false)
    setTimeout(fetchOutput, 2000)
  }

  async function sendLiteral(message: string, appendEnter: boolean) {
    if (!selected) return
    await fetch('/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: selected, message, appendEnter }),
    })
    setTimeout(fetchOutput, 500)
  }

  async function sendNamed(...keys: string[]) {
    if (!selected) return
    await fetch('/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: selected, keys }),
    })
    setTimeout(fetchOutput, 500)
  }

  async function handleReview() {
    if (!selected) return
    const session = sessions.find((s) => s.name === selected)
    if (!session) return
    setReviewing(true)
    setReviewResult(null)
    setReviewInfo(null)
    const reviewer = session.agent.platform === 'codex' ? 'claude' : 'codex'
    const res = await fetch('/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: selected, reviewer }),
    })
    const data = await res.json()
    setReviewing(false)
    if (data.review) {
      setReviewResult(data.review)
    } else if (data.reviewSession) {
      setReviewInfo(`Review sent to "${data.reviewSession}". Check that session for results.`)
    } else if (data.error) {
      setReviewResult(`Error: ${data.error}`)
    }
  }

  const selectedSession = sessions.find((s) => s.name === selected)
  const agent = selectedSession?.agent

  return (
    <Shell>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <PageHeader
          eyebrow="Sessions"
          title="Inspect the live agent fabric."
          description="Read posture, steer individual lanes, and pressure-test work without dropping into the shell unless operator action is truly warranted."
        />
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Session list */}
          <div className="lg:w-64 shrink-0 pt-2">
            <h2 className="text-sm font-medium text-neutral-400 mb-3">Live lanes</h2>
            <div className="space-y-1">
              {sessions.map((s) => (
                <button
                  key={s.name}
                  onClick={() => setSelected(s.name)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    selected === s.name
                      ? 'bg-accent-dim text-accent border border-accent/30'
                      : 'text-neutral-400 hover:bg-surface-2 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${
                      s.agent.activity === 'working' ? 'bg-accent animate-pulse' :
                      s.agent.activity === 'rate-limited' ? 'bg-warn' :
                      s.agent.activity === 'plan-mode' ? 'bg-purple-500' : 'bg-ok'
                    }`} />
                    <span className="font-mono">{s.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 ml-4">
                    <PlatformPill platform={s.agent.platform} />
                    {s.agent.model && (
                      <span className="text-[10px] text-neutral-500">{s.agent.model}</span>
                    )}
                    {s.agent.reasoning && (
                      <span className="text-[10px] text-neutral-600">
                        {s.agent.reasoning === 'high' ? '●' : s.agent.reasoning === 'medium' ? '◐' : '○'}
                      </span>
                    )}
                  </div>
                </button>
              ))}
              {sessions.length === 0 && (
                <p className="text-sm text-neutral-500 px-3">No active sessions</p>
              )}
            </div>
          </div>

          {/* Session detail */}
          <div className="flex-1 min-w-0 space-y-4">
            {selected && agent ? (
              <>
                {/* Header with agent info bar */}
                <div className="flex items-center justify-between">
                  <h1 className="text-lg font-semibold font-mono">{selected}</h1>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-neutral-600">
                      auto-refresh every 2s{lastOutputAt ? ` · last ${new Date(lastOutputAt).toLocaleTimeString()}` : ''}
                    </span>
                    <button
                      onClick={fetchOutput}
                      disabled={refreshing}
                      className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
                    >
                      {refreshing ? 'Refreshing...' : 'Refresh now'}
                    </button>
                  </div>
                </div>

                {/* Agent info bar */}
                <div className="bg-surface-1 border border-neutral-800 rounded-lg px-4 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <PlatformPill platform={agent.platform} />

                    {agent.model && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-neutral-500 uppercase">Model</span>
                        <span className="text-sm text-neutral-200 font-medium">{agent.model}</span>
                      </div>
                    )}

                    {agent.plan && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-neutral-500 uppercase">Plan</span>
                        <span className="text-sm text-neutral-300">{agent.plan}</span>
                      </div>
                    )}

                    {agent.reasoning && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-neutral-500 uppercase">Effort</span>
                        <span className={`text-sm font-medium ${
                          agent.reasoning === 'high' ? 'text-orange-300' :
                          agent.reasoning === 'medium' ? 'text-yellow-300' :
                          'text-neutral-400'
                        }`}>
                          {agent.reasoning === 'high' ? '● high' :
                           agent.reasoning === 'medium' ? '◐ medium' : '○ low'}
                        </span>
                      </div>
                    )}

                    {agent.context && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-neutral-500 uppercase">Context</span>
                        <span className="text-sm text-neutral-400 font-mono">{agent.context}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 ml-auto">
                      <span className={`w-2 h-2 rounded-full ${
                        agent.activity === 'working' ? 'bg-accent animate-pulse' :
                        agent.activity === 'rate-limited' ? 'bg-warn' :
                        agent.activity === 'plan-mode' ? 'bg-purple-500' : 'bg-ok'
                      }`} />
                      <span className={`text-xs ${
                        agent.activity === 'working' ? 'text-accent' :
                        agent.activity === 'rate-limited' ? 'text-warn' :
                        agent.activity === 'plan-mode' ? 'text-purple-400' : 'text-neutral-500'
                      }`}>
                        {agent.activity === 'working' ? agent.activityDetail || 'Working...' :
                         agent.activity === 'plan-mode' ? 'Plan mode' :
                         agent.activity === 'rate-limited' ? 'Rate limited' :
                         agent.activity === 'idle' ? 'Idle' : ''}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Output viewer */}
                <div className="bg-surface-0 border border-neutral-800 rounded-lg overflow-hidden">
                  <pre className="p-4 text-xs font-mono text-neutral-300 overflow-x-auto max-h-[50vh] overflow-y-auto whitespace-pre">
                    {output || 'No output captured'}
                  </pre>
                </div>

                {/* Detection inspector */}
                <div>
                  <button
                    onClick={() => setShowInspector(!showInspector)}
                    className="text-[10px] text-neutral-600 hover:text-neutral-400 uppercase tracking-wide transition-colors"
                  >
                    {showInspector ? '▾ Hide detection logic' : '▸ Inspect detection logic'}
                  </button>
                  {showInspector && (
                    <div className="mt-2 bg-surface-1 border border-neutral-800 rounded-lg p-4 space-y-3">
                      <p className="text-xs text-neutral-500">
                        Agent info is parsed from the last 15 lines of the tmux pane via <code className="text-neutral-400">tmux capture-pane</code>.
                        The parser in <code className="text-neutral-400">src/lib/tmux.ts:parseAgentInfo()</code> matches these patterns:
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <InspectorRow label="Platform" pattern='contains "Claude" or "Remote Control" → claude / "Codex" → codex' detected={agent.platform} />
                        <InspectorRow label="Model" pattern="/(Sonnet|Opus|Haiku) [\\d.]+/" detected={agent.model || '(not visible — hidden during active work)'} />
                        <InspectorRow label="Plan" pattern="/Claude (Pro|Max|Team|Free)/" detected={agent.plan || '(not visible)'} />
                        <InspectorRow label="Reasoning" pattern="/[◐●○] (low|medium|high)/" detected={agent.reasoning || '(not set or default)'} />
                        <InspectorRow label="Activity" pattern="spinner text → working / ? prompt → idle / ⏸ → plan-mode / rate limit → rate-limited" detected={`${agent.activity}: ${agent.activityDetail || '-'}`} />
                        <InspectorRow label="Context" pattern="/~?\\d+k (uncached|tokens)/" detected={agent.context || '(not visible)'} />
                      </div>
                      <details className="text-xs">
                        <summary className="text-neutral-500 cursor-pointer hover:text-neutral-400">Raw pane capture (last 15 lines)</summary>
                        <pre className="mt-2 p-3 bg-surface-0 border border-neutral-800 rounded text-[10px] font-mono text-neutral-500 max-h-40 overflow-y-auto whitespace-pre">
                          {rawPane || '(empty)'}
                        </pre>
                      </details>
                    </div>
                  )}
                </div>

                {/* Quick keys for menu confirmations / control */}
                <div className="flex gap-2 flex-wrap">
                  {['1', '2', '3'].map((k) => (
                    <button
                      key={k}
                      onClick={() => sendLiteral(k, false)}
                      disabled={!selected}
                      className="px-3 py-1.5 bg-surface-2 hover:bg-surface-3 border border-neutral-700
                                 rounded text-xs font-mono disabled:opacity-40"
                      title={`Send "${k}" without Enter (menu confirm)`}
                    >
                      {k}
                    </button>
                  ))}
                  <button
                    onClick={() => sendNamed('Enter')}
                    disabled={!selected}
                    className="px-3 py-1.5 bg-surface-2 hover:bg-surface-3 border border-neutral-700
                               rounded text-xs font-mono disabled:opacity-40"
                    title="Press Enter"
                  >
                    ⏎ Enter
                  </button>
                  <button
                    onClick={() => sendNamed('Escape')}
                    disabled={!selected}
                    className="px-3 py-1.5 bg-surface-2 hover:bg-surface-3 border border-neutral-700
                               rounded text-xs font-mono disabled:opacity-40"
                    title="Press Esc"
                  >
                    Esc
                  </button>
                  <button
                    onClick={() => sendNamed('C-c')}
                    disabled={!selected}
                    className="px-3 py-1.5 bg-surface-2 hover:bg-surface-3 border border-neutral-700
                               rounded text-xs font-mono disabled:opacity-40"
                    title="Send Ctrl-C"
                  >
                    Ctrl-C
                  </button>
                </div>

                {/* Send prompt */}
                <div className="flex gap-2">
                  <input
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    placeholder={`Send to ${selected}...`}
                    className="flex-1 px-4 py-2.5 bg-surface-2 border border-neutral-700 rounded-lg
                               text-sm text-neutral-200 placeholder-neutral-500
                               focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                  />
                  <button
                    onClick={handleSend}
                    disabled={sending || !prompt.trim()}
                    className="px-5 py-2.5 bg-accent hover:bg-blue-600 disabled:opacity-40
                               rounded-lg text-sm font-medium transition-colors"
                  >
                    {sending ? '...' : 'Send'}
                  </button>
                  <button
                    onClick={handleReview}
                    disabled={reviewing}
                    className="px-4 py-2.5 bg-purple-800/60 hover:bg-purple-700/60 disabled:opacity-40
                               rounded-lg text-xs font-medium transition-colors border border-purple-700/40"
                  >
                    {reviewing ? '...' : 'Review'}
                  </button>
                </div>

                {/* Review result */}
                {reviewInfo && (
                  <p className="text-xs text-neutral-400">{reviewInfo}</p>
                )}
                {reviewResult && (
                  <div className="bg-purple-950/30 border border-purple-800/30 rounded-lg overflow-hidden">
                    <div className="px-4 py-2 border-b border-purple-800/30 flex items-center justify-between">
                      <span className="text-xs font-medium text-purple-300">Adversarial Review</span>
                      <button
                        onClick={() => { setReviewResult(null); setReviewInfo(null) }}
                        className="text-xs text-neutral-600 hover:text-neutral-400"
                      >
                        Dismiss
                      </button>
                    </div>
                    <pre className="p-4 text-xs font-mono text-neutral-300 overflow-x-auto max-h-[40vh] overflow-y-auto whitespace-pre-wrap">
                      {reviewResult}
                    </pre>
                  </div>
                )}
              </>
            ) : (
              <p className="text-neutral-500 text-sm">Select a session to view</p>
            )}
          </div>
        </div>
      </div>
    </Shell>
  )
}

function PlatformPill({ platform }: { platform: string }) {
  const styles = {
    claude: 'bg-orange-900/40 text-orange-300 border-orange-800/50',
    codex: 'bg-emerald-900/40 text-emerald-300 border-emerald-800/50',
    unknown: 'bg-neutral-800 text-neutral-500 border-neutral-700',
  }
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
      styles[platform as keyof typeof styles] || styles.unknown
    }`}>
      {platform === 'unknown' ? '?' : platform}
    </span>
  )
}

function InspectorRow({ label, pattern, detected }: { label: string; pattern: string; detected: string }) {
  return (
    <div className="bg-surface-0 border border-neutral-800 rounded p-2">
      <div className="text-neutral-400 font-medium mb-1">{label}</div>
      <div className="text-neutral-600 font-mono text-[10px] mb-1">{pattern}</div>
      <div className="text-neutral-300">{detected}</div>
    </div>
  )
}
