#!/usr/bin/env tsx
/**
 * Deploy precondition: working tree must be clean.
 *
 * Why: `npm run build` writes `dist/.version` from `git rev-parse HEAD`.
 * If the deploy runs before the commit lands, the deployed binary
 * reports a stale SHA via `/api/health` until the next rebuild. The
 * "pushed is not deployed" rule in the workspace quality standard
 * extends to "deployed at HEAD" — running with uncommitted code
 * silently violates that contract.
 *
 * Failing loudly here is cheap; debugging a stale `sha` field downstream
 * is not.
 */
import { execSync } from 'child_process'

try {
  const status = execSync('git status --porcelain', { encoding: 'utf-8' }).trim()
  if (status) {
    console.error('ERROR: Commit your changes before deploying. Working tree is dirty.')
    console.error('')
    console.error(status)
    process.exit(1)
  }
  console.log('check-clean-tree: OK')
} catch (e) {
  console.error('check-clean-tree: git status failed:', e instanceof Error ? e.message : e)
  process.exit(1)
}
