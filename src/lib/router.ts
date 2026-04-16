/**
 * Orchestration Router
 *
 * Decides which platform, model, and reasoning level to use for a given task.
 * This is the routing policy — the single place that answers:
 *   "Given this task, what should handle it and how?"
 *
 * The router is pure logic — no side effects. It takes a task description
 * and returns a routing decision. The caller is responsible for acting on it.
 */

const EXECUTIVE_CODEX_SESSION = 'executive-codex'

export interface RoutingDecision {
  platform: 'claude' | 'codex'
  model: string
  reasoning: 'low' | 'medium' | 'high'
  session: string           // which tmux session to route to
  environmentId: string
  rationale: string         // why this routing was chosen
  rules: MatchedRule[]      // which rules fired (for inspection)
}

export interface MatchedRule {
  name: string
  matched: boolean
  weight: number
  effect: string
}

export interface TaskSignals {
  description: string       // what the user asked for
  project?: string          // which project context (mentor, skillfoundry, etc.)
  scope?: 'single-file' | 'multi-file' | 'cross-project' | 'unknown'
  intent?: 'implement' | 'review' | 'debug' | 'refactor' | 'plan' | 'deploy' | 'test' | 'explore' | 'unknown'
  risk?: 'low' | 'medium' | 'high'  // auth, data mutation, concurrency, infra
}

// --- Routing rules ---
// Each rule inspects the task signals and contributes to the routing decision.
// Rules are evaluated in order. Later rules can override earlier ones.

interface Rule {
  name: string
  evaluate: (signals: TaskSignals) => {
    matched: boolean
    effect?: Partial<Pick<RoutingDecision, 'platform' | 'model' | 'reasoning'>>
    rationale?: string
  }
}

const RULES: Rule[] = [
  // --- Defaults ---
  {
    name: 'default-baseline',
    evaluate: () => ({
      matched: true,
      effect: { platform: 'claude', model: 'sonnet', reasoning: 'medium' },
      rationale: 'Baseline: Claude Sonnet at medium reasoning',
    }),
  },

  // --- Platform routing ---
  {
    name: 'codex-for-skillfoundry',
    evaluate: (s) => ({
      matched: s.project === 'skillfoundry',
      effect: { platform: 'codex' },
      rationale: 'Skillfoundry was built with Codex — maintain continuity',
    }),
  },
  {
    name: 'codex-for-batch-ops',
    evaluate: (s) => {
      const batchPatterns = /batch|migration|bulk|seed|backfill|mass update|rename across|find and replace/i
      return {
        matched: batchPatterns.test(s.description),
        effect: { platform: 'codex' },
        rationale: 'Batch/bulk operations favor Codex (autonomous sandbox, token-efficient)',
      }
    },
  },
  {
    name: 'codex-for-review',
    evaluate: (s) => ({
      matched: s.intent === 'review',
      effect: { platform: 'codex', reasoning: 'high' },
      rationale: 'Code review routes to Codex (catches logical errors, race conditions better)',
    }),
  },
  {
    name: 'codex-for-devops',
    evaluate: (s) => {
      const devopsPatterns = /shell script|bash|cron|systemd|nginx|deploy|docker|ci\/cd|pipeline|infra/i
      return {
        matched: devopsPatterns.test(s.description),
        effect: { platform: 'codex' },
        rationale: 'Terminal/DevOps tasks favor Codex (77% Terminal-Bench vs 65% Claude)',
      }
    },
  },

  // --- Model escalation ---
  {
    name: 'opus-for-architecture',
    evaluate: (s) => ({
      matched: s.intent === 'plan' || /architect|design|redesign|rethink|restructure/i.test(s.description),
      effect: { model: 'opus', reasoning: 'high' },
      rationale: 'Architectural decisions need deep reasoning — escalate to Opus',
    }),
  },
  {
    name: 'opus-for-complex-debug',
    evaluate: (s) => {
      const complexDebug = /race condition|deadlock|memory leak|intermittent|flaky|heisenbug|concurrent/i
      return {
        matched: s.intent === 'debug' && complexDebug.test(s.description),
        effect: { model: 'opus', reasoning: 'high' },
        rationale: 'Complex debugging (concurrency, intermittent failures) needs Opus',
      }
    },
  },
  {
    name: 'opus-for-high-risk',
    evaluate: (s) => ({
      matched: s.risk === 'high',
      effect: { model: 'opus', reasoning: 'high' },
      rationale: 'High-risk changes (auth, data loss, security) need maximum reasoning',
    }),
  },
  {
    name: 'opus-for-cross-project',
    evaluate: (s) => ({
      matched: s.scope === 'cross-project',
      effect: { model: 'opus' },
      rationale: 'Cross-project changes need broader reasoning context',
    }),
  },

  // --- Reasoning effort ---
  {
    name: 'low-effort-for-simple',
    evaluate: (s) => {
      const simple = /typo|rename|fix import|update version|bump|add comment|formatting/i
      return {
        matched: simple.test(s.description),
        effect: { reasoning: 'low' },
        rationale: 'Simple mechanical changes need minimal reasoning',
      }
    },
  },
  {
    name: 'high-effort-for-refactor',
    evaluate: (s) => ({
      matched: s.intent === 'refactor' && s.scope !== 'single-file',
      effect: { reasoning: 'high' },
      rationale: 'Multi-file refactors need careful cross-reference reasoning',
    }),
  },
]

// --- Session mapping ---
const PROJECT_SESSIONS: Record<string, string> = {
  mentor: 'mentor',
  skillfoundry: 'skillfoundry',
  recruiter: 'recruiter',
  'context-repository': 'context-repo',
  'context-repo': 'context-repo',
  command: 'command',
}

export function classifyTask(description: string): TaskSignals {
  const signals: TaskSignals = {
    description,
    scope: 'unknown',
    intent: 'unknown',
    risk: 'low',
  }

  // Detect project
  for (const proj of Object.keys(PROJECT_SESSIONS)) {
    if (description.toLowerCase().includes(proj)) {
      signals.project = proj
      break
    }
  }

  // Detect intent
  if (/review|audit|check|inspect/i.test(description)) signals.intent = 'review'
  else if (/fix|bug|debug|broken|error|crash|fail/i.test(description)) signals.intent = 'debug'
  else if (/refactor|restructure|reorganize|clean up/i.test(description)) signals.intent = 'refactor'
  else if (/plan|design|architect|spec|rfc/i.test(description)) signals.intent = 'plan'
  else if (/deploy|ship|release|push/i.test(description)) signals.intent = 'deploy'
  else if (/test|spec|coverage/i.test(description)) signals.intent = 'test'
  else if (/explore|understand|how does|what is|explain/i.test(description)) signals.intent = 'explore'
  else if (/implement|add|create|build|wire up|connect/i.test(description)) signals.intent = 'implement'

  // Detect scope
  if (/across (projects|repos)|cross-project|all projects/i.test(description)) signals.scope = 'cross-project'
  else if (/multiple files|multi-file|several files|across.*files/i.test(description)) signals.scope = 'multi-file'
  else if (/single file|one file|this file|in [\w.]+\.\w+/i.test(description)) signals.scope = 'single-file'

  // Detect risk
  if (/auth|password|token|secret|credential|permission|role|security/i.test(description)) signals.risk = 'high'
  else if (/delete|drop|truncate|destroy|wipe|reset|migration|schema/i.test(description)) signals.risk = 'high'
  else if (/payment|billing|money|charge|subscription/i.test(description)) signals.risk = 'high'
  else if (/database|sql|query|index|constraint/i.test(description)) signals.risk = 'medium'

  return signals
}

export function route(signals: TaskSignals): RoutingDecision {
  let decision: RoutingDecision = {
    platform: 'claude',
    model: 'sonnet',
    reasoning: 'medium',
    session: signals.project ? (PROJECT_SESSIONS[signals.project] || 'general') : 'general',
    environmentId: 'tmux-session',
    rationale: '',
    rules: [],
  }

  const rationales: string[] = []

  for (const rule of RULES) {
    const result = rule.evaluate(signals)
    decision.rules.push({
      name: rule.name,
      matched: result.matched,
      weight: result.matched ? 1 : 0,
      effect: result.matched ? (result.rationale || '') : '(not matched)',
    })

    if (result.matched && result.effect) {
      if (result.effect.platform) decision.platform = result.effect.platform
      if (result.effect.model) decision.model = result.effect.model
      if (result.effect.reasoning) decision.reasoning = result.effect.reasoning
      if (result.rationale) rationales.push(result.rationale)
    }
  }

  decision.rationale = rationales[rationales.length - 1] || 'Default routing'

  // If routing to codex, use the general session (codex runs ad-hoc, not in tmux)
  if (decision.platform === 'codex') {
    decision.session = EXECUTIVE_CODEX_SESSION
    decision.environmentId = 'tmux-session'
  } else {
    decision.environmentId = 'tmux-session'
  }

  return decision
}

export function routeFromDescription(description: string): RoutingDecision {
  const signals = classifyTask(description)
  return route(signals)
}

// All rules exposed for inspection
export function getRules(): { name: string; description: string }[] {
  return RULES.map((r) => {
    const testResult = r.evaluate({ description: '(inspection)' })
    return {
      name: r.name,
      description: r.name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    }
  })
}
