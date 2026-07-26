import { spawnSync } from 'child_process'

export interface AgentInfo {
  platform: 'claude' | 'codex' | 'unknown'
  model: string          // e.g. "Sonnet 4.6", "Opus 4.6"
  plan: string           // e.g. "Claude Pro"
  reasoning: string      // e.g. "medium", "high"
  activity: 'working' | 'idle' | 'plan-mode' | 'rate-limited' | 'unknown'
  activityDetail: string // e.g. "Waddling… (45s · ↓ 642 tokens)"
  context: string        // e.g. "~113k uncached"
}

export interface Session {
  name: string
  created: string
  attached: boolean
  width: number
  height: number
  agent: AgentInfo
}

export interface TmuxObservation<T> {
  status: 'observed' | 'unknown'
  value: T
  issue?: 'tmux-unavailable'
}

function runTmux(args: string[]) {
  return spawnSync('/usr/bin/tmux', args, {
    encoding: 'utf-8',
    timeout: 5000,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
}

export function parseAgentInfo(paneText: string): AgentInfo {
  const info: AgentInfo = {
    platform: 'unknown',
    model: '',
    plan: '',
    reasoning: '',
    activity: 'unknown',
    activityDetail: '',
    context: '',
  }

  // Detect platform
  if (paneText.includes('claude') || paneText.includes('Claude') || paneText.includes('Remote Control')) {
    info.platform = 'claude'
  } else if (paneText.includes('codex') || paneText.includes('Codex')) {
    info.platform = 'codex'
  }

  // Detect model: "Sonnet 4.6", "Opus 4.6", "Haiku 4.5"
  const modelMatch = paneText.match(/(Sonnet|Opus|Haiku)\s+[\d.]+/i)
  if (modelMatch) {
    info.model = modelMatch[0]
  }

  // Detect plan: "Claude Pro", "Claude Max", etc.
  const planMatch = paneText.match(/Claude\s+(Pro|Max|Team|Free)/i)
  if (planMatch) {
    info.plan = planMatch[0]
  }

  // Detect reasoning effort: "◐ medium", "● high", "○ low"
  const effortMatch = paneText.match(/[◐●○◑]\s*(low|medium|high)/i)
  if (effortMatch) {
    info.reasoning = effortMatch[1].toLowerCase()
  }
  // Also check for /effort pattern
  const effortAlt = paneText.match(/\/(effort)\s*/i)
  if (!info.reasoning && effortAlt) {
    // effort indicator is nearby
    const nearby = paneText.match(/(low|medium|high)\s*·?\s*\/effort/i)
    if (nearby) info.reasoning = nearby[1].toLowerCase()
  }

  // Detect activity state
  if (paneText.match(/⏸\s*plan mode/i)) {
    info.activity = 'plan-mode'
    info.activityDetail = 'Plan mode active'
  } else if (paneText.match(/rate.?limit/i) || paneText.match(/waiting for limit/i)) {
    info.activity = 'rate-limited'
    info.activityDetail = 'Rate limited'
  } else if (paneText.match(/(Waddling|Running|Thinking|Working|Reading|Editing|Searching|Building|Installing|Creating|Updating|Adding|Fixing|Writing|Exploring|Analyzing)/)) {
    info.activity = 'working'
    // Extract the activity line
    const actMatch = paneText.match(/[✽⎿◐●]\s*.+?(Waddling|Running|Thinking|Working|Reading|Editing|Searching|Building|Installing|Creating|Updating|Adding|Fixing|Writing|Exploring|Analyzing).+/i)
    if (actMatch) {
      info.activityDetail = actMatch[0].trim().replace(/^[✽⎿◐●]\s*/, '')
    } else {
      const simpleMatch = paneText.match(/(Waddling|Running|Thinking|Working).+/i)
      info.activityDetail = simpleMatch ? simpleMatch[0].trim() : 'Working...'
    }
  } else if (paneText.match(/\?\s*for shortcuts/)) {
    info.activity = 'idle'
    info.activityDetail = 'Waiting for input'
  }

  // Detect context window usage
  const contextMatch = paneText.match(/~?(\d+\.?\d*k)\s*(uncached|tokens)/i)
  if (contextMatch) {
    info.context = contextMatch[0]
  }
  const tokenMatch = paneText.match(/save\s+(\d+\.?\d*k)\s*tokens/i)
  if (!info.context && tokenMatch) {
    info.context = tokenMatch[1] + ' tokens'
  }

  return info
}

// Map tmux session name → pane PID. Since our supervised sessions spawn
// claude directly as the pane process (no intermediate shell), this is
// also the supervised claude PID for each tmux session.
export function observeSupervisedPids(): TmuxObservation<Record<string, number>> {
  const result = runTmux(['list-panes', '-a', '-F', '#{session_name}|#{pane_pid}'])
  if (result.status !== 0 || typeof result.stdout !== 'string') {
    return { status: 'unknown', value: {}, issue: 'tmux-unavailable' }
  }
  const out: Record<string, number> = {}
  const raw = result.stdout.trim()
  if (!raw) return { status: 'observed', value: out }
  for (const line of raw.split('\n')) {
    const [name, pid] = line.split('|')
    const n = parseInt(pid, 10)
    if (name && Number.isFinite(n)) out[name] = n
  }
  return { status: 'observed', value: out }
}

export function observeSessions(): TmuxObservation<Session[]> {
  const result = runTmux([
    'list-sessions',
    '-F',
    '#{session_name}|#{session_created}|#{session_attached}|#{session_width}|#{session_height}',
  ])
  if (result.status !== 0 || typeof result.stdout !== 'string') {
    return { status: 'unknown', value: [], issue: 'tmux-unavailable' }
  }
  const raw = result.stdout.trim()
  if (!raw) return { status: 'observed', value: [] }
  return {
    status: 'observed',
    value: raw.split('\n').map((line) => {
      const [name, created, attached, width, height] = line.split('|')
      const paneText = capturePane(name, 15)
      return {
        name,
        created: new Date(parseInt(created) * 1000).toISOString(),
        attached: attached === '1',
        width: parseInt(width),
        height: parseInt(height),
        agent: parseAgentInfo(paneText),
      }
    }),
  }
}

export function capturePane(sessionName: string, lines = 50): string {
  try {
    // spawnSync (no shell) avoids the shell's fork+exec chain and takes
    // an args array so we don't have to quote sessionName. Both of these
    // reduce the window for inherited fds to corrupt adjacent sockets
    // (observed under WebSocket polling at 200ms with long scrollback).
    const result = runTmux(['capture-pane', '-t', sessionName, '-p', '-S', `-${lines}`])
    if (result.status !== 0 || !result.stdout) return ''
    return result.stdout.trimEnd()
  } catch {
    return ''
  }
}
