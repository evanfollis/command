import { NextResponse } from 'next/server'
import { listSessions, capturePane } from '@/lib/tmux'
import { recordTelemetry } from '@/lib/telemetry'

export const dynamic = 'force-dynamic'

export async function GET() {
  const sessions = listSessions()
  recordTelemetry({
    project: 'command',
    source: 'command.api.sessions',
    eventType: 'sessions.listed',
    level: 'info',
    sourceType: 'system',
    details: { count: sessions.length },
  })
  return NextResponse.json({ sessions })
}
