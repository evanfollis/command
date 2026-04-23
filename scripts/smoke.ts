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
import WebSocket from 'ws'
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

interface WebSocketCheckOpts {
  label: string
  authToken?: string
  rejectUnauthed?: boolean   // expect immediate close/401 with no cookie
  rejectOpen?: boolean       // expect server to close after upgrade (allowlist miss)
  expectSnapshot?: boolean   // expect at least one 'snapshot' frame within 2s
}

async function checkWebSocket(url: string, opts: WebSocketCheckOpts): Promise<void> {
  await new Promise<void>((resolve) => {
    const headers: Record<string, string> = {}
    if (opts.authToken) headers.Cookie = `command_token=${opts.authToken}`
    const ws = new WebSocket(url, { headers, handshakeTimeout: 3000 })

    let done = false
    let opened = false

    const finish = (pass: boolean, detail?: string) => {
      if (done) return
      done = true
      clearTimeout(timeout)
      try { ws.terminate() } catch { /* noop */ }
      check(opts.label, pass, detail)
      resolve()
    }

    const timeout = setTimeout(() => {
      if (opts.expectSnapshot) finish(false, 'no snapshot within 2s')
      else if (opts.rejectUnauthed) finish(true, 'no frame within timeout (ok for auth-reject)')
      else if (opts.rejectOpen) finish(true, 'no frame within timeout (ok for allowlist-reject)')
      else finish(false, 'timeout with no decisive signal')
    }, 2500)

    ws.on('open', () => { opened = true })
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        if (msg.type === 'snapshot') {
          if (opts.expectSnapshot) finish(true, `snapshot bytes=${(msg.text || '').length}`)
          else if (opts.rejectOpen) finish(false, 'server streamed snapshot despite allowlist reject')
        }
      } catch { /* ignore */ }
    })
    ws.on('unexpected-response', (_req, res) => {
      const rejectedStatus = [401, 404]
      if (opts.rejectUnauthed) finish(res.statusCode === 401, `http=${res.statusCode}`)
      else if (opts.rejectOpen) finish(rejectedStatus.includes(res.statusCode ?? 0), `http=${res.statusCode}`)
      else finish(false, `unexpected http=${res.statusCode}`)
    })
    ws.on('error', () => {
      if (opts.rejectUnauthed || opts.rejectOpen) finish(true, 'connect rejected')
    })
    ws.on('close', () => {
      if (opts.rejectOpen && opened) finish(true, 'opened then closed by server')
      else if (opts.rejectUnauthed && !opened) finish(true, 'closed before open')
    })
  })
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

  const healthRes = await fetch(`${BASE}/api/health`, { headers: authHeaders })
  check('GET /api/health → 200', healthRes.ok, `status=${healthRes.status}`)
  const healthBody = await healthRes.json().catch(() => ({}))
  check(
    'health response has sha (40-char hex)',
    typeof healthBody?.sha === 'string' && /^[0-9a-f]{40}$/.test(healthBody.sha),
    `sha="${healthBody?.sha}"`
  )

  // Phase C1 durable attach (read-only streaming). Covers auth gate + allowlist.
  await checkWebSocket(
    `${BASE.replace(/^http/, 'ws')}/api/attach/general/stream`,
    { rejectUnauthed: true, label: 'ws unauthed /api/attach/general/stream → 401/close' }
  )
  await checkWebSocket(
    `${BASE.replace(/^http/, 'ws')}/api/attach/not-in-allowlist/stream`,
    { authToken: token, rejectOpen: true, label: 'ws authed /api/attach/not-in-allowlist/stream → rejected' }
  )
  await checkWebSocket(
    `${BASE.replace(/^http/, 'ws')}/api/attach/general/stream`,
    { authToken: token, expectSnapshot: true, label: 'ws authed /api/attach/general/stream → snapshot frame' }
  )

  // Artifacts inbox (ADR-0028). Auth-gated markdown reader over a narrow
  // code-path-only source allowlist.
  const artifactsUnauth = await fetch(`${BASE}/artifacts`, { redirect: 'manual' })
  check(
    'GET /artifacts unauthed → 307/302 redirect to /login',
    [302, 307].includes(artifactsUnauth.status),
    `status=${artifactsUnauth.status}`
  )

  const artifactsAuth = await fetch(`${BASE}/artifacts`, {
    headers: authHeaders,
    redirect: 'manual',
  })
  check(
    'GET /artifacts authed → 200',
    artifactsAuth.status === 200,
    `status=${artifactsAuth.status}`
  )
  const artifactsBody = await artifactsAuth.text()
  check(
    'artifacts list shows both sources',
    artifactsBody.includes('Research') && artifactsBody.includes('Cross-cutting syntheses')
  )

  const traversal = await fetch(
    `${BASE}/artifacts/research/${encodeURIComponent('..')}/${encodeURIComponent('..')}/etc/passwd`,
    { headers: authHeaders, redirect: 'manual' }
  )
  check(
    'path-traversal attack → 404',
    traversal.status === 404,
    `status=${traversal.status}`
  )

  const wrongExt = await fetch(`${BASE}/artifacts/research/synaplex-scouting/README.html`, {
    headers: authHeaders,
    redirect: 'manual',
  })
  check(
    'non-.md extension → 404',
    wrongExt.status === 404,
    `status=${wrongExt.status}`
  )

  const realDoc = await fetch(`${BASE}/artifacts/research/synaplex-scouting/README.md`, {
    headers: authHeaders,
    redirect: 'manual',
  })
  check(
    'real doc renders → 200',
    realDoc.status === 200,
    `status=${realDoc.status}`
  )
  const realDocBody = await realDoc.text()
  const renderedOk = realDocBody.includes('synaplex scouting') && realDocBody.includes('<h1')
  check(
    'rendered doc contains expected content',
    renderedOk,
    renderedOk ? undefined : 'missing heading or title text'
  )

  console.log(failed === 0 ? '\nSMOKE PASSED' : `\nSMOKE FAILED (${failed} check${failed > 1 ? 's' : ''})`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('smoke threw:', e)
  process.exit(1)
})
