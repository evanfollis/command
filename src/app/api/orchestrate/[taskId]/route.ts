import { NextRequest, NextResponse } from 'next/server'
import { getTask } from '@/lib/taskStore'
import { capturePane, parseAgentInfo } from '@/lib/tmux'
import { getEnvironmentProfile } from '@/lib/environments'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params
  const task = getTask(taskId)
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  const decision = { ...task.decision, ...task.overrides }

  // For session-backed tasks, fetch live pane output and agent state.
  if (task.status === 'dispatched' && decision.session) {
    const paneOutput = capturePane(decision.session, 80)
    const agentInfo = parseAgentInfo(paneOutput)
    return NextResponse.json({
      task: { ...task, output: paneOutput },
      environment: getEnvironmentProfile(task.environmentId),
      agentActivity: agentInfo.activity,
      agentDetail: agentInfo.activityDetail,
    })
  }

  return NextResponse.json({
    task,
    environment: getEnvironmentProfile(task.environmentId),
  })
}
