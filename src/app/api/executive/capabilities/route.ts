import { NextResponse } from 'next/server'

import { getExecutiveStatus } from '@/lib/executive'
import { recordTelemetry } from '@/lib/telemetry'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const status = getExecutiveStatus()

  recordTelemetry({
    project: 'command',
    source: 'command.api.executive',
    eventType: 'executive.capabilities_read',
    level: 'info',
    details: {
      effectiveRole: status.capabilities.effective_role,
      operatorAvailable: status.capabilities.operator_available,
      liveSessions: status.liveSessions.length,
    },
  })

  return NextResponse.json(status)
}
