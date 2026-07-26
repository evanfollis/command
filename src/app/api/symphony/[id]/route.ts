import { NextResponse } from 'next/server'
import { readSymphonyProjection } from '@/lib/symphonyProjection'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const projection = readSymphonyProjection()
  const task = projection.tasks.find((entry) => entry.id === id)
  if (!task && projection.status === 'unknown') {
    return NextResponse.json(projection, { status: 503 })
  }
  if (!task) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ status: projection.status, task, issue: projection.issue })
}
