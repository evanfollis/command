#!/usr/bin/env tsx
/**
 * Static check for banned patterns. Prevents recurrence of bugs we've
 * already paid for. Fails the build (or pre-commit) if violations are found.
 *
 * Banned:
 *   - `new URL(<path>, req.url)` — produces an absolute URL from the internal
 *     origin (localhost:3000 behind cloudflared). Use relative paths in
 *     Location headers instead. Caused the mobile login-loop incident.
 *   - `NextResponse.redirect(new URL(` — same failure mode via the Next helper.
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, extname } from 'path'

const ROOT = join(__dirname, '..', 'src')
const EXTRA_FILES = [join(__dirname, '..', 'server.ts')]
const BANNED: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /new URL\([^,)]+,\s*req\.url\s*\)/,
    reason: 'absolute URL from req.url leaks internal origin behind a proxy; use relative paths',
  },
  {
    pattern: /NextResponse\.redirect\(\s*new URL\([^,)]+,\s*req\.(url|headers)/,
    reason: 'NextResponse.redirect() base URL must not come from req.url/req.headers (leaks internal origin behind proxy); pin the public origin in COMMAND_ORIGIN env var instead',
  },
]

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const s = statSync(p)
    if (s.isDirectory()) out.push(...walk(p))
    else if (['.ts', '.tsx'].includes(extname(name))) out.push(p)
  }
  return out
}

let violations = 0
for (const file of [...walk(ROOT), ...EXTRA_FILES]) {
  const src = readFileSync(file, 'utf8')
  const lines = src.split('\n')
  lines.forEach((line, i) => {
    // Skip this check script itself and any file with an explicit allow marker.
    if (line.includes('allow-banned-pattern')) return
    for (const { pattern, reason } of BANNED) {
      if (pattern.test(line)) {
        console.error(`${file}:${i + 1}: ${reason}\n  ${line.trim()}`)
        violations++
      }
    }
  })
}

if (violations > 0) {
  console.error(`\n${violations} banned-pattern violation${violations > 1 ? 's' : ''}.`)
  process.exit(1)
}
console.log('check-patterns: OK')
