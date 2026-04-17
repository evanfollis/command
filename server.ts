import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import { Socket } from 'net'

const dev = process.env.NODE_ENV !== 'production'
const port = parseInt(process.env.PORT || '3100', 10)

const app = next({ dev, hostname: 'localhost', port })
const handle = app.getRequestHandler()

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

  server.on('upgrade', (_req, socket: Socket) => {
    socket.destroy()
  })

  server.listen(port, () => {
    console.log(`Command running on http://localhost:${port}`)
  })
})
