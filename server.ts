import { createServer, IncomingMessage } from 'http'
import { parse } from 'url'
import next from 'next'
import { WebSocketServer, WebSocket } from 'ws'
import { spawn, IPty } from 'node-pty'
import { verify } from 'jsonwebtoken'
import { Socket } from 'net'
import { buildScopedShellEnv, getEnvironmentProfile } from './src/lib/environments'
import { recordTelemetry } from './src/lib/telemetry'

const dev = process.env.NODE_ENV !== 'production'
const port = parseInt(process.env.PORT || '3100', 10)
const JWT_SECRET = process.env.JWT_SECRET || 'command-jwt-secret-change-in-production'

const app = next({ dev, hostname: 'localhost', port })
const handle = app.getRequestHandler()

function extractToken(req: IncomingMessage): string | null {
  const cookies = req.headers.cookie || ''
  const match = cookies.match(/command_token=([^;]+)/)
  return match ? match[1] : null
}

function verifyAuth(req: IncomingMessage): boolean {
  const token = extractToken(req)
  if (!token) return false
  try {
    verify(token, JWT_SECRET)
    return true
  } catch {
    return false
  }
}

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true)
    if (parsedUrl.pathname?.startsWith('/ws/')) {
      res.statusCode = 426
      res.end('Upgrade Required')
      return
    }
    handle(req, res, parsedUrl)
  })

  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false })

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || '', `http://localhost:${port}`)
    const environmentId = url.searchParams.get('environment') || 'workspace-observer'
    const environment = getEnvironmentProfile(environmentId)
    const websocketSessionId = crypto.randomUUID()
    const shell = process.env.SHELL || '/bin/bash'
    // Programmatic clients (smoke test) set X-Source-Type: smoke; browsers cannot set custom WS headers
    const termSourceType = (req.headers['x-source-type'] as string) === 'smoke' ? 'smoke' : 'user'
    const pty: IPty = spawn(shell, [], {
      name: 'xterm-256color',
      cols: 120,
      rows: 40,
      cwd: environment.workingDirectory,
      env: buildScopedShellEnv(process.env, environment.id),
    })
    recordTelemetry({
      project: 'command',
      source: 'command.server.terminal',
      eventType: 'terminal.connected',
      level: 'info',
      sourceType: termSourceType,
      sessionId: websocketSessionId,
      details: {
        environmentId: environment.id,
        trustClass: environment.trustClass,
      },
    })

    pty.onData((data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'output', data }))
      }
    })

    pty.onExit(({ exitCode, signal }: { exitCode: number; signal?: number }) => {
      recordTelemetry({
        project: 'command',
        source: 'command.server.terminal',
        eventType: 'terminal.pty_exit',
        level: exitCode === 0 ? 'info' : 'warn',
        sourceType: termSourceType,
        sessionId: websocketSessionId,
        details: { environmentId: environment.id, exitCode, signal: signal ?? null },
      })
      if (ws.readyState === WebSocket.OPEN) {
        ws.close()
      }
    })

    ws.on('message', (msg: Buffer) => {
      try {
        const parsed = JSON.parse(msg.toString())
        if (parsed.type === 'input') {
          pty.write(parsed.data)
        } else if (parsed.type === 'resize') {
          pty.resize(parsed.cols, parsed.rows)
        }
      } catch {
        // raw text fallback
        pty.write(msg.toString())
      }
    })

    ws.on('close', (code: number, reason: Buffer) => {
      recordTelemetry({
        project: 'command',
        source: 'command.server.terminal',
        eventType: 'terminal.disconnected',
        level: 'info',
        sourceType: termSourceType,
        sessionId: websocketSessionId,
        details: { environmentId: environment.id, closeCode: code, closeReason: reason?.toString() || '' },
      })
      pty.kill()
    })
  })

  server.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
    const { pathname } = parse(req.url || '', true)

    if (pathname === '/ws/terminal') {
      if (!verifyAuth(req)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        socket.destroy()
        return
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req)
      })
    } else {
      socket.destroy()
    }
  })

  server.listen(port, () => {
    console.log(`Command running on http://localhost:${port}`)
  })
})
