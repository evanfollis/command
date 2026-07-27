#!/usr/bin/env tsx
import assert from 'node:assert/strict'

import { processAlive } from '../src/lib/claudeSessions'

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

console.log('dedicated identity treats EPERM as observed-alive without signal authority')
