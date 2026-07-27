#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = '.next/server/app/artifacts'
const manifests = []

function collect(path) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, entry.name)
    if (entry.isDirectory()) collect(child)
    else if (entry.isFile() && entry.name.endsWith('.nft.json')) manifests.push(child)
  }
}

collect(root)
if (manifests.length === 0) throw new Error('artifact route emitted no NFT manifests')

const allowed = (file) => {
  const normalized = file.replaceAll('\\', '/').replace(/^(\.\.\/)+/, '').replace(/^\.\//, '')
  return normalized === 'package.json'
    || normalized.startsWith('node_modules/')
    || normalized.startsWith('chunks/')
    || normalized.startsWith('page/')
    || normalized === 'page_client-reference-manifest.js'
    || normalized === 'react-loadable-manifest.json'
}

for (const manifest of manifests) {
  const parsed = JSON.parse(readFileSync(manifest, 'utf8'))
  if (!Array.isArray(parsed.files)) throw new Error(`${relative('.', manifest)} has no files array`)
  const unexpected = parsed.files.filter((file) => typeof file !== 'string' || !allowed(file))
  if (unexpected.length > 0) {
    throw new Error(`${relative('.', manifest)} retained project files outside the artifact runtime boundary`)
  }
}

console.log(`artifact NFT boundary passed (${manifests.length} manifests)`)
