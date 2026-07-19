import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { WORKSPACE_PATHS } from './workspacePaths'

const WINDOWS = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
} as const

type WindowKey = keyof typeof WINDOWS
const MAX_TELEMETRY_BYTES = 768_000
const MAX_REPORT_BYTES = 2_000_000

interface RawEvent {
  timestamp?: number
  project?: string
  source?: string
  eventType?: string
  provider?: string
  model?: string
  status?: string
  latencyMs?: number
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  fallbackFrom?: string
}

export interface LlmUsageWindow {
  calls: number
  successes: number
  throttles: number
  errors: number
  fallbacks: number
  totalTokens: number
  inputTokens: number
  outputTokens: number
  avgLatencyMs: number
  byProvider: Record<string, number>
}

export interface EvalRunSummary {
  project: string
  promptId: string
  runId: string
  ts: string
  aggregate: number | null
  passed: boolean | null
  release: boolean
  model: string | null
  reportPath: string
}

export interface EvalSummary {
  generated_at: string
  llm_usage: Record<WindowKey, LlmUsageWindow>
  eval_runs: EvalRunSummary[]
}

function emptyWindow(): LlmUsageWindow {
  return {
    calls: 0,
    successes: 0,
    throttles: 0,
    errors: 0,
    fallbacks: 0,
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    avgLatencyMs: 0,
    byProvider: {},
  }
}

function readTail(path: string, maxBytes: number): string {
  const size = statSync(path).size
  const length = Math.min(size, maxBytes)
  const buffer = Buffer.alloc(length)
  const fd = openSync(path, 'r')
  try { readSync(fd, buffer, 0, length, size - length) } finally { closeSync(fd) }
  const text = buffer.toString('utf8')
  return size > length ? text.slice(text.indexOf('\n') + 1) : text
}

function readTelemetry(): RawEvent[] {
  const path = WORKSPACE_PATHS.telemetryLog
  if (!existsSync(path)) return []
  return readTail(path, MAX_TELEMETRY_BYTES)
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as RawEvent]
      } catch {
        return []
      }
    })
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function summarizeLlmUsage(now = Date.now()): Record<WindowKey, LlmUsageWindow> {
  const events = readTelemetry().filter((event) => event.eventType === 'llm_call')
  const out: Record<WindowKey, LlmUsageWindow> = {
    '1h': emptyWindow(),
    '24h': emptyWindow(),
    '7d': emptyWindow(),
  }
  const latencyTotals: Record<WindowKey, number> = { '1h': 0, '24h': 0, '7d': 0 }
  for (const event of events) {
    const ts = numberValue(event.timestamp)
    if (!ts) continue
    for (const key of Object.keys(WINDOWS) as WindowKey[]) {
      if (now - ts > WINDOWS[key]) continue
      const bucket = out[key]
      const status = event.status || 'unknown'
      const provider = event.provider || 'unknown'
      const inputTokens = numberValue(event.inputTokens)
      const outputTokens = numberValue(event.outputTokens)
      bucket.calls += 1
      bucket.successes += status === 'success' || status === 'passed' ? 1 : 0
      bucket.throttles += status === 'throttled' ? 1 : 0
      bucket.errors += !['success', 'passed', 'throttled'].includes(status) ? 1 : 0
      bucket.fallbacks += event.fallbackFrom ? 1 : 0
      bucket.inputTokens += inputTokens
      bucket.outputTokens += outputTokens
      bucket.totalTokens += numberValue(event.totalTokens) || inputTokens + outputTokens
      bucket.byProvider[provider] = (bucket.byProvider[provider] || 0) + 1
      latencyTotals[key] += numberValue(event.latencyMs)
    }
  }
  for (const key of Object.keys(WINDOWS) as WindowKey[]) {
    out[key].avgLatencyMs = out[key].calls ? Math.round(latencyTotals[key] / out[key].calls) : 0
  }
  return out
}

function projectFromRuntimeKey(name: string): string {
  return name.replace(/-[0-9a-f]{6}$/, '')
}

function readJson(path: string): Record<string, any> | null {
  try {
    if (statSync(path).size > MAX_REPORT_BYTES) return null
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return null
  }
}

export function listLatestEvalRuns(): EvalRunSummary[] {
  const root = join(WORKSPACE_PATHS.runtimeRoot, 'prompteval')
  if (!existsSync(root)) return []
  const rows: EvalRunSummary[] = []
  for (const projectKey of readdirSync(root).slice(0, 100)) {
    const projectPath = join(root, projectKey)
    try { if (!statSync(projectPath).isDirectory()) continue } catch { continue }
    for (const promptId of readdirSync(projectPath).slice(0, 100)) {
      const runsDir = join(projectPath, promptId, 'runs')
      if (!existsSync(runsDir)) continue
      const reports = readdirSync(runsDir)
        .filter((name) => name.endsWith('.json'))
        .map((name) => join(runsDir, name))
        .map((path) => ({ path, data: readJson(path) }))
        .filter((entry): entry is { path: string; data: Record<string, any> } => Boolean(entry.data))
        .sort((a, b) => String(b.data.ts || '').localeCompare(String(a.data.ts || '')))
      const latest = reports[0]
      if (!latest) continue
      rows.push({
        project: latest.data.project || projectFromRuntimeKey(projectKey),
        promptId,
        runId: latest.data.run_id || '',
        ts: latest.data.ts || '',
        aggregate: typeof latest.data.aggregate === 'number' ? latest.data.aggregate : null,
        passed: typeof latest.data.gate?.passed === 'boolean' ? latest.data.gate.passed : null,
        release: Boolean(latest.data.release),
        model: latest.data.model || null,
        reportPath: latest.path,
      })
    }
  }
  return rows.sort((a, b) => b.ts.localeCompare(a.ts))
}

export function getEvalSummary(now = Date.now()): EvalSummary {
  return {
    generated_at: new Date(now).toISOString(),
    llm_usage: summarizeLlmUsage(now),
    eval_runs: listLatestEvalRuns(),
  }
}
