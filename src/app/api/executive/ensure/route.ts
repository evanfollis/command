import { NextResponse } from 'next/server'

import { ensureExecutiveCodexSession } from '@/lib/executive'
import { recordTelemetry } from '@/lib/telemetry'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST() {
  const result = ensureExecutiveCodexSession()

  recordTelemetry({
    project: 'command',
    source: 'command.api.executive',
    eventType: result.ok ? 'executive.ensure_succeeded' : 'executive.ensure_failed',
    level: result.ok ? 'info' : 'error',
    details: {
      effectiveRole: result.capabilities.effective_role,
      operatorAvailable: result.capabilities.operator_available,
      executiveCodexPresent: result.executiveCodexSession.present,
      liveSessions: result.liveSessions.length,
    },
  })

  return NextResponse.json(result, { status: result.ok ? 200 : 503 })
}
