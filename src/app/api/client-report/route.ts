import { NextRequest, NextResponse } from 'next/server'
import { recordTelemetry } from '@/lib/telemetry'

/**
 * Minimal client-side observability endpoint. The login page beacons this on
 * load so we can see what the browser actually did after a redirect — the
 * information curl-from-localhost cannot give us. Closes the "I had to guess
 * at what iOS was doing" gap that led to a round-trip of bad theories.
 *
 * Accepts a small, fixed shape. No secrets, no user content — only navigation
 * metadata and a kind tag.
 */
export async function POST(req: NextRequest) {
  let body: { kind?: string; href?: string; referrer?: string; navType?: string; detail?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const kind = String(body.kind || 'unknown').slice(0, 64)
  const userAgent = req.headers.get('user-agent')?.slice(0, 200) || ''

  recordTelemetry({
    project: 'command',
    source: 'command.client.beacon',
    eventType: `client.${kind}`,
    level: 'info',
    sourceType: 'user',
    details: {
      href: String(body.href || '').slice(0, 500),
      referrer: String(body.referrer || '').slice(0, 500),
      navType: String(body.navType || '').slice(0, 32),
      detail: String(body.detail || '').slice(0, 500),
      userAgent,
    },
  })
  return NextResponse.json({ ok: true })
}
