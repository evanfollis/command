#!/usr/bin/env tsx
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function main() {
  const root = mkdtempSync(join(tmpdir(), 'command-symphony-projection-'))
  const runtimeRoot = join(root, 'runtime')
  const storePath = join(runtimeRoot, 'symphony', 'tasks.json')
  mkdirSync(join(runtimeRoot, 'symphony'), { recursive: true })
  process.env.RUNTIME_ROOT = runtimeRoot

  const { readSymphonyProjection } = await import('../src/lib/symphonyProjection')

  const validTask = {
    id: 'task-1',
    title: 'Verified task',
    description: 'Typed lifecycle evidence',
    targetProject: 'command',
    ownerSession: 'command',
    state: 'done',
    createdAt: 100,
    stateChangedAt: 200,
    completedAt: 200,
    stateHistory: [{ from: null, to: 'done', by: 'test', timestamp: 200 }],
  }

  try {
    rmSync(storePath, { force: true })
    let projection = readSymphonyProjection()
    assert.equal(projection.status, 'unknown')
    assert.equal(projection.issue?.code, 'missing')
    assert.deepEqual(projection.tasks, [])

    writeFileSync(storePath, '{not-json', 'utf8')
    projection = readSymphonyProjection()
    assert.equal(projection.status, 'unknown')
    assert.equal(projection.issue?.code, 'malformed-json')
    assert.deepEqual(projection.tasks, [])

    writeFileSync(storePath, JSON.stringify({ tasks: 'not-an-array' }), 'utf8')
    projection = readSymphonyProjection()
    assert.equal(projection.status, 'unknown')
    assert.equal(projection.issue?.code, 'invalid-schema')
    assert.deepEqual(projection.tasks, [])

    writeFileSync(storePath, JSON.stringify({ tasks: [validTask, { id: 'untrusted' }] }), 'utf8')
    projection = readSymphonyProjection()
    assert.equal(projection.status, 'unknown')
    assert.equal(projection.issue?.invalidTaskCount, 1)
    assert.deepEqual(projection.tasks.map((task) => task.id), ['task-1'])

    writeFileSync(storePath, JSON.stringify({ tasks: [validTask] }), 'utf8')
    projection = readSymphonyProjection()
    assert.equal(projection.status, 'healthy')
    assert.equal(projection.issue, undefined)
    assert.deepEqual(projection.tasks.map((task) => task.id), ['task-1'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }

  console.log('Symphony projection preserves missing, malformed, and partial evidence as typed unknown')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
