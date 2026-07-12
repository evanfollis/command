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
  recordCounts: Record<string, number>
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

function collectPublicProjection(): PublicProjectionSummary {
  const path = publicProjectionPath()
  if (!path) return {
    ...signal({ id: 'public-projection', title: 'Public projection', state: 'unknown', sourceRef: 'projects/synaplex/knowledge/{projection.json,public-projection.json,index.json}', reason: 'No versioned public projection has been emitted yet.' }),
    availability: 'empty', contractVersion: null, projectionVersion: null, digest: null, generatedAt: null, recordCounts: {},
  }
  const raw = readBounded(path, MAX_JSON_BYTES)
  if (!raw.trim()) return {
    ...signal({ id: 'public-projection', title: 'Public projection', state: 'unknown', sourceRef: path, reason: 'The projection file exists but is empty.' }),
    availability: 'empty', contractVersion: null, projectionVersion: null, digest: null, generatedAt: null, recordCounts: {},
  }
  const parsed = JSON.parse(raw) as Record<string, unknown>
  if (containsPrivateProjectionField(parsed)) throw new Error('public projection contains a private-field key')
  const declaredDigest = typeof parsed.digest === 'string' ? parsed.digest : null
  const digestPayload = { ...parsed }
  delete digestPayload.digest
  const computedDigest = `sha256:${createHash('sha256').update(canonicalJson(digestPayload)).digest('hex')}`
  if (!declaredDigest || declaredDigest !== computedDigest) throw new Error('public projection digest does not match its canonical payload')
  const research = Array.isArray(parsed.research) ? parsed.research as Array<Record<string, unknown>> : []
  const mechanisms = Array.isArray(parsed.mechanisms) ? parsed.mechanisms as Array<Record<string, unknown>> : []
  const findings = Array.isArray(parsed.findings) ? parsed.findings as Array<Record<string, unknown>> : []
  const recordCounts = {
    claims: research.length,
    frozenGates: research.length,
    evidence: research.reduce((count, item) => count + (Array.isArray((item.provenance as Record<string, unknown> | undefined)?.evidence_ids) ? ((item.provenance as Record<string, unknown>).evidence_ids as unknown[]).length : 0), 0),
    decisions: research.filter((item) => (item.provenance as Record<string, unknown> | undefined)?.decision_id).length,
    invariants: mechanisms.filter((item) => item.status === 'operational').length,
    podReuse: 0,
    blockedResearch: research.filter((item) => item.status === 'blocked').length,
    findings: findings.length,
    mechanisms: mechanisms.length,
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
    recordCounts,
  }
}

function frontMatter(text: string): Record<string, string> {
  const match = text.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}
  return Object.fromEntries(match[1].split('\n').map((line) => line.match(/^([a-z_]+):\s*(.*)$/)).filter(Boolean).map((part) => [part![1], part![2]]))
}

function collectOwnerQueue(): OwnerDecision[] {
  const dir = join(WORKSPACE_PATHS.runtimeRoot, '.handoff')
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => ({ entry, stat: statSync(join(dir, entry.name)) }))
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
    .slice(0, 50)
    .flatMap(({ entry, stat }) => {
      const path = join(dir, entry.name)
      const meta = frontMatter(readBounded(path, 48_000))
      const authorityGate = /principal|owner|authority|money|legal|credential/i.test(`${meta.blocked_by ?? ''} ${meta.requires ?? ''} ${meta.decision_owner ?? ''}`)
      const ordinaryWork = /implementation|test|fix|refactor|deploy|review/i.test(entry.name)
      if (!authorityGate || ordinaryWork || meta.status === 'complete') return []
      const item = signal({ id: `owner-${entry.name}`, title: entry.name.replace(/\.md$/, '').replace(/[-_]/g, ' '), state: 'blocked', observedAt: stat.mtime.toISOString(), sourceRef: path, reason: 'Handoff metadata names a people, money, credential, legal, or authority gate.' })
      return [{ ...item, requestedBy: meta.from || 'workspace' }]
    })
    .slice(0, 8)
}

function collectKnowledgeLoop(): ObservatorySignal {
  const link = join(WORKSPACE_PATHS.runtimeRoot, '.meta', 'LATEST_SYNTHESIS')
  if (!existsSync(link)) return signal({ id: 'knowledge-loop', title: 'Knowledge loop', state: 'unknown', sourceRef: link, reason: 'No LATEST_SYNTHESIS pointer is present; last complete cycle cannot be established.' })
  const stat = statSync(link)
  const age = Date.now() - stat.mtimeMs
  return signal({ id: 'knowledge-loop', title: 'Knowledge loop', state: age > 7 * 86_400_000 ? 'degraded' : 'healthy', observedAt: stat.mtime.toISOString(), sourceRef: link, reason: age > 7 * 86_400_000 ? 'Latest synthesis pointer is older than seven days.' : 'Latest synthesis pointer is fresh.', details: { ageHours: Math.round(age / 3_600_000) } })
}

function collectKnowledgeState(projection: PublicProjectionSummary): ObservatorySignal[] {
  const labels = [
    ['claims', 'Claims'], ['frozenGates', 'Frozen gates'], ['evidence', 'Evidence'],
    ['decisions', 'Decisions'], ['invariants', 'Invariants'], ['podReuse', 'Pod reuse'],
  ] as const
  return labels.map(([label, title]) => signal({
    id: `knowledge-${label}`,
    title,
    state: projection.availability === 'present' ? (label === 'podReuse' ? 'unknown' : (label === 'claims' || label === 'frozenGates') && (projection.recordCounts.blockedResearch ?? 0) > 0 ? 'blocked' : 'healthy') : 'unknown',
    sourceRef: projection.sourceRef,
    reason: projection.availability === 'present' ? (label === 'podReuse' ? 'The current public contract does not expose pod-reuse records.' : (label === 'claims' || label === 'frozenGates') && (projection.recordCounts.blockedResearch ?? 0) > 0 ? `${projection.recordCounts[label] ?? 0} projected records; ${projection.recordCounts.blockedResearch} has a frozen blocked transition.` : `${projection.recordCounts[label] ?? 0} projected records.`) : 'Unavailable until the first valid public projection is emitted.',
    details: { count: projection.recordCounts[label] ?? 0 },
  }))
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
  return [signal({ id: 'automation', title: 'Automation health', state: failed.length ? 'degraded' : 'healthy', sourceRef: 'systemd:list-units(state=failed)', reason: failed.length ? `${failed.length} failed unit(s) require engineering attention.` : 'No failed systemd units are reported.', details: { failedUnits: failed.join(', ') || 'none' } })]
}

function collectOperationalPressure(): ObservatorySignal[] {
  const handoffDir = join(WORKSPACE_PATHS.runtimeRoot, '.handoff')
  const activeHandoffs = existsSync(handoffDir) ? readdirSync(handoffDir, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith('.md')).length : 0
  const frontDoors = existsSync(WORKSPACE_PATHS.projectsRoot) ? readdirSync(WORKSPACE_PATHS.projectsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).flatMap((entry) => {
    const path = join(WORKSPACE_PATHS.projectsRoot, entry.name, 'CURRENT_STATE.md')
    return existsSync(path) ? [{ name: entry.name, ageMs: Date.now() - statSync(path).mtimeMs }] : []
  }) : []
  const stale = frontDoors.filter((item) => item.ageMs > 7 * 86_400_000)
  return [
    signal({ id: 'handoff-pressure', title: 'Handoff pressure', state: activeHandoffs > 20 ? 'degraded' : 'healthy', sourceRef: handoffDir, reason: `${activeHandoffs} active top-level handoff(s) indexed; archive and rejected directories are excluded.`, details: { activeHandoffs } }),
    signal({ id: 'front-door-freshness', title: 'Front-door freshness', state: stale.length ? 'degraded' : frontDoors.length ? 'healthy' : 'unknown', sourceRef: `${WORKSPACE_PATHS.projectsRoot}/*/CURRENT_STATE.md`, reason: stale.length ? `${stale.length} project front door(s) are older than seven days.` : frontDoors.length ? `${frontDoors.length} project front door(s) are within seven days.` : 'No project front doors were found.', details: { observed: frontDoors.length, stale: stale.length } }),
  ]
}

function collectRecentChanges(): ObservatorySignal[] {
  const roots = [WORKSPACE_PATHS.projectsRoot, join(WORKSPACE_PATHS.runtimeRoot, '.handoff')]
  const files: Array<{ path: string; mtimeMs: number }> = []
  for (const root of roots) {
    if (!existsSync(root)) continue
    for (const entry of readdirSync(root, { withFileTypes: true }).slice(0, 100)) {
      const path = join(root, entry.name, entry.isDirectory() && root === WORKSPACE_PATHS.projectsRoot ? 'CURRENT_STATE.md' : '')
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
  const publicFallback: PublicProjectionSummary = { ...signal({ id: 'public-projection', title: 'Public projection', state: 'unknown', sourceRef: 'projects/synaplex/knowledge', reason: 'Projection collector failed.' }), availability: 'unknown', contractVersion: null, projectionVersion: null, digest: null, generatedAt: null, recordCounts: {} }
  const [projection, ownerQueue, knowledgeLoop, automation, telemetry, changes] = await Promise.all([
    safe('publicProjection', publicFallback, collectPublicProjection),
    safe('ownerQueue', [], collectOwnerQueue),
    safe('knowledgeLoop', signal({ id: 'knowledge-loop', title: 'Knowledge loop', state: 'unknown', sourceRef: 'runtime/.meta/LATEST_SYNTHESIS', reason: 'Collector failed.' }), collectKnowledgeLoop),
    safe('automation', [signal({ id: 'automation', title: 'Automation health', state: 'unknown', sourceRef: 'systemd', reason: 'Collector failed or timed out.' })], collectAutomation),
    safe('telemetry', [signal({ id: 'telemetry', title: 'Model and eval telemetry', state: 'unknown', sourceRef: WORKSPACE_PATHS.telemetryLog, reason: 'Collector failed.' })], collectTelemetry),
    safe('recentChanges', [], collectRecentChanges),
  ])
  const knowledge = collectKnowledgeState(projection)
  automation.push(...collectOperationalPressure())
  if (projection.availability === 'present' && projection.generatedAt && changes[0] && Date.parse(changes[0].observedAt) > Date.parse(projection.generatedAt)) {
    projection.state = 'degraded'
    projection.reason = 'Private source state is newer than the emitted public projection; projection drift is visible.'
    projection.details = { ...(projection.details ?? {}), newestPrivateSourceAt: changes[0].observedAt }
  }
  const allSignals = [projection, knowledgeLoop, ...knowledge, ...automation, ...telemetry, ...ownerQueue]
  const posture = derivePosture(allSignals)
  const generatedAt = iso()
  const snapshot: ObservatorySnapshot = { schemaVersion: 'command.observatory.v1', generatedAt, expiresAt: iso(Date.now() + SNAPSHOT_TTL_MS), posture: posture.posture, postureReason: posture.reason, publicProjection: projection, ownerQueue, knowledgeLoop, knowledge, automation, modelTelemetry: telemetry, recentChanges: changes, collectorErrors: errors }
  cached = { expires: Date.now() + SNAPSHOT_TTL_MS, snapshot }
  return snapshot
}
