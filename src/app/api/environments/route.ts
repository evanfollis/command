import { NextResponse } from 'next/server'

import { listTerminalEnvironments } from '@/lib/environments'

export async function GET() {
  return NextResponse.json({ environments: listTerminalEnvironments() })
}
