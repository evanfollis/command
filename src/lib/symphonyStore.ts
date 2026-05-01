import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'

import { recordTelemetry } from './telemetry'
import { WORKSPACE_PATHS } from './workspacePaths'

// Symphony-lite task state machine.
//
// Owner model: ownerSession is a tmux session name (e.g. "general", "command").
// agentSessionId is the Claude/Codex native session id (from --session-id flag
// or ~/.codex/sessions/). threadId is the command thread UUID if this task
// runs via a command thread. These are separate identifiers for separate scopes.
//
// Bounded concurrency: max MAX_RUNNING_PER_PROJECT per project, MAX_RUNNING_GLOBAL globally.
// Transitions that would exceed these caps are rejected with an error.
//
// v1 scope: ready → running → review path is fully implemented.
// blocked → ready auto-resolution and depends-on graph are informational only.
// Automatic merge from review → done is out of scope.

export type SymphonyState = 'ready' | 'running' | 'blocked' | 'review' | 'done' | 'deferred'

const MAX_RUNNING_PER_PROJECT = 1
const MAX_RUNNING_GLOBAL = 3

// Stale thresholds (ms)
const STALE_RUNNING_MS = 2 * 60 * 60 * 1000   // 2h in running state
const STALE_REVIEW_MS = 24 * 60 * 60 * 1000    // 24h in review state

const STORE_PATH = WORKSPACE_PATHS.symphonyTasks

// Valid transitions (from → to). "any" means from any non-terminal state.
const VALID_TRANSITIONS: Record<SymphonyState, SymphonyState[]> = {
  ready:    ['running'],
  running:  ['review', 'done', 'blocked', 'deferred'],
  blocked:  ['ready', 'deferred'],
  review:   ['done', 'running', 'deferred'],
  done:     [],
  deferred: ['ready'],
}

export interface StateChange {
  from: SymphonyState | null
  to: SymphonyState
  by: string   // tmux session name or "system"
  reason?: string
  timestamp: number
}

export interface SymphonyTask {
  id: string
  title: string
  description: string
  targetProject: string    // project name: command, atlas, general, etc.
  ownerSession: string     // tmux session name
  state: SymphonyState
  blockedBy?: string       // task id (informational in v1; no auto-resolution)
  dependsOn?: string[]     // task ids (informational in v1)
  worktreeIdentity?: string   // git worktree path or name, if applicable
  agentSessionId?: string     // Claude/Codex native session id
  threadId?: string           // command thread UUID
  reviewArtifacts?: string[]  // paths to review artifacts
  createdAt: number
  stateChangedAt: number
  runningAt?: number      // when it entered running (for stale detection)
  reviewAt?: number       // when it entered review
  completedAt?: number    // when it entered done
  stateHistory: StateChange[]
}

interface SymphonyStoreState {
  tasks: SymphonyTask[]
}

export interface TransitionError {
  code: 'invalid_transition' | 'concurrency_cap' | 'not_found'
  message: string
}

function ensureDir() {
  mkdirSync(dirname(STORE_PATH), { recursive: true })
}

function loadState(): SymphonyStoreState {
  ensureDir()
  try {
    const raw = readFileSync(STORE_PATH, 'utf-8')
    const parsed = JSON.parse(raw) as SymphonyStoreState
    return { tasks: parsed.tasks || [] }
  } catch {
    return { tasks: [] }
  }
}

function saveState(state: SymphonyStoreState) {
  ensureDir()
  writeFileSync(STORE_PATH, JSON.stringify(state, null, 2))
}

function withState<T>(fn: (state: SymphonyStoreState) => T): T {
  const state = loadState()
  const result = fn(state)
  saveState(state)
  return result
}

function isStale(task: SymphonyTask): boolean {
  const now = Date.now()
  if (task.state === 'running' && task.runningAt) {
    return now - task.runningAt > STALE_RUNNING_MS
  }
  if (task.state === 'review' && task.reviewAt) {
    return now - task.reviewAt > STALE_REVIEW_MS
  }
  return false
}

export interface SymphonyTaskView extends SymphonyTask {
  stale: boolean
}

function toView(task: SymphonyTask): SymphonyTaskView {
  return { ...task, stale: isStale(task) }
}

function emitTelemetry(task: SymphonyTask, fromState: SymphonyState | null, toState: SymphonyState, by: string) {
  recordTelemetry({
    project: task.targetProject || 'command',
    source: 'command.symphony',
    eventType: 'symphony.transition',
    level: 'info',
    sourceType: 'system',
    taskId: task.id,
    details: {
      title: task.title,
      from: fromState,
      to: toState,
      by,
      ownerSession: task.ownerSession,
    },
  })
}

export function createSymphonyTask(params: {
  title: string
  description: string
  targetProject: string
  ownerSession: string
  blockedBy?: string
  dependsOn?: string[]
  worktreeIdentity?: string
  agentSessionId?: string
  threadId?: string
}): SymphonyTask {
  return withState((state) => {
    const now = Date.now()
    const task: SymphonyTask = {
      id: crypto.randomUUID(),
      title: params.title,
      description: params.description,
      targetProject: params.targetProject,
      ownerSession: params.ownerSession,
      state: 'ready',
      blockedBy: params.blockedBy,
      dependsOn: params.dependsOn,
      worktreeIdentity: params.worktreeIdentity,
      agentSessionId: params.agentSessionId,
      threadId: params.threadId,
      createdAt: now,
      stateChangedAt: now,
      stateHistory: [
        { from: null, to: 'ready', by: params.ownerSession, timestamp: now },
      ],
    }
    state.tasks.push(task)
    emitTelemetry(task, null, 'ready', params.ownerSession)
    return structuredClone(task)
  })
}

export function listSymphonyTasks(): SymphonyTaskView[] {
  const state = loadState()
  return state.tasks
    .map(toView)
    .sort((a, b) => b.createdAt - a.createdAt)
}

export function getSymphonyTask(id: string): SymphonyTaskView | undefined {
  const state = loadState()
  const task = state.tasks.find((t) => t.id === id)
  return task ? toView(task) : undefined
}

export function transitionSymphonyTask(params: {
  id: string
  to: SymphonyState
  by: string
  reason?: string
  reviewArtifacts?: string[]
  agentSessionId?: string
  threadId?: string
  worktreeIdentity?: string
}): { task: SymphonyTaskView } | { error: TransitionError } {
  return withState((state) => {
    const task = state.tasks.find((t) => t.id === params.id)
    if (!task) {
      return { error: { code: 'not_found', message: `Task ${params.id} not found` } }
    }

    const allowed = VALID_TRANSITIONS[task.state]
    if (!allowed.includes(params.to)) {
      return {
        error: {
          code: 'invalid_transition',
          message: `Cannot transition from '${task.state}' to '${params.to}'. Allowed: [${allowed.join(', ') || 'none'}]`,
        },
      }
    }

    // Enforce bounded concurrency at ready → running
    if (params.to === 'running') {
      const runningTasks = state.tasks.filter((t) => t.state === 'running')
      const runningForProject = runningTasks.filter((t) => t.targetProject === task.targetProject)

      if (runningForProject.length >= MAX_RUNNING_PER_PROJECT) {
        return {
          error: {
            code: 'concurrency_cap',
            message: `Project '${task.targetProject}' already has ${MAX_RUNNING_PER_PROJECT} running task(s). Resolve or defer it before starting another.`,
          },
        }
      }
      if (runningTasks.length >= MAX_RUNNING_GLOBAL) {
        return {
          error: {
            code: 'concurrency_cap',
            message: `Global running task cap (${MAX_RUNNING_GLOBAL}) reached. Resolve or defer a running task first.`,
          },
        }
      }
    }

    const from = task.state
    const now = Date.now()
    task.state = params.to
    task.stateChangedAt = now

    if (params.to === 'running') task.runningAt = now
    if (params.to === 'review') task.reviewAt = now
    if (params.to === 'done') task.completedAt = now
    if (params.reviewArtifacts) task.reviewArtifacts = params.reviewArtifacts
    if (params.agentSessionId) task.agentSessionId = params.agentSessionId
    if (params.threadId) task.threadId = params.threadId
    if (params.worktreeIdentity) task.worktreeIdentity = params.worktreeIdentity

    task.stateHistory.push({
      from,
      to: params.to,
      by: params.by,
      reason: params.reason,
      timestamp: now,
    })

    emitTelemetry(task, from, params.to, params.by)
    return { task: toView(structuredClone(task)) }
  })
}

export function staleSymphonyTasks(): SymphonyTaskView[] {
  return listSymphonyTasks().filter((t) => t.stale)
}
