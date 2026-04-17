import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'

import { WORKSPACE_PATHS } from './workspacePaths'

export type ThreadModel = 'claude' | 'codex'

export interface ThreadMeta {
  id: string
  title: string
  model: ThreadModel
  created_at: number
  last_activity_at: number
  claude_session_id?: string
  codex_session_id?: string
}

const THREADS_DIR = `${WORKSPACE_PATHS.runtimeRoot}/.threads`

function ensureDir() {
  if (!existsSync(THREADS_DIR)) mkdirSync(THREADS_DIR, { recursive: true })
}

function metaPath(id: string) {
  return join(THREADS_DIR, `${id}.meta.json`)
}

export function listThreads(): ThreadMeta[] {
  ensureDir()
  const files = readdirSync(THREADS_DIR).filter((f) => f.endsWith('.meta.json'))
  const threads: ThreadMeta[] = []
  for (const f of files) {
    try {
      const raw = readFileSync(join(THREADS_DIR, f), 'utf-8')
      threads.push(JSON.parse(raw) as ThreadMeta)
    } catch {
      // skip malformed
    }
  }
  threads.sort((a, b) => b.last_activity_at - a.last_activity_at)
  return threads
}

export function getThread(id: string): ThreadMeta | null {
  ensureDir()
  const p = metaPath(id)
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as ThreadMeta
  } catch {
    return null
  }
}

export function createThread(input: { title: string; model: ThreadModel }): ThreadMeta {
  ensureDir()
  const now = Date.now()
  const meta: ThreadMeta = {
    id: randomUUID(),
    title: input.title.trim() || 'Untitled thread',
    model: input.model,
    created_at: now,
    last_activity_at: now,
  }
  writeFileSync(metaPath(meta.id), JSON.stringify(meta, null, 2))
  return meta
}

export function updateThread(id: string, patch: Partial<ThreadMeta>): ThreadMeta | null {
  const existing = getThread(id)
  if (!existing) return null
  const merged: ThreadMeta = { ...existing, ...patch, id: existing.id }
  writeFileSync(metaPath(id), JSON.stringify(merged, null, 2))
  return merged
}

export function deleteThread(id: string): boolean {
  const p = metaPath(id)
  if (!existsSync(p)) return false
  unlinkSync(p)
  return true
}

export function touchThread(id: string) {
  updateThread(id, { last_activity_at: Date.now() })
}
