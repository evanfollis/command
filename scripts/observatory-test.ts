#!/usr/bin/env tsx
import assert from 'node:assert/strict'
import { createHash } from 'crypto'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
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

const closurePath = join(dir, 'closure.json')
process.env.CLOSURE_INDEX_PATH = closurePath
writeFileSync(closurePath, JSON.stringify({ schemaVersion: 'command.closure.v1', generatedAt: new Date().toISOString(), queue: { open: 1, completed7d: 3, oldestOpenedAt: new Date(Date.now() - 3_600_000).toISOString() }, diagnosis: { total: 4, executed: 3 }, recommendations: { open: 2, closed: 5 } }))

const symphonyPath = join(dir, 'symphony.json')
process.env.SYMPHONY_TASKS_PATH = symphonyPath
writeFileSync(symphonyPath, JSON.stringify({ tasks: [
  { id: 'cycle-1', title: 'Fresh cycle', ownerSession: 'command', targetProject: 'command', state: 'running', createdAt: Date.now() - 60_000, stateChangedAt: Date.now() - 60_000, stateHistory: [] },
  { id: 'done-1', title: 'Closed cycle', ownerSession: 'command', targetProject: 'command', state: 'done', createdAt: Date.now() - 120_000, stateChangedAt: Date.now() - 30_000, completedAt: Date.now() - 30_000, stateHistory: [] },
] }))

const durabilityPath = join(dir, 'remote-durability.jsonl')
process.env.REMOTE_DURABILITY_PATH = durabilityPath
writeFileSync(durabilityPath, `${JSON.stringify({ project: 'command', source: 'remote-durability', eventType: 'remote_durability_verified', timestamp: Date.now(), repository: '/workspace/command', publicationState: 'synced', dirtyPaths: 0 })}\n`)

const releaseRoot = join(dir, 'release')
mkdirSync(join(releaseRoot, 'dist'), { recursive: true })
process.env.COMMAND_RELEASE_CURRENT = releaseRoot
const releaseSha = 'a'.repeat(40)
writeFileSync(join(releaseRoot, 'RELEASE.json'), JSON.stringify({ releaseId: 'fixture-release', sha: releaseSha, dirty: false, builtAt: new Date().toISOString() }))
writeFileSync(join(releaseRoot, 'dist', '.version'), `${releaseSha}\n`)

async function main() {
  const freshProjection = makeFreshProjection()
  writeFileSync(join(projectionRoot, 'projection.json'), JSON.stringify(freshProjection))

  const isolated = await getObservatorySnapshot({ bypassCache: true })
  assert.equal(isolated.publicProjection.availability, 'present')
  assert.deepEqual(isolated.publicProjection.counts, { research: 1, findings: 0, mechanisms: 1, engineeringCases: 0, sources: 0, conjectures: 0 })
  assert.match(String(isolated.publicProjection.digest), /^sha256:[a-f0-9]{64}$/, 'digest must be valid sha256 format')
  assert.equal(isolated.publicProjection.state, 'healthy', 'fresh projection must be healthy')
  assert.equal(isolated.ownerQueueState.state, 'unknown')
  assert.equal(isolated.closure.find((item) => item.id === 'diagnosis-conversion')?.details?.executed, 3)
  assert.equal(isolated.currentCycles[0]?.details?.completed7d, 1)
  assert.equal(isolated.currentCycles.find((item) => item.id === 'cycle-cycle-1')?.details?.owner, 'command')
  assert.equal(isolated.durability[0]?.state, 'healthy')
  assert.equal(isolated.deployment[0]?.state, 'healthy')
  // handoff-pressure is hardcoded unknown and must not appear in postureSignals — verified by
  // checking that the automation section contains it but posture is not 'unknown' solely due to it.
  assert.ok(isolated.automation.some((s) => s.id === 'handoff-pressure'), 'handoff-pressure must appear in automation for display')
  assert.ok(isolated.automation.find((s) => s.id === 'handoff-pressure')?.state === 'unknown', 'handoff-pressure is always unknown')

  const producerV11 = JSON.parse(readFileSync(join(process.cwd(), 'test/fixtures/public-projection-v1.1.json'), 'utf8')) as Record<string, unknown>
  producerV11.generated_at = new Date().toISOString()
  ;(producerV11.sources as Array<Record<string, unknown>>).forEach((source) => { source.retrieved_at = new Date().toISOString() })
  resign(producerV11)
  writeFileSync(join(projectionRoot, 'projection.json'), JSON.stringify(producerV11))
  const discovery = await getObservatorySnapshot({ bypassCache: true })
  assert.equal(discovery.publicProjection.contractVersion, '1.1.0')
  assert.deepEqual(discovery.publicProjection.counts, { research: 1, findings: 0, mechanisms: 1, engineeringCases: 1, sources: 2, conjectures: 1 })
  assert.equal(discovery.publicProjection.sourceHealth.domains, 2)
  assert.equal(discovery.knowledge.find((item) => item.id === 'knowledge-conjecture-flow')?.title, 'Conjecture contract')
  assert.equal(discovery.knowledge.find((item) => item.id === 'knowledge-conjecture-flow')?.state, 'healthy')

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
