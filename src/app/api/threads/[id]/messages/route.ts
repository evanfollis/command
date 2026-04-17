import { NextRequest, NextResponse } from 'next/server'

import { getThread } from '@/lib/threads'
import { getTranscript, runThreadTurn } from '@/lib/threadConversation'
import { recordTelemetry } from '@/lib/telemetry'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const thread = getThread(params.id)
  if (!thread) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ thread, messages: getTranscript(params.id) })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const thread = getThread(params.id)
  if (!thread) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 })

  try {
    const assistant = await runThreadTurn(params.id, message)
    recordTelemetry({
      project: 'command',
      source: 'command.api.threads',
      eventType: 'thread.turn_succeeded',
      level: 'info',
      sourceType: 'user',
      details: {
        threadId: params.id,
        model: thread.model,
        inputLength: message.length,
        outputLength: assistant.content.length,
      },
    })
    return NextResponse.json({
      ok: true,
      messages: getTranscript(params.id),
      assistant,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unable to run turn'
    recordTelemetry({
      project: 'command',
      source: 'command.api.threads',
      eventType: 'thread.turn_failed',
      level: 'error',
      sourceType: 'user',
      details: { threadId: params.id, model: thread.model, error: errorMessage },
    })
    const status = errorMessage.includes('in flight') ? 409 : 503
    return NextResponse.json(
      { error: errorMessage, messages: getTranscript(params.id) },
      { status }
    )
  }
}
