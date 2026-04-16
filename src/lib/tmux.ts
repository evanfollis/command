import { execSync } from 'child_process'

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

export function listSessions(): Session[] {
  try {
    const raw = execSync(
      'tmux list-sessions -F "#{session_name}|#{session_created}|#{session_attached}|#{session_width}|#{session_height}"',
      { encoding: 'utf-8', timeout: 5000 }
    ).trim()
    if (!raw) return []
    return raw.split('\n').map((line) => {
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
    })
  } catch {
    return []
  }
}

export function capturePane(sessionName: string, lines = 50): string {
  try {
    return execSync(
      `tmux capture-pane -t "${sessionName}" -p -S -${lines}`,
      { encoding: 'utf-8', timeout: 5000 }
    ).trimEnd()
  } catch {
    return ''
  }
}

export function sendKeys(sessionName: string, text: string, appendEnter = true): boolean {
  try {
    const enterArg = appendEnter ? ' Enter' : ''
    const textArg = text === '' ? '' : ' ' + JSON.stringify(text)
    execSync(`tmux send-keys -t "${sessionName}"${textArg}${enterArg}`, {
      timeout: 5000,
    })
    return true
  } catch {
    return false
  }
}

// Send tmux named keys (Enter, Escape, C-c, Tab, etc.) — passed unquoted so tmux interprets them.
// `keys` is an array of tmux key names; each is shell-escaped individually but not JSON-quoted.
const TMUX_KEY_PATTERN = /^([A-Z]-)*[A-Za-z0-9]+$/
export function sendNamedKeys(sessionName: string, keys: string[]): boolean {
  if (!keys.every((k) => TMUX_KEY_PATTERN.test(k))) return false
  try {
    execSync(`tmux send-keys -t "${sessionName}" ${keys.join(' ')}`, { timeout: 5000 })
    return true
  } catch {
    return false
  }
}
