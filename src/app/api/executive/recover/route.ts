import { NextResponse } from 'next/server'

import { recoverExecutiveSessionFabric } from '@/lib/executive'
import { recordTelemetry } from '@/lib/telemetry'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST() {
  const result = recoverExecutiveSessionFabric()

  recordTelemetry({
    project: 'command',
    source: 'command.api.executive',
    eventType: result.ok ? 'executive.recover_succeeded' : 'executive.recover_failed',
    level: result.ok ? 'info' : 'error',
    sourceType: 'user',
    details: {
      effectiveRole: result.capabilities.effective_role,
      operatorAvailable: result.capabilities.operator_available,
      liveSessions: result.liveSessions.length,
    },
  })

  return NextResponse.json(result, { status: result.ok ? 200 : 503 })
}
