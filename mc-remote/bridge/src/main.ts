import { loadConfig } from './config.ts'
import { createBridge } from './server.ts'

const config = loadConfig(process.env)
const wss = createBridge(config)

wss.on('listening', () => {
  console.log(`McRemote bridge listening on ws://${config.wsHost}:${config.wsPort}`)
})
wss.on('error', (err) => {
  console.error(`McRemote bridge: server error: ${err.message}`)
  process.exitCode = 1
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => wss.close(() => process.exit(0)))
}
