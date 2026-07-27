import { appendFileSync, mkdirSync } from 'fs'
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
