import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'

import { recordTelemetry } from './telemetry'
import { TaskSignals, RoutingDecision } from './router'
import { WORKSPACE_PATHS } from './workspacePaths'

const TTL_MS = 7 * 24 * 60 * 60 * 1000
const STORE_PATH = WORKSPACE_PATHS.taskStore

export interface TaskEvent {
  id: string
  type:
    | 'task.created'
    | 'task.updated'
    | 'task.dispatched'
    | 'task.completed'
    | 'task.failed'
    | 'review.pending'
    | 'review.completed'
    | 'review.failed'
  message: string
  timestamp: number
  details?: Record<string, unknown>
}

export interface Task {
  id: string
  sessionId: string
  description: string
  signals: TaskSignals
  decision: RoutingDecision
  environmentId: string
  overrides?: Partial<Pick<RoutingDecision, 'platform' | 'model' | 'reasoning' | 'session' | 'environmentId'>>
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

interface TaskStoreState {
  tasks: Task[]
}

function ensureStoreDir() {
  mkdirSync(dirname(STORE_PATH), { recursive: true })
}

function loadState(): TaskStoreState {
  ensureStoreDir()
  try {
    const raw = readFileSync(STORE_PATH, 'utf-8')
    const parsed = JSON.parse(raw) as TaskStoreState
    return { tasks: parsed.tasks || [] }
  } catch {
    return { tasks: [] }
  }
}

function saveState(state: TaskStoreState) {
  ensureStoreDir()
  writeFileSync(STORE_PATH, JSON.stringify(state, null, 2))
}

function sweep(state: TaskStoreState) {
  const cutoff = Date.now() - TTL_MS
  state.tasks = state.tasks.filter((task) => task.createdAt >= cutoff)
}

function nextEvent(
  type: TaskEvent['type'],
  message: string,
  details?: Record<string, unknown>
): TaskEvent {
  return {
    id: crypto.randomUUID(),
    type,
    message,
    timestamp: Date.now(),
    details,
  }
}

function withState<T>(fn: (state: TaskStoreState) => T): T {
  const state = loadState()
  sweep(state)
  const result = fn(state)
  saveState(state)
  return result
}

export function createTask(
  description: string,
  signals: TaskSignals,
  decision: RoutingDecision
): Task {
  return withState((state) => {
    const task: Task = {
      id: crypto.randomUUID(),
      sessionId: crypto.randomUUID(),
      description,
      signals,
      decision,
      environmentId: decision.environmentId,
      status: 'analyzed',
      reviewStatus: 'none',
      createdAt: Date.now(),
      events: [
        nextEvent('task.created', 'Task analyzed and persisted', {
          platform: decision.platform,
          model: decision.model,
          environmentId: decision.environmentId,
        }),
      ],
    }
    state.tasks.push(task)
    recordTelemetry({
      project: task.signals.project || 'command',
      source: 'command.taskStore',
      eventType: 'task.created',
      level: 'info',
      taskId: task.id,
      sessionId: task.sessionId,
      details: {
        intent: task.signals.intent,
        scope: task.signals.scope,
        environmentId: task.environmentId,
      },
    })
    return structuredClone(task)
  })
}

export function getTask(id: string): Task | undefined {
  return withState((state) => {
    const task = state.tasks.find((entry) => entry.id === id)
    return task ? structuredClone(task) : undefined
  })
}

export function updateTask(id: string, updates: Partial<Task>, event?: Omit<TaskEvent, 'id' | 'timestamp'>): Task | undefined {
  return withState((state) => {
    const task = state.tasks.find((entry) => entry.id === id)
    if (!task) return undefined

    Object.assign(task, updates)
    if (event) {
      task.events.push(nextEvent(event.type, event.message, event.details))
    } else {
      task.events.push(nextEvent('task.updated', 'Task metadata updated'))
    }
    const latestEvent = task.events[task.events.length - 1]
    recordTelemetry({
      project: task.signals.project || 'command',
      source: 'command.taskStore',
      eventType: latestEvent.type,
      level: latestEvent.type.includes('failed') ? 'error' : latestEvent.type.includes('review') ? 'warn' : 'info',
      taskId: task.id,
      sessionId: task.sessionId,
      details: latestEvent.details,
    })

    return structuredClone(task)
  })
}

export function appendTaskEvent(
  id: string,
  type: TaskEvent['type'],
  message: string,
  details?: Record<string, unknown>
): Task | undefined {
  return withState((state) => {
    const task = state.tasks.find((entry) => entry.id === id)
    if (!task) return undefined
    task.events.push(nextEvent(type, message, details))
    return structuredClone(task)
  })
}

export function listTasks(): Task[] {
  return withState((state) =>
    structuredClone(state.tasks).sort((a, b) => b.createdAt - a.createdAt)
  )
}
