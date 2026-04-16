import { NextRequest, NextResponse } from 'next/server'
import { classifyTask, route } from '@/lib/router'
import { createTask, getTask, updateTask, listTasks } from '@/lib/taskStore'
import { dispatch } from '@/lib/executor'
import { executeReview } from '@/lib/review'
import { getEnvironmentProfile } from '@/lib/environments'
import { recordTelemetry } from '@/lib/telemetry'

/**
 * POST /api/orchestrate
 *
 * Three actions:
 *   "dispatch" — Single-shot: analyze → configure session → execute → auto-review if high-risk.
 *                No human gate. System handles routing, model/effort config, and verification.
 *   "analyze"  — Read-only: returns routing decision without executing. For inspection.
 *   "execute"  — Execute a previously analyzed task (with optional overrides).
 */
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action } = body

  // --- Single-shot autonomous dispatch ---
  if (action === 'dispatch') {
    const { description } = body
    if (!description?.trim()) {
      return NextResponse.json({ error: 'description required' }, { status: 400 })
    }

    // Analyze
    const signals = classifyTask(description)
    const decision = route(signals)
    const task = createTask(description, signals, decision)
    recordTelemetry({
      project: signals.project || 'command',
      source: 'command.api.orchestrate',
      eventType: 'orchestrate.dispatch_requested',
      level: 'info',
      taskId: task.id,
      sessionId: task.sessionId,
      details: { intent: signals.intent, risk: signals.risk },
    })

    // Execute (configures model/effort, verifies, then sends)
    const result = await dispatch(task)
    if (!result.ok) {
      return NextResponse.json({
        taskId: task.id, signals, decision,
        status: 'failed',
        environment: getEnvironmentProfile(task.environmentId),
        error: result.error,
        configLog: result.configLog,
      }, { status: 503 })
    }

    // Auto-trigger adversarial review for high-risk tasks
    if (signals.risk === 'high') {
      triggerAutoReview(task.id, decision)
    }

    return NextResponse.json({
      taskId: task.id, signals, decision,
      status: 'dispatched',
      environment: getEnvironmentProfile(task.environmentId),
      configLog: result.configLog,
    })
  }

  // --- Read-only analysis (for inspection, not execution) ---
  if (action === 'analyze') {
    const { description } = body
    if (!description?.trim()) {
      return NextResponse.json({ error: 'description required' }, { status: 400 })
    }
    const signals = classifyTask(description)
    const decision = route(signals)
    const task = createTask(description, signals, decision)
    recordTelemetry({
      project: signals.project || 'command',
      source: 'command.api.orchestrate',
      eventType: 'orchestrate.analyze_requested',
      level: 'info',
      taskId: task.id,
      sessionId: task.sessionId,
    })
    return NextResponse.json({
      taskId: task.id,
      signals,
      decision,
      environment: getEnvironmentProfile(task.environmentId),
    })
  }

  // --- Execute a previously analyzed task ---
  if (action === 'execute') {
    const { taskId, overrides } = body
    if (!taskId) {
      return NextResponse.json({ error: 'taskId required' }, { status: 400 })
    }
    const task = getTask(taskId)
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }
    if (task.status !== 'analyzed') {
      return NextResponse.json({ error: `Task already ${task.status}` }, { status: 409 })
    }

    if (overrides) {
      updateTask(taskId, { overrides }, {
        type: 'task.updated',
        message: 'Task overrides applied before execution',
      })
    }
    recordTelemetry({
      project: task.signals.project || 'command',
      source: 'command.api.orchestrate',
      eventType: 'orchestrate.execute_requested',
      level: 'info',
      taskId: task.id,
      sessionId: task.sessionId,
    })

    const result = await dispatch(task)
    if (!result.ok) {
      return NextResponse.json({ error: result.error, configLog: result.configLog }, { status: 503 })
    }
    return NextResponse.json({
      taskId,
      status: 'dispatched',
      environment: getEnvironmentProfile((overrides?.environmentId || task.environmentId) as string),
      configLog: result.configLog,
    })
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
}

export async function GET() {
  const tasks = listTasks()
  recordTelemetry({
    project: 'command',
    source: 'command.api.orchestrate',
    eventType: 'orchestrate.list_tasks',
    level: 'info',
    details: { count: tasks.length },
  })
  return NextResponse.json({ tasks })
}

/**
 * Fire-and-forget adversarial review for high-risk tasks.
 * Runs in the background after a 5s delay — doesn't block the dispatch response.
 */
function triggerAutoReview(taskId: string, decision: { platform: string; session: string }) {
  const reviewer = (decision.platform === 'claude' ? 'codex' : 'claude') as 'codex' | 'claude'
  const session = decision.session || 'general'

  setTimeout(() => {
    try {
      executeReview(session, reviewer, taskId)
    } catch {
      // Auto-review is best-effort — don't fail the task
    }
  }, 5000)
}
