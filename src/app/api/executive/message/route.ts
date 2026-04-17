import { NextRequest, NextResponse } from 'next/server'

import { getExecutiveStatus } from '@/lib/executive'
import { getExecutiveConversation, runExecutiveTurn } from '@/lib/executiveConversation'
import { recordTelemetry } from '@/lib/telemetry'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const { message } = await req.json()

  if (typeof message !== 'string' || !message.trim()) {
    return NextResponse.json({ error: 'message required' }, { status: 400 })
  }

  try {
    const response = runExecutiveTurn(message.trim())
    const status = getExecutiveStatus()
    const messages = getExecutiveConversation()

    recordTelemetry({
      project: 'command',
      source: 'command.api.executive',
      eventType: 'executive.respond_succeeded',
      level: 'info',
      sourceType: 'user',
      details: {
        executiveCodexPresent: status.executiveCodexSession.present,
        operatorAvailable: status.capabilities.operator_available,
        inputLength: message.length,
        outputLength: response.length,
      },
    })

    return NextResponse.json({
      ok: true,
      response,
      messages,
      ...status,
    })
  } catch (error) {
    const status = getExecutiveStatus()
    const errorMessage = error instanceof Error ? error.message : 'Unable to get executive response'

    recordTelemetry({
      project: 'command',
      source: 'command.api.executive',
      eventType: 'executive.respond_failed',
      level: 'error',
      sourceType: 'user',
      details: {
        executiveCodexPresent: status.executiveCodexSession.present,
        operatorAvailable: status.capabilities.operator_available,
        length: message.length,
        error: errorMessage,
      },
    })

    return NextResponse.json(
      {
        error: errorMessage,
        messages: getExecutiveConversation(),
        ...status,
      },
      { status: 503 }
    )
  }
}
