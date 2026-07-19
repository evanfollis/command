#!/usr/bin/env tsx
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
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
writeFileSync(join(runs, 'old.json'), JSON.stringify({ project: 'command', prompt_id: 'review-prompt', run_id: 'old', ts: '2026-07-18T00:00:00Z', aggregate: 0.5, gate: { passed: false }, release: true, model: 'sonnet' }))
writeFileSync(join(runs, 'new.json'), JSON.stringify({ project: 'command', prompt_id: 'review-prompt', run_id: 'new', ts: '2026-07-19T00:00:00Z', aggregate: 1, gate: { passed: true }, release: true, model: 'sonnet' }))

async function main() {
  const { getEvalSummary } = await import('../src/lib/evalTelemetry')
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
  console.log('bounded eval telemetry and latest-run selection tests passed')
}

main().catch((error) => { console.error(error); process.exit(1) })
