#!/usr/bin/env tsx
import assert from 'node:assert/strict'

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { observeClaudeSessions, parseClaudeSessionState, processAlive } from '../src/lib/claudeSessions'

assert.equal(processAlive(101, () => true), true)
assert.equal(processAlive(102, () => {
  const error = new Error('operation not permitted') as NodeJS.ErrnoException
  error.code = 'EPERM'
  throw error
}), true)
assert.equal(processAlive(103, () => {
  const error = new Error('no such process') as NodeJS.ErrnoException
  error.code = 'ESRCH'
  throw error
}), false)

const valid = {
  pid: 123,
  sessionId: '673fe8c8-0f6e-4f84-b268-7d5c0490a77c',
  cwd: '/opt/workspace/projects/command/',
  startedAt: 1,
  version: '1.0.0',
  kind: 'local',
  bridgeSessionId: 'bridge_id-123',
  ignoredFutureField: 'not projected',
}
assert.deepEqual(parseClaudeSessionState(valid), {
  pid: 123,
  sessionId: valid.sessionId,
  cwd: '/opt/workspace/projects/command',
  startedAt: 1,
  version: '1.0.0',
  kind: 'local',
  bridgeSessionId: 'bridge_id-123',
  bridgeUrl: 'https://claude.ai/code/bridge_id-123',
})
assert.equal(parseClaudeSessionState({ ...valid, pid: '123' }), null)
assert.equal(parseClaudeSessionState({ ...valid, sessionId: '../../escape' }), null)
assert.equal(parseClaudeSessionState({ ...valid, cwd: 'relative/path' }), null)
assert.equal(parseClaudeSessionState({ ...valid, bridgeSessionId: '../escape' }), null)

const root = mkdtempSync(join(tmpdir(), 'command-claude-sessions-'))
try {
  assert.deepEqual(observeClaudeSessions(root), {
    status: 'observed',
    value: [],
    issue: null,
  })
  assert.deepEqual(observeClaudeSessions(root, () => {
    const error = new Error('permission denied') as NodeJS.ErrnoException
    error.code = 'EACCES'
    throw error
  }), {
    status: 'unknown',
    value: [],
    issue: 'claude-sessions-unavailable',
  })
  assert.deepEqual(observeClaudeSessions(join(root, 'missing')), {
    status: 'unknown',
    value: [],
    issue: 'claude-sessions-unavailable',
  })
} finally {
  rmSync(root, { recursive: true, force: true })
}

console.log('Claude session metadata is schema-bounded and EPERM preserves observed liveness')
