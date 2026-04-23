import { createServer, IncomingMessage } from 'http'
import { parse } from 'url'
import next from 'next'
import { Socket } from 'net'
import { WebSocketServer } from 'ws'

import { attachReadStream, isAllowedAttach } from './src/lib/attachStream'
import { extractCookieToken, verifyToken } from './src/lib/jwt'

const dev = process.env.NODE_ENV !== 'production'
const port = parseInt(process.env.PORT || '3100', 10)

const app = next({ dev, hostname: 'localhost', port })
const handle = app.getRequestHandler()

const ATTACH_STREAM_PATH = /^\/api\/attach\/([A-Za-z0-9_-]+)\/stream$/

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true)
    if (parsedUrl.pathname?.startsWith('/ws/')) {
      res.statusCode = 410
      res.end('Gone')
      return
    }
    handle(req, res, parsedUrl)
  })

  const wss = new WebSocketServer({ noServer: true })

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
    wss.handleUpgrade(req, socket, head, (ws) => {
      attachReadStream(ws, sessionName)
    })
  })

  server.listen(port, () => {
    console.log(`Command running on http://localhost:${port}`)
  })
})
