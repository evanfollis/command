import { NextResponse } from 'next/server'
import { getEvalSummary } from '@/lib/evalTelemetry'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  return NextResponse.json(getEvalSummary())
}
