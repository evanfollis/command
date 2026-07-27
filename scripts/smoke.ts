#!/usr/bin/env tsx
/** Post-release HTTP smoke for the authenticated, read-only Command observatory. */
import { readFileSync } from 'fs'
import { WORKSPACE_PATHS } from '../src/lib/workspacePaths'

const BASE = process.env.SMOKE_BASE || 'http://localhost:3100'
const ALLOW_LEGACY_EVAL_ACL_FAILURE = process.env.SMOKE_ALLOW_LEGACY_EVAL_ACL_FAILURE === '1'
const ALLOW_PRE_CSP_RELEASE = process.env.SMOKE_ALLOW_PRE_CSP_RELEASE === '1'
const RUNTIME_ENV = readFileSync(WORKSPACE_PATHS.envLocal, 'utf8')
const COMMAND_ORIGIN = process.env.COMMAND_ORIGIN
  || RUNTIME_ENV.match(/^COMMAND_ORIGIN=(.*)$/m)?.[1]?.trim()
const PASSWORD = process.env.COMMAND_PASSWORD
  || RUNTIME_ENV.match(/^COMMAND_PASSWORD=(.*)$/m)?.[1]?.trim()

if (!PASSWORD || !COMMAND_ORIGIN) {
  console.error('FAIL: COMMAND_PASSWORD and COMMAND_ORIGIN must be set at runtime or in .env.local')
  process.exit(1)
}

let failed = 0
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}

async function main() {
  const loginRes = await fetch(`${BASE}/login`, { redirect: 'manual' })
  const loginBody = await loginRes.text()
  check('GET /login returns 200', loginRes.status === 200, `status=${loginRes.status}`)
  check('login page has password field', loginBody.includes('type="password"'))
  if (!ALLOW_PRE_CSP_RELEASE) {
    const csp = loginRes.headers.get('content-security-policy') || ''
    check('login denies framing', loginRes.headers.get('x-frame-options') === 'DENY')
    check('login disables MIME sniffing', loginRes.headers.get('x-content-type-options') === 'nosniff')
    check('login emits a restrictive browser capability policy', loginRes.headers.get('permissions-policy')?.includes('camera=()') === true)
    check('login constrains script and connection origins', csp.includes("default-src 'self'") && csp.includes("connect-src 'self'") && csp.includes("frame-src 'none'"))
  }

  const authRequiredPaths = [
    '/', '/lineage', '/artifacts', '/artifacts/eval/example.md', '/symphony',
    '/api/health', '/api/metrics', '/api/metrics/summary',
    '/api/evals/summary', '/api/project-status',
    '/api/context-usage/general', '/api/symphony', '/api/symphony/example',
  ]
  for (const path of authRequiredPaths) {
    const response = await fetch(`${BASE}${path}`, { redirect: 'manual' })
    const location = response.headers.get('location')
    check(
      `GET ${path} rejects an unauthenticated request`,
      [302, 307].includes(response.status) && location === `${COMMAND_ORIGIN}/login`,
      `status=${response.status} location=${location}`,
    )
    check(
      `GET ${path} unauthenticated response omits private paths`,
      !(await response.text()).includes('/opt/workspace'),
    )
  }

  const cssMatch = loginBody.match(/\/_next\/static\/(?:css|chunks)\/[^"']+\.css/)
  if (cssMatch) {
    const cssRes = await fetch(`${BASE}${cssMatch[0]}`)
    check('login CSS asset is reachable', cssRes.status === 200, `status=${cssRes.status}`)
  } else {
    check('login references a CSS asset', false)
  }

  const badAuth = await fetch(`${BASE}/api/auth`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: 'definitely-wrong' }),
    redirect: 'manual',
  })
  check('wrong password returns 401', badAuth.status === 401, `status=${badAuth.status}`)

  const goodAuth = await fetch(`${BASE}/api/auth`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `password=${encodeURIComponent(PASSWORD!)}`,
    redirect: 'manual',
  })
  check('form login returns 303', goodAuth.status === 303, `status=${goodAuth.status}`)
  const location = goodAuth.headers.get('location') || ''
  check('login redirect is the exact relative owner root', location === '/', `location=${location}`)
  const cookie = goodAuth.headers.get('set-cookie') || ''
  const token = cookie.match(/command_token=([^;]+)/)?.[1]
  check('auth cookie is HttpOnly, Secure, SameSite=Lax', Boolean(token && /HttpOnly/i.test(cookie) && /Secure/i.test(cookie) && /SameSite=Lax/i.test(cookie)))
  if (!token) throw new Error('authenticated checks require command_token')
  const authHeaders = { Cookie: `command_token=${token}` }

  const homeRes = await fetch(`${BASE}/`, { headers: authHeaders })
  const homeHtml = await homeRes.text()
  check('authenticated observatory returns 200', homeRes.status === 200, `status=${homeRes.status}`)
  check('home identifies the owner observatory', homeHtml.includes('What changed, what is stuck'))
  check('home omits legacy operator navigation', !/Operator tools|Executive recovery attach|Live pane/.test(homeHtml))

  const assets = [...new Set(homeHtml.match(/\/_next\/static\/[^"']+?\.(?:js|css)/g) || [])]
  const broken: string[] = []
  for (const asset of assets) {
    const response = await fetch(`${BASE}${asset}`, { headers: authHeaders })
    if (response.status !== 200) broken.push(`${asset} -> ${response.status}`)
  }
  check(`all authenticated shell assets resolve (n=${assets.length})`, assets.length > 0 && broken.length === 0, broken.join(', ') || undefined)

  for (const [path, marker] of [
    ['/lineage', 'Evidence and artifact lineage'],
    ['/artifacts', 'Artifacts'],
    ['/symphony', 'Symphony closure'],
  ] as const) {
    const response = await fetch(`${BASE}${path}`, { headers: authHeaders })
    const body = await response.text()
    check(`GET ${path} is authenticated read-only drilldown`, response.status === 200 && body.includes(marker), `status=${response.status}`)
  }

  for (const path of ['/api/health', '/api/metrics', '/api/metrics/summary', '/api/evals/summary', '/api/symphony']) {
    const response = await fetch(`${BASE}${path}`, { headers: authHeaders })
    const expectedLegacyFailure = ALLOW_LEGACY_EVAL_ACL_FAILURE
      && path === '/api/evals/summary'
      && response.status === 500
    check(
      `GET ${path} remains available`,
      response.status === 200 || expectedLegacyFailure,
      expectedLegacyFailure ? 'known immutable predecessor ACL incompatibility; provenance remains closed' : `status=${response.status}`,
    )
  }

  const removedPaths = [
    '/operator-tools', '/attach/general', '/sessions/general',
    '/api/client-report', '/api/send', '/api/sessions', '/api/sessions/general', '/api/review',
    '/api/threads', '/api/threads/example', '/api/threads/example/messages',
    '/api/executive/capabilities', '/api/executive/ensure', '/api/executive/recover', '/api/executive/thread',
    '/api/attach/general/stream', '/api/attach/general/send', '/api/attach/general/take-write', '/api/attach/general/decline-transfer',
  ]
  for (const path of removedPaths) {
    const response = await fetch(`${BASE}${path}`, { headers: authHeaders, redirect: 'manual' })
    check(`legacy surface ${path} is absent`, response.status === 404, `status=${response.status}`)
  }

  for (const [method, path] of [['POST', '/api/symphony'], ['PATCH', '/api/symphony/example']] as const) {
    const response = await fetch(`${BASE}${path}`, {
      method,
      headers: { ...authHeaders, 'content-type': 'application/json' },
      body: '{}',
      redirect: 'manual',
    })
    check(`${method} ${path} cannot mutate lifecycle state`, [404, 405].includes(response.status), `status=${response.status}`)
  }

  const health = await (await fetch(`${BASE}/api/health`, { headers: authHeaders })).json()
  check('health identifies a committed release SHA', typeof health?.sha === 'string' && /^[0-9a-f]{40}$/.test(health.sha), `sha=${health?.sha}`)

  console.log(failed === 0 ? '\nSMOKE PASSED' : `\nSMOKE FAILED (${failed})`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error('smoke threw:', error)
  process.exit(1)
})
