import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'

const dev = process.env.NODE_ENV !== 'production'
const port = Number.parseInt(process.env.PORT || '3100', 10)
const app = next({ dev, hostname: 'localhost', port })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  createServer((req, res) => handle(req, res, parse(req.url ?? '/', true))).listen(port, () => {
    console.log(`Command observatory running on http://localhost:${port}`)
  })
})
