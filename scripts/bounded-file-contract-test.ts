#!/usr/bin/env tsx
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { readBoundedUtf8File } from '../src/lib/boundedFile'

const root = mkdtempSync(join(tmpdir(), 'command-bounded-file-'))
try {
  const small = join(root, 'small.txt')
  const large = join(root, 'large.txt')
  const link = join(root, 'link.txt')
  writeFileSync(small, 'bounded evidence\n')
  writeFileSync(large, 'x'.repeat(65))
  symlinkSync(small, link)

  assert.equal(readBoundedUtf8File(small, 64).text, 'bounded evidence\n')
  assert.throws(() => readBoundedUtf8File(large, 64), /exceeds 64 bytes/)
  assert.throws(() => readBoundedUtf8File(link, 64), /ELOOP/)
  assert.throws(() => readBoundedUtf8File(small, 0), /positive safe integer/)
  console.log('bounded no-follow UTF-8 file contract tests passed')
} finally {
  rmSync(root, { recursive: true, force: true })
}
