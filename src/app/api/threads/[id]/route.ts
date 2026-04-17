import { NextRequest, NextResponse } from 'next/server'

import { deleteThread, getThread, updateThread } from '@/lib/threads'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const thread = getThread(params.id)
  if (!thread) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ thread })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}))
  const patch: { title?: string } = {}
  if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title.trim()
  const thread = updateThread(params.id, patch)
  if (!thread) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ thread })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const ok = deleteThread(params.id)
  if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
