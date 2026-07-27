import { existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { readBoundedUtf8File, readBoundedUtf8Tail } from './boundedFile'
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
  return readBoundedUtf8Tail(path, maxBytes).text
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

function readJson(path: string): Record<string, any> | null {
  try {
    return JSON.parse(readBoundedUtf8File(path, MAX_REPORT_BYTES).text)
  } catch {
    return null
  }
}

export function listLatestEvalRuns(readReport: (path: string) => Record<string, any> | null = readJson): EvalRunSummary[] {
  // Only payload-free accepted baselines cross into the web process. Raw
  // runtime reports contain trial/check material (including release holdouts)
  // and remain wholly inaccessible to the service identity.
  const root = join(WORKSPACE_PATHS.commandRoot, '.prompteval')
  if (!existsSync(root)) return []
  const rows: EvalRunSummary[] = []
  for (const promptId of readdirSync(root).filter((name) => !name.startsWith('.')).slice(0, 100)) {
    const promptPath = join(root, promptId)
    try {
      if (!statSync(promptPath).isDirectory()) continue
      const path = join(promptPath, 'baseline.json')
      const data = readReport(path)
      if (!data) continue
      rows.push({
        project: 'command',
        promptId,
        runId: data.run_id || '',
        ts: data.ts || '',
        aggregate: typeof data.aggregate === 'number' ? data.aggregate : null,
        passed: typeof data.gate?.passed === 'boolean' ? data.gate.passed : null,
        release: Boolean(data.release),
        model: data.model || null,
        reportPath: path,
      })
    } catch {
      continue
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
