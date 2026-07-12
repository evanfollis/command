import { NextResponse } from 'next/server'
import { getSymphonyTask, transitionSymphonyTask, type SymphonyState } from '@/lib/symphonyStore'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const VALID_STATES = new Set<SymphonyState>(['ready', 'running', 'blocked', 'review', 'done', 'deferred'])

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const task = getSymphonyTask(id)
  if (!task) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ task })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const to = body.to as string
  const by = typeof body.by === 'string' ? body.by.trim() : 'operator'

  if (!to || !VALID_STATES.has(to as SymphonyState)) {
    return NextResponse.json(
      { error: `'to' must be one of: ${[...VALID_STATES].join(', ')}` },
      { status: 400 }
    )
  }

  const result = transitionSymphonyTask({
    id,
    to: to as SymphonyState,
    by,
    reason: typeof body.reason === 'string' ? body.reason : undefined,
    reviewArtifacts: Array.isArray(body.reviewArtifacts)
      ? body.reviewArtifacts.filter((a) => typeof a === 'string')
      : undefined,
    agentSessionId: typeof body.agentSessionId === 'string' ? body.agentSessionId : undefined,
    threadId: typeof body.threadId === 'string' ? body.threadId : undefined,
    worktreeIdentity: typeof body.worktreeIdentity === 'string' ? body.worktreeIdentity : undefined,
  })

  if ('error' in result) {
    const status = result.error.code === 'not_found' ? 404 : 422
    return NextResponse.json({ error: result.error.message, code: result.error.code }, { status })
  }

  return NextResponse.json({ task: result.task })
}
