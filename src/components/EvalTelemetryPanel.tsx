import type { EvalSummary, LlmUsageWindow } from '@/lib/evalTelemetry'

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

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function formatLatency(ms: number): string {
  if (!ms) return '-'
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${ms}ms`
}

const USAGE_ROWS: Array<{ label: string; value: (usage: LlmUsageWindow) => string | number }> = [
  { label: 'calls', value: (usage) => usage.calls },
  { label: 'tokens', value: (usage) => formatTokens(usage.totalTokens) },
  { label: 'fallbacks', value: (usage) => usage.fallbacks },
  { label: 'throttles', value: (usage) => usage.throttles },
  { label: 'errors', value: (usage) => usage.errors },
  { label: 'avg latency', value: (usage) => formatLatency(usage.avgLatencyMs) },
]

const WINDOWS: Array<keyof EvalSummary['llm_usage']> = ['1h', '24h', '7d']

export function EvalTelemetryPanel({ summary }: { summary: EvalSummary | null }) {
  const latest = summary?.eval_runs.slice(0, 6) ?? []
  return (
    <div className="min-w-0 overflow-hidden rounded-[2rem] border border-white/10 bg-[rgba(9,14,22,0.78)] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.22)] sm:p-5">
      <div className="mb-4 flex items-center justify-between text-[11px] uppercase tracking-[0.26em] text-neutral-500">
        <span>Eval telemetry</span>
        <span className="text-[10px] normal-case tracking-normal text-neutral-600">
          {summary?.generated_at ? `as of ${relativeTime(Date.parse(summary.generated_at))}` : 'loading...'}
        </span>
      </div>
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div className="min-w-0 overflow-hidden rounded-xl border border-white/8 bg-black/30 px-3 py-3 sm:px-4">
          <table className="w-full table-fixed text-xs">
            <caption className="sr-only">Model usage and reliability by time window</caption>
            <thead>
              <tr className="text-neutral-500">
                <th className="py-1 text-left font-normal">metric</th>
                {WINDOWS.map((window) => <th key={window} className="py-1 text-right font-normal">{window}</th>)}
              </tr>
            </thead>
            <tbody className="font-mono text-neutral-200">
              {USAGE_ROWS.map((row) => (
                <tr key={row.label} className="border-t border-white/5">
                  <td className="py-1 text-neutral-400">{row.label}</td>
                  {WINDOWS.map((window) => (
                    <td key={window} className="py-1 text-right">
                      {summary ? row.value(summary.llm_usage[window]) : '-'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="min-w-0 overflow-hidden rounded-xl border border-white/8 bg-black/30 px-3 py-3 sm:px-4">
          <table className="w-full table-fixed text-xs">
            <caption className="sr-only">Latest prompt evaluation release runs</caption>
            <thead>
              <tr className="text-neutral-500">
                <th className="w-1/2 py-1 text-left font-normal">prompt</th>
                <th className="w-1/4 py-1 text-right font-normal">latest</th>
                <th className="w-1/4 py-1 text-right font-normal">score</th>
              </tr>
            </thead>
            <tbody className="font-mono text-neutral-200">
              {latest.length === 0 && (
                <tr className="border-t border-white/5">
                  <td colSpan={3} className="py-3 text-neutral-500">No eval runs recorded yet.</td>
                </tr>
              )}
              {latest.map((run) => (
                <tr key={`${run.project}-${run.promptId}-${run.runId}`} className="border-t border-white/5">
                  <td className="min-w-0 py-1 pr-3">
                    <div className="truncate text-neutral-200">{run.project}/{run.promptId}</div>
                    <div className="truncate text-[10px] text-neutral-600">{run.model || 'model unknown'}</div>
                  </td>
                  <td className={`py-1 text-right ${run.passed === false ? 'text-rose-300' : run.passed ? 'text-emerald-300' : 'text-neutral-500'}`}>
                    {run.passed === null ? 'unknown' : run.passed ? 'pass' : 'fail'}
                    <div className="text-[10px] text-neutral-600">{relativeTime(Date.parse(run.ts))}</div>
                  </td>
                  <td className="py-1 text-right">
                    {run.aggregate === null ? '-' : `${Math.round(run.aggregate * 100)}%`}
                    {run.release && <div className="text-[10px] text-sky-300">release</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
