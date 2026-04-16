import { NextRequest, NextResponse } from 'next/server'
import { capturePane } from '@/lib/tmux'
import { recordTelemetry } from '@/lib/telemetry'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params
  const output = capturePane(name, 80)
  recordTelemetry({
    project: name,
    source: 'command.api.sessions',
    eventType: 'session.captured',
    level: 'info',
    details: { lines: 80 },
  })
  return NextResponse.json({ name, output })
}
