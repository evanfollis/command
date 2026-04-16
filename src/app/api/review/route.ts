import { NextRequest, NextResponse } from 'next/server'
import { listSessions } from '@/lib/tmux'
import { executeReview } from '@/lib/review'
import { recordTelemetry } from '@/lib/telemetry'

/**
 * Adversarial review: sends a review prompt to a different agent than the one
 * that wrote the code. The reviewing agent challenges design decisions, assumptions,
 * and failure modes rather than looking for typos.
 *
 * POST /api/review
 * { session: "mentor", reviewer: "codex" | "claude", focus?: "caching design", taskId?: string }
 */
export async function POST(req: NextRequest) {
  const { session, reviewer, focus, taskId } = await req.json()

  if (!session) {
    return NextResponse.json({ error: 'session required' }, { status: 400 })
  }

  const sessions = listSessions()
  const target = sessions.find((s) => s.name === session)
  if (!target) {
    return NextResponse.json({ error: `Session "${session}" not found` }, { status: 404 })
  }

  const result = await executeReview(session, reviewer || 'codex', taskId, focus)
  recordTelemetry({
    project: session,
    source: 'command.api.review',
    eventType: 'review.requested',
    level: 'info',
    taskId,
    details: { reviewer: reviewer || 'codex', focus },
  })

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  if (result.review) {
    return NextResponse.json({ reviewer: result.reviewer, session, review: result.review })
  }

  return NextResponse.json({
    reviewer: result.reviewer,
    session,
    reviewSession: result.reviewSession,
    status: 'Review prompt sent. Check the review session for results.',
  })
}
