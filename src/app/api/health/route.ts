import { NextResponse } from 'next/server'
import { getHealth } from '@/lib/health'

export const dynamic = 'force-dynamic'

export async function GET() {
  const health = getHealth()
  return NextResponse.json(health)
}
