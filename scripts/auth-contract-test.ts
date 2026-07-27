#!/usr/bin/env tsx
import assert from 'node:assert/strict'
import { readFileSync } from 'fs'
import { sign } from 'jsonwebtoken'
import { NextRequest } from 'next/server'

import { checkPassword, createToken, verifyToken } from '../src/lib/auth'
import { resolveJwtSecret } from '../src/lib/authKey'
import {
  clearLoginFailures,
  loginGlobalThrottleStatus,
  loginClientKey,
  loginClientThrottleStatus,
  loginThrottleStatus,
  recordLoginFailure,
  resetLoginThrottleForTest,
} from '../src/lib/loginThrottle'
import { proxy } from '../src/proxy'

const originalSecret = process.env.JWT_SECRET
const originalPassword = process.env.COMMAND_PASSWORD
const originalOrigin = process.env.COMMAND_ORIGIN

async function main() {
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
  process.env.COMMAND_ORIGIN = 'https://command.synaplex.ai'
  const absentCookie = await proxy(new NextRequest('https://attacker.example/api/health'))
  assert.equal(absentCookie.status, 307)
  assert.equal(absentCookie.headers.get('location'), 'https://command.synaplex.ai/login')
  const foreignIssuer = sign(
    { role: 'owner' },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', issuer: 'foreign.example', audience: 'command-owner' },
  )
  const rejectedForeignIssuer = await proxy(new NextRequest('https://attacker.example/api/health', {
    headers: { cookie: `command_token=${foreignIssuer}` },
  }))
  assert.equal(rejectedForeignIssuer.status, 307)
  assert.equal(rejectedForeignIssuer.headers.get('location'), 'https://command.synaplex.ai/login')
  const acceptedOwner = await proxy(new NextRequest('https://attacker.example/api/health', {
    headers: { cookie: `command_token=${second}` },
  }))
  assert.equal(acceptedOwner.status, 200)
  assert.equal(acceptedOwner.headers.get('x-middleware-next'), '1')
  assert.equal(
    verifyToken(sign({ role: 'admin' }, 'not-the-runtime-secret')),
    false,
    'a token signed by a different secret must fail',
  )
  assert.equal(
    verifyToken(sign({ role: 'owner' }, process.env.JWT_SECRET)),
    false,
    'a same-key token without the Command issuer and audience must fail',
  )
  assert.equal(
    verifyToken(sign(
      { role: 'owner' },
      process.env.JWT_SECRET,
      { algorithm: 'HS512', issuer: 'command.synaplex.ai', audience: 'command-owner' },
    )),
    false,
    'a same-key token using an unapproved algorithm must fail',
  )

  delete process.env.COMMAND_PASSWORD
  assert.equal(checkPassword('anything'), false, 'a missing password must fail closed')
  process.env.COMMAND_PASSWORD = 'contract-password-a9f50c'
  assert.equal(checkPassword('contract-password-a9f50c'), true, 'the exact runtime password must pass')
  assert.equal(checkPassword('contract-password-a9f50d'), false, 'a same-length mismatch must fail')
  assert.equal(checkPassword('short'), false, 'a different-length mismatch must fail')
  assert.equal(checkPassword(undefined), false, 'a malformed JSON password must fail closed')

  resetLoginThrottleForTest()
  const cloudflareHeaders = new Headers({ 'cf-connecting-ip': '203.0.113.8' })
  const clientKey = loginClientKey(cloudflareHeaders)
  assert.equal(clientKey, '203.0.113.8')
  assert.equal(
    loginClientKey(new Headers({
      'cf-connecting-ip': 'not-an-ip',
      'x-forwarded-for': '198.51.100.7',
    })),
    'unattributed',
    'untrusted forwarded headers must not create attacker-selected throttle buckets',
  )
  for (let attempt = 0; attempt < 8; attempt += 1) {
    assert.deepEqual(loginThrottleStatus(clientKey, 1000), { allowed: true })
    recordLoginFailure(clientKey, 1000)
  }
  assert.deepEqual(loginThrottleStatus(clientKey, 1000), {
    allowed: false,
    retryAfterSeconds: 300,
  })
  assert.deepEqual(loginThrottleStatus(clientKey, 301001), { allowed: true })
  recordLoginFailure(clientKey, 400000)
  clearLoginFailures(clientKey)
  assert.deepEqual(loginThrottleStatus(clientKey, 400000), { allowed: true })
  resetLoginThrottleForTest()
  for (let attempt = 0; attempt < 64; attempt += 1) {
    recordLoginFailure(`203.0.113.${attempt}`, 500000)
  }
  assert.deepEqual(loginThrottleStatus('198.51.100.7', 500000), {
    allowed: true,
  }, 'distributed failures must never lock a new client out before credential verification')
  assert.deepEqual(loginGlobalThrottleStatus(500000), {
    allowed: false,
    retryAfterSeconds: 300,
  }, 'distributed invalid credentials must still reach a bounded global ceiling')
  clearLoginFailures('198.51.100.7')
  assert.deepEqual(loginClientThrottleStatus('198.51.100.7', 500000), { allowed: true })
  assert.deepEqual(loginGlobalThrottleStatus(500000), {
    allowed: false,
    retryAfterSeconds: 300,
  }, 'a successful client clear must not reset distributed failure evidence')

  const authRouteSource = readFileSync('src/app/api/auth/route.ts', 'utf8')
  assert.ok(
    authRouteSource.indexOf('if (!checkPassword(password))') < authRouteSource.indexOf('loginGlobalThrottleStatus()'),
    'the distributed ceiling may be consulted only after a credential is known invalid',
  )
  assert.match(authRouteSource, /eventType: 'throttled'/)

  const config = readFileSync('next.config.js', 'utf8')
  assert.doesNotMatch(
    config,
    /JWT_SECRET\s*:/,
    'next.config.js must not expose JWT_SECRET through the build-time env map',
  )
  for (const header of [
    'Content-Security-Policy',
    'Permissions-Policy',
    'Referrer-Policy',
    'Strict-Transport-Security',
    'X-Content-Type-Options',
    'X-Frame-Options',
  ]) {
    assert.ok(config.includes(header), `next.config.js must set ${header}`)
  }
  for (const directive of [
    "default-src 'self'",
    "connect-src 'self'",
    "frame-src 'none'",
    "script-src 'self' 'unsafe-inline'",
  ]) {
    assert.ok(config.includes(directive), `the CSP must constrain ${directive}`)
  }
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
  const productionBuild = readFileSync('scripts/build-production.sh', 'utf8')
  const boundaryScan = readFileSync('scripts/assert-build-credential-boundary.sh', 'utf8')
  assert.ok(packageJson.includes('bash scripts/build-production.sh'), 'production builds must use the credential boundary wrapper')
  assert.ok(productionBuild.includes('rm -f .next/trace'), 'build-only trace output must not ship in releases')
  assert.ok(productionBuild.includes('rm -rf .next/cache'), 'build cache output must not ship in releases')
  assert.ok(productionBuild.includes('JWT_SECRET="$JWT_CANARY"'), 'builds must use a non-secret JWT canary')
  assert.ok(productionBuild.includes('COMMAND_PASSWORD="$PASSWORD_CANARY"'), 'builds must use a non-secret password canary')
  assert.ok(boundaryScan.includes('base64 encoding'), 'the boundary must scan encoded canary values')
  assert.ok(boundaryScan.includes('hex encoding'), 'the boundary must scan encoded canary values')
  assert.ok(
    boundaryScan.includes('assert-artifact-trace-boundary.mjs'),
    'the production build must reject artifact traces that retain project files',
  )
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
  if (originalOrigin === undefined) delete process.env.COMMAND_ORIGIN
  else process.env.COMMAND_ORIGIN = originalOrigin
}

console.log('JWT runtime resolution and fail-closed contracts passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
