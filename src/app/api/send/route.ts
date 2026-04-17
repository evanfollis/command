import { NextRequest, NextResponse } from 'next/server'
import { sendKeys, sendNamedKeys, listSessions } from '@/lib/tmux'
import { recordTelemetry } from '@/lib/telemetry'

export async function POST(req: NextRequest) {
  const { session, message, appendEnter = true, keys } = await req.json()

  if (!session) {
    return NextResponse.json({ error: 'session required' }, { status: 400 })
  }
  if (!Array.isArray(keys) && (message === undefined || message === null)) {
    return NextResponse.json({ error: 'message or keys required' }, { status: 400 })
  }

  const sessions = listSessions()
  const exists = sessions.some((s) => s.name === session)
  if (!exists) {
    return NextResponse.json({ error: `Session "${session}" not found` }, { status: 404 })
  }

  const ok = Array.isArray(keys)
    ? sendNamedKeys(session, keys)
    : sendKeys(session, message, appendEnter)
  recordTelemetry({
    project: session,
    source: 'command.api.send',
    eventType: ok ? 'session.message_sent' : 'session.message_failed',
    level: ok ? 'info' : 'error',
    sourceType: 'user',
    details: Array.isArray(keys) ? { keys } : { length: message.length },
  })
  return NextResponse.json({ ok, session })
}
