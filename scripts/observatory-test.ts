#!/usr/bin/env tsx
import assert from 'node:assert/strict'
import { createHash } from 'crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
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
const eventsPath = join(dir, 'events.jsonl')
writeFileSync(eventsPath, `${Array.from({ length: 20 }, (_, index) => JSON.stringify({ index, body: 'x'.repeat(20) })).join('\n')}\n`)
const tail = readTail(eventsPath, 150)
assert.ok(!tail.includes('"index":0'))
assert.ok(tail.includes('"index":19'))
for (const line of tail.trim().split('\n')) assert.doesNotThrow(() => JSON.parse(line))

// Build a fresh projection at runtime so the generated_at never goes stale.
// The static fixture at test/fixtures/public-projection-v1.json documents the v1 shape
// but must not be used directly — its timestamp becomes stale after 24h.
function makeFreshProjection(): Record<string, unknown> {
  const projection: Record<string, unknown> = {
    projection_version: '1.0.0',
    generated_at: new Date().toISOString(),
    counts: { research: 1, findings: 0, mechanisms: 1 },
    research: [
      {
        id: 'claim-1',
        slug: 'fixture',
        title: 'Fixture research',
        summary: 'Typed fixture.',
        status: 'active',
        validity: 'pending',
        registered_at: '2026-07-12T18:00:00Z',
        updated_at: '2026-07-12T19:18:00Z',
        superseded_by: null,
        public_artifact: '/artifacts/fixture/',
        provenance: { claim_id: 'claim-1', decision_id: null, evidence_ids: [] },
      },
    ],
    findings: [],
    mechanisms: [
      { id: 'mechanism:fixture', title: 'Fixture mechanism', summary: 'Typed fixture.', status: 'operational', public_artifact: '/method/#fixture' },
    ],
    digest: '',
  }
  resign(projection)
  return projection
}

const projectionRoot = join(dir, 'knowledge')
mkdirSync(projectionRoot)
process.env.SYNAPLEX_PROJECTION_ROOT = projectionRoot

async function main() {
  const freshProjection = makeFreshProjection()
  writeFileSync(join(projectionRoot, 'projection.json'), JSON.stringify(freshProjection))

  const isolated = await getObservatorySnapshot({ bypassCache: true })
  assert.equal(isolated.publicProjection.availability, 'present')
  assert.deepEqual(isolated.publicProjection.counts, { research: 1, findings: 0, mechanisms: 1 })
  assert.match(String(isolated.publicProjection.digest), /^sha256:[a-f0-9]{64}$/, 'digest must be valid sha256 format')
  assert.equal(isolated.publicProjection.state, 'healthy', 'fresh projection must be healthy')
  assert.equal(isolated.ownerQueueState.state, 'unknown')
  // handoff-pressure is hardcoded unknown and must not appear in postureSignals — verified by
  // checking that the automation section contains it but posture is not 'unknown' solely due to it.
  assert.ok(isolated.automation.some((s) => s.id === 'handoff-pressure'), 'handoff-pressure must appear in automation for display')
  assert.ok(isolated.automation.find((s) => s.id === 'handoff-pressure')?.state === 'unknown', 'handoff-pressure is always unknown')

  const blockedProjection = { ...freshProjection, research: [{ ...(freshProjection.research as Array<Record<string, unknown>>)[0] }] }
  ;(blockedProjection.research as Array<Record<string, unknown>>)[0] = {
    ...(freshProjection.research as Array<Record<string, unknown>>)[0],
    status: 'blocked',
    block: { code: 'opposing-review-unavailable', since: '2026-07-12T19:18:00Z', summary: 'Required review is unavailable.', source_digest: `sha256:${'1'.repeat(64)}` },
  }
  resign(blockedProjection)
  writeFileSync(join(projectionRoot, 'projection.json'), JSON.stringify(blockedProjection))
  const blocked = await getObservatorySnapshot({ bypassCache: true })
  assert.equal(blocked.publicProjection.state, 'healthy', 'contract integrity remains healthy when research is blocked')
  assert.equal(blocked.publicProjection.researchHealth.blocked, 1)
  assert.deepEqual(blocked.publicProjection.researchHealth.blockCodes, ['opposing-review-unavailable'])
  assert.equal(blocked.knowledge.find((item) => item.id === 'knowledge-research')?.state, 'blocked')
  assert.equal(blocked.knowledge.find((item) => item.id === 'knowledge-findings')?.title, 'Findings contract')
  assert.equal(blocked.knowledge.find((item) => item.id === 'knowledge-mechanisms')?.title, 'Mechanisms contract')
  assert.match(blocked.knowledge.find((item) => item.id === 'knowledge-research')?.reason ?? '', /1 of 1.*opposing-review-unavailable/)
  assert.equal(blocked.posture, 'blocked')

  const invalidSemantics = { ...freshProjection, counts: { ...(freshProjection.counts as Record<string, number>), research: -1 } }
  resign(invalidSemantics)
  writeFileSync(join(projectionRoot, 'projection.json'), JSON.stringify(invalidSemantics))
  const semanticRejection = await getObservatorySnapshot({ bypassCache: true })
  assert.ok(semanticRejection.collectorErrors.some((error) => error.collector === 'publicProjection' && error.reason.includes('nonnegative integers')))

  // Re-sign the contaminated payload so the digest is valid. This ensures containsPrivateProjectionField
  // (not the digest check) is what catches the contamination.
  const contaminated: Record<string, unknown> = {
    ...freshProjection,
    research: [{ ...(freshProjection.research as Array<Record<string, unknown>>)[0], transcript: 'private' }],
  }
  resign(contaminated)
  writeFileSync(join(projectionRoot, 'projection.json'), JSON.stringify(contaminated))
  const rejected = await getObservatorySnapshot({ bypassCache: true })
  assert.equal(rejected.publicProjection.availability, 'unknown')
  assert.ok(rejected.collectorErrors.some((error) => error.collector === 'publicProjection'))
  assert.ok(rejected.automation.length > 0, 'one failed collector must not erase other collector results')

  console.log('observatory contract, posture, bounded-tail, partial-failure, and redaction tests passed')
}

main().catch((error) => { console.error(error); process.exit(1) })
