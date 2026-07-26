import { createServer } from 'node:http'
import next from 'next'

const dev = process.env.NODE_ENV !== 'production'
const port = Number.parseInt(process.env.PORT || '3100', 10)
const app = next({ dev, hostname: 'localhost', port })
const handle = app.getRequestHandler()

async function main() {
  await app.prepare()
  const server = createServer((req, res) => handle(req, res))

  server.listen(port, '127.0.0.1', () => {
    console.log(`Command observatory running on http://127.0.0.1:${port}`)
  })

  async function shutdown(signal: string) {
    console.log(`Command observatory received ${signal}; draining connections`)
    server.close(async (error) => {
      await app.close()
      if (error) console.error(error)
      process.exit(error ? 1 : 0)
    })
  }

  process.once('SIGTERM', () => void shutdown('SIGTERM'))
  process.once('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((error) => {
  console.error('Command observatory failed to start', error)
  process.exit(1)
})
