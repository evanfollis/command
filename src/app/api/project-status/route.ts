import { execFileSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { NextResponse } from 'next/server'

import { correlateSession } from '@/lib/claudeSessions'
import { observeSessions, observeSupervisedPids } from '@/lib/tmux'
import { WORKSPACE_PATHS } from '@/lib/workspacePaths'

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
  general: WORKSPACE_PATHS.supervisorStatus,
}

const SESSIONS_CONF = WORKSPACE_PATHS.sessionsConfig

interface SessionRow {
  name: string
  cwd: string
  agent: string
  role: string
}

function parseSessionsConf(): { status: 'observed' | 'unknown'; value: SessionRow[] } {
  try {
    const raw = readFileSync(SESSIONS_CONF, 'utf-8')
    return {
      status: 'observed',
      value: raw
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
        }),
    }
  } catch {
    return { status: 'unknown', value: [] }
  }
}

function currentStatePath(session: SessionRow): string | null {
  const override = CURRENT_STATE_FALLBACK[session.name]
  if (override && existsSync(override)) return override
  const direct = join(/*turbopackIgnore: true*/ session.cwd, 'CURRENT_STATE.md')
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
    return { path, content: readFileSync(/*turbopackIgnore: true*/ path, 'utf-8') }
  } catch {
    return { path, content: null }
  }
}

function getLastCommit(cwd: string): { subject: string; relativeTime: string } | null {
  if (!cwd) return null
  // `existsSync('.git')` is a necessary-but-insufficient repo check —
  // an empty .git directory (e.g. /opt/workspace/.git, created but never
  // initialised) passes the path test but makes `git log` print
  // "fatal: not a git repository (or any of the parent directories): .git"
  // to stderr. Require .git/HEAD, the canonical marker of a usable repo,
  // before invoking git — and `stdio: ['ignore', 'pipe', 'ignore']`
  // suppresses stderr for any unexpected failure (corrupt HEAD, dangling
  // ref, etc.) so the journal stays clean.
  if (!existsSync(join(/*turbopackIgnore: true*/ cwd, '.git', 'HEAD'))) return null
  try {
    const subject = execFileSync('/usr/bin/git', ['-C', cwd, 'log', '-1', '--format=%s'], {
      encoding: 'utf-8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    const relativeTime = execFileSync('/usr/bin/git', ['-C', cwd, 'log', '-1', '--format=%ar'], {
      encoding: 'utf-8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return { subject: truncate(subject, 80) || '', relativeTime }
  } catch {
    return null
  }
}

export async function GET() {
  const declared = parseSessionsConf()
  const liveSessions = observeSessions()
  const supervisedPids = observeSupervisedPids()
  const liveNames = new Set(liveSessions.value.map((s) => s.name))

  const rows = declared.value.map((row) => {
    const projectName = SESSION_TO_PROJECT[row.name] ?? row.name
    const { path, content } = readCurrentState(row)
    const correlated = correlateSession(
      row.name,
      row.cwd,
      row.role,
      supervisedPids.value[row.name] ?? null,
    )
    return {
      name: row.name,
      projectName,
      cwd: row.cwd,
      agent: row.agent,
      role: row.role,
      live: liveSessions.status === 'observed' ? liveNames.has(row.name) : null,
      currentState: {
        path,
        content,
      },
      lastCommit: getLastCommit(row.cwd),
      claude: {
        pid: correlated.pid,
        bridgeUrl: correlated.bridgeUrl,
        bridgeSessionId: correlated.bridgeSessionId,
        conflictingPids: correlated.conflictingPids,
      },
    }
  })

  const issues = [
    ...(declared.status === 'unknown' ? ['sessions-config-unavailable'] : []),
    ...(liveSessions.status === 'unknown' ? ['tmux-sessions-unavailable'] : []),
    ...(supervisedPids.status === 'unknown' ? ['tmux-pids-unavailable'] : []),
  ]
  return NextResponse.json({ status: issues.length ? 'unknown' : 'healthy', issues, sessions: rows })
}
