import { readdirSync, readFileSync } from 'fs'
import { NextResponse } from 'next/server'

import { listSessions } from '@/lib/tmux'
import { WORKSPACE_PATHS } from '@/lib/workspacePaths'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Maps tmux session names (from sessions.conf) to reflection file prefixes (from projects.conf)
const SESSION_TO_PROJECT: Record<string, string> = {
  general: 'supervisor',
  mentor: 'mentor',
  skillfoundry: 'skillfoundry-harness',
  recruiter: 'recruiter',
  'context-repo': 'context-repository',
  command: 'command',
  atlas: 'atlas',
}

// Sessions declared in sessions.conf — drives the status strip order
const SESSIONS_CONF = '/opt/workspace/supervisor/scripts/lib/sessions.conf'

interface SessionRow {
  name: string
  cwd: string
  agent: string
  role: string
}

function parseSessionsConf(): SessionRow[] {
  try {
    const raw = readFileSync(SESSIONS_CONF, 'utf-8')
    return raw.split('\n')
      .filter((line) => line.trim() && !line.startsWith('#'))
      .map((line) => {
        const [name, cwd, agent, role] = line.split('|')
        return { name: name.trim(), cwd: (cwd || '').trim(), agent: (agent || 'claude').trim(), role: (role || 'project').trim() }
      })
  } catch {
    return []
  }
}

function getLastReflectionSummary(projectName: string): string {
  try {
    const files = readdirSync(WORKSPACE_PATHS.metaDir)
      .filter((f) => f.startsWith(`${projectName}-reflection-`) && f.endsWith('.md'))
      .sort()
      .reverse()

    if (files.length === 0) return 'no reflection yet'

    const content = readFileSync(`${WORKSPACE_PATHS.metaDir}/${files[0]}`, 'utf-8')

    // Find the first ## Observation heading and extract first non-empty paragraph
    const match = content.match(/##\s+Observation[^\n]*\n+([\s\S]*?)(?=\n##|\n---|\s*$)/)
    if (!match) return 'no observation found'

    const paragraph = match[1].trim().split('\n').find((l) => l.trim())
    if (!paragraph) return 'no observation found'

    const truncated = paragraph.trim().replace(/^[-*]\s*/, '')
    return truncated.length > 80 ? truncated.slice(0, 79) + '…' : truncated
  } catch {
    return 'no reflection yet'
  }
}

export async function GET() {
  const declared = parseSessionsConf()
  const liveSessions = listSessions()
  const liveNames = new Set(liveSessions.map((s) => s.name))

  const rows = declared.map((row) => {
    const projectName = SESSION_TO_PROJECT[row.name] ?? row.name
    return {
      name: row.name,
      cwd: row.cwd,
      agent: row.agent,
      role: row.role,
      live: liveNames.has(row.name),
      lastReflection: getLastReflectionSummary(projectName),
    }
  })

  return NextResponse.json({ sessions: rows })
}
