#!/usr/bin/env tsx
import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { containsPrivateProjectionField, derivePosture, getObservatorySnapshot, readTail, type ObservatorySignal } from '../src/lib/observatory'

const base: ObservatorySignal = { id: 'x', title: 'x', state: 'healthy', observedAt: new Date().toISOString(), expiresAt: new Date().toISOString(), sourceRef: 'test', reason: 'test' }
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
