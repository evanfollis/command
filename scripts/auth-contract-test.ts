#!/usr/bin/env tsx
import assert from 'node:assert/strict'
import { readFileSync } from 'fs'
import { sign } from 'jsonwebtoken'

import { checkPassword, createToken, verifyToken } from '../src/lib/auth'
import { resolveJwtSecret } from '../src/lib/authKey'

const originalSecret = process.env.JWT_SECRET
const originalPassword = process.env.COMMAND_PASSWORD

try {
  delete process.env.JWT_SECRET
  assert.throws(
    () => resolveJwtSecret(),
    /JWT_SECRET is required/,
    'missing JWT_SECRET must fail closed in every environment',
  )
  assert.throws(
    () => createToken(),
    /JWT_SECRET is required/,
    'token signing must not have a fallback secret',
  )

  process.env.JWT_SECRET = 'contract-secret-one-7e0b18'
  const first = createToken()
  assert.equal(verifyToken(first), true, 'a token must verify with the current runtime secret')

  process.env.JWT_SECRET = 'contract-secret-two-b91a2d'
  assert.equal(
    verifyToken(first),
    false,
    'verification must resolve the runtime secret per call rather than retaining build/module state',
  )
  const second = createToken()
  assert.equal(verifyToken(second), true, 'signing must use the rotated runtime secret')
  assert.equal(
    verifyToken(sign({ role: 'admin' }, 'not-the-runtime-secret')),
    false,
    'a token signed by a different secret must fail',
  )

  delete process.env.COMMAND_PASSWORD
  assert.equal(checkPassword('anything'), false, 'a missing password must fail closed')
  process.env.COMMAND_PASSWORD = 'contract-password-a9f50c'
  assert.equal(checkPassword('contract-password-a9f50c'), true, 'the exact runtime password must pass')
  assert.equal(checkPassword('contract-password-a9f50d'), false, 'a same-length mismatch must fail')
  assert.equal(checkPassword('short'), false, 'a different-length mismatch must fail')
  assert.equal(checkPassword(undefined), false, 'a malformed JSON password must fail closed')

  const config = readFileSync('next.config.js', 'utf8')
  assert.doesNotMatch(
    config,
    /JWT_SECRET\s*:/,
    'next.config.js must not expose JWT_SECRET through the build-time env map',
  )
  for (const path of ['src/lib/auth.ts', 'src/lib/jwt.ts', 'src/lib/authKey.ts', 'src/proxy.ts']) {
    assert.doesNotMatch(
      readFileSync(path, 'utf8'),
      /command-jwt-secret-change-in-production/,
      `${path} must not retain the forgeable historical fallback`,
    )
  }
  const authRoute = readFileSync('src/app/api/auth/route.ts', 'utf8')
  assert.match(
    authRoute,
    /typeof password !== 'string'/,
    'the login route must reject malformed JSON and non-string passwords before comparison or telemetry',
  )
  assert.ok(
    authRoute.includes("return NextResponse.json({ error: 'Malformed request' }, { status: 400 })"),
    'the login route must return a bounded client error for malformed request bodies',
  )
  const packageJson = readFileSync('package.json', 'utf8')
  const boundaryScan = readFileSync('scripts/assert-build-credential-boundary.sh', 'utf8')
  assert.ok(packageJson.includes('rm -f .next/trace'), 'build-only trace output must not ship in releases')
  assert.ok(packageJson.includes('rm -rf .next/cache'), 'build cache output must not ship in releases')
  assert.doesNotMatch(
    boundaryScan,
    /--exclude(?:-dir)?=/,
    'secret scanning must not exempt generated files or directories',
  )
} finally {
  if (originalSecret === undefined) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = originalSecret
  if (originalPassword === undefined) delete process.env.COMMAND_PASSWORD
  else process.env.COMMAND_PASSWORD = originalPassword
}

console.log('JWT runtime resolution and fail-closed contracts passed')
