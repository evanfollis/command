#!/usr/bin/env tsx
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
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
writeFileSync(join(projectionRoot, 'projection.json'), JSON.stringify({ schemaVersion: 'synaplex.public.v1', version: 'test', generatedAt: new Date().toISOString(), records: { claims: [{ id: 'claim-1', transcript: 'private' }] } }))
async function main() {
  const isolated = await getObservatorySnapshot({ bypassCache: true })
  assert.equal(isolated.publicProjection.availability, 'unknown')
  assert.ok(isolated.collectorErrors.some((error) => error.collector === 'publicProjection'))
  assert.ok(isolated.automation.length > 0, 'one failed collector must not erase other collector results')
  console.log('observatory contract, posture, bounded-tail, partial-failure, and redaction tests passed')
}

main().catch((error) => { console.error(error); process.exit(1) })
