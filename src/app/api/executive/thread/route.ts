import { NextResponse } from 'next/server'

import { getExecutiveThreadState } from '@/lib/executive'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  return NextResponse.json(getExecutiveThreadState())
}
