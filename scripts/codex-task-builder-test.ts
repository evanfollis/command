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
assert.match(rendered, /status prose, inventory labels, and prior completion statements as assertions to verify/)
assert.match(rendered, /Inspect the underlying per-item artifacts and their current acceptance fields before affirming aggregate completion/)
assert.match(rendered, /Treat explicitly named interface elements—API keys, schema fields, routes, status values, and persisted properties—as exact contracts/)
assert.match(rendered, /A differently named value with similar meaning does not satisfy the requested contract/)
assert.match(rendered, /do not substitute adjacent behavior such as server-side filtering for a requested response-field change/)
assert.match(rendered, /When inspection proves that the reported defect is unreachable and the current implementation already satisfies the requested invariant, conclude that no change is warranted/)
assert.match(rendered, /Do not invent hypothetical environments or propose a behavior-preserving refactor merely to keep a disproven ticket actionable/)
assert.match(rendered, /Keep source-invariant closure separate from incident-root-cause closure/)
assert.match(rendered, /state that no source edit is warranted, but do not claim the observed incident is explained/)
assert.match(rendered, /original stack trace with current line or source-map mapping, the triggering payload, the deployed runtime revision, or a reproduction trace/)
assert.match(rendered, /do not stop at a generic capability statement/)
assert.match(rendered, /reproduce the exact working directory and command/)
assert.match(rendered, /use available inspection and provide the exact proposed diff/)
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
assert.match(complex, /trace dependency and lock identity, runtime and service configuration, the actual readiness target, rollback selection and recovery verification, and the regression coverage/)
assert.match(complex, /Name the exact readiness endpoint and the configuration source that selects it/)
assert.match(complex, /switches from release A to release B and back to A while proving each selected release remains paired with its own dependency identity/)
assert.match(complex, /static source-text or grep assertions do not prove that runtime invariant and must not replace an existing behavioral regression/)
assert.match(complex, /Do not call a proposal exact, coherent, complete, implemented, or closed unless its coverage and verification support that claim/)
assert.match(complex, /bound the artifact, name every known omission or uncertainty, and state the next proof needed/)
assert.doesNotMatch(complex, /\{(?:task_id|project_path|intent|scope|risk|model_posture|target_project_line|description)\}/)

console.log('codex task real-builder verification, false-premise, and bounded-closure contract tests passed')
