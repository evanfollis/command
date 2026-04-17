import { NextRequest, NextResponse } from 'next/server'

import { createThread, listThreads } from '@/lib/threads'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  return NextResponse.json({ threads: listThreads() })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const title = typeof body.title === 'string' ? body.title : ''
  const model = body.model === 'claude' ? 'claude' : 'codex'
  const thread = createThread({ title, model })
  return NextResponse.json({ thread })
}
