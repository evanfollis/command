#!/usr/bin/env tsx
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { extname, join, relative } from 'path'

const ROOT = join(__dirname, '..')
const APP = join(ROOT, 'src', 'app')
const errors: string[] = []

function walk(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) files.push(...walk(path))
    else files.push(path)
  }
  return files
}

const forbiddenSources = [
  'src/app/operator-tools/page.tsx',
  'src/app/attach/[name]/page.tsx',
  'src/app/sessions/[name]/page.tsx',
  'src/app/api/client-report/route.ts',
  'src/app/api/send/route.ts',
  'src/app/api/sessions/route.ts',
  'src/app/api/sessions/[name]/route.ts',
  'src/app/api/review/route.ts',
  'src/app/api/threads/route.ts',
  'src/app/api/threads/[id]/route.ts',
  'src/app/api/threads/[id]/messages/route.ts',
  'src/app/api/executive/capabilities/route.ts',
  'src/app/api/executive/ensure/route.ts',
  'src/app/api/executive/recover/route.ts',
  'src/app/api/executive/thread/route.ts',
  'src/lib/attachLock.ts',
  'src/lib/attachStream.ts',
  'src/lib/threadConversation.ts',
  'src/lib/threads.ts',
]

for (const file of forbiddenSources) {
  if (existsSync(join(ROOT, file))) errors.push(`legacy route source returned: ${file}`)
}

const allowedRouteSources = new Set([
  'src/app/page.tsx',
  'src/app/login/page.tsx',
  'src/app/lineage/page.tsx',
  'src/app/artifacts/page.tsx',
  'src/app/artifacts/[source]/[...path]/page.tsx',
  'src/app/symphony/page.tsx',
  'src/app/api/auth/route.ts',
  'src/app/api/context-usage/[name]/route.ts',
  'src/app/api/evals/summary/route.ts',
  'src/app/api/health/route.ts',
  'src/app/api/metrics/route.ts',
  'src/app/api/metrics/summary/route.ts',
  'src/app/api/project-status/route.ts',
  'src/app/api/symphony/route.ts',
  'src/app/api/symphony/[id]/route.ts',
])

const actualRouteSources = walk(APP)
  .map((file) => relative(ROOT, file))
  .filter((file) => file.endsWith('/page.tsx') || file.endsWith('/route.ts'))

for (const file of actualRouteSources) {
  if (!allowedRouteSources.has(file)) errors.push(`route is outside the product allowlist: ${file}`)
}
for (const file of allowedRouteSources) {
  if (!actualRouteSources.includes(file)) errors.push(`documented route source is missing: ${file}`)
}

const webFiles = [
  ...walk(APP),
  ...walk(join(ROOT, 'src', 'components')),
  join(ROOT, 'server.ts'),
].filter((file) => ['.ts', '.tsx'].includes(extname(file)))

const forbiddenWebPatterns: Array<[RegExp, string]> = [
  [/['"`]\/operator-tools(?:[/'"`]|$)/, 'operator-tools link'],
  [/['"`]\/attach(?:[/'"`]|$)/, 'attach page link'],
  [/['"`]\/sessions(?:[/'"`]|$)/, 'session page link'],
  [/['"`]\/api\/(?:attach|send|sessions|review|threads|executive|client-report)(?:[/'"`]|$)/, 'legacy API reference'],
  [/WebSocketServer|new WebSocket\(/, 'interactive WebSocket runtime'],
  [/attachLock/, 'retired attach-lock import'],
  [/\bsendKeys\b|\bsendNamedKeys\b/, 'tmux mutation import'],
]

for (const file of webFiles) {
  const source = readFileSync(file, 'utf8')
  for (const [pattern, label] of forbiddenWebPatterns) {
    if (pattern.test(source)) errors.push(`${relative(ROOT, file)} contains ${label}`)
  }
}

for (const file of ['src/app/api/symphony/route.ts', 'src/app/api/symphony/[id]/route.ts']) {
  const source = readFileSync(join(ROOT, file), 'utf8')
  if (/export\s+async\s+function\s+(?:POST|PUT|PATCH|DELETE)\b/.test(source)) {
    errors.push(`${file} exports a mutation method`)
  }
}

for (const file of actualRouteSources.filter((file) => file.includes('/api/') && file !== 'src/app/api/auth/route.ts')) {
  const source = readFileSync(join(ROOT, file), 'utf8')
  const methods = [...source.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].map((match) => match[1])
  if (methods.length !== 1 || methods[0] !== 'GET') {
    errors.push(`${file} must export GET only (found: ${methods.join(', ') || 'none'})`)
  }
}

const authSource = readFileSync(join(ROOT, 'src/app/api/auth/route.ts'), 'utf8')
const authMethods = [...authSource.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].map((match) => match[1]).sort()
if (authMethods.join(',') !== 'DELETE,POST') errors.push(`auth route may export only POST and DELETE (found: ${authMethods.join(', ')})`)

const packageJson = readFileSync(join(ROOT, 'package.json'), 'utf8')
for (const dependency of ['@xterm/xterm', '@xterm/addon-fit', '@xterm/addon-web-links', 'node-pty', 'ws', '@types/ws']) {
  if (packageJson.includes(`"${dependency}"`)) errors.push(`legacy runtime dependency remains: ${dependency}`)
}

if (errors.length) {
  for (const error of errors) console.error(`FAIL: ${error}`)
  process.exit(1)
}

console.log(`product-boundary-test: OK (${webFiles.length} web source files audited)`)
