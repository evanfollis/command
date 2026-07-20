#!/usr/bin/env tsx
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, statSync, utimesSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const root = mkdtempSync(join(tmpdir(), 'command-eval-telemetry-'))
process.env.WORKSPACE_ROOT = root
process.env.PROJECTS_ROOT = join(root, 'projects')
process.env.RUNTIME_ROOT = join(root, 'runtime')

const telemetryDir = join(root, 'runtime', '.telemetry')
mkdirSync(telemetryDir, { recursive: true })
const now = Date.now()
writeFileSync(join(telemetryDir, 'events.jsonl'), [
  JSON.stringify({ eventType: 'llm_call', timestamp: now - 1_000, provider: 'claude', status: 'success', latencyMs: 400, totalTokens: 100 }),
  '{malformed',
  JSON.stringify({ eventType: 'llm_call', timestamp: now - 2_000, provider: 'codex', status: 'throttled', latencyMs: 600, fallbackFrom: 'claude', inputTokens: 20, outputTokens: 30 }),
].join('\n'))

const runs = join(root, 'runtime', 'prompteval', 'command-abc123', 'review-prompt', 'runs')
mkdirSync(runs, { recursive: true })
writeFileSync(join(runs, 'run-20260718T000000Z-old.json'), JSON.stringify({ project: 'command', prompt_id: 'review-prompt', run_id: 'old', ts: '2026-07-18T00:00:00Z', aggregate: 0.5, gate: { passed: false }, release: true, model: 'sonnet' }))
writeFileSync(join(runs, 'run-20260719T000000Z-new.json'), JSON.stringify({ project: 'command', prompt_id: 'review-prompt', run_id: 'new', ts: '2026-07-19T00:00:00Z', aggregate: 1, gate: { passed: true }, release: true, model: 'sonnet' }))

async function main() {
  const { getEvalSummary, listLatestEvalRuns, MAX_EVAL_REPORT_CANDIDATES_PER_PROMPT } = await import('../src/lib/evalTelemetry')
  const summary = getEvalSummary(now)
  assert.equal(summary.llm_usage['1h'].calls, 2)
  assert.equal(summary.llm_usage['1h'].successes, 1)
  assert.equal(summary.llm_usage['1h'].throttles, 1)
  assert.equal(summary.llm_usage['1h'].fallbacks, 1)
  assert.equal(summary.llm_usage['1h'].totalTokens, 150)
  assert.equal(summary.llm_usage['1h'].avgLatencyMs, 500)
  assert.equal(summary.eval_runs.length, 1)
  assert.equal(summary.eval_runs[0].runId, 'new')
  assert.equal(summary.eval_runs[0].passed, true)

  // A valid report immediately beyond the discovery cap must never be read as
  // a fallback, even when every selected recent candidate is malformed.
  const boundedRuns = join(root, 'runtime', 'prompteval', 'command-abc123', 'bounded-prompt', 'runs')
  mkdirSync(boundedRuns, { recursive: true })
  const oldValid = join(boundedRuns, 'run-20260101T000000Z-valid.json')
  writeFileSync(oldValid, JSON.stringify({ project: 'command', run_id: 'beyond-cap', ts: '2099-01-01T00:00:00Z', gate: { passed: true }, release: true }))
  utimesSync(oldValid, new Date('2099-01-01T00:00:00Z'), new Date('2099-01-01T00:00:00Z'))
  for (let index = 0; index < MAX_EVAL_REPORT_CANDIDATES_PER_PROMPT; index += 1) {
    writeFileSync(join(boundedRuns, `run-20260720T0000${String(index).padStart(2, '0')}Z-malformed.json`), '{malformed')
  }
  const bounded = getEvalSummary(now)
  assert.equal(bounded.eval_runs.some((run) => run.promptId === 'bounded-prompt'), false)
  let boundedReads = 0
  listLatestEvalRuns((path) => {
    if (path.startsWith(boundedRuns)) boundedReads += 1
    try {
      if (statSync(path).size > 2_000_000) return null
      return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
    } catch {
      return null
    }
  })
  assert.equal(boundedReads, MAX_EVAL_REPORT_CANDIDATES_PER_PROMPT, 'old history cannot increase per-prompt report reads beyond the cap')
  console.log('bounded eval telemetry and latest-run selection tests passed')
}

main().catch((error) => { console.error(error); process.exit(1) })
