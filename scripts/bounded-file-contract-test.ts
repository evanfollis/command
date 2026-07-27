#!/usr/bin/env tsx
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { readBoundedUtf8File, readBoundedUtf8Tail } from '../src/lib/boundedFile'
import { parseContextUsageJsonl } from '../src/lib/contextUsage'

const root = mkdtempSync(join(tmpdir(), 'command-bounded-file-'))
try {
  const small = join(root, 'small.txt')
  const large = join(root, 'large.txt')
  const link = join(root, 'link.txt')
  const directory = join(root, 'directory')
  writeFileSync(small, 'bounded evidence\n')
  writeFileSync(large, 'x'.repeat(65))
  symlinkSync(small, link)
  mkdirSync(directory)

  assert.equal(readBoundedUtf8File(small, 64).text, 'bounded evidence\n')
  assert.throws(() => readBoundedUtf8File(large, 64), /exceeds 64 bytes/)
  assert.throws(() => readBoundedUtf8File(link, 64), /ELOOP/)
  assert.throws(() => readBoundedUtf8File(directory, 64), /not a regular file/)
  assert.throws(() => readBoundedUtf8File(small, 0), /positive safe integer/)
  writeFileSync(large, 'discarded\nsecond\nthird\n')
  assert.equal(readBoundedUtf8Tail(large, 13).text, 'second\nthird\n')
  assert.throws(() => readBoundedUtf8Tail(link, 64), /ELOOP/)
  assert.throws(() => readBoundedUtf8Tail(directory, 64), /not a regular file/)
  assert.deepEqual(parseContextUsageJsonl([
    JSON.stringify({ type: 'user' }),
    JSON.stringify({
      message: {
        model: 'claude-opus',
        usage: {
          input_tokens: 100,
          cache_read_input_tokens: 50,
          cache_creation_input_tokens: 25,
        },
        content: [{ type: 'tool_use' }],
      },
    }),
  ].join('\n'), 'session-1'), {
    available: true,
    model: 'claude-opus',
    contextTokens: 175,
    userTurns: 1,
    assistantTurns: 1,
    toolUses: 1,
    contextWindowSize: 200_000,
    contextPercent: 0.08750000000000001,
    freshness: 'fresh',
    sessionId: 'session-1',
  })
  const contextSource = readFileSync('src/lib/contextUsage.ts', 'utf8')
  assert.doesNotMatch(contextSource, /createReadStream|createInterface/)
  assert.match(contextSource, /readBoundedUtf8Tail/)
  assert.match(contextSource, /MAX_TRANSCRIPT_LINES = 10_000/)
  const boundedSource = readFileSync('src/lib/boundedFile.ts', 'utf8')
  assert.equal(
    boundedSource.match(/source changed during bounded read/g)?.length,
    2,
    'both full and tail reads must reject evidence changed during the read',
  )
  console.log('bounded no-follow UTF-8 file contract tests passed')
} finally {
  rmSync(root, { recursive: true, force: true })
}
