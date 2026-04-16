import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'

import type { Task } from './taskStore'
import { WORKSPACE_PATHS } from './workspacePaths'

const STORE_PATH = WORKSPACE_PATHS.metaStore

export type MetaObservationCategory =
  | 'stuckness'
  | 'mistake'
  | 'surprise'
  | 'success'
  | 'design_pressure'
  | 'better_explanation'
  | 'manual'

export interface MetaObservation {
  id: string
  source: string
  project: string
  category: MetaObservationCategory
  summary: string
  evidence?: string
  recurringKey?: string
  taskId?: string
  sessionId?: string
  createdAt: number
}

interface MetaStoreState {
  observations: MetaObservation[]
}

function ensureStoreDir() {
  mkdirSync(dirname(STORE_PATH), { recursive: true })
}

function loadState(): MetaStoreState {
  ensureStoreDir()
  try {
    const raw = readFileSync(STORE_PATH, 'utf-8')
    const parsed = JSON.parse(raw) as MetaStoreState
    return { observations: parsed.observations || [] }
  } catch {
    return { observations: [] }
  }
}

function saveState(state: MetaStoreState) {
  ensureStoreDir()
  writeFileSync(STORE_PATH, JSON.stringify(state, null, 2))
}

function withState<T>(fn: (state: MetaStoreState) => T): T {
  const state = loadState()
  const result = fn(state)
  saveState(state)
  return result
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function truncate(text: string, limit = 220): string {
  if (text.length <= limit) return text
  return text.slice(0, limit - 3) + '...'
}

export function recordMetaObservation(input: Omit<MetaObservation, 'id' | 'createdAt'>): MetaObservation {
  return withState((state) => {
    const observation: MetaObservation = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    }
    state.observations.push(observation)
    return structuredClone(observation)
  })
}

export function listMetaObservations(): MetaObservation[] {
  return withState((state) =>
    structuredClone(state.observations).sort((a, b) => b.createdAt - a.createdAt)
  )
}

export function recordTaskFailureObservation(task: Task, evidence?: string) {
  const project = task.signals.project || 'general'
  const risk = task.signals.risk || 'low'
  const intent = task.signals.intent || 'unknown'
  return recordMetaObservation({
    source: 'command.task',
    project,
    category: risk === 'high' ? 'mistake' : 'stuckness',
    summary: truncate(`Task failed in ${project} during ${intent} work`),
    evidence: evidence ? truncate(evidence, 1200) : undefined,
    recurringKey: normalize(`${project} ${intent} ${risk} failure`),
    taskId: task.id,
    sessionId: task.sessionId,
  })
}

export function recordTaskSuccessObservation(task: Task, evidence?: string) {
  const project = task.signals.project || 'general'
  const risk = task.signals.risk || 'low'
  if (risk !== 'high' && task.signals.scope !== 'cross-project') {
    return null
  }

  return recordMetaObservation({
    source: 'command.task',
    project,
    category: 'success',
    summary: truncate(`Task succeeded in ${project} under elevated complexity or risk`),
    evidence: evidence ? truncate(evidence, 1200) : undefined,
    recurringKey: normalize(`${project} elevated complexity success`),
    taskId: task.id,
    sessionId: task.sessionId,
  })
}

export function recordReviewObservation(task: Task | undefined, reviewText: string, reviewer: string) {
  const project = task?.signals.project || 'general'
  const intent = task?.signals.intent || 'unknown'
  const firstLine = reviewText.split('\n').find((line) => line.trim()) || 'Adversarial review completed'
  return recordMetaObservation({
    source: `command.review.${reviewer}`,
    project,
    category: 'design_pressure',
    summary: truncate(firstLine),
    evidence: truncate(reviewText, 4000),
    recurringKey: normalize(`${project} ${intent} review pressure`),
    taskId: task?.id,
    sessionId: task?.sessionId,
  })
}

export interface MetaPattern {
  key: string
  project: string
  category: MetaObservationCategory
  count: number
  latestSummary: string
  sampleEvidence: string[]
}

export function buildOfflineSynthesisPrompt(patterns: MetaPattern[]): string {
  const lines = patterns.length > 0
    ? patterns.map((pattern, index) => {
        const evidence = pattern.sampleEvidence.map((sample) => `- ${sample}`).join('\n')
        return `${index + 1}. Project: ${pattern.project}\nCategory: ${pattern.category}\nCount: ${pattern.count}\nPattern: ${pattern.latestSummary}\nEvidence:\n${evidence || '- No attached evidence'}`
      }).join('\n\n')
    : 'No recurring patterns yet.'

  return [
    'Offline meta-learning synthesis task.',
    'Use the recurring observations below to propose better explanations and cleaner design changes.',
    'Do not recommend local band-aids unless they fall out of a deeper explanatory change.',
    'For each recurring pattern, identify:',
    '- the hidden design pressure',
    '- the best explanation of why the system is behaving this way',
    '- the substrate or architecture change that would remove the class of problems',
    '- what should become a server-wide rule versus a repo-local fix',
    '',
    lines,
  ].join('\n')
}

export function synthesizeMetaFindings() {
  const observations = listMetaObservations()
  const buckets = new Map<string, MetaObservation[]>()

  for (const observation of observations) {
    const key = observation.recurringKey || normalize(`${observation.project} ${observation.category} ${observation.summary}`)
    const bucket = buckets.get(key) || []
    bucket.push(observation)
    buckets.set(key, bucket)
  }

  const patterns: MetaPattern[] = Array.from(buckets.entries())
    .map(([key, items]) => ({
      key,
      project: items[0].project,
      category: items[0].category,
      count: items.length,
      latestSummary: items[0].summary,
      sampleEvidence: items
        .map((item) => item.evidence)
        .filter((value): value is string => Boolean(value))
        .slice(0, 3),
    }))
    .sort((a, b) => b.count - a.count)

  const explanationCandidates = patterns.filter((pattern) => pattern.count >= 2)

  return {
    observations,
    patterns,
    explanationCandidates,
    synthesisPrompt: buildOfflineSynthesisPrompt(explanationCandidates),
  }
}
