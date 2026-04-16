import { NextResponse } from 'next/server'

import { summarizeTelemetry } from '@/lib/telemetry'

export async function GET() {
  return NextResponse.json(summarizeTelemetry())
}
