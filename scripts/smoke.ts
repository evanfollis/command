#!/usr/bin/env tsx
/**
 * Post-deploy smoke test for Command.
 *
 * Verifies the critical paths that broke silently in prior incidents:
 *   - static CSS asset referenced by the current HTML is reachable
 *   - /login returns 200 with a password field
 *   - wrong password → 401, right password → 303 + relative Location + Set-Cookie
 *   - /api/threads round-trip: create → list → fetch transcript → delete
 *   - /sessions/general reachable when authed
 *
 * Exits non-zero on any failure. Wire this into the deploy pipeline so a
 * broken build cannot silently serve traffic.
 */
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
  console.log(`${ok ? '\u2713' : '\u2717'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}

async function main() {
  const loginRes = await fetch(`${BASE}/login`, { redirect: 'manual' })
  const loginBody = await loginRes.text()
  check('GET /login returns 200', loginRes.status === 200, `status=${loginRes.status}`)
  check('login page has password field', loginBody.includes('type="password"'))

  const cssMatch = loginBody.match(/\/_next\/static\/css\/[^"]+\.css/)
  if (cssMatch) {
    const cssRes = await fetch(`${BASE}${cssMatch[0]}`)
    check(`CSS asset reachable (${cssMatch[0].slice(-20)})`, cssRes.status === 200,
      `status=${cssRes.status}`)
  } else {
    check('CSS asset referenced in HTML', false, 'no CSS link found')
  }

  const badJson = await fetch(`${BASE}/api/auth`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: 'definitely-wrong' }),
    redirect: 'manual',
  })
  check('wrong password (json) → 401', badJson.status === 401, `status=${badJson.status}`)

  const goodForm = await fetch(`${BASE}/api/auth`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `password=${encodeURIComponent(PASSWORD!)}`,
    redirect: 'manual',
  })
  check('form login → 303', goodForm.status === 303, `status=${goodForm.status}`)
  const location = goodForm.headers.get('location') || ''
  check('redirect Location is relative', location === '/' || location.startsWith('/'),
    `location="${location}"`)
  check('redirect Location is NOT absolute (no host leak)',
    !location.startsWith('http://') && !location.startsWith('https://'),
    `location="${location}"`)
  const setCookie = goodForm.headers.get('set-cookie') || ''
  const tokenMatch = setCookie.match(/command_token=([^;]+)/)
  check('Set-Cookie has command_token', Boolean(tokenMatch))
  check('cookie is HttpOnly', /HttpOnly/i.test(setCookie))
  check('cookie is Secure', /Secure/i.test(setCookie))
  check('cookie is SameSite=Lax', /SameSite=Lax/i.test(setCookie))
  check('redirect has Cache-Control: no-store',
    goodForm.headers.get('cache-control')?.includes('no-store') === true)

  const token = tokenMatch?.[1]
  if (!token) {
    console.log(`\nSMOKE FAILED (auth failed, cannot continue)`)
    process.exit(1)
  }
  const authHeaders = { Cookie: `command_token=${token}` }

  // Threads round-trip (no real agent turn — just plumbing)
  const createRes = await fetch(`${BASE}/api/threads`, {
    method: 'POST',
    headers: { ...authHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'smoke-test', model: 'codex' }),
  })
  check('POST /api/threads → 200', createRes.ok, `status=${createRes.status}`)
  const createdBody = await createRes.json().catch(() => ({}))
  const threadId = createdBody?.thread?.id as string | undefined
  check('create response has thread.id (uuid)', Boolean(threadId && /^[0-9a-f-]{36}$/.test(threadId)))

  const listRes = await fetch(`${BASE}/api/threads`, { headers: authHeaders })
  const listBody = await listRes.json().catch(() => ({}))
  const threads: Array<{ id: string }> = listBody?.threads || []
  check('GET /api/threads lists created thread', Boolean(threadId && threads.some((t) => t.id === threadId)))

  if (threadId) {
    const msgRes = await fetch(`${BASE}/api/threads/${threadId}/messages`, { headers: authHeaders })
    check('GET /api/threads/:id/messages → 200', msgRes.ok, `status=${msgRes.status}`)

    const delRes = await fetch(`${BASE}/api/threads/${threadId}`, {
      method: 'DELETE',
      headers: authHeaders,
    })
    check('DELETE /api/threads/:id → 200', delRes.ok, `status=${delRes.status}`)
  }

  const pmRes = await fetch(`${BASE}/sessions/general`, {
    headers: authHeaders,
    redirect: 'manual',
  })
  check(
    'GET /sessions/general returns 200 (authed)',
    pmRes.status === 200,
    `status=${pmRes.status}`
  )

  const statusRes = await fetch(`${BASE}/api/project-status`, { headers: authHeaders })
  check('GET /api/project-status → 200', statusRes.ok, `status=${statusRes.status}`)
  const statusBody = await statusRes.json().catch(() => ({}))
  check('project-status returns sessions array', Array.isArray(statusBody?.sessions))

  console.log(failed === 0 ? '\nSMOKE PASSED' : `\nSMOKE FAILED (${failed} check${failed > 1 ? 's' : ''})`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('smoke threw:', e)
  process.exit(1)
})
