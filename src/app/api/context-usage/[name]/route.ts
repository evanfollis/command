import { readFileSync } from 'fs'
import { NextRequest, NextResponse } from 'next/server'

import { getContextUsage } from '@/lib/contextUsage'
import { listSupervisedPids } from '@/lib/tmux'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const SESSIONS_CONF = '/opt/workspace/supervisor/scripts/lib/sessions.conf'

interface SessionRow {
  name: string
  cwd: string
  agent: string
}

function parseSessionsConf(): SessionRow[] {
  try {
    const raw = readFileSync(SESSIONS_CONF, 'utf-8')
    return raw
      .split('\n')
      .filter((line) => line.trim() && !line.startsWith('#'))
      .map((line) => {
        const [name, cwd, agent] = line.split('|')
        return {
          name: name.trim(),
          cwd: (cwd || '').trim(),
          agent: (agent || 'claude').trim(),
        }
      })
  } catch {
    return []
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params
  const sessions = parseSessionsConf()
  const session = sessions.find((s) => s.name === name)
  if (!session) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  // Pass the supervised tmux pane PID so getContextUsage can prefer the
  // managed session over any ad-hoc tick Claude sharing the same cwd.
  const supervisedPids = listSupervisedPids()
  const supervisedPid = supervisedPids[name] ?? null
  const usage = await getContextUsage(session.name, session.cwd, session.agent, supervisedPid)
  return NextResponse.json(usage)
}
