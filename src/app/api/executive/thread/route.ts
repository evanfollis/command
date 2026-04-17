import { NextResponse } from 'next/server'

import { getExecutiveThreadState } from '@/lib/executive'
import { getExecutiveConversation } from '@/lib/executiveConversation'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const state = getExecutiveThreadState()
  const messages = getExecutiveConversation()

  return NextResponse.json({
    ...state,
    messages,
  })
}
