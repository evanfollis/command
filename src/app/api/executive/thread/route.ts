import { NextResponse } from 'next/server'

import { getExecutiveThreadState } from '@/lib/executive'
import { getExecutiveConversation } from '@/lib/executiveConversation'
import { recordTelemetry } from '@/lib/telemetry'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const state = getExecutiveThreadState()
  const messages = getExecutiveConversation()

  recordTelemetry({
    project: 'command',
    source: 'command.api.executive',
    eventType: 'executive.thread_read',
    level: 'info',
    sourceType: 'system',
    details: {
      executiveCodexPresent: state.executiveCodexSession.present,
      liveSessions: state.liveSessions.length,
      operatorAvailable: state.capabilities.operator_available,
      messageCount: messages.length,
    },
  })

  return NextResponse.json({
    ...state,
    messages,
  })
}
