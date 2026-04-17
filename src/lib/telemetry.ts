import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs'
import { dirname } from 'path'
import { WORKSPACE_PATHS } from './workspacePaths'

export type SourceType = 'user' | 'system' | 'smoke' | 'cron'

export interface TelemetryEvent {
  id: string
  timestamp: number
  project: string
  source: string
  eventType: string
  level: 'info' | 'warn' | 'error'
  sourceType: SourceType
  sessionId?: string
  taskId?: string
  details?: Record<string, unknown>
}

const STORE_PATH = WORKSPACE_PATHS.telemetryLog

function ensureStoreDir() {
  mkdirSync(dirname(STORE_PATH), { recursive: true })
}

function toLine(event: TelemetryEvent): string {
  return JSON.stringify(event) + '\n'
}

export function recordTelemetry(input: Omit<TelemetryEvent, 'id' | 'timestamp'>): TelemetryEvent {
  ensureStoreDir()
  const event: TelemetryEvent = {
    ...input,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
  }
  appendFileSync(STORE_PATH, toLine(event), 'utf-8')
  return event
}

export function listTelemetry(limit = 200): TelemetryEvent[] {
  ensureStoreDir()
  if (!existsSync(STORE_PATH)) return []

  const lines = readFileSync(STORE_PATH, 'utf-8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const events = lines
    .map((line) => {
      try {
        return JSON.parse(line) as TelemetryEvent
      } catch {
        return null
      }
    })
    .filter((event): event is TelemetryEvent => Boolean(event))
    .sort((a, b) => b.timestamp - a.timestamp)

  return events.slice(0, limit)
}

export function summarizeTelemetry(limit = 500) {
  const events = listTelemetry(limit)
  const byProject = new Map<string, number>()
  const byType = new Map<string, number>()
  const byLevel = new Map<string, number>()

  for (const event of events) {
    byProject.set(event.project, (byProject.get(event.project) || 0) + 1)
    byType.set(event.eventType, (byType.get(event.eventType) || 0) + 1)
    byLevel.set(event.level, (byLevel.get(event.level) || 0) + 1)
  }

  return {
    total: events.length,
    byProject: Array.from(byProject.entries()).sort((a, b) => b[1] - a[1]),
    byType: Array.from(byType.entries()).sort((a, b) => b[1] - a[1]),
    byLevel: Array.from(byLevel.entries()).sort((a, b) => b[1] - a[1]),
    recent: events.slice(0, 100),
  }
}
