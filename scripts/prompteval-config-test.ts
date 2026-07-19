#!/usr/bin/env tsx
import assert from 'node:assert/strict'
import { readFileSync } from 'fs'

const adapter = readFileSync('scripts/prompteval-adapters/adapter_llm.py', 'utf8')
const spec = JSON.parse(readFileSync('.prompteval/codex-task-prompt/spec.json', 'utf8')) as { executor?: { timeout?: number } }
const callTimeouts = [...adapter.matchAll(/run_with_fallback\([\s\S]*?timeout=(\d+),/g)].map((match) => Number(match[1]))
const renderTimeout = Number(adapter.match(/subprocess\.run\([\s\S]*?timeout=(\d+),/m)?.[1])

assert.ok(callTimeouts.length >= 2, 'adapter must expose both prompt-call timeout sites')
assert.ok(callTimeouts.every((value) => Number.isInteger(value) && value > 0), 'prompt-call timeouts must be positive integers')
assert.ok(Number.isInteger(renderTimeout) && renderTimeout > 0, 'render timeout must be a positive integer')

// A capacity failure can consume the primary timeout before the sibling provider
// starts. The command executor envelope must leave time for render + both calls.
const requiredEnvelope = renderTimeout + Math.max(...callTimeouts) * 2 + 20
assert.ok(Number(spec.executor?.timeout) >= requiredEnvelope, `codex-task executor timeout ${spec.executor?.timeout} cannot contain render + primary + fallback (${requiredEnvelope}s)`)

console.log(`prompteval fallback timeout envelope passed (${spec.executor?.timeout}s >= ${requiredEnvelope}s)`)
