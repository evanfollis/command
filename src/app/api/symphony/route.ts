import { NextResponse } from 'next/server'
import { createSymphonyTask, listSymphonyTasks } from '@/lib/symphonyStore'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const tasks = listSymphonyTasks()
  return NextResponse.json({ tasks })
}

export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const description = typeof body.description === 'string' ? body.description.trim() : ''
  const targetProject = typeof body.targetProject === 'string' ? body.targetProject.trim() : ''
  const ownerSession = typeof body.ownerSession === 'string' ? body.ownerSession.trim() : ''

  if (!title || !description || !targetProject || !ownerSession) {
    return NextResponse.json(
      { error: 'title, description, targetProject, and ownerSession are required' },
      { status: 400 }
    )
  }

  const task = createSymphonyTask({
    title,
    description,
    targetProject,
    ownerSession,
    blockedBy: typeof body.blockedBy === 'string' ? body.blockedBy : undefined,
    dependsOn: Array.isArray(body.dependsOn) ? body.dependsOn.filter((d) => typeof d === 'string') : undefined,
    worktreeIdentity: typeof body.worktreeIdentity === 'string' ? body.worktreeIdentity : undefined,
    agentSessionId: typeof body.agentSessionId === 'string' ? body.agentSessionId : undefined,
    threadId: typeof body.threadId === 'string' ? body.threadId : undefined,
  })

  return NextResponse.json({ task }, { status: 201 })
}
