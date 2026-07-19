import { createHash } from 'crypto'
import { execFile } from 'child_process'
import { existsSync, openSync, closeSync, readFileSync, readSync, readdirSync, statSync } from 'fs'
import { basename, dirname, join } from 'path'

import { WORKSPACE_PATHS } from './workspacePaths'
import { getEvalSummary, type EvalSummary } from './evalTelemetry'

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
  artifactHref?: string
}

export interface PublicProjectionSummary extends ObservatorySignal {
  availability: 'present' | 'empty' | 'unknown'
  contractVersion: string | null
  projectionVersion: string | null
  digest: string | null
  generatedAt: string | null
  counts: { research: number; findings: number; mechanisms: number; engineeringCases: number; sources: number; conjectures: number }
  provenance: { decisionRefs: number; evidenceRefs: number }
  researchHealth: { active: number; blocked: number; completed: number; invalidated: number; withdrawn: number; superseded: number; blockCodes: string[]; latestUpdatedAt: string | null; oldestUpdatedAt: string | null }
  sourceHealth: { latestRetrievedAt: string | null; oldestRetrievedAt: string | null; domains: number }
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
  closure: ObservatorySignal[]
  currentCycles: ObservatorySignal[]
  durability: ObservatorySignal[]
  deployment: ObservatorySignal[]
  modelTelemetry: ObservatorySignal[]
  evalSummary: EvalSummary
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
    artifactHref: input.artifactHref,
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
  const extended = parsed.projection_version === '1.1.0'
  const topKeys = extended ? ['projection_version', 'generated_at', 'digest', 'counts', 'research', 'findings', 'mechanisms', 'engineering_cases', 'sources', 'conjectures'] : ['projection_version', 'generated_at', 'digest', 'counts', 'research', 'findings', 'mechanisms']
  if (!hasExactKeys(parsed, topKeys)) throw new Error(`public projection top-level shape is not exact ${extended ? 'v1.1' : 'v1.0'}`)
  if (!['1.0.0', '1.1.0'].includes(String(parsed.projection_version)) || typeof parsed.generated_at !== 'string' || Number.isNaN(Date.parse(parsed.generated_at)) || typeof parsed.digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(parsed.digest)) throw new Error('public projection version, timestamp, or digest is invalid')
  const counts = parsed.counts
  const countKeys = extended ? ['research', 'findings', 'mechanisms', 'engineering_cases', 'sources', 'conjectures'] : ['research', 'findings', 'mechanisms']
  if (!counts || typeof counts !== 'object' || !hasExactKeys(counts as Record<string, unknown>, countKeys)) throw new Error(`public projection counts shape is not exact ${extended ? 'v1.1' : 'v1.0'}`)
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
  if (extended) {
    const cases = parsed.engineering_cases
    const sources = parsed.sources
    const conjectures = parsed.conjectures
    const caseRequired = ['id', 'slug', 'title', 'summary', 'label', 'status', 'learned', 'limits', 'source_links']
    const sourceRequired = ['id', 'title', 'url', 'retrieved_at', 'source_class', 'domain', 'author_publisher', 'content_digest', 'access_license', 'quality']
    const conjectureRequired = ['id', 'title', 'source_ids', 'source_mechanism', 'target_mechanism', 'analogy_map', 'disanalogies', 'competing_explanations', 'falsifiers', 'preconditions', 'expected_information_gain', 'observation_route', 'diversity_score', 'novelty_score', 'redundancy_score', 'source_quality_score']
    if (!Array.isArray(cases) || !cases.every((item) => item && typeof item === 'object' && hasExactKeys(item as Record<string, unknown>, caseRequired))) throw new Error('public projection engineering case shape is not exact v1.1')
    if (!Array.isArray(sources) || !sources.every((item) => item && typeof item === 'object' && hasExactKeys(item as Record<string, unknown>, sourceRequired))) throw new Error('public projection source shape is not exact v1.1')
    if (!Array.isArray(conjectures) || !conjectures.every((item) => item && typeof item === 'object' && hasExactKeys(item as Record<string, unknown>, conjectureRequired))) throw new Error('public projection conjecture shape is not exact v1.1')
    const stringArray = (value: unknown, minimum = 1) => Array.isArray(value) && value.length >= minimum && value.every((item) => typeof item === 'string' && item.length > 0) && new Set(value).size === value.length
    const httpsUrl = (value: unknown) => { try { return typeof value === 'string' && new URL(value).protocol === 'https:' } catch { return false } }
    const score = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    for (const item of cases as Array<Record<string, unknown>>) if (!strings(item, ['id', 'slug', 'title', 'summary', 'label', 'status', 'learned', 'limits']) || item.label !== 'engineering case study' || item.status !== 'operational' || !Array.isArray(item.source_links) || item.source_links.length < 1 || !item.source_links.every(httpsUrl)) throw new Error('public projection engineering case semantics are invalid')
    for (const item of sources as Array<Record<string, unknown>>) if (!strings(item, ['id', 'title', 'url', 'retrieved_at', 'source_class', 'domain', 'author_publisher', 'content_digest', 'access_license']) || !/^src:[a-f0-9]{16}$/.test(String(item.id)) || !httpsUrl(item.url) || Number.isNaN(Date.parse(String(item.retrieved_at))) || !/^sha256:[a-f0-9]{64}$/.test(String(item.content_digest)) || !score(item.quality)) throw new Error('public projection source semantics are invalid')
    const sourceIds = new Set((sources as Array<Record<string, unknown>>).map((item) => String(item.id)))
    for (const item of conjectures as Array<Record<string, unknown>>) {
      if (!strings(item, ['id', 'title', 'source_mechanism', 'target_mechanism', 'expected_information_gain', 'observation_route']) || !stringArray(item.source_ids, 2) || !(item.source_ids as unknown[]).every((id) => sourceIds.has(String(id))) || !['analogy_map', 'disanalogies', 'competing_explanations', 'falsifiers', 'preconditions'].every((key) => stringArray(item[key])) || !String(item.observation_route).includes('preregistered Claim') || !['diversity_score', 'novelty_score', 'redundancy_score', 'source_quality_score'].every((key) => score(item[key]))) throw new Error('public projection conjecture semantics are invalid')
    }
  }
}

function collectPublicProjection(): PublicProjectionSummary {
  const path = publicProjectionPath()
  if (!path) return {
    ...signal({ id: 'public-projection', title: 'Public projection', state: 'unknown', sourceRef: 'projects/synaplex/knowledge/{projection.json,public-projection.json,index.json}', reason: 'No versioned public projection has been emitted yet.' }),
    availability: 'empty', contractVersion: null, projectionVersion: null, digest: null, generatedAt: null, counts: { research: 0, findings: 0, mechanisms: 0, engineeringCases: 0, sources: 0, conjectures: 0 }, provenance: { decisionRefs: 0, evidenceRefs: 0 }, researchHealth: { active: 0, blocked: 0, completed: 0, invalidated: 0, withdrawn: 0, superseded: 0, blockCodes: [], latestUpdatedAt: null, oldestUpdatedAt: null }, sourceHealth: { latestRetrievedAt: null, oldestRetrievedAt: null, domains: 0 },
  }
  const raw = readBounded(path, MAX_JSON_BYTES)
  if (!raw.trim()) return {
    ...signal({ id: 'public-projection', title: 'Public projection', state: 'unknown', sourceRef: path, reason: 'The projection file exists but is empty.' }),
    availability: 'empty', contractVersion: null, projectionVersion: null, digest: null, generatedAt: null, counts: { research: 0, findings: 0, mechanisms: 0, engineeringCases: 0, sources: 0, conjectures: 0 }, provenance: { decisionRefs: 0, evidenceRefs: 0 }, researchHealth: { active: 0, blocked: 0, completed: 0, invalidated: 0, withdrawn: 0, superseded: 0, blockCodes: [], latestUpdatedAt: null, oldestUpdatedAt: null }, sourceHealth: { latestRetrievedAt: null, oldestRetrievedAt: null, domains: 0 },
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
  const engineeringCases = Array.isArray(parsed.engineering_cases) ? parsed.engineering_cases as Array<Record<string, unknown>> : []
  const sources = Array.isArray(parsed.sources) ? parsed.sources as Array<Record<string, unknown>> : []
  const conjectures = Array.isArray(parsed.conjectures) ? parsed.conjectures as Array<Record<string, unknown>> : []
  const declaredCounts = parsed.counts as Record<string, unknown> | undefined
  const counts = { research: Number(declaredCounts?.research), findings: Number(declaredCounts?.findings), mechanisms: Number(declaredCounts?.mechanisms), engineeringCases: Number(declaredCounts?.engineering_cases ?? 0), sources: Number(declaredCounts?.sources ?? 0), conjectures: Number(declaredCounts?.conjectures ?? 0) }
  if (!Object.values(counts).every(Number.isInteger) || counts.research !== research.length || counts.findings !== findings.length || counts.mechanisms !== mechanisms.length || counts.engineeringCases !== engineeringCases.length || counts.sources !== sources.length || counts.conjectures !== conjectures.length) throw new Error('public projection counts do not match typed v1 arrays')
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
    latestUpdatedAt: research.length ? research.map((item) => String(item.updated_at)).sort().at(-1) ?? null : null,
    oldestUpdatedAt: research.length ? research.map((item) => String(item.updated_at)).sort().at(0) ?? null : null,
  }
  const retrieved = sources.map((item) => String(item.retrieved_at)).sort()
  const sourceHealth = { latestRetrievedAt: retrieved.at(-1) ?? null, oldestRetrievedAt: retrieved.at(0) ?? null, domains: new Set(sources.map((item) => String(item.domain))).size }
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
    sourceHealth,
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
  const sourceUpdatedAt = projection.sourceHealth.latestRetrievedAt ?? projection.researchHealth.latestUpdatedAt
  const sourceAgeMs = sourceUpdatedAt ? Date.now() - Date.parse(sourceUpdatedAt) : Number.POSITIVE_INFINITY
  const researchFreshnessState: ObservatoryState = !exposed || !sourceUpdatedAt ? 'unknown' : sourceAgeMs > 7 * 86_400_000 ? 'degraded' : 'healthy'
  const exposesDiscovery = projection.projectionVersion === '1.1.0'
  return [
    signal({ id: 'knowledge-research', title: 'Research', state: exposed ? projection.researchHealth.blocked > 0 ? 'blocked' : 'healthy' : 'unknown', sourceRef: projection.sourceRef, reason: researchReason, details: { count: projection.counts.research, active: projection.researchHealth.active, blocked: projection.researchHealth.blocked, completed: projection.researchHealth.completed, invalidated: projection.researchHealth.invalidated, withdrawn: projection.researchHealth.withdrawn, superseded: projection.researchHealth.superseded, blockCodes: projection.researchHealth.blockCodes.join(', ') || 'none' } }),
    signal({ id: 'knowledge-findings', title: 'Findings contract', state: exposed ? 'healthy' : 'unknown', sourceRef: projection.sourceRef, reason: exposed ? `The typed contract contains ${projection.counts.findings} Findings; count integrity is verified, but zero or nonzero is not treated as progress health.` : 'Unavailable until a valid public projection is emitted.', details: { count: projection.counts.findings } }),
    signal({ id: 'knowledge-mechanisms', title: 'Mechanisms contract', state: exposed ? 'healthy' : 'unknown', sourceRef: projection.sourceRef, reason: exposed ? `The typed contract contains ${projection.counts.mechanisms} Mechanisms; this is a contract count, not an invariants or system-health claim.` : 'Unavailable until a valid public projection is emitted.', details: { count: projection.counts.mechanisms } }),
    signal({ id: 'knowledge-research-freshness', title: 'Research source freshness', state: researchFreshnessState, observedAt: sourceUpdatedAt ?? undefined, sourceRef: projection.sourceRef, reason: researchFreshnessState === 'healthy' ? `Newest typed ${projection.sourceHealth.latestRetrievedAt ? 'source retrieval' : 'research update'} is ${Math.max(0, Math.round(sourceAgeMs / 3_600_000))}h old.` : researchFreshnessState === 'degraded' ? `Newest typed source activity is ${Math.round(sourceAgeMs / 86_400_000)}d old; freshness threshold is seven days.` : 'No typed source retrieval or research update timestamp is available.', details: { sources: projection.counts.sources, domains: projection.sourceHealth.domains, newestRetrieval: projection.sourceHealth.latestRetrievedAt, oldestRetrieval: projection.sourceHealth.oldestRetrievedAt } }),
    signal({ id: 'knowledge-provenance', title: 'Decision / Evidence boundary', state: exposed ? 'healthy' : 'unknown', sourceRef: projection.sourceRef, reason: exposed ? `The exact v1 contract validates per-record provenance: ${projection.provenance.decisionRefs} Decision references and ${projection.provenance.evidenceRefs} Evidence references are declared. Counts describe contract content, not epistemic success.` : 'Projection provenance is unavailable.', details: projection.provenance }),
    signal({ id: 'knowledge-conjecture-flow', title: 'Conjecture contract', state: exposesDiscovery ? 'healthy' : 'unknown', sourceRef: exposesDiscovery ? projection.sourceRef : `${WORKSPACE_PATHS.runtimeRoot}/.knowledge-flow/observatory.json`, reason: exposesDiscovery ? `The exact v1.1 contract contains ${projection.counts.conjectures} conjectures linked to ${projection.counts.sources} typed sources; observation routes are validated as requiring a preregistered Claim. Count integrity is not evidence of research progress.` : 'Projection v1.0 does not expose conjectures, and no command.knowledge-flow.v1 private transition index exists.', details: { conjectures: projection.counts.conjectures, sources: projection.counts.sources } }),
    signal({ id: 'knowledge-engineering-cases', title: 'Engineering cases contract', state: exposesDiscovery ? 'healthy' : 'unknown', sourceRef: projection.sourceRef, reason: exposesDiscovery ? `The exact v1.1 contract contains ${projection.counts.engineeringCases} operational engineering case studies with HTTPS source links; they remain labeled case studies, not Findings.` : 'Projection v1.0 does not expose typed engineering cases.', details: { count: projection.counts.engineeringCases } }),
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
  const [failedOutput, timerOutput, serviceOutput] = await Promise.all([
    execFileAsync('systemctl', ['list-units', '--state=failed', '--no-legend', '--no-pager']),
    execFileAsync('systemctl', ['list-timers', '--all', '--no-legend', '--no-pager', '--output=json']),
    execFileAsync('systemctl', ['show', 'command.service', '--property=ActiveState,SubState,Result,ExecMainStartTimestamp', '--output=json']),
  ])
  const failed = failedOutput.split('\n').filter(Boolean).map((line) => line.trim().split(/\s+/)[0]).slice(0, 12)
  const timers = (JSON.parse(timerOutput) as Array<Record<string, unknown>>).filter((item) => /^(workspace|command|synaplex|server|metrics)/.test(String(item.unit)))
  const nowMicros = Date.now() * 1000
  const staleTimers = timers.filter((item) => typeof item.next !== 'number' || Number(item.next) < nowMicros - 5 * 60 * 1_000_000 || typeof item.last !== 'number' || Number(item.last) <= 0)
  const service = Object.fromEntries(serviceOutput.split('\n').filter(Boolean).map((line) => { const at = line.indexOf('='); return at > 0 ? [line.slice(0, at), line.slice(at + 1)] : [line, ''] }))
  const serviceHealthy = service.ActiveState === 'active' && service.SubState === 'running' && ['success', ''].includes(String(service.Result ?? ''))
  return [
    signal({ id: 'command-service', title: 'Command service', state: serviceHealthy ? 'healthy' : 'degraded', sourceRef: 'systemd:command.service', reason: serviceHealthy ? 'command.service is active and running.' : `command.service reports ${String(service.ActiveState ?? 'unknown')}/${String(service.SubState ?? 'unknown')} with result ${String(service.Result ?? 'unknown')}.`, details: { active: String(service.ActiveState ?? 'unknown'), substate: String(service.SubState ?? 'unknown'), result: String(service.Result ?? 'unknown'), started: String(service.ExecMainStartTimestamp ?? 'unknown') } }),
    signal({ id: 'automation', title: 'Failed systemd units', state: failed.length ? 'degraded' : 'healthy', sourceRef: 'systemd:list-units(state=failed)', reason: failed.length ? `${failed.length} failed unit(s) require engineering attention.` : 'No failed systemd units are reported.', details: { failedUnits: failed.join(', ') || 'none' } }),
    signal({ id: 'timer-freshness', title: 'Workspace timer freshness', state: staleTimers.length ? 'degraded' : timers.length ? 'healthy' : 'unknown', sourceRef: 'systemd:list-timers(workspace|command|synaplex|server|metrics)', reason: staleTimers.length ? `${staleTimers.length} of ${timers.length} scoped timers have no successful trigger timestamp or a past-due next trigger.` : timers.length ? `${timers.length} scoped timers have a recorded trigger and a future next trigger.` : 'No scoped workspace timers were returned.', details: { observed: timers.length, staleOrNeverTriggered: staleTimers.map((item) => String(item.unit)).join(', ') || 'none' } }),
  ]
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

interface ClosureIndexV1 {
  schemaVersion: 'command.closure.v1'
  generatedAt: string
  queue: { open: number; completed7d: number; oldestOpenedAt: string | null }
  diagnosis: { total: number; executed: number }
  recommendations: { open: number; closed: number }
}

function collectClosure(): ObservatorySignal[] {
  const path = process.env.CLOSURE_INDEX_PATH || join(WORKSPACE_PATHS.runtimeRoot, '.closure', 'observatory.json')
  if (!existsSync(path)) return [
    signal({ id: 'closure-queue', title: 'Closure queue age and drain', state: 'unknown', sourceRef: path, reason: 'No command.closure.v1 index exists; handoff filenames and synthesis prose are not lifecycle evidence.' }),
    signal({ id: 'diagnosis-conversion', title: 'Diagnosis to execution', state: 'unknown', sourceRef: path, reason: 'No typed diagnosis-to-execution linkage is available.' }),
    signal({ id: 'recommendation-closure', title: 'Recommendation closure', state: 'unknown', sourceRef: path, reason: 'No typed recommendation lifecycle index is available.' }),
  ]
  const parsed = JSON.parse(readBounded(path, 128_000)) as ClosureIndexV1
  if (parsed.schemaVersion !== 'command.closure.v1' || Number.isNaN(Date.parse(parsed.generatedAt))) throw new Error('closure index does not match command.closure.v1')
  const values = [parsed.queue?.open, parsed.queue?.completed7d, parsed.diagnosis?.total, parsed.diagnosis?.executed, parsed.recommendations?.open, parsed.recommendations?.closed]
  if (!values.every((value) => Number.isInteger(value) && value >= 0) || parsed.diagnosis.executed > parsed.diagnosis.total) throw new Error('closure index contains invalid counts')
  if (!(parsed.queue.oldestOpenedAt === null || !Number.isNaN(Date.parse(parsed.queue.oldestOpenedAt)))) throw new Error('closure index oldestOpenedAt is invalid')
  const ageHours = parsed.queue.oldestOpenedAt ? Math.max(0, Math.round((Date.now() - Date.parse(parsed.queue.oldestOpenedAt)) / 3_600_000)) : 0
  const stale = Date.now() - Date.parse(parsed.generatedAt) > 60 * 60_000
  return [
    signal({ id: 'closure-queue', title: 'Closure queue age and drain', state: stale ? 'degraded' : 'healthy', observedAt: parsed.generatedAt, sourceRef: path, reason: stale ? 'Closure index is older than one hour.' : `${parsed.queue.open} open; oldest ${parsed.queue.oldestOpenedAt ? `${ageHours}h` : 'none'}; ${parsed.queue.completed7d} completed in seven days.`, details: { open: parsed.queue.open, oldestAgeHours: ageHours, completed7d: parsed.queue.completed7d } }),
    signal({ id: 'diagnosis-conversion', title: 'Diagnosis to execution', state: stale ? 'degraded' : 'healthy', observedAt: parsed.generatedAt, sourceRef: path, reason: `${parsed.diagnosis.executed} of ${parsed.diagnosis.total} typed diagnoses link to execution. The ratio is reported without inventing a target.`, details: { total: parsed.diagnosis.total, executed: parsed.diagnosis.executed } }),
    signal({ id: 'recommendation-closure', title: 'Recommendation closure', state: stale ? 'degraded' : 'healthy', observedAt: parsed.generatedAt, sourceRef: path, reason: `${parsed.recommendations.closed} closed and ${parsed.recommendations.open} open recommendations are declared by the typed index.`, details: parsed.recommendations }),
  ]
}

function collectCurrentCycles(): ObservatorySignal[] {
  const path = process.env.SYMPHONY_TASKS_PATH || WORKSPACE_PATHS.symphonyTasks
  if (!existsSync(path)) return [signal({ id: 'symphony-queue', title: 'Current cycles and owners', state: 'unknown', sourceRef: path, reason: 'The typed Symphony task store is missing.' })]
  const parsed = JSON.parse(readBounded(path, MAX_JSON_BYTES)) as { tasks?: unknown[] }
  if (!Array.isArray(parsed.tasks)) throw new Error('Symphony task store has no tasks array')
  const allowed = new Set(['ready', 'running', 'blocked', 'review', 'done', 'deferred'])
  const tasks = (parsed.tasks as Array<Record<string, unknown>>).filter((task) => typeof task.id === 'string' && typeof task.title === 'string' && typeof task.ownerSession === 'string' && typeof task.targetProject === 'string' && typeof task.stateChangedAt === 'number' && allowed.has(String(task.state)))
  if (tasks.length !== parsed.tasks.length) throw new Error('Symphony task store contains a structurally invalid task')
  const active = tasks.filter((task) => !['done', 'deferred'].includes(String(task.state)))
  const stale = active.filter((task) => (task.state === 'running' && Date.now() - Number(task.stateChangedAt) > 2 * 60 * 60_000) || (['ready', 'review'].includes(String(task.state)) && Date.now() - Number(task.stateChangedAt) > 24 * 60 * 60_000))
  const blocked = active.filter((task) => task.state === 'blocked')
  const done7d = tasks.filter((task) => task.state === 'done' && typeof task.completedAt === 'number' && Date.now() - Number(task.completedAt) <= 7 * 86_400_000).length
  const queueState: ObservatoryState = blocked.length ? 'blocked' : stale.length ? 'degraded' : 'healthy'
  const summary = signal({ id: 'symphony-queue', title: 'Execution queue', state: queueState, sourceRef: path, artifactHref: '/symphony', reason: blocked.length ? `${blocked.length} of ${active.length} active typed tasks are blocked.` : stale.length ? `${stale.length} of ${active.length} active typed tasks exceed their lifecycle freshness threshold.` : `${active.length} active typed tasks; ${done7d} completed in seven days.`, details: { active: active.length, blocked: blocked.length, stale: stale.length, completed7d: done7d } })
  const rows = active.sort((a, b) => Number(b.stateChangedAt) - Number(a.stateChangedAt)).slice(0, 8).map((task) => signal({ id: `cycle-${String(task.id)}`, title: String(task.title), state: task.state === 'blocked' ? 'blocked' : stale.includes(task) ? 'degraded' : 'healthy', observedAt: iso(Number(task.stateChangedAt)), sourceRef: `${path}#${String(task.id)}`, artifactHref: '/symphony', reason: `${String(task.targetProject)} · ${String(task.state)} · owner ${String(task.ownerSession)} · state age ${Math.max(0, Math.round((Date.now() - Number(task.stateChangedAt)) / 3_600_000))}h.`, details: { project: String(task.targetProject), owner: String(task.ownerSession), state: String(task.state) } }))
  return [summary, ...rows]
}

function collectRemoteDurability(): ObservatorySignal[] {
  const path = process.env.REMOTE_DURABILITY_PATH || join(WORKSPACE_PATHS.runtimeRoot, '.telemetry', 'remote-durability.jsonl')
  if (!existsSync(path)) return [signal({ id: 'remote-durability', title: 'Remote durability', state: 'unknown', sourceRef: path, reason: 'No typed remote-durability telemetry exists.' })]
  const events = readTail(path, MAX_TAIL_BYTES).split('\n').filter(Boolean).flatMap((line) => { try { return [JSON.parse(line) as Record<string, unknown>] } catch { return [] } }).filter((event) => event.source === 'remote-durability' && typeof event.repository === 'string' && typeof event.publicationState === 'string' && typeof event.timestamp === 'number')
  const latest = new Map<string, Record<string, unknown>>()
  for (const event of events) latest.set(String(event.repository), event)
  if (!latest.size) return [signal({ id: 'remote-durability', title: 'Remote durability', state: 'unknown', sourceRef: `${path}#tail-${MAX_TAIL_BYTES}`, reason: 'No valid remote-durability events were found in the bounded tail.' })]
  const rows = [...latest.values()]
  const newest = Math.max(...rows.map((event) => Number(event.timestamp)))
  const stale = Date.now() - newest > 60 * 60_000
  const unsynced = rows.filter((event) => event.publicationState !== 'synced')
  const state: ObservatoryState = unsynced.length ? 'degraded' : stale ? 'degraded' : 'healthy'
  return [signal({ id: 'remote-durability', title: 'Remote durability', state, observedAt: iso(newest), sourceRef: `${path}#tail-${MAX_TAIL_BYTES}`, reason: unsynced.length ? `${unsynced.length} of ${rows.length} repositories are not reported synced.` : stale ? `All ${rows.length} latest repository receipts are synced, but the newest receipt is older than one hour.` : `All ${rows.length} latest repository receipts are synced and fresh.`, details: { repositories: rows.length, unsynced: unsynced.map((event) => String(event.project ?? event.repository)).join(', ') || 'none', dirtyWorktrees: rows.filter((event) => Number(event.dirtyPaths) > 0).length } })]
}

function collectEvalState(): ObservatorySignal[] {
  const root = join(WORKSPACE_PATHS.commandRoot, '.prompteval')
  const inventoryPath = join(root, 'inventory.json')
  if (!existsSync(inventoryPath)) return [signal({ id: 'eval-governance', title: 'Prompt eval release gate', state: 'unknown', sourceRef: inventoryPath, reason: 'Prompt eval inventory is missing.' })]
  const inventory = JSON.parse(readBounded(inventoryPath, 128_000)) as { enforce?: boolean; prompts?: Array<{ id?: string | null; status?: string }> }
  if (!Array.isArray(inventory.prompts) || typeof inventory.enforce !== 'boolean') throw new Error('prompt eval inventory is invalid')
  const ids = inventory.prompts.filter((item) => item.status === 'governed' && typeof item.id === 'string').map((item) => String(item.id))
  const baselines = ids.flatMap((id) => {
    const path = join(root, id, 'baseline.json')
    if (!existsSync(path)) return []
    const parsed = JSON.parse(readBounded(path, 1_000_000)) as Record<string, unknown>
    return parsed.passed === true && parsed.release === true && parsed.accepted_from_cache === false ? [parsed] : []
  })
  const statusRoot = join(WORKSPACE_PATHS.runtimeRoot, 'prompteval')
  const commandStatus = existsSync(statusRoot) ? readdirSync(statusRoot).find((name) => name.startsWith('command-') && existsSync(join(statusRoot, name, 'status.json'))) : undefined
  const statusPath = commandStatus ? join(statusRoot, commandStatus, 'status.json') : null
  const status = statusPath ? JSON.parse(readBounded(statusPath, 1_000_000)) as { prompts?: Record<string, { flags?: unknown[]; flag_streak?: number }> } : null
  const flagged = Object.entries(status?.prompts ?? {}).filter(([, value]) => Array.isArray(value.flags) && value.flags.length).map(([id, value]) => `${id}:${value.flags?.join('+')}(${value.flag_streak ?? 0})`)
  const complete = ids.length > 0 && baselines.length === ids.length && inventory.enforce
  return [signal({ id: 'eval-governance', title: 'Prompt eval release gate', state: complete ? 'healthy' : 'blocked', observedAt: statusPath ? statSync(statusPath).mtime.toISOString() : undefined, sourceRef: statusPath ?? inventoryPath, artifactHref: '/lineage', reason: complete ? `${baselines.length}/${ids.length} governed prompts have fresh uncached release baselines and enforcement is enabled.` : `${baselines.length}/${ids.length} governed prompts have accepted uncached release baselines; inventory enforcement is ${inventory.enforce ? 'enabled' : 'disabled'}.`, details: { governed: ids.length, acceptedFreshBaselines: baselines.length, enforce: inventory.enforce, decayFlags: flagged.join(', ') || 'none' } })]
}

function collectDeployment(): ObservatorySignal[] {
  const current = process.env.COMMAND_RELEASE_CURRENT || join(WORKSPACE_PATHS.runtimeRoot, 'releases', 'command', 'current')
  const manifestPath = join(current, 'RELEASE.json')
  const versionPath = join(current, 'dist', '.version')
  if (!existsSync(manifestPath) || !existsSync(versionPath)) return [signal({ id: 'deployment-identity', title: 'Deployment identity', state: 'unknown', sourceRef: manifestPath, reason: 'Immutable release manifest or runtime version is missing.' })]
  const manifest = JSON.parse(readBounded(manifestPath, 32_000)) as Record<string, unknown>
  const version = readBounded(versionPath, 256).trim()
  if (typeof manifest.releaseId !== 'string' || typeof manifest.sha !== 'string' || !/^[a-f0-9]{40}$/.test(manifest.sha) || typeof manifest.dirty !== 'boolean' || typeof manifest.builtAt !== 'string' || Number.isNaN(Date.parse(manifest.builtAt))) throw new Error('release manifest is structurally invalid')
  const expected = `${manifest.sha}${manifest.dirty ? '-dirty' : ''}`
  const coherent = version === expected
  return [signal({ id: 'deployment-identity', title: 'Deployment identity', state: coherent && !manifest.dirty ? 'healthy' : coherent ? 'degraded' : 'blocked', observedAt: String(manifest.builtAt), sourceRef: manifestPath, reason: !coherent ? 'Active release manifest and served runtime version disagree.' : manifest.dirty ? `Release ${manifest.releaseId} is coherent but explicitly dirty.` : `Immutable release ${manifest.releaseId} serves committed SHA ${String(manifest.sha).slice(0, 12)}.`, details: { releaseId: String(manifest.releaseId), sha: String(manifest.sha), dirty: Boolean(manifest.dirty), versionCoherent: coherent } })]
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
  const publicFallback: PublicProjectionSummary = { ...signal({ id: 'public-projection', title: 'Public projection', state: 'unknown', sourceRef: 'projects/synaplex/knowledge', reason: 'Projection collector failed.' }), availability: 'unknown', contractVersion: null, projectionVersion: null, digest: null, generatedAt: null, counts: { research: 0, findings: 0, mechanisms: 0, engineeringCases: 0, sources: 0, conjectures: 0 }, provenance: { decisionRefs: 0, evidenceRefs: 0 }, researchHealth: { active: 0, blocked: 0, completed: 0, invalidated: 0, withdrawn: 0, superseded: 0, blockCodes: [], latestUpdatedAt: null, oldestUpdatedAt: null }, sourceHealth: { latestRetrievedAt: null, oldestRetrievedAt: null, domains: 0 } }
  const ownerFallback = { state: signal({ id: 'owner-queue-state', title: 'Owner authority source', state: 'unknown', sourceRef: 'runtime/.owner-decisions/queue.json', reason: 'Owner authority collector failed.' }), decisions: [] as OwnerDecision[] }
  const emptyEvalSummary: EvalSummary = { generated_at: iso(), llm_usage: { '1h': { calls: 0, successes: 0, throttles: 0, errors: 0, fallbacks: 0, totalTokens: 0, inputTokens: 0, outputTokens: 0, avgLatencyMs: 0, byProvider: {} }, '24h': { calls: 0, successes: 0, throttles: 0, errors: 0, fallbacks: 0, totalTokens: 0, inputTokens: 0, outputTokens: 0, avgLatencyMs: 0, byProvider: {} }, '7d': { calls: 0, successes: 0, throttles: 0, errors: 0, fallbacks: 0, totalTokens: 0, inputTokens: 0, outputTokens: 0, avgLatencyMs: 0, byProvider: {} } }, eval_runs: [] }
  const [projection, ownerQueue, knowledgeLoop, automation, telemetry, changes, closure, currentCycles, durability, deployment, evalSummary, evalState] = await Promise.all([
    safe('publicProjection', publicFallback, collectPublicProjection),
    safe('ownerQueue', ownerFallback, collectOwnerQueue),
    safe('knowledgeLoop', signal({ id: 'knowledge-loop', title: 'Knowledge loop', state: 'unknown', sourceRef: 'runtime/.meta/LATEST_SYNTHESIS', reason: 'Collector failed.' }), collectKnowledgeLoop),
    safe('automation', [signal({ id: 'automation', title: 'Automation health', state: 'unknown', sourceRef: 'systemd', reason: 'Collector failed or timed out.' })], collectAutomation),
    safe('telemetry', [signal({ id: 'telemetry', title: 'Model and eval telemetry', state: 'unknown', sourceRef: WORKSPACE_PATHS.telemetryLog, reason: 'Collector failed.' })], collectTelemetry),
    safe('recentChanges', [], collectRecentChanges),
    safe('closure', [signal({ id: 'closure', title: 'Closure telemetry', state: 'unknown', sourceRef: 'runtime/.closure/observatory.json', reason: 'Collector failed.' })], collectClosure),
    safe('currentCycles', [signal({ id: 'cycles', title: 'Current cycles and owners', state: 'unknown', sourceRef: WORKSPACE_PATHS.symphonyTasks, reason: 'Collector failed.' })], collectCurrentCycles),
    safe('remoteDurability', [signal({ id: 'remote-durability', title: 'Remote durability', state: 'unknown', sourceRef: 'runtime/telemetry/remote-durability.jsonl', reason: 'Collector failed.' })], collectRemoteDurability),
    safe('deployment', [signal({ id: 'deployment-identity', title: 'Deployment identity', state: 'unknown', sourceRef: 'runtime/releases/command/current/RELEASE.json', reason: 'Collector failed.' })], collectDeployment),
    safe('evalSummary', emptyEvalSummary, getEvalSummary),
    safe('evalState', [signal({ id: 'eval-governance', title: 'Prompt eval release gate', state: 'unknown', sourceRef: '.prompteval', reason: 'Collector failed.' })], collectEvalState),
  ])
  const knowledge = collectKnowledgeState(projection)
  automation.push(...collectOperationalPressure())
  const publicCoherence = signal({ id: 'public-coherence', title: 'Projection coherence', state: 'unknown', sourceRef: projection.sourceRef, reason: projection.availability === 'present' ? 'The v1 artifact digest verifies projection integrity, but the contract exposes no authoritative producer-input digest for source-drift comparison.' : 'Projection coherence cannot be evaluated without a valid projection and authoritative producer-input digest.' })
  // handoff-pressure has no real collector and is always unknown — exclude it from posture so
  // it cannot permanently hold the overall posture at 'unknown'. It still appears in the
  // automation section of the dashboard for visibility.
  const modelTelemetry = [...evalState, ...telemetry]
  const postureSignals = [projection, publicCoherence, ownerQueue.state, knowledgeLoop, ...knowledge, ...automation.filter((s) => s.id !== 'handoff-pressure'), ...closure, ...currentCycles, ...durability, ...deployment, ...modelTelemetry, ...ownerQueue.decisions]
  const posture = derivePosture(postureSignals)
  const generatedAt = iso()
  const cause = postureSignals.find((item) => item.state === posture.posture)
  const postureReason = cause && posture.posture !== 'healthy' ? `${posture.reason} ${cause.title}: ${cause.reason}` : posture.reason
  const snapshot: ObservatorySnapshot = { schemaVersion: 'command.observatory.v1', generatedAt, expiresAt: iso(Date.now() + SNAPSHOT_TTL_MS), posture: posture.posture, postureReason, publicProjection: projection, publicCoherence, ownerQueueState: ownerQueue.state, ownerQueue: ownerQueue.decisions, knowledgeLoop, knowledge, automation, closure, currentCycles, durability, deployment, modelTelemetry, evalSummary, recentChanges: changes, collectorErrors: errors }
  cached = { expires: Date.now() + SNAPSHOT_TTL_MS, snapshot }
  return snapshot
}
