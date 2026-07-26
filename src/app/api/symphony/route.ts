import { NextResponse } from 'next/server'
import { readSymphonyProjection } from '@/lib/symphonyProjection'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  return NextResponse.json(readSymphonyProjection())
}
