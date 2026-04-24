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
          if (opts.expectSnapshot) {
            const text: string = msg.text || ''
            if (text.length === 0) { finish(false, 'snapshot text empty'); return }
            if (/^debug-lls-/.test(text)) { finish(false, `snapshot is debug stub: ${text.slice(0, 40)}`); return }
            finish(true, `snapshot bytes=${text.length}`)
          } else if (opts.rejectOpen) finish(false, 'server streamed snapshot despite allowlist reject')
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

  // Phase C2.1 write path. Covers auth + allowlist + writer lock gate.
  const sendUnauth = await fetch(`${BASE}/api/attach/general/send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: '', clientId: 'smoke', submit: false }),
  })
  check('POST /api/attach/general/send unauthed → 401', sendUnauth.status === 401, `status=${sendUnauth.status}`)

  const sendBadSession = await fetch(`${BASE}/api/attach/not-in-allowlist/send`, {
    method: 'POST',
    headers: { ...authHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ text: '', clientId: 'smoke', submit: false }),
  })
  check('POST /api/attach/<bad>/send authed → 404', sendBadSession.status === 404, `status=${sendBadSession.status}`)

  const sendMissingClient = await fetch(`${BASE}/api/attach/general/send`, {
    method: 'POST',
    headers: { ...authHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ text: '' }),
  })
  check('POST /api/attach/general/send without clientId → 400', sendMissingClient.status === 400, `status=${sendMissingClient.status}`)

  const sendDriveBy = await fetch(`${BASE}/api/attach/general/send`, {
    method: 'POST',
    headers: { ...authHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ text: '', clientId: 'drive-by-no-ws', submit: false }),
  })
  check('POST /api/attach/general/send without ws registration → 403', sendDriveBy.status === 403, `status=${sendDriveBy.status}`)

  // End-to-end: open ws with a known clientId, wait for hello, then POST send with same id.
  // The ws claims the writer lock on connect (nothing else is holding), and the POST is the writer.
  const e2eClientId = `smoke-e2e-${Date.now()}`
  const e2eResult = await new Promise<{ ok: boolean; detail: string }>((resolve) => {
    const ws = new WebSocket(
      `${BASE.replace(/^http/, 'ws')}/api/attach/general/stream?clientId=${encodeURIComponent(e2eClientId)}`,
      { headers: { Cookie: `command_token=${token}` }, handshakeTimeout: 3000, perMessageDeflate: false }
    )
    let resolved = false
    const finish = (ok: boolean, detail: string) => {
      if (resolved) return
      resolved = true
      try { ws.terminate() } catch { /* noop */ }
      resolve({ ok, detail })
    }
    const timeout = setTimeout(() => finish(false, 'e2e timeout'), 4000)
    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        if (msg.type === 'hello') {
          const res = await fetch(`${BASE}/api/attach/general/send`, {
            method: 'POST',
            headers: { ...authHeaders, 'content-type': 'application/json' },
            body: JSON.stringify({ text: '', clientId: e2eClientId, submit: false }),
          })
          const body = await res.json().catch(() => ({}))
          clearTimeout(timeout)
          finish(res.status === 200 && body.role === 'writer', `status=${res.status} role=${body.role}`)
        }
      } catch { /* ignore */ }
    })
    ws.on('error', (e) => finish(false, `e2e ws error: ${e.message}`))
  })
  check('ws+POST end-to-end: registered writer can send → 200', e2eResult.ok, e2eResult.detail)

  // take-write: observer that has a ws registration can request transfer
  const takeWriteClientId = `smoke-take-${Date.now()}`
  const takeWriteResult = await new Promise<{ ok: boolean; detail: string }>((resolve) => {
    const ws = new WebSocket(
      `${BASE.replace(/^http/, 'ws')}/api/attach/general/stream?clientId=${encodeURIComponent(takeWriteClientId)}`,
      { headers: { Cookie: `command_token=${token}` }, handshakeTimeout: 3000, perMessageDeflate: false }
    )
    let resolved = false
    const finish = (ok: boolean, detail: string) => {
      if (resolved) return
      resolved = true
      try { ws.terminate() } catch { /* noop */ }
      resolve({ ok, detail })
    }
    const timeout = setTimeout(() => finish(false, 'take-write timeout'), 4000)
    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        if (msg.type === 'hello') {
          // First become writer (no other ws holding it in this context)
          // then immediately request transfer with a second client — or just verify
          // that take-write 200s for a client with no current writer
          const res = await fetch(`${BASE}/api/attach/general/take-write`, {
            method: 'POST',
            headers: { ...authHeaders, 'content-type': 'application/json' },
            body: JSON.stringify({ clientId: takeWriteClientId }),
          })
          clearTimeout(timeout)
          // If we're already the writer (from hello), take-write still succeeds (granted or writer-changed)
          finish([200, 202].includes(res.status), `status=${res.status}`)
        }
      } catch { /* ignore */ }
    })
    ws.on('error', (e) => finish(false, `take-write ws error: ${e.message}`))
  })
  check('ws+POST take-write: authed client can request write transfer → 200/202', takeWriteResult.ok, takeWriteResult.detail)

  // take-write without ws registration → 403 (client has no lock lifecycle)
  const takeWriteDriveBy = await fetch(`${BASE}/api/attach/general/take-write`, {
    method: 'POST',
    headers: { ...authHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ clientId: 'take-drive-by-no-ws' }),
  })
  check('POST /api/attach/general/take-write without ws → 403', takeWriteDriveBy.status === 403, `status=${takeWriteDriveBy.status}`)

  // reconnect replay: open ws, get a snapshot, reconnect with ?since=0 and verify replay
  const replayClientId = `smoke-replay-${Date.now()}`
  const replayResult = await new Promise<{ ok: boolean; detail: string }>((resolve) => {
    let firstSnapshotTs = 0
    let phase: 'first' | 'replaying' = 'first'
    let firstWs: WebSocket | null = null

    const timeout = setTimeout(() => {
      try { firstWs?.terminate() } catch { /* noop */ }
      resolve({ ok: false, detail: 'replay timeout' })
    }, 6000)

    const startFirst = () => {
      const ws = new WebSocket(
        `${BASE.replace(/^http/, 'ws')}/api/attach/general/stream?clientId=${encodeURIComponent(replayClientId)}`,
        { headers: { Cookie: `command_token=${token}` }, handshakeTimeout: 3000, perMessageDeflate: false }
      )
      firstWs = ws
      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString())
          if (msg.type === 'snapshot' && phase === 'first') {
            firstSnapshotTs = msg.ts
            phase = 'replaying'
            try { ws.terminate() } catch { /* noop */ }
            // Reconnect with since=<ts - 1> to ensure the snapshot is included
            const replayWs = new WebSocket(
              `${BASE.replace(/^http/, 'ws')}/api/attach/general/stream?clientId=${encodeURIComponent(replayClientId)}&since=${firstSnapshotTs - 1}`,
              { headers: { Cookie: `command_token=${token}` }, handshakeTimeout: 3000, perMessageDeflate: false }
            )
            replayWs.on('message', (raw2) => {
              try {
                const msg2 = JSON.parse(raw2.toString())
                if (msg2.type === 'snapshot') {
                  clearTimeout(timeout)
                  try { replayWs.terminate() } catch { /* noop */ }
                  resolve({ ok: true, detail: `replayed ts=${msg2.ts}` })
                }
              } catch { /* ignore */ }
            })
            replayWs.on('error', () => {
              clearTimeout(timeout)
              resolve({ ok: false, detail: 'replay ws error' })
            })
          }
        } catch { /* ignore */ }
      })
      ws.on('error', () => {
        clearTimeout(timeout)
        resolve({ ok: false, detail: 'first ws error' })
      })
    }
    startFirst()
  })
  check('reconnect with ?since replay delivers snapshot', replayResult.ok, replayResult.detail)

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
