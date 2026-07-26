import { readFileSync } from 'fs'

import { WORKSPACE_PATHS } from './workspacePaths'

const SYMPHONY_STATES = ['ready', 'running', 'blocked', 'review', 'done', 'deferred'] as const
export type SymphonyState = typeof SYMPHONY_STATES[number]

export interface StateChange {
  from: SymphonyState | null
  to: SymphonyState
  by: string
  reason?: string
  timestamp: number
}

export interface SymphonyTask {
  id: string
  title: string
  description: string
  targetProject: string
  ownerSession: string
  state: SymphonyState
  blockedBy?: string
  dependsOn?: string[]
  worktreeIdentity?: string
  agentSessionId?: string
  threadId?: string
  reviewArtifacts?: string[]
  createdAt: number
  stateChangedAt: number
  runningAt?: number
  reviewAt?: number
  completedAt?: number
  stateHistory: StateChange[]
}

export interface SymphonyTaskView extends SymphonyTask {
  stale: boolean
}

export type SymphonyProjectionIssueCode = 'missing' | 'malformed-json' | 'invalid-schema'

export interface SymphonyProjectionIssue {
  code: SymphonyProjectionIssueCode
  message: string
  invalidTaskCount?: number
}

export interface SymphonyProjection {
  status: 'healthy' | 'unknown'
  tasks: SymphonyTaskView[]
  issue?: SymphonyProjectionIssue
}

const STALE_RUNNING_MS = 2 * 60 * 60 * 1000
const STALE_REVIEW_MS = 24 * 60 * 60 * 1000

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string'
}

function isOptionalNumber(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value))
}

function isSymphonyState(value: unknown): value is SymphonyState {
  return typeof value === 'string' && (SYMPHONY_STATES as readonly string[]).includes(value)
}

function isStateChange(value: unknown): value is StateChange {
  if (!value || typeof value !== 'object') return false
  const entry = value as Record<string, unknown>
  return (
    (entry.from === null || isSymphonyState(entry.from))
    && isSymphonyState(entry.to)
    && typeof entry.by === 'string'
    && isOptionalString(entry.reason)
    && typeof entry.timestamp === 'number'
    && Number.isFinite(entry.timestamp)
  )
}

function isSymphonyTask(value: unknown): value is SymphonyTask {
  if (!value || typeof value !== 'object') return false
  const task = value as Record<string, unknown>
  return (
    typeof task.id === 'string'
    && typeof task.title === 'string'
    && typeof task.description === 'string'
    && typeof task.targetProject === 'string'
    && typeof task.ownerSession === 'string'
    && isSymphonyState(task.state)
    && isOptionalString(task.blockedBy)
    && (task.dependsOn === undefined || isStringArray(task.dependsOn))
    && isOptionalString(task.worktreeIdentity)
    && isOptionalString(task.agentSessionId)
    && isOptionalString(task.threadId)
    && (task.reviewArtifacts === undefined || isStringArray(task.reviewArtifacts))
    && typeof task.createdAt === 'number'
    && Number.isFinite(task.createdAt)
    && typeof task.stateChangedAt === 'number'
    && Number.isFinite(task.stateChangedAt)
    && isOptionalNumber(task.runningAt)
    && isOptionalNumber(task.reviewAt)
    && isOptionalNumber(task.completedAt)
    && Array.isArray(task.stateHistory)
    && task.stateHistory.every(isStateChange)
  )
}

function loadProjection(): SymphonyProjection {
  let raw: string
  try {
    raw = readFileSync(WORKSPACE_PATHS.symphonyTasks, 'utf8')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return {
      status: 'unknown',
      tasks: [],
      issue: {
        code: code === 'ENOENT' ? 'missing' : 'invalid-schema',
        message: code === 'ENOENT'
          ? 'Symphony evidence is not available.'
          : 'Symphony evidence could not be read.',
      },
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {
      status: 'unknown',
      tasks: [],
      issue: {
        code: 'malformed-json',
        message: 'Symphony evidence is malformed and was not trusted.',
      },
    }
  }

  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as Record<string, unknown>).tasks)) {
    return {
      status: 'unknown',
      tasks: [],
      issue: {
        code: 'invalid-schema',
        message: 'Symphony evidence does not match the expected task schema.',
      },
    }
  }

  const rawTasks = (parsed as { tasks: unknown[] }).tasks
  const tasks = rawTasks.filter(isSymphonyTask).map(toView).sort((a, b) => b.createdAt - a.createdAt)
  const invalidTaskCount = rawTasks.length - tasks.length
  if (invalidTaskCount > 0) {
    return {
      status: 'unknown',
      tasks,
      issue: {
        code: 'invalid-schema',
        message: 'Some Symphony records were invalid and were omitted.',
        invalidTaskCount,
      },
    }
  }
  return { status: 'healthy', tasks }
}

function toView(task: SymphonyTask): SymphonyTaskView {
  const age = Date.now() - (task.state === 'running' ? task.runningAt ?? 0 : task.reviewAt ?? 0)
  const stale =
    (task.state === 'running' && Boolean(task.runningAt) && age > STALE_RUNNING_MS)
    || (task.state === 'review' && Boolean(task.reviewAt) && age > STALE_REVIEW_MS)
  return { ...task, stale }
}

export function readSymphonyProjection(): SymphonyProjection {
  return loadProjection()
}
