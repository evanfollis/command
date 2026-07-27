import { existsSync } from 'fs'
import { NextRequest, NextResponse } from 'next/server'

import { readBoundedUtf8File } from '@/lib/boundedFile'
import { WORKSPACE_PATHS } from '@/lib/workspacePaths'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ALLOWED_WINDOWS = new Set(['1h', 'today', '24h', '7d', '30d', 'all', 'LATEST'])
const MAX_METRICS_BYTES = 2_000_000

export async function GET(req: NextRequest) {
  const window = req.nextUrl.searchParams.get('window') || 'today'
  if (!ALLOWED_WINDOWS.has(window)) {
    return NextResponse.json({ error: 'invalid window' }, { status: 400 })
  }
  const path = `${WORKSPACE_PATHS.runtimeRoot}/.metrics/${window}.json`
  if (!existsSync(path)) {
    return NextResponse.json({ error: 'metrics not yet generated', path }, { status: 404 })
  }
  try {
    const raw = readBoundedUtf8File(path, MAX_METRICS_BYTES).text
    return NextResponse.json(JSON.parse(raw))
  } catch {
    return NextResponse.json({ error: 'metrics evidence unavailable' }, { status: 500 })
  }
}
