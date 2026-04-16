import type { TaskSignals, RoutingDecision } from './router'
import { WORKSPACE_PATHS } from './workspacePaths'

export interface EnvironmentProfile {
  id: string
  label: string
  description: string
  trustClass: 'observed' | 'controlled' | 'session'
  capabilities: string[]
  workingDirectory: string
  terminalAllowed: boolean
  codexSandboxMode?: 'read-only' | 'workspace-write'
  credentialPolicy: 'scoped' | 'brokered'
}

export const ENVIRONMENTS: Record<string, EnvironmentProfile> = {
  'workspace-observer': {
    id: 'workspace-observer',
    label: 'Workspace Observer',
    description: 'Read-oriented shell scoped to the workspace root with a sanitized environment.',
    trustClass: 'observed',
    capabilities: ['inspect', 'search', 'read-logs'],
    workingDirectory: WORKSPACE_PATHS.workspaceRoot,
    terminalAllowed: true,
    codexSandboxMode: 'read-only',
    credentialPolicy: 'scoped',
  },
  'repo-workspace': {
    id: 'repo-workspace',
    label: 'Repo Workspace',
    description: 'Controlled code-editing environment with sanitized shell variables.',
    trustClass: 'controlled',
    capabilities: ['inspect', 'edit', 'test', 'review'],
    workingDirectory: WORKSPACE_PATHS.workspaceRoot,
    terminalAllowed: true,
    codexSandboxMode: 'workspace-write',
    credentialPolicy: 'scoped',
  },
  'review-sandbox': {
    id: 'review-sandbox',
    label: 'Review Sandbox',
    description: 'Read-only environment used for adversarial review and inspection tasks.',
    trustClass: 'observed',
    capabilities: ['inspect', 'review'],
    workingDirectory: WORKSPACE_PATHS.workspaceRoot,
    terminalAllowed: false,
    codexSandboxMode: 'read-only',
    credentialPolicy: 'brokered',
  },
  'tmux-session': {
    id: 'tmux-session',
    label: 'Tmux Session',
    description: 'Declared control-plane environment for an existing interactive session.',
    trustClass: 'session',
    capabilities: ['dispatch', 'observe', 'review'],
    workingDirectory: WORKSPACE_PATHS.workspaceRoot,
    terminalAllowed: false,
    credentialPolicy: 'brokered',
  },
}

const ENV_WHITELIST = ['HOME', 'LANG', 'LC_ALL', 'LOGNAME', 'PATH', 'TERM', 'TZ', 'USER']

export function listTerminalEnvironments(): EnvironmentProfile[] {
  return Object.values(ENVIRONMENTS).filter((env) => env.terminalAllowed)
}

export function getEnvironmentProfile(environmentId: string): EnvironmentProfile {
  return ENVIRONMENTS[environmentId] || ENVIRONMENTS['workspace-observer']
}

export function resolveEnvironment(signals: TaskSignals, decision: RoutingDecision): EnvironmentProfile {
  if (decision.platform === 'claude') {
    return ENVIRONMENTS['tmux-session']
  }

  if (signals.intent === 'review' || signals.intent === 'explore') {
    return ENVIRONMENTS['review-sandbox']
  }

  if (signals.intent === 'implement' || signals.intent === 'refactor' || signals.intent === 'debug' || signals.intent === 'test') {
    return ENVIRONMENTS['repo-workspace']
  }

  return ENVIRONMENTS['workspace-observer']
}

export function buildScopedShellEnv(baseEnv: NodeJS.ProcessEnv, environmentId: string): NodeJS.ProcessEnv {
  const scopedEnv = {} as NodeJS.ProcessEnv
  for (const key of ENV_WHITELIST) {
    const value = baseEnv[key]
    if (value) scopedEnv[key] = value
  }

  const profile = getEnvironmentProfile(environmentId)
  scopedEnv.TERM = scopedEnv.TERM || 'xterm-256color'
  scopedEnv.PWD = profile.workingDirectory
  scopedEnv.COMMAND_ENVIRONMENT_ID = profile.id
  scopedEnv.COMMAND_ENVIRONMENT_TRUST = profile.trustClass
  return scopedEnv
}
