import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'fs'
import { join, relative, sep } from 'path'

export interface ArtifactEntry {
  relativePath: string
  title: string
  mtime: number
  sizeBytes: number
}

export interface ArtifactDoc {
  source: string
  relativePath: string
  absolutePath: string
  title: string
  mtime: number
  frontmatter: Record<string, string>
  content: string
}

interface SourceDef {
  id: string
  label: string
  description: string
  root: string
  mode: 'recursive' | 'flat-pattern'
  pattern?: RegExp
}

const SOURCES: SourceDef[] = [
  {
    id: 'research',
    label: 'Research',
    description: 'Primary-source research artifacts produced for workspace projects.',
    root: '/opt/workspace/runtime/research',
    mode: 'recursive',
  },
  {
    id: 'syntheses',
    label: 'Cross-cutting syntheses',
    description: 'Twice-daily cross-project synthesis passes from the reflection loop.',
    root: '/opt/workspace/runtime/.meta',
    mode: 'flat-pattern',
    pattern: /^cross-cutting-[0-9T:\-Z.]+\.md$/,
  },
]

export function listSources(): Array<{ id: string; label: string; description: string }> {
  return SOURCES.map((s) => ({ id: s.id, label: s.label, description: s.description }))
}

function findSource(id: string): SourceDef | null {
  return SOURCES.find((s) => s.id === id) ?? null
}

function segmentIsSafe(segment: string): boolean {
  if (!segment) return false
  if (segment === '.' || segment === '..') return false
  if (segment.includes('\0')) return false
  if (segment.includes('/') || segment.includes('\\')) return false
  if (segment.startsWith('-')) return false
  return true
}

export function validateRelativePath(segments: string[]): string | null {
  if (!segments.length) return null
  if (!segments.every(segmentIsSafe)) return null
  const last = segments[segments.length - 1]
  if (!last.endsWith('.md')) return null
  return segments.join('/')
}

function resolveSafe(sourceRoot: string, relativePath: string): string | null {
  const rootReal = realpathSync(sourceRoot)
  const candidate = join(rootReal, relativePath)
  let resolved: string
  try {
    resolved = realpathSync(candidate)
  } catch {
    return null
  }
  if (resolved !== rootReal && !resolved.startsWith(rootReal + sep)) {
    return null
  }
  return resolved
}

function walkMarkdown(root: string, current: string, out: ArtifactEntry[]): void {
  let entries: string[] = []
  try {
    entries = readdirSync(current)
  } catch {
    return
  }
  for (const name of entries) {
    if (name.startsWith('.')) continue
    const abs = join(current, name)
    let stat
    try {
      stat = statSync(abs)
    } catch {
      continue
    }
    if (stat.isDirectory()) {
      walkMarkdown(root, abs, out)
    } else if (stat.isFile() && name.endsWith('.md')) {
      const rel = relative(root, abs)
      out.push({
        relativePath: rel.split(sep).join('/'),
        title: deriveTitleFromPath(rel),
        mtime: stat.mtimeMs,
        sizeBytes: stat.size,
      })
    }
  }
}

function listFlat(source: SourceDef): ArtifactEntry[] {
  const out: ArtifactEntry[] = []
  let entries: string[] = []
  try {
    entries = readdirSync(source.root)
  } catch {
    return out
  }
  for (const name of entries) {
    if (!source.pattern || !source.pattern.test(name)) continue
    const abs = join(source.root, name)
    let stat
    try {
      stat = statSync(abs)
    } catch {
      continue
    }
    if (!stat.isFile()) continue
    out.push({
      relativePath: name,
      title: deriveTitleFromPath(name),
      mtime: stat.mtimeMs,
      sizeBytes: stat.size,
    })
  }
  return out
}

function deriveTitleFromPath(rel: string): string {
  const base = rel.split(/[\\/]/).pop() || rel
  return base.replace(/\.md$/, '')
}

export function listArtifacts(sourceId: string): ArtifactEntry[] | null {
  const source = findSource(sourceId)
  if (!source) return null
  if (!existsSync(source.root)) return []
  const out: ArtifactEntry[] = []
  if (source.mode === 'recursive') {
    walkMarkdown(source.root, source.root, out)
  } else {
    out.push(...listFlat(source))
  }
  return out.sort((a, b) => b.mtime - a.mtime)
}

function parseFrontmatter(raw: string): { frontmatter: Record<string, string>; body: string } {
  if (!raw.startsWith('---\n') && !raw.startsWith('---\r\n')) {
    return { frontmatter: {}, body: raw }
  }
  const rest = raw.replace(/^---\r?\n/, '')
  const closeIdx = rest.search(/\r?\n---\r?\n/)
  if (closeIdx === -1) return { frontmatter: {}, body: raw }
  const block = rest.slice(0, closeIdx)
  const body = rest.slice(closeIdx).replace(/^\r?\n---\r?\n/, '')
  const frontmatter: Record<string, string> = {}
  for (const line of block.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_.\- ]+):\s*(.*)$/)
    if (!match) continue
    const key = match[1].trim()
    let value = match[2].trim()
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
    frontmatter[key] = value
  }
  return { frontmatter, body }
}

export function readArtifact(sourceId: string, segments: string[]): ArtifactDoc | null {
  const source = findSource(sourceId)
  if (!source) return null
  const rel = validateRelativePath(segments)
  if (!rel) return null
  if (source.mode === 'flat-pattern') {
    if (segments.length !== 1) return null
    if (!source.pattern || !source.pattern.test(segments[0])) return null
  }
  if (!existsSync(source.root)) return null
  const absolute = resolveSafe(source.root, rel)
  if (!absolute) return null
  let stat
  try {
    stat = statSync(absolute)
  } catch {
    return null
  }
  if (!stat.isFile()) return null
  let raw: string
  try {
    raw = readFileSync(absolute, 'utf-8')
  } catch {
    return null
  }
  const { frontmatter, body } = parseFrontmatter(raw)
  const title = frontmatter.title || deriveTitleFromPath(rel)
  return {
    source: sourceId,
    relativePath: rel,
    absolutePath: absolute,
    title,
    mtime: stat.mtimeMs,
    frontmatter,
    content: body,
  }
}

export function describeSource(id: string): { id: string; label: string; description: string } | null {
  const source = findSource(id)
  if (!source) return null
  return { id: source.id, label: source.label, description: source.description }
}
