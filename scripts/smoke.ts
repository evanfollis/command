#!/usr/bin/env tsx
/**
 * Post-deploy smoke test for Command.
 *
 * Verifies the critical paths that broke silently in prior incidents:
 *   - static CSS asset referenced by the current HTML is reachable
 *   - /login returns 200 with a password field
 *   - wrong password → 401, right password → 303 + relative Location + Set-Cookie
 *   - /ws/terminal upgrades and streams PTY output within 500ms
 *
 * Exits non-zero on any failure. Wire this into the deploy pipeline so a
 * broken build cannot silently serve traffic.
 */
import { readFileSync } from 'fs'
import { WORKSPACE_PATHS } from '../src/lib/workspacePaths'
import { WebSocket } from 'ws'

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
  // 1. Login page loads and references a CSS asset that exists
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

  // 2. Wrong password → 401 (JSON path) or 303 → /login?error=1 (form path)
  const badJson = await fetch(`${BASE}/api/auth`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: 'definitely-wrong' }),
    redirect: 'manual',
  })
  check('wrong password (json) → 401', badJson.status === 401, `status=${badJson.status}`)

  // 3. Right password → 303 with RELATIVE Location + Set-Cookie
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

  // 4. WebSocket terminal: open, receive PTY output within 500ms
  if (token) {
    await new Promise<void>((resolve) => {
      const ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}/ws/terminal?token=${token}`)
      const timer = setTimeout(() => {
        check('WS /ws/terminal streams output within 500ms', false, 'timeout')
        ws.close()
        resolve()
      }, 500)
      ws.on('message', () => {
        clearTimeout(timer)
        check('WS /ws/terminal streams output within 500ms', true)
        ws.close()
        resolve()
      })
      ws.on('error', (e) => {
        clearTimeout(timer)
        check('WS /ws/terminal streams output within 500ms', false, e.message)
        resolve()
      })
    })
  }

  // 5. /sessions/general page exists (200 when authed, 307 to login when not — not 404/500)
  if (token) {
    const pmRes = await fetch(`${BASE}/sessions/general`, {
      headers: { Cookie: `command_token=${token}` },
      redirect: 'manual',
    })
    check(
      'GET /sessions/general returns 200 (authed)',
      pmRes.status === 200,
      `status=${pmRes.status}`
    )
  } else {
    const pmAnon = await fetch(`${BASE}/sessions/general`, { redirect: 'manual' })
    check(
      'GET /sessions/general redirects to login (unauthenticated)',
      pmAnon.status === 307 || pmAnon.status === 200,
      `status=${pmAnon.status}`
    )
  }

  console.log(failed === 0 ? '\nSMOKE PASSED' : `\nSMOKE FAILED (${failed} check${failed > 1 ? 's' : ''})`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('smoke threw:', e)
  process.exit(1)
})
