#!/usr/bin/env tsx
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { getHealth } from '../src/lib/health'

const health = getHealth()
assert.match(health.sha, /^(?:[0-9a-f]{40}(?:-dirty)?|unknown)$/)
assert.ok(health.uptime === null || typeof health.uptime === 'string')
assert.ok(health.memoryPercent === null || Number.isFinite(health.memoryPercent))
assert.ok(health.diskPercent === null || Number.isFinite(health.diskPercent))
assert.ok(health.containers === null || Array.isArray(health.containers))
assert.ok(health.tunnelActive === null || typeof health.tunnelActive === 'boolean')
assert.ok(health.lastCheck === null || typeof health.lastCheck === 'string')
assert.ok(health.issues.every((issue) => /^[a-z-]+$/.test(issue)))

const source = readFileSync('src/lib/health.ts', 'utf8')
assert.doesNotMatch(source, /\bexecSync\b|\bexec\s*\(/, 'health reads must not invoke a shell')
for (const line of source.split('\n').filter((entry) => entry.includes('runReadCommand(') && !entry.includes('function runReadCommand'))) {
  assert.match(line, /runReadCommand\(\s*['"]\/usr\/bin\//, `health command path must be a fixed literal: ${line.trim()}`)
}

console.log('health collector uses fixed argv reads and preserves unavailable evidence as null')
