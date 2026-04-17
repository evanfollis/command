import { existsSync, readFileSync } from 'fs'
import { NextRequest, NextResponse } from 'next/server'

import { WORKSPACE_PATHS } from '@/lib/workspacePaths'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ALLOWED_WINDOWS = new Set(['today', '24h', '7d', 'all', 'LATEST'])

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
    const raw = readFileSync(path, 'utf-8')
    return NextResponse.json(JSON.parse(raw))
  } catch (e) {
    return NextResponse.json({ error: 'read failed', detail: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
