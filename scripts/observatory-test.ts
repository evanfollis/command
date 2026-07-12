#!/usr/bin/env tsx
import assert from 'node:assert/strict'
import { createHash } from 'crypto'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { containsPrivateProjectionField, derivePosture, getObservatorySnapshot, readTail, type ObservatorySignal } from '../src/lib/observatory'

const base: ObservatorySignal = { id: 'x', title: 'x', state: 'healthy', observedAt: new Date().toISOString(), expiresAt: new Date().toISOString(), sourceRef: 'test', reason: 'test' }
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}` : JSON.stringify(value)
const resign = (projection: Record<string, unknown>) => { const payload = { ...projection }; delete payload.digest; projection.digest = `sha256:${createHash('sha256').update(canonical(payload)).digest('hex')}` }
assert.equal(derivePosture([{ ...base, state: 'healthy' }, { ...base, state: 'unknown' }]).posture, 'unknown')
assert.equal(derivePosture([{ ...base, state: 'degraded' }, { ...base, state: 'blocked' }]).posture, 'blocked')
assert.equal(derivePosture([{ ...base, state: 'healthy' }]).posture, 'healthy')

assert.equal(containsPrivateProjectionField({ records: { claims: [] } }), false)
for (const key of ['transcript', 'password', 'token', 'rawTelemetry', 'localPath']) assert.equal(containsPrivateProjectionField({ records: [{ [key]: 'nope' }] }), true)

const dir = mkdtempSync(join(tmpdir(), 'command-observatory-'))
const path = join(dir, 'events.jsonl')
writeFileSync(path, `${Array.from({ length: 20 }, (_, index) => JSON.stringify({ index, body: 'x'.repeat(20) })).join('\n')}\n`)
const tail = readTail(path, 150)
assert.ok(!tail.includes('"index":0'))
assert.ok(tail.includes('"index":19'))
for (const line of tail.trim().split('\n')) assert.doesNotThrow(() => JSON.parse(line))

const projectionRoot = join(dir, 'knowledge')
mkdirSync(projectionRoot)
process.env.SYNAPLEX_PROJECTION_ROOT = projectionRoot
copyFileSync(join(process.cwd(), 'test/fixtures/public-projection-v1.json'), join(projectionRoot, 'projection.json'))
async function main() {
  const isolated = await getObservatorySnapshot({ bypassCache: true })
  assert.equal(isolated.publicProjection.availability, 'present')
  assert.deepEqual(isolated.publicProjection.counts, { research: 1, findings: 0, mechanisms: 1 })
  assert.equal(isolated.publicProjection.digest, 'sha256:a27957cf505852e341fd22c61ab5680c5060db52b8a96cba66b426d5ba7b7709')
  assert.equal(isolated.ownerQueueState.state, 'unknown')
  const blockedProjection = JSON.parse(readFileSync(join(projectionRoot, 'projection.json'), 'utf8'))
  blockedProjection.research[0].status = 'blocked'
  blockedProjection.research[0].block = { code: 'opposing-review-unavailable', since: '2026-07-12T19:18:00Z', summary: 'Required review is unavailable.', source_digest: `sha256:${'1'.repeat(64)}` }
  resign(blockedProjection)
  writeFileSync(join(projectionRoot, 'projection.json'), JSON.stringify(blockedProjection))
  const blocked = await getObservatorySnapshot({ bypassCache: true })
  assert.equal(blocked.publicProjection.state, 'healthy', 'contract integrity remains healthy')
  assert.equal(blocked.publicProjection.researchHealth.blocked, 1)
  assert.deepEqual(blocked.publicProjection.researchHealth.blockCodes, ['opposing-review-unavailable'])
  assert.equal(blocked.knowledge.find((item) => item.id === 'knowledge-research')?.state, 'blocked')
  assert.match(blocked.knowledge.find((item) => item.id === 'knowledge-research')?.reason ?? '', /1 of 1.*opposing-review-unavailable/)
  assert.equal(blocked.posture, 'blocked')
  copyFileSync(join(process.cwd(), 'test/fixtures/public-projection-v1.json'), join(projectionRoot, 'projection.json'))
  const invalidSemantics = JSON.parse(readFileSync(join(projectionRoot, 'projection.json'), 'utf8'))
  invalidSemantics.counts.research = -1
  resign(invalidSemantics)
  writeFileSync(join(projectionRoot, 'projection.json'), JSON.stringify(invalidSemantics))
  const semanticRejection = await getObservatorySnapshot({ bypassCache: true })
  assert.ok(semanticRejection.collectorErrors.some((error) => error.collector === 'publicProjection' && error.reason.includes('nonnegative integers')))
  copyFileSync(join(process.cwd(), 'test/fixtures/public-projection-v1.json'), join(projectionRoot, 'projection.json'))
  const contaminated = JSON.parse(readFileSync(join(projectionRoot, 'projection.json'), 'utf8'))
  contaminated.research[0].transcript = 'private'
  writeFileSync(join(projectionRoot, 'projection.json'), JSON.stringify(contaminated))
  const rejected = await getObservatorySnapshot({ bypassCache: true })
  assert.equal(rejected.publicProjection.availability, 'unknown')
  assert.ok(rejected.collectorErrors.some((error) => error.collector === 'publicProjection'))
  assert.ok(rejected.automation.length > 0, 'one failed collector must not erase other collector results')
  console.log('observatory contract, posture, bounded-tail, partial-failure, and redaction tests passed')
}

main().catch((error) => { console.error(error); process.exit(1) })
