#!/usr/bin/env tsx
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = mkdtempSync(join(tmpdir(), 'command-artifacts-'))
const runtimeRoot = join(root, 'runtime')
const researchRoot = join(runtimeRoot, 'research')
process.env.RUNTIME_ROOT = runtimeRoot

mkdirSync(join(researchRoot, 'nested'), { recursive: true })
mkdirSync(join(researchRoot, '.hidden'), { recursive: true })
writeFileSync(join(researchRoot, 'visible.md'), '# Visible\n')
writeFileSync(join(researchRoot, 'nested', 'inside.md'), '---\ntitle: Inside\n---\nBody\n')
writeFileSync(join(researchRoot, '.hidden', 'private.md'), '# Private\n')
writeFileSync(join(root, 'outside.md'), '# Outside\n')
symlinkSync(join(root, 'outside.md'), join(researchRoot, 'escape.md'))

let deep = researchRoot
for (let index = 0; index < 14; index += 1) {
  deep = join(deep, `d${index}`)
  mkdirSync(deep)
}
writeFileSync(join(deep, 'too-deep.md'), '# Too deep\n')

async function main() {
  const { listArtifacts, readArtifact, validateRelativePath } = await import('../src/lib/artifacts')

  const artifacts = listArtifacts('research')
  assert.deepEqual(
    artifacts?.map((item) => item.relativePath).sort(),
    ['nested/inside.md', 'visible.md'],
    'recursive projection must omit hidden, symlinked, and over-depth files',
  )
  assert.equal(readArtifact('research', ['escape.md']), null, 'realpath containment must reject symlink escapes')
  assert.equal(readArtifact('research', ['nested', 'inside.md'])?.title, 'Inside')
  assert.equal(validateRelativePath(['..', 'outside.md']), null)
  assert.equal(validateRelativePath(['visible.txt']), null)
  assert.equal(listArtifacts('unknown'), null)

  console.log('bounded artifact discovery and realpath containment tests passed')
}

main()
  .finally(() => rmSync(root, { recursive: true, force: true }))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
