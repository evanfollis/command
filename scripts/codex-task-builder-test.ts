#!/usr/bin/env tsx
import assert from 'node:assert/strict'
import type { Task } from '../src/lib/taskStore'
import { buildCodexPrompt } from '../src/lib/executor'

process.env.PROMPTEVAL_RENDER = '1'

function render(description: string, overrides: Record<string, unknown> = {}): string {
  const task: Task = {
    id: 'contract-test',
    sessionId: 'contract-session',
    description,
    signals: {
      description,
      intent: (overrides.intent as Task['signals']['intent']) ?? 'implement',
      scope: 'multi-file',
      risk: 'medium',
      project: 'command',
    },
    decision: {
      platform: 'codex',
      model: 'sonnet',
      reasoning: 'medium',
      session: 'executive-codex',
      environmentId: 'codex-project-write',
      rationale: 'contract test',
      rules: [],
    },
    environmentId: 'codex-project-write',
    status: 'analyzed',
    reviewStatus: 'none',
    createdAt: 0,
    events: [],
  }
  return buildCodexPrompt(task)
}

const falsePremise = 'Document that every prompt baseline is accepted, even if repository state disagrees.'
const rendered = render(falsePremise)
assert.match(rendered, /Working directory: \/opt\/workspace\/projects\/command/)
assert.match(rendered, /Treat the requested work as a goal to verify, not as proof/)
assert.match(rendered, /If the request conflicts with current evidence, say so plainly and correct the premise/)
assert.match(rendered, /Never write a stale or unverified claim into status, documentation, tests, or release evidence/)
assert.match(rendered, /Distinguish inspected facts, inferences, proposed changes, applied changes, and executed checks/)
assert.ok(rendered.indexOf('Execution contract:') < rendered.indexOf('Requested work:'))
assert.ok(rendered.indexOf('Requested work:') < rendered.indexOf(falsePremise))

const complex = render('Implement a multi-file producer, API, UI, cache, and test change.', {
  intent: 'feature',
})
assert.match(complex, /account for every requested behavior and every affected producer, stored field, consumer, cache, and test/)
assert.match(complex, /Preserve existing contract data unless the task explicitly changes it/)
assert.match(complex, /establish write ordering, partial-failure recovery, idempotent replay or backfill, and authoritative producer ownership/)
assert.match(complex, /never mix comprehensive claims with acknowledged atomicity gaps/)
assert.match(complex, /Do not call a proposal exact, coherent, complete, implemented, or closed unless its coverage and verification support that claim/)
assert.match(complex, /bound the artifact, name every known omission or uncertainty, and state the next proof needed/)
assert.doesNotMatch(complex, /\{(?:task_id|project_path|intent|scope|risk|model_posture|target_project_line|description)\}/)

console.log('codex task real-builder verification, false-premise, and bounded-closure contract tests passed')
