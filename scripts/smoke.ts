#!/usr/bin/env tsx
/** Post-release HTTP smoke for the authenticated, read-only Command observatory. */
import { readFileSync } from 'fs'
import { WORKSPACE_PATHS } from '../src/lib/workspacePaths'

const BASE = process.env.SMOKE_BASE || 'http://localhost:3100'
const PASSWORD = process.env.COMMAND_PASSWORD ||
  readFileSync(WORKSPACE_PATHS.envLocal, 'utf8').match(/COMMAND_PASSWORD=(.*)/)?.[1]?.trim()

if (!PASSWORD) {
  console.error('FAIL: COMMAND_PASSWORD not set and not in .env.local')
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

  const ownerUnauth = await fetch(`${BASE}/`, { redirect: 'manual' })
  check('GET / unauthed redirects to login', [302, 307].includes(ownerUnauth.status), `status=${ownerUnauth.status}`)
  check('unauthenticated response omits private paths', !(await ownerUnauth.text()).includes('/opt/workspace'))

  const cssMatch = loginBody.match(/\/_next\/static\/css\/[^"']+\.css/)
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
  check('login redirect is relative', location === '/' || location.startsWith('/'), `location=${location}`)
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
    check(`GET ${path} remains available`, response.status === 200, `status=${response.status}`)
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
