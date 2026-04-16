import { execFileSync } from 'child_process'

import { capturePane, listSessions, parseAgentInfo, sendKeys } from './tmux'
import { WORKSPACE_PATHS } from './workspacePaths'

export interface ExecutiveCapabilities {
  posture: string
  effective_role: string
  workspace_write: string
  supervisor_write: string
  runtime_write: string
  project_mutation: string
  host_tmux_control: string
  host_systemd_control: string
  network_egress: string
  operator_available: string
}

export interface ExecutiveStatus {
  capabilities: ExecutiveCapabilities
  liveSessions: string[]
  executiveCodexSession: {
    name: string
    present: boolean
  }
}

export interface ExecutiveRecoveryResult extends ExecutiveStatus {
  ok: boolean
  output: string
}

export interface ExecutiveEnsureResult extends ExecutiveStatus {
  ok: boolean
  output: string
}

export interface ExecutiveThreadState extends ExecutiveStatus {
  output: string
  agentActivity: string
}

const CAPABILITY_SCRIPT = `${WORKSPACE_PATHS.workspaceRoot}/supervisor/scripts/lib/capability-attestation.sh`
const WORKSPACE_SCRIPT = `${WORKSPACE_PATHS.workspaceRoot}/supervisor/workspace.sh`
const EXECUTIVE_CODEX_SESSION = 'executive-codex'

function sessionNames(): string[] {
  return listSessions().map((session) => session.name)
}

function runWorkspaceCommand(args: string[], timeout = 15000): string {
  return execFileSync('bash', args, {
    encoding: 'utf-8',
    timeout,
    cwd: WORKSPACE_PATHS.workspaceRoot,
    env: process.env,
  })
}

export function getExecutiveCapabilities(): ExecutiveCapabilities {
  const raw = runWorkspaceCommand([CAPABILITY_SCRIPT, '--json'], 8000)
  return JSON.parse(raw) as ExecutiveCapabilities
}

export function getExecutiveStatus(): ExecutiveStatus {
  const liveSessions = sessionNames()
  return {
    capabilities: getExecutiveCapabilities(),
    liveSessions,
    executiveCodexSession: {
      name: EXECUTIVE_CODEX_SESSION,
      present: liveSessions.includes(EXECUTIVE_CODEX_SESSION),
    },
  }
}

export function recoverExecutiveSessionFabric(): ExecutiveRecoveryResult {
  let output = ''

  try {
    output = runWorkspaceCommand([WORKSPACE_SCRIPT, 'recover'], 20000)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const stderr = typeof error === 'object' && error && 'stderr' in error
      ? String((error as { stderr?: string | Buffer }).stderr || '')
      : ''
    const stdout = typeof error === 'object' && error && 'stdout' in error
      ? String((error as { stdout?: string | Buffer }).stdout || '')
      : ''

    const status = getExecutiveStatus()
    return {
      ok: false,
      output: [stdout, stderr, message].filter(Boolean).join('\n').trim(),
      ...status,
    }
  }

  return {
    ok: true,
    output: output.trim(),
    ...getExecutiveStatus(),
  }
}

export function ensureExecutiveCodexSession(): ExecutiveEnsureResult {
  const existing = getExecutiveStatus()
  if (existing.executiveCodexSession.present) {
    return {
      ok: true,
      output: `tmux session "${EXECUTIVE_CODEX_SESSION}" already present`,
      ...existing,
    }
  }

  try {
    execFileSync('tmux', [
      'new-session',
      '-d',
      '-s',
      EXECUTIVE_CODEX_SESSION,
      '-c',
      WORKSPACE_PATHS.workspaceRoot,
      'codex -C /opt/workspace --dangerously-bypass-approvals-and-sandbox',
    ], {
      encoding: 'utf-8',
      timeout: 15000,
      env: process.env,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const stderr = typeof error === 'object' && error && 'stderr' in error
      ? String((error as { stderr?: string | Buffer }).stderr || '')
      : ''
    const stdout = typeof error === 'object' && error && 'stdout' in error
      ? String((error as { stdout?: string | Buffer }).stdout || '')
      : ''

    return {
      ok: false,
      output: [stdout, stderr, message].filter(Boolean).join('\n').trim(),
      ...getExecutiveStatus(),
    }
  }

  return {
    ok: true,
    output: `started tmux session "${EXECUTIVE_CODEX_SESSION}"`,
    ...getExecutiveStatus(),
  }
}

export function getExecutiveThreadState(lines = 120): ExecutiveThreadState {
  const status = getExecutiveStatus()
  const output = status.executiveCodexSession.present
    ? capturePane(EXECUTIVE_CODEX_SESSION, lines)
    : ''
  const agentInfo = output ? parseAgentInfo(output) : null

  return {
    ...status,
    output,
    agentActivity: agentInfo?.activityDetail || '',
  }
}

export function sendExecutiveMessage(message: string): ExecutiveEnsureResult {
  const ensured = ensureExecutiveCodexSession()
  if (!ensured.ok) return ensured

  const ok = sendKeys(EXECUTIVE_CODEX_SESSION, message)
  if (!ok) {
    return {
      ok: false,
      output: `Failed to send message to "${EXECUTIVE_CODEX_SESSION}"`,
      ...getExecutiveStatus(),
    }
  }

  return {
    ok: true,
    output: `Message sent to "${EXECUTIVE_CODEX_SESSION}"`,
    ...getExecutiveStatus(),
  }
}
