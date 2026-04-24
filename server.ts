import { createServer, IncomingMessage, ServerResponse } from 'http'
import { parse } from 'url'
import next from 'next'
import { Socket } from 'net'
import { randomUUID } from 'crypto'
import { WebSocketServer } from 'ws'

import { attachReadStream, isAllowedAttach } from './src/lib/attachStream'
import { claimIfUnheld, isWriter, requestTransfer, declineTransfer } from './src/lib/attachLock'
import { extractCookieToken, verifyToken } from './src/lib/jwt'
import { sendKeys, sendNamedKeys } from './src/lib/tmux'

const dev = process.env.NODE_ENV !== 'production'
const port = parseInt(process.env.PORT || '3100', 10)

const app = next({ dev, hostname: 'localhost', port })
// NextCustomServer (returned by next() in custom-server mode) lazily registers
// its own upgrade listener via setupWebSocketHandler() on the first HTTP request.
// That listener calls resolveRoutes({req, res: socket}) → handleRequestImpl(req,
// socket) which crashes because socket lacks setHeader. We handle upgrades
// ourselves, so suppress Next's registration by pre-setting the guard flag.
;(app as any).didWebSocketSetup = true
const handle = app.getRequestHandler()

const ATTACH_STREAM_PATH = /^\/api\/attach\/([A-Za-z0-9_-]+)\/stream$/
const ATTACH_SEND_PATH = /^\/api\/attach\/([A-Za-z0-9_-]+)\/send$/
const ATTACH_TAKE_WRITE_PATH = /^\/api\/attach\/([A-Za-z0-9_-]+)\/take-write$/
const ATTACH_DECLINE_TRANSFER_PATH = /^\/api\/attach\/([A-Za-z0-9_-]+)\/decline-transfer$/
const MAX_SEND_BYTES = 64 * 1024

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    req.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total > MAX_SEND_BYTES) {
        reject(new Error('payload too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf-8')
        resolve(raw ? JSON.parse(raw) : {})
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

async function handleAttachSend(
  req: IncomingMessage,
  res: ServerResponse,
  sessionName: string,
): Promise<void> {
  if (req.method !== 'POST') {
    writeJson(res, 405, { error: 'method not allowed' })
    return
  }
  const token = extractCookieToken(req.headers.cookie)
  if (!token || !verifyToken(token)) {
    writeJson(res, 401, { error: 'unauthorized' })
    return
  }
  if (!isAllowedAttach(sessionName)) {
    writeJson(res, 404, { error: 'session not in attach allowlist' })
    return
  }
  let body: { text?: string; submit?: boolean; clientId?: string }
  try {
    body = (await readJsonBody(req)) as typeof body
  } catch (e) {
    writeJson(res, 400, { error: e instanceof Error ? e.message : 'invalid body' })
    return
  }
  const clientId = typeof body.clientId === 'string' ? body.clientId : ''
  const text = typeof body.text === 'string' ? body.text : ''
  const submit = body.submit !== false
  if (!clientId) {
    writeJson(res, 400, { error: 'clientId required' })
    return
  }
  const claimed = claimIfUnheld(sessionName, clientId)
  if (!claimed && !isWriter(sessionName, clientId)) {
    writeJson(res, 403, { error: 'another client holds the writer lock', role: 'observer' })
    return
  }
  if (text.length > 0) {
    const ok = sendKeys(sessionName, text, false)
    if (!ok) {
      writeJson(res, 502, { error: 'tmux send-keys failed (text)' })
      return
    }
  }
  if (submit) {
    const ok = sendNamedKeys(sessionName, ['Enter'])
    if (!ok) {
      writeJson(res, 502, { error: 'tmux send-keys failed (Enter)' })
      return
    }
  }
  writeJson(res, 200, { ok: true, role: 'writer', submitted: submit })
}

async function handleAttachTakeWrite(
  req: IncomingMessage,
  res: ServerResponse,
  sessionName: string,
): Promise<void> {
  if (req.method !== 'POST') {
    writeJson(res, 405, { error: 'method not allowed' })
    return
  }
  const token = extractCookieToken(req.headers.cookie)
  if (!token || !verifyToken(token)) {
    writeJson(res, 401, { error: 'unauthorized' })
    return
  }
  if (!isAllowedAttach(sessionName)) {
    writeJson(res, 404, { error: 'session not in attach allowlist' })
    return
  }
  let body: { clientId?: string }
  try {
    body = (await readJsonBody(req)) as typeof body
  } catch (e) {
    writeJson(res, 400, { error: e instanceof Error ? e.message : 'invalid body' })
    return
  }
  const clientId = typeof body.clientId === 'string' ? body.clientId : ''
  if (!clientId) {
    writeJson(res, 400, { error: 'clientId required' })
    return
  }
  const result = requestTransfer(sessionName, clientId)
  if (result.notRegistered) {
    writeJson(res, 403, { error: 'no active WebSocket for this clientId; connect to the stream first' })
    return
  }
  if (!result.granted && !result.alreadyPending) {
    // Queued — writer has 10s to decline
    writeJson(res, 202, { status: 'pending', message: 'transfer requested; granted in 10s unless writer declines' })
    return
  }
  if (result.alreadyPending) {
    writeJson(res, 409, { error: 'transfer already pending' })
    return
  }
  writeJson(res, 200, { granted: true, role: 'writer' })
}

async function handleAttachDeclineTransfer(
  req: IncomingMessage,
  res: ServerResponse,
  sessionName: string,
): Promise<void> {
  if (req.method !== 'POST') {
    writeJson(res, 405, { error: 'method not allowed' })
    return
  }
  const token = extractCookieToken(req.headers.cookie)
  if (!token || !verifyToken(token)) {
    writeJson(res, 401, { error: 'unauthorized' })
    return
  }
  if (!isAllowedAttach(sessionName)) {
    writeJson(res, 404, { error: 'session not in attach allowlist' })
    return
  }
  let body: { clientId?: string }
  try {
    body = (await readJsonBody(req)) as typeof body
  } catch (e) {
    writeJson(res, 400, { error: e instanceof Error ? e.message : 'invalid body' })
    return
  }
  const clientId = typeof body.clientId === 'string' ? body.clientId : ''
  if (!clientId) {
    writeJson(res, 400, { error: 'clientId required' })
    return
  }
  const declined = declineTransfer(sessionName, clientId)
  if (!declined) {
    writeJson(res, 409, { error: 'no pending transfer or not writer' })
    return
  }
  writeJson(res, 200, { ok: true })
}

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true)
    if (parsedUrl.pathname?.startsWith('/ws/')) {
      res.statusCode = 410
      res.end('Gone')
      return
    }
    const sendMatch = parsedUrl.pathname?.match(ATTACH_SEND_PATH)
    if (sendMatch) {
      // Handled directly in server.ts — shares lock state with the upgrade
      // handler. Next.js route bundles do not share module state with
      // server.ts (verified empirically), so routing here is load-bearing
      // for correctness, not just a preference.
      handleAttachSend(req, res, sendMatch[1]).catch((e) => {
        writeJson(res, 500, { error: e instanceof Error ? e.message : 'internal error' })
      })
      return
    }
    const takeWriteMatch = parsedUrl.pathname?.match(ATTACH_TAKE_WRITE_PATH)
    if (takeWriteMatch) {
      handleAttachTakeWrite(req, res, takeWriteMatch[1]).catch((e) => {
        writeJson(res, 500, { error: e instanceof Error ? e.message : 'internal error' })
      })
      return
    }
    const declineMatch = parsedUrl.pathname?.match(ATTACH_DECLINE_TRANSFER_PATH)
    if (declineMatch) {
      handleAttachDeclineTransfer(req, res, declineMatch[1]).catch((e) => {
        writeJson(res, 500, { error: e instanceof Error ? e.message : 'internal error' })
      })
      return
    }
    // The /api/attach/<name>/stream path is a WebSocket upgrade endpoint
    // handled in server.on('upgrade') below. Regular HTTP hits to it are
    // method mismatches (GET via curl etc.) — return 426 instead of
    // falling through to Next, which crashes trying to route it.
    const streamMatch = parsedUrl.pathname?.match(ATTACH_STREAM_PATH)
    if (streamMatch) {
      res.statusCode = 426
      res.setHeader('Upgrade', 'websocket')
      res.setHeader('Connection', 'Upgrade')
      res.end('Upgrade Required')
      return
    }
    handle(req, res, parsedUrl)
  })

  // perMessageDeflate: false avoids an RSV1 negotiation mismatch that
  // appeared under Node.js native fetch / ws Node client combinations.
  // Our frames are small JSON; compression buys little and cost an
  // intermittent "Invalid WebSocket frame: RSV1 must be clear" close.
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false })

  server.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
    const pathname = parse(req.url!).pathname || ''
    const match = pathname.match(ATTACH_STREAM_PATH)
    if (!match) {
      socket.destroy()
      return
    }
    const sessionName = match[1]
    if (!isAllowedAttach(sessionName)) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
      socket.destroy()
      return
    }
    const token = extractCookieToken(req.headers.cookie)
    if (!token || !verifyToken(token)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }
    const parsed = parse(req.url!, true)
    const rawClientId = parsed.query.clientId
    const clientId = typeof rawClientId === 'string' && rawClientId.length > 0
      ? rawClientId
      : randomUUID()
    const rawSince = parsed.query.since
    const since = typeof rawSince === 'string' && rawSince.length > 0
      ? parseInt(rawSince, 10)
      : undefined
    wss.handleUpgrade(req, socket, head, (ws) => {
      attachReadStream(ws, sessionName, clientId, since)
    })
  })

  server.listen(port, () => {
    console.log(`Command running on http://localhost:${port}`)
  })
})
