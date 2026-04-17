import { execFileSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { NextResponse } from 'next/server'

import { listSessions } from '@/lib/tmux'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const SESSION_TO_PROJECT: Record<string, string> = {
  general: 'supervisor',
  mentor: 'mentor',
  skillfoundry: 'skillfoundry-harness',
  recruiter: 'recruiter',
  'context-repo': 'context-repository',
  command: 'command',
  atlas: 'atlas',
}

const CURRENT_STATE_FALLBACK: Record<string, string> = {
  general: '/opt/workspace/supervisor/system/status.md',
}

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
    return raw
      .split('\n')
      .filter((line) => line.trim() && !line.startsWith('#'))
      .map((line) => {
        const [name, cwd, agent, role] = line.split('|')
        return {
          name: name.trim(),
          cwd: (cwd || '').trim(),
          agent: (agent || 'claude').trim(),
          role: (role || 'project').trim(),
        }
      })
  } catch {
    return []
  }
}

function currentStatePath(session: SessionRow): string | null {
  const override = CURRENT_STATE_FALLBACK[session.name]
  if (override && existsSync(override)) return override
  const direct = `${session.cwd}/CURRENT_STATE.md`
  if (existsSync(direct)) return direct
  return null
}

function truncate(value: string | null, max: number): string | null {
  if (!value) return null
  const cleaned = value.replace(/\s+/g, ' ').trim()
  if (cleaned.length <= max) return cleaned
  return cleaned.slice(0, max - 1) + '…'
}

function readCurrentState(session: SessionRow): { path: string | null; content: string | null } {
  const path = currentStatePath(session)
  if (!path) return { path: null, content: null }
  try {
    return { path, content: readFileSync(path, 'utf-8') }
  } catch {
    return { path, content: null }
  }
}

function getLastCommit(cwd: string): { subject: string; relativeTime: string } | null {
  if (!cwd || !existsSync(`${cwd}/.git`)) return null
  try {
    const subject = execFileSync('git', ['-C', cwd, 'log', '-1', '--format=%s'], {
      encoding: 'utf-8',
      timeout: 2000,
    }).trim()
    const relativeTime = execFileSync('git', ['-C', cwd, 'log', '-1', '--format=%ar'], {
      encoding: 'utf-8',
      timeout: 2000,
    }).trim()
    return { subject: truncate(subject, 80) || '', relativeTime }
  } catch {
    return null
  }
}

export async function GET() {
  const declared = parseSessionsConf()
  const liveSessions = listSessions()
  const liveNames = new Set(liveSessions.map((s) => s.name))

  const rows = declared.map((row) => {
    const projectName = SESSION_TO_PROJECT[row.name] ?? row.name
    const { path, content } = readCurrentState(row)
    return {
      name: row.name,
      projectName,
      cwd: row.cwd,
      agent: row.agent,
      role: row.role,
      live: liveNames.has(row.name),
      currentState: {
        path,
        content,
      },
      lastCommit: getLastCommit(row.cwd),
    }
  })

  return NextResponse.json({ sessions: rows })
}
