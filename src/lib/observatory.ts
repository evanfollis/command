import { createHash } from 'crypto'
import { execFile } from 'child_process'
import { existsSync, openSync, closeSync, readFileSync, readSync, readdirSync, statSync } from 'fs'
import { basename, dirname, join } from 'path'

import { WORKSPACE_PATHS } from './workspacePaths'

export type ObservatoryState = 'healthy' | 'degraded' | 'blocked' | 'unknown'

export interface ObservatorySignal {
  id: string
  title: string
  state: ObservatoryState
  observedAt: string
  expiresAt: string
  sourceRef: string
  reason: string
  details?: Record<string, string | number | boolean | null>
}

export interface PublicProjectionSummary extends ObservatorySignal {
  availability: 'present' | 'empty' | 'unknown'
  contractVersion: string | null
  projectionVersion: string | null
  digest: string | null
  generatedAt: string | null
  counts: { research: number; findings: number; mechanisms: number }
  provenance: { decisionRefs: number; evidenceRefs: number }
  researchHealth: { active: number; blocked: number; completed: number; invalidated: number; withdrawn: number; superseded: number; blockCodes: string[] }
}

export interface OwnerDecision extends ObservatorySignal {
  requestedBy: string
}

export interface ObservatorySnapshot {
  schemaVersion: 'command.observatory.v1'
  generatedAt: string
  expiresAt: string
  posture: ObservatoryState
  postureReason: string
  publicProjection: PublicProjectionSummary
  publicCoherence: ObservatorySignal
  ownerQueueState: ObservatorySignal
  ownerQueue: OwnerDecision[]
  knowledgeLoop: ObservatorySignal
  knowledge: ObservatorySignal[]
  automation: ObservatorySignal[]
  modelTelemetry: ObservatorySignal[]
  recentChanges: ObservatorySignal[]
  collectorErrors: Array<{ collector: string; reason: string }>
}

const SNAPSHOT_TTL_MS = 15_000
const SOURCE_TIMEOUT_MS = 1_200
const MAX_JSON_BYTES = 1_000_000
const MAX_TEXT_BYTES = 32_000
const MAX_TAIL_BYTES = 512_000
const PRIVATE_KEYS = /^(transcript|prompt|content|body|secret|password|token|cookie|authorization|localPath|rawTelemetry)$/i

let cached: { expires: number; snapshot: ObservatorySnapshot } | null = null

function iso(ms = Date.now()) { return new Date(ms).toISOString() }

function signal(input: Omit<ObservatorySignal, 'observedAt' | 'expiresAt'> & { observedAt?: string; ttlMs?: number }): ObservatorySignal {
  const now = input.observedAt ?? iso()
  return {
    id: input.id,
    title: input.title,
    state: input.state,
    observedAt: now,
    expiresAt: iso(Date.parse(now) + (input.ttlMs ?? 5 * 60_000)),
    sourceRef: input.sourceRef,
    reason: input.reason,
    details: input.details,
  }
}

export function derivePosture(signals: ObservatorySignal[]): { posture: ObservatoryState; reason: string } {
  const states = signals.map((item) => item.state)
  if (states.includes('blocked')) return { posture: 'blocked', reason: 'At least one bounded source reports a blocked transition.' }
  if (states.includes('degraded')) return { posture: 'degraded', reason: 'No blocked transition is visible, but at least one source is degraded or stale.' }
  if (states.includes('unknown')) return { posture: 'unknown', reason: 'Known signals are not degraded, but one or more required sources are unknown.' }
  return { posture: 'healthy', reason: 'All observed required signals are healthy and fresh.' }
}

export function containsPrivateProjectionField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsPrivateProjectionField)
  if (!value || typeof value !== 'object') return false
  return Object.entries(value as Record<string, unknown>).some(([key, nested]) => PRIVATE_KEYS.test(key) || containsPrivateProjectionField(nested))
}

export function readTail(path: string, maxBytes = MAX_TAIL_BYTES): string {
  const size = statSync(path).size
  const length = Math.min(size, maxBytes)
  const buffer = Buffer.alloc(length)
  const fd = openSync(path, 'r')
  try { readSync(fd, buffer, 0, length, size - length) } finally { closeSync(fd) }
  const text = buffer.toString('utf8')
  return size > length ? text.slice(text.indexOf('\n') + 1) : text
}

function readBounded(path: string, maxBytes = MAX_TEXT_BYTES): string {
  if (statSync(path).size > maxBytes) throw new Error(`source exceeds ${maxBytes} byte hot-path limit`)
  return readFileSync(path, 'utf8')
}

async function timed<T>(label: string, task: () => Promise<T> | T, timeoutMs = SOURCE_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    Promise.resolve().then(task),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)),
  ])
}

function execFileAsync(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: SOURCE_TIMEOUT_MS, maxBuffer: 128_000 }, (error, stdout) => {
      if (error) reject(error)
      else resolve(stdout)
    })
  })
}

function publicProjectionPath(): string | null {
  const root = process.env.SYNAPLEX_PROJECTION_ROOT || join(WORKSPACE_PATHS.projectsRoot, 'synaplex', 'knowledge')
  for (const name of ['projection.json', 'public-projection.json', 'index.json']) {
    const candidate = join(root, name)
    if (existsSync(candidate)) return candidate
  }
  return null
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(',')}}`
  return JSON.stringify(value)
}

function hasExactKeys(value: Record<string, unknown>, required: string[], optional: string[] = []): boolean {
  const keys = Object.keys(value)
  return required.every((key) => keys.includes(key)) && keys.every((key) => required.includes(key) || optional.includes(key))
}

function validateProjectionV1(parsed: Record<string, unknown>): void {
  if (!hasExactKeys(parsed, ['projection_version', 'generated_at', 'digest', 'counts', 'research', 'findings', 'mechanisms'])) throw new Error('public projection top-level shape is not exact v1')
  if (parsed.projection_version !== '1.0.0' || typeof parsed.generated_at !== 'string' || Number.isNaN(Date.parse(parsed.generated_at)) || typeof parsed.digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(parsed.digest)) throw new Error('public projection version, timestamp, or digest is invalid')
  const counts = parsed.counts
  if (!counts || typeof counts !== 'object' || !hasExactKeys(counts as Record<string, unknown>, ['research', 'findings', 'mechanisms'])) throw new Error('public projection counts shape is not exact v1')
  if (!Object.values(counts as Record<string, unknown>).every((value) => Number.isInteger(value) && Number(value) >= 0)) throw new Error('public projection counts must be nonnegative integers')
  const researchRequired = ['id', 'slug', 'title', 'summary', 'status', 'validity', 'registered_at', 'updated_at', 'superseded_by', 'public_artifact', 'provenance']
  const findingRequired = ['id', 'claim_id', 'decision_id', 'evidence_ids', 'statement', 'validity', 'decided_at', 'superseded_by']
  const mechanismRequired = ['id', 'title', 'summary', 'status', 'public_artifact']
  if (!Array.isArray(parsed.research) || !parsed.research.every((item) => item && typeof item === 'object' && hasExactKeys(item as Record<string, unknown>, researchRequired, ['block']))) throw new Error('public projection research shape is not exact v1')
  if (!Array.isArray(parsed.findings) || !parsed.findings.every((item) => item && typeof item === 'object' && hasExactKeys(item as Record<string, unknown>, findingRequired))) throw new Error('public projection findings shape is not exact v1')
  if (!Array.isArray(parsed.mechanisms) || !parsed.mechanisms.every((item) => item && typeof item === 'object' && hasExactKeys(item as Record<string, unknown>, mechanismRequired))) throw new Error('public projection mechanisms shape is not exact v1')
  const strings = (item: Record<string, unknown>, keys: string[]) => keys.every((key) => typeof item[key] === 'string' && String(item[key]).length > 0)
  const statuses = new Set(['active', 'blocked', 'completed', 'invalidated', 'withdrawn', 'superseded'])
  const validities = new Set(['pending', 'valid', 'invalid', 'withdrawn', 'superseded'])
  for (const item of parsed.research as Array<Record<string, unknown>>) {
    if (!strings(item, ['id', 'slug', 'title', 'summary', 'status', 'validity', 'registered_at', 'updated_at', 'public_artifact']) || !statuses.has(String(item.status)) || !validities.has(String(item.validity)) || Number.isNaN(Date.parse(String(item.registered_at))) || Number.isNaN(Date.parse(String(item.updated_at))) || !String(item.public_artifact).startsWith('/') || !(item.superseded_by === null || typeof item.superseded_by === 'string')) throw new Error('public projection research semantics are invalid')
    const provenance = item.provenance
    if (!provenance || typeof provenance !== 'object' || !hasExactKeys(provenance as Record<string, unknown>, ['claim_id', 'decision_id', 'evidence_ids']) || typeof (provenance as Record<string, unknown>).claim_id !== 'string' || !((provenance as Record<string, unknown>).decision_id === null || typeof (provenance as Record<string, unknown>).decision_id === 'string') || !Array.isArray((provenance as Record<string, unknown>).evidence_ids) || !((provenance as Record<string, unknown>).evidence_ids as unknown[]).every((id) => typeof id === 'string')) throw new Error('public projection provenance shape is not exact v1')
    if (item.block !== undefined) {
      const block = item.block as Record<string, unknown>
      if (!block || typeof block !== 'object' || !hasExactKeys(block, ['code', 'since', 'summary', 'source_digest']) || !strings(block, ['code', 'since', 'summary', 'source_digest']) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(block.code)) || Number.isNaN(Date.parse(String(block.since))) || !/^sha256:[a-f0-9]{64}$/.test(String(block.source_digest))) throw new Error('public projection block semantics are invalid')
    }
  }
  for (const item of parsed.findings as Array<Record<string, unknown>>) if (!strings(item, ['id', 'claim_id', 'decision_id', 'statement', 'validity', 'decided_at']) || item.validity !== 'valid' || Number.isNaN(Date.parse(String(item.decided_at))) || !Array.isArray(item.evidence_ids) || item.evidence_ids.length === 0 || !item.evidence_ids.every((id) => typeof id === 'string') || !(item.superseded_by === null || typeof item.superseded_by === 'string')) throw new Error('public projection finding semantics are invalid')
  for (const item of parsed.mechanisms as Array<Record<string, unknown>>) if (!strings(item, mechanismRequired) || !String(item.public_artifact).startsWith('/')) throw new Error('public projection mechanism semantics are invalid')
}

function collectPublicProjection(): PublicProjectionSummary {
  const path = publicProjectionPath()
  if (!path) return {
    ...signal({ id: 'public-projection', title: 'Public projection', state: 'unknown', sourceRef: 'projects/synaplex/knowledge/{projection.json,public-projection.json,index.json}', reason: 'No versioned public projection has been emitted yet.' }),
    availability: 'empty', contractVersion: null, projectionVersion: null, digest: null, generatedAt: null, counts: { research: 0, findings: 0, mechanisms: 0 }, provenance: { decisionRefs: 0, evidenceRefs: 0 }, researchHealth: { active: 0, blocked: 0, completed: 0, invalidated: 0, withdrawn: 0, superseded: 0, blockCodes: [] },
  }
  const raw = readBounded(path, MAX_JSON_BYTES)
  if (!raw.trim()) return {
    ...signal({ id: 'public-projection', title: 'Public projection', state: 'unknown', sourceRef: path, reason: 'The projection file exists but is empty.' }),
    availability: 'empty', contractVersion: null, projectionVersion: null, digest: null, generatedAt: null, counts: { research: 0, findings: 0, mechanisms: 0 }, provenance: { decisionRefs: 0, evidenceRefs: 0 }, researchHealth: { active: 0, blocked: 0, completed: 0, invalidated: 0, withdrawn: 0, superseded: 0, blockCodes: [] },
  }
  const parsed = JSON.parse(raw) as Record<string, unknown>
  if (containsPrivateProjectionField(parsed)) throw new Error('public projection contains a private-field key')
  validateProjectionV1(parsed)
  const declaredDigest = typeof parsed.digest === 'string' ? parsed.digest : null
  const digestPayload = { ...parsed }
  delete digestPayload.digest
  const computedDigest = `sha256:${createHash('sha256').update(canonicalJson(digestPayload)).digest('hex')}`
  if (!declaredDigest || declaredDigest !== computedDigest) throw new Error('public projection digest does not match its canonical payload')
  const research = Array.isArray(parsed.research) ? parsed.research as Array<Record<string, unknown>> : []
  const mechanisms = Array.isArray(parsed.mechanisms) ? parsed.mechanisms as Array<Record<string, unknown>> : []
  const findings = Array.isArray(parsed.findings) ? parsed.findings as Array<Record<string, unknown>> : []
  const declaredCounts = parsed.counts as Record<string, unknown> | undefined
  const counts = { research: Number(declaredCounts?.research), findings: Number(declaredCounts?.findings), mechanisms: Number(declaredCounts?.mechanisms) }
  if (!Object.values(counts).every(Number.isInteger) || counts.research !== research.length || counts.findings !== findings.length || counts.mechanisms !== mechanisms.length) throw new Error('public projection counts do not match typed v1 arrays')
  const provenance = {
    decisionRefs: research.filter((item) => (item.provenance as Record<string, unknown> | undefined)?.decision_id).length,
    evidenceRefs: research.reduce((count, item) => count + (Array.isArray((item.provenance as Record<string, unknown> | undefined)?.evidence_ids) ? ((item.provenance as Record<string, unknown>).evidence_ids as unknown[]).length : 0), 0),
  }
  const researchHealth = {
    active: research.filter((item) => item.status === 'active').length,
    blocked: research.filter((item) => item.status === 'blocked').length,
    completed: research.filter((item) => item.status === 'completed').length,
    invalidated: research.filter((item) => item.status === 'invalidated').length,
    withdrawn: research.filter((item) => item.status === 'withdrawn').length,
    superseded: research.filter((item) => item.status === 'superseded').length,
    blockCodes: [...new Set(research.flatMap((item) => item.status === 'blocked' && item.block && typeof item.block === 'object' && typeof (item.block as Record<string, unknown>).code === 'string' ? [String((item.block as Record<string, unknown>).code)] : []))].sort(),
  }
  const generatedAt = typeof parsed.generated_at === 'string' ? parsed.generated_at : null
  const age = generatedAt ? Date.now() - Date.parse(generatedAt) : Number.POSITIVE_INFINITY
  const state: ObservatoryState = age <= 24 * 60 * 60_000 ? 'healthy' : generatedAt ? 'degraded' : 'unknown'
  return {
    ...signal({ id: 'public-projection', title: 'Public projection', state, sourceRef: path, reason: state === 'healthy' ? 'Versioned public projection is present and fresh.' : 'Projection timestamp is missing or older than 24 hours.' }),
    availability: 'present',
    contractVersion: typeof parsed.projection_version === 'string' ? parsed.projection_version : null,
    projectionVersion: typeof parsed.projection_version === 'string' ? parsed.projection_version : null,
    digest: declaredDigest,
    generatedAt,
    counts,
    provenance,
    researchHealth,
  }
}

function frontMatter(text: string): Record<string, string> {
  const match = text.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}
  return Object.fromEntries(match[1].split('\n').map((line) => line.match(/^([a-z_]+):\s*(.*)$/)).filter(Boolean).map((part) => [part![1], part![2]]))
}

function collectOwnerQueue(): { state: ObservatorySignal; decisions: OwnerDecision[] } {
  const path = process.env.OWNER_AUTHORITY_PATH || join(WORKSPACE_PATHS.runtimeRoot, '.owner-decisions', 'queue.json')
  if (!existsSync(path)) return { state: signal({ id: 'owner-queue-state', title: 'Owner authority source', state: 'unknown', sourceRef: path, reason: 'No typed principal-authority queue has been emitted. Handoff filenames and prose are not authority evidence.' }), decisions: [] }
  const parsed = JSON.parse(readBounded(path, 128_000)) as { schemaVersion?: string; generatedAt?: string; entries?: unknown[] }
  if (parsed.schemaVersion !== 'command.owner-authority.v1' || !Array.isArray(parsed.entries)) throw new Error('owner authority source does not match command.owner-authority.v1')
  const allowed = new Set(['people', 'money', 'authority', 'legal', 'credential'])
  const entries = parsed.entries as Array<Record<string, unknown>>
  const pending = entries.filter((item) => item.status === 'pending' && typeof item.id === 'string' && typeof item.title === 'string' && typeof item.reason === 'string' && typeof item.sourceRef === 'string' && allowed.has(String(item.authorityType)))
  if (pending.length !== entries.filter((item) => item.status === 'pending').length) throw new Error('pending owner authority entry is missing a typed field')
  const observedAt = typeof parsed.generatedAt === 'string' ? parsed.generatedAt : iso()
  return { state: signal({ id: 'owner-queue-state', title: 'Owner authority source', state: pending.length ? 'blocked' : 'healthy', observedAt, sourceRef: path, reason: pending.length ? `${pending.length} typed principal-authority decision(s) are pending.` : 'Typed principal-authority source is present and contains no pending decisions.' }), decisions: pending.slice(0, 8).map((item) => ({ ...signal({ id: String(item.id), title: String(item.title), state: 'blocked', observedAt, sourceRef: String(item.sourceRef), reason: String(item.reason) }), requestedBy: typeof item.requestedBy === 'string' ? item.requestedBy : 'workspace' })) }
}

function collectKnowledgeLoop(): ObservatorySignal {
  const link = join(WORKSPACE_PATHS.runtimeRoot, '.meta', 'LATEST_SYNTHESIS')
  if (!existsSync(link)) return signal({ id: 'knowledge-loop', title: 'Knowledge loop', state: 'unknown', sourceRef: link, reason: 'No LATEST_SYNTHESIS pointer is present; last complete cycle cannot be established.' })
  const stat = statSync(link)
  const age = Date.now() - stat.mtimeMs
  return signal({ id: 'knowledge-loop', title: 'Knowledge loop', state: age > 7 * 86_400_000 ? 'degraded' : 'healthy', observedAt: stat.mtime.toISOString(), sourceRef: link, reason: age > 7 * 86_400_000 ? 'Latest synthesis pointer is older than seven days.' : 'Latest synthesis pointer is fresh.', details: { ageHours: Math.round(age / 3_600_000) } })
}

function collectKnowledgeState(projection: PublicProjectionSummary): ObservatorySignal[] {
  const exposed = projection.availability === 'present'
  const unknown = (id: string, title: string) => signal({ id: `knowledge-${id}`, title, state: 'unknown', sourceRef: projection.sourceRef, reason: `The public v1 contract does not expose a typed ${title.toLowerCase()} count, and no separate bounded private canon collector is configured.` })
  const researchReason = exposed
    ? projection.researchHealth.blocked > 0
      ? `${projection.researchHealth.blocked} of ${projection.counts.research} typed research records are blocked (${projection.researchHealth.blockCodes.join(', ') || 'block code missing'}).`
      : `${projection.counts.research} typed research records; none reports status=blocked. Contract state is reported without inferring research progress.`
    : 'Unavailable until a valid public projection is emitted.'
  return [
    signal({ id: 'knowledge-research', title: 'Research', state: exposed ? projection.researchHealth.blocked > 0 ? 'blocked' : 'healthy' : 'unknown', sourceRef: projection.sourceRef, reason: researchReason, details: { count: projection.counts.research, active: projection.researchHealth.active, blocked: projection.researchHealth.blocked, completed: projection.researchHealth.completed, invalidated: projection.researchHealth.invalidated, withdrawn: projection.researchHealth.withdrawn, superseded: projection.researchHealth.superseded, blockCodes: projection.researchHealth.blockCodes.join(', ') || 'none' } }),
    signal({ id: 'knowledge-findings', title: 'Findings', state: exposed ? 'healthy' : 'unknown', sourceRef: projection.sourceRef, reason: exposed ? `The typed contract contains ${projection.counts.findings} Findings; count integrity is verified, but zero or nonzero is not treated as progress health.` : 'Unavailable until a valid public projection is emitted.', details: { count: projection.counts.findings } }),
    signal({ id: 'knowledge-mechanisms', title: 'Mechanisms', state: exposed ? 'healthy' : 'unknown', sourceRef: projection.sourceRef, reason: exposed ? `The typed contract contains ${projection.counts.mechanisms} Mechanisms; this is a contract count, not an invariants or system-health claim.` : 'Unavailable until a valid public projection is emitted.', details: { count: projection.counts.mechanisms } }),
    signal({ id: 'knowledge-provenance', title: 'Decision / Evidence provenance', state: exposed ? 'healthy' : 'unknown', sourceRef: projection.sourceRef, reason: exposed ? `${projection.provenance.decisionRefs} Decision references and ${projection.provenance.evidenceRefs} Evidence references are explicitly present on research records.` : 'Projection provenance is unavailable.', details: projection.provenance }),
    unknown('claims', 'Claims'), unknown('frozen-gates', 'Frozen gates'), unknown('invariants', 'Invariants'), unknown('pod-reuse', 'Pod reuse'),
  ]
}

function collectTelemetry(): ObservatorySignal[] {
  const path = WORKSPACE_PATHS.telemetryLog
  if (!existsSync(path)) return [signal({ id: 'telemetry', title: 'Model and eval telemetry', state: 'unknown', sourceRef: path, reason: 'The shared telemetry log is missing.' })]
  const events = readTail(path).split('\n').filter(Boolean).slice(-400).flatMap((line) => { try { return [JSON.parse(line) as Record<string, unknown>] } catch { return [] } })
  const model = events.filter((event) => event.provider || event.model || String(event.eventType).includes('eval'))
  if (!model.length) return [signal({ id: 'telemetry', title: 'Model and eval telemetry', state: 'unknown', sourceRef: path, reason: 'No model/eval events were found in the bounded telemetry tail.' })]
  const latest = model[model.length - 1]
  const latestAt = typeof latest.timestamp === 'number' ? latest.timestamp : 0
  const stale = !latestAt || Date.now() - latestAt > 15 * 60_000
  const failures = model.filter((event) => event.status === 'failed' || event.level === 'error').length
  const fallbacks = model.filter((event) => event.fallbackFrom).length
  const tokens = model.reduce((sum, event) => sum + (Number(event.totalTokens) || Number((event.details as Record<string, unknown> | undefined)?.totalTokens) || 0), 0)
  return [signal({ id: 'telemetry', title: 'Model and eval telemetry', state: failures || stale ? 'degraded' : 'healthy', observedAt: latestAt ? iso(latestAt) : iso(), ttlMs: 15 * 60_000, sourceRef: `${path}#tail-${MAX_TAIL_BYTES}`, reason: failures ? `${failures} failed calls in the bounded recent window.` : stale ? `${model.length} calls are indexed, but the newest is older than 15 minutes.` : `${model.length} recent calls observed without a reported failure.`, details: { calls: model.length, failures, fallbacks, estimatedTotalTokens: tokens, costEstimate: 'unknown' } })]
}

async function collectAutomation(): Promise<ObservatorySignal[]> {
  const output = await execFileAsync('systemctl', ['list-units', '--state=failed', '--no-legend', '--no-pager'])
  const failed = output.split('\n').filter(Boolean).map((line) => line.trim().split(/\s+/)[0]).slice(0, 12)
  return [signal({ id: 'automation', title: 'Failed systemd units', state: failed.length ? 'degraded' : 'healthy', sourceRef: 'systemd:list-units(state=failed)', reason: failed.length ? `${failed.length} failed unit(s) require engineering attention.` : 'No failed systemd units are reported. This card does not claim timer freshness.', details: { failedUnits: failed.join(', ') || 'none' } })]
}

function collectOperationalPressure(): ObservatorySignal[] {
  const frontDoors = existsSync(WORKSPACE_PATHS.projectsRoot) ? readdirSync(WORKSPACE_PATHS.projectsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).flatMap((entry) => {
    const path = join(WORKSPACE_PATHS.projectsRoot, entry.name, 'CURRENT_STATE.md')
    return existsSync(path) ? [{ name: entry.name, ageMs: Date.now() - statSync(path).mtimeMs }] : []
  }) : []
  const stale = frontDoors.filter((item) => item.ageMs > 7 * 86_400_000)
  return [
    signal({ id: 'handoff-pressure', title: 'Handoff pressure', state: 'unknown', sourceRef: join(WORKSPACE_PATHS.runtimeRoot, '.handoff', 'index.json'), reason: 'No typed lifecycle index is available to exclude dispatched and completed handoffs; filename counts are not health evidence.' }),
    signal({ id: 'front-door-freshness', title: 'Front-door freshness', state: stale.length ? 'degraded' : frontDoors.length ? 'healthy' : 'unknown', sourceRef: `${WORKSPACE_PATHS.projectsRoot}/*/CURRENT_STATE.md`, reason: stale.length ? `${stale.length} project front door(s) are older than seven days.` : frontDoors.length ? `${frontDoors.length} project front door(s) are within seven days.` : 'No project front doors were found.', details: { observed: frontDoors.length, stale: stale.length } }),
  ]
}

function collectRecentChanges(): ObservatorySignal[] {
  const files: Array<{ path: string; mtimeMs: number }> = []
  if (existsSync(WORKSPACE_PATHS.projectsRoot)) {
    for (const entry of readdirSync(WORKSPACE_PATHS.projectsRoot, { withFileTypes: true }).filter((item) => item.isDirectory()).slice(0, 100)) {
      const path = join(WORKSPACE_PATHS.projectsRoot, entry.name, 'CURRENT_STATE.md')
      if (existsSync(path) && statSync(path).isFile()) files.push({ path, mtimeMs: statSync(path).mtimeMs })
    }
  }
  return files.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, 8).map(({ path, mtimeMs }) => signal({ id: `change-${createHash('sha1').update(path).digest('hex').slice(0, 10)}`, title: basename(path) === 'CURRENT_STATE.md' ? `${basename(dirname(path))} front door changed` : basename(path).replace(/\.md$/, '').replace(/-/g, ' '), state: Date.now() - mtimeMs > 7 * 86_400_000 ? 'degraded' : 'healthy', observedAt: iso(mtimeMs), sourceRef: path, reason: 'Material change indexed by bounded front-door or active-handoff metadata.' }))
}

export async function getObservatorySnapshot(options: { bypassCache?: boolean } = {}): Promise<ObservatorySnapshot> {
  if (!options.bypassCache && cached && cached.expires > Date.now()) return cached.snapshot
  const errors: Array<{ collector: string; reason: string }> = []
  const safe = async <T>(collector: string, fallback: T, fn: () => Promise<T> | T): Promise<T> => {
    try { return await timed(collector, fn) } catch (error) { errors.push({ collector, reason: error instanceof Error ? error.message : String(error) }); return fallback }
  }
  const publicFallback: PublicProjectionSummary = { ...signal({ id: 'public-projection', title: 'Public projection', state: 'unknown', sourceRef: 'projects/synaplex/knowledge', reason: 'Projection collector failed.' }), availability: 'unknown', contractVersion: null, projectionVersion: null, digest: null, generatedAt: null, counts: { research: 0, findings: 0, mechanisms: 0 }, provenance: { decisionRefs: 0, evidenceRefs: 0 }, researchHealth: { active: 0, blocked: 0, completed: 0, invalidated: 0, withdrawn: 0, superseded: 0, blockCodes: [] } }
  const ownerFallback = { state: signal({ id: 'owner-queue-state', title: 'Owner authority source', state: 'unknown', sourceRef: 'runtime/.owner-decisions/queue.json', reason: 'Owner authority collector failed.' }), decisions: [] as OwnerDecision[] }
  const [projection, ownerQueue, knowledgeLoop, automation, telemetry, changes] = await Promise.all([
    safe('publicProjection', publicFallback, collectPublicProjection),
    safe('ownerQueue', ownerFallback, collectOwnerQueue),
    safe('knowledgeLoop', signal({ id: 'knowledge-loop', title: 'Knowledge loop', state: 'unknown', sourceRef: 'runtime/.meta/LATEST_SYNTHESIS', reason: 'Collector failed.' }), collectKnowledgeLoop),
    safe('automation', [signal({ id: 'automation', title: 'Automation health', state: 'unknown', sourceRef: 'systemd', reason: 'Collector failed or timed out.' })], collectAutomation),
    safe('telemetry', [signal({ id: 'telemetry', title: 'Model and eval telemetry', state: 'unknown', sourceRef: WORKSPACE_PATHS.telemetryLog, reason: 'Collector failed.' })], collectTelemetry),
    safe('recentChanges', [], collectRecentChanges),
  ])
  const knowledge = collectKnowledgeState(projection)
  automation.push(...collectOperationalPressure())
  const publicCoherence = signal({ id: 'public-coherence', title: 'Projection coherence', state: 'unknown', sourceRef: projection.sourceRef, reason: projection.availability === 'present' ? 'The v1 artifact digest verifies projection integrity, but the contract exposes no authoritative producer-input digest for source-drift comparison.' : 'Projection coherence cannot be evaluated without a valid projection and authoritative producer-input digest.' })
  const allSignals = [projection, publicCoherence, ownerQueue.state, knowledgeLoop, ...knowledge, ...automation, ...telemetry, ...ownerQueue.decisions]
  const posture = derivePosture(allSignals)
  const generatedAt = iso()
  const snapshot: ObservatorySnapshot = { schemaVersion: 'command.observatory.v1', generatedAt, expiresAt: iso(Date.now() + SNAPSHOT_TTL_MS), posture: posture.posture, postureReason: posture.reason, publicProjection: projection, publicCoherence, ownerQueueState: ownerQueue.state, ownerQueue: ownerQueue.decisions, knowledgeLoop, knowledge, automation, modelTelemetry: telemetry, recentChanges: changes, collectorErrors: errors }
  cached = { expires: Date.now() + SNAPSHOT_TTL_MS, snapshot }
  return snapshot
}
