import { NextRequest, NextResponse } from 'next/server'

import { readBoundedUtf8File } from '@/lib/boundedFile'
import { getContextUsage } from '@/lib/contextUsage'
import { observeSupervisedPids } from '@/lib/tmux'
import { WORKSPACE_PATHS } from '@/lib/workspacePaths'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const SESSIONS_CONF = WORKSPACE_PATHS.sessionsConfig
const MAX_SESSIONS_CONFIG_BYTES = 128_000

interface SessionRow {
  name: string
  cwd: string
  agent: string
}

function parseSessionsConf(): { status: 'observed' | 'unknown'; value: SessionRow[] } {
  try {
    const raw = readBoundedUtf8File(
      SESSIONS_CONF,
      MAX_SESSIONS_CONFIG_BYTES,
    ).text
    return {
      status: 'observed',
      value: raw
        .split('\n')
        .filter((line) => line.trim() && !line.startsWith('#'))
        .map((line) => {
          const [name, cwd, agent] = line.split('|')
          return {
            name: name.trim(),
            cwd: (cwd || '').trim(),
            agent: (agent || 'claude').trim(),
          }
        }),
    }
  } catch {
    return { status: 'unknown', value: [] }
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params
  const sessions = parseSessionsConf()
  if (sessions.status === 'unknown') {
    return NextResponse.json(
      { available: false, freshness: 'unknown', issue: 'sessions-config-unavailable' },
      { status: 503 },
    )
  }
  const session = sessions.value.find((s) => s.name === name)
  if (!session) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  // Pass the supervised tmux pane PID so getContextUsage can prefer the
  // managed session over any ad-hoc tick Claude sharing the same cwd.
  const supervisedPids = observeSupervisedPids()
  const supervisedPid = supervisedPids.value[name] ?? null
  const usage = await getContextUsage(session.name, session.cwd, session.agent, supervisedPid)
  return NextResponse.json({
    ...usage,
    tmuxStatus: supervisedPids.status,
    ...(supervisedPids.issue ? { issue: supervisedPids.issue } : {}),
  })
}
