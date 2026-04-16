import { getEnvironmentProfile, resolveEnvironment } from './environments'
import { recordTaskFailureObservation, recordTaskSuccessObservation } from './metaLearning'
import { sendKeys, capturePane, parseAgentInfo } from './tmux'
import { updateTask, type Task } from './taskStore'
import { WORKSPACE_PATHS } from './workspacePaths'
import { ensureExecutiveCodexSession } from './executive'
import type { RoutingDecision } from './router'

export interface DispatchResult {
  ok: boolean
  error?: string
  configLog?: string[]
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Dispatch a task to the resolved platform.
 * For Claude: configures the session (model + effort) with verification, then sends the task.
 * For Codex: ensures the canonical executive-codex lane exists, then sends the task into that live session.
 */
export async function dispatch(task: Task): Promise<DispatchResult> {
  const decision: RoutingDecision = {
    ...task.decision,
    ...task.overrides,
  }
  const environment = resolveEnvironment(task.signals, decision)
  updateTask(task.id, { environmentId: environment.id }, {
    type: 'task.updated',
    message: `Execution environment resolved: ${environment.label}`,
    details: {
      environmentId: environment.id,
      trustClass: environment.trustClass,
      capabilities: environment.capabilities,
    },
  })

  if (decision.platform === 'codex') {
    return dispatchCodex(task, environment.id)
  } else {
    return dispatchClaude(task, decision)
  }
}

// --- Claude dispatch with session configuration ---

async function dispatchClaude(task: Task, decision: RoutingDecision): Promise<DispatchResult> {
  const { session, model, reasoning } = decision
  const log: string[] = []

  // Step 1: Check that the session is idle before configuring
  const preCheck = capturePane(session, 15)
  const preInfo = parseAgentInfo(preCheck)
  if (preInfo.activity === 'working') {
    log.push(`Session "${session}" is busy (${preInfo.activityDetail}). Dispatching anyway — task will queue.`)
    // Still send — Claude queues prompts. But skip model/effort config to avoid interrupting.
    const ok = sendKeys(session, task.description)
    if (ok) {
      updateTask(task.id, { status: 'dispatched', dispatchedAt: Date.now(), output: log.join('\n') }, {
        type: 'task.dispatched',
        message: `Task dispatched to Claude session "${session}"`,
        details: { session, model, reasoning },
      })
      return { ok: true, configLog: log }
    }
    const failedTask = updateTask(task.id, { status: 'failed', output: `Failed to send to session "${session}"` }, {
      type: 'task.failed',
      message: `Failed to send task to Claude session "${session}"`,
      details: { session },
    })
    if (failedTask) recordTaskFailureObservation(failedTask, failedTask.output)
    return { ok: false, error: `Failed to send to "${session}"` }
  }

  // Step 2: Configure model if needed
  const currentModel = preInfo.model.toLowerCase()
  const targetModel = model.toLowerCase()
  if (!currentModel.includes(targetModel)) {
    log.push(`Configuring model: ${currentModel || '(unknown)'} → ${model}`)
    sendKeys(session, `/model ${model}`)
    await sleep(1200)

    // Verify
    const verified = await verifyConfig(session, (info) => info.model.toLowerCase().includes(targetModel))
    if (verified) {
      log.push(`Model verified: ${model}`)
    } else {
      log.push(`Model verification inconclusive — proceeding (model may update on next prompt)`)
    }
  } else {
    log.push(`Model already set: ${preInfo.model}`)
  }

  // Step 3: Configure reasoning effort if needed
  const currentEffort = preInfo.reasoning
  if (currentEffort !== reasoning) {
    log.push(`Configuring effort: ${currentEffort || '(unknown)'} → ${reasoning}`)
    sendKeys(session, `/effort ${reasoning}`)
    await sleep(800)

    const verified = await verifyConfig(session, (info) => info.reasoning === reasoning)
    if (verified) {
      log.push(`Effort verified: ${reasoning}`)
    } else {
      log.push(`Effort verification inconclusive — proceeding`)
    }
  } else {
    log.push(`Effort already set: ${currentEffort}`)
  }

  // Step 4: Dispatch the task
  log.push(`Dispatching to session "${session}"`)
  const ok = sendKeys(session, task.description)
  if (ok) {
    updateTask(task.id, { status: 'dispatched', dispatchedAt: Date.now(), output: log.join('\n') }, {
      type: 'task.dispatched',
      message: `Task dispatched to Claude session "${session}"`,
      details: { session, model, reasoning },
    })
    return { ok: true, configLog: log }
  }

  const failedTask = updateTask(task.id, { status: 'failed', output: log.join('\n') + '\nFailed to send keys.' }, {
    type: 'task.failed',
    message: `Failed to send task to Claude session "${session}"`,
    details: { session },
  })
  if (failedTask) recordTaskFailureObservation(failedTask, failedTask.output)
  return { ok: false, error: `Failed to send to "${session}"`, configLog: log }
}

/**
 * Poll pane output up to 3 times to verify a configuration change took effect.
 */
async function verifyConfig(
  session: string,
  check: (info: ReturnType<typeof parseAgentInfo>) => boolean,
  retries = 3,
  delayMs = 600
): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    const pane = capturePane(session, 15)
    const info = parseAgentInfo(pane)
    if (check(info)) return true
    if (i < retries - 1) await sleep(delayMs)
  }
  return false
}

// --- Codex dispatch ---

function dispatchCodex(task: Task, environmentId: string): DispatchResult {
  const decision: RoutingDecision = {
    ...task.decision,
    ...task.overrides,
  }
  const session = decision.session
  const ensured = ensureExecutiveCodexSession()
  if (!ensured.ok) {
    const failure = ensured.output || 'Failed to ensure executive Codex session'
    const failedTask = updateTask(task.id, { status: 'failed', output: failure }, {
      type: 'task.failed',
      message: 'Failed to ensure executive Codex lane',
      details: { session, environmentId },
    })
    if (failedTask) recordTaskFailureObservation(failedTask, failure)
    return { ok: false, error: failure }
  }

  const environment = getEnvironmentProfile(environmentId)
  const preCheck = capturePane(session, 20)
  const preInfo = parseAgentInfo(preCheck)
  const prompt = buildCodexPrompt(task)

  const notes: string[] = []
  if (preInfo.activity === 'working') {
    notes.push(`Session "${session}" is busy (${preInfo.activityDetail || 'working'}). Dispatching anyway — Codex will queue the prompt.`)
  } else {
    notes.push(`Session "${session}" is ready.`)
  }

  const ok = sendKeys(session, prompt)
  if (!ok) {
    const failure = `Failed to send task to "${session}"`
    const failedTask = updateTask(task.id, { status: 'failed', output: failure }, {
      type: 'task.failed',
      message: 'Failed to send task to Codex lane',
      details: { session, environmentId },
    })
    if (failedTask) recordTaskFailureObservation(failedTask, failure)
    return { ok: false, error: failure }
  }

  updateTask(task.id, {
    status: 'dispatched',
    dispatchedAt: Date.now(),
    environmentId,
    output: notes.join('\n'),
  }, {
    type: 'task.dispatched',
    message: `Task dispatched to Codex session "${session}"`,
    details: {
      session,
      environmentId,
      trustClass: environment.trustClass,
      capabilities: environment.capabilities,
    },
  })

  return { ok: true, configLog: notes }
}

// --- Helpers ---

const PROJECT_PATHS: Record<string, string> = {
  mentor: WORKSPACE_PATHS.mentorRoot,
  skillfoundry: WORKSPACE_PATHS.skillfoundryRoot,
  recruiter: WORKSPACE_PATHS.recruiterRoot,
  'context-repository': WORKSPACE_PATHS.contextRepoRoot,
  'context-repo': WORKSPACE_PATHS.contextRepoRoot,
  command: WORKSPACE_PATHS.commandRoot,
}

function resolveProjectPath(project?: string): string {
  if (project && PROJECT_PATHS[project]) return PROJECT_PATHS[project]
  return WORKSPACE_PATHS.generalRoot
}

function buildCodexPrompt(task: Task): string {
  const projectPath = resolveProjectPath(task.signals.project)
  const decision: RoutingDecision = {
    ...task.decision,
    ...task.overrides,
  }
  const lines = [
    `Task ID: ${task.id}`,
    `Working directory: ${projectPath}`,
    `Intent: ${task.signals.intent || 'unknown'}`,
    `Scope: ${task.signals.scope || 'unknown'}`,
    `Risk: ${task.signals.risk || 'low'}`,
    `Requested model posture: ${decision.model} / ${decision.reasoning}`,
  ]

  if (task.signals.project) {
    lines.push(`Target project: ${task.signals.project}`)
  }

  lines.push('', task.description)
  return lines.join('\n')
}
