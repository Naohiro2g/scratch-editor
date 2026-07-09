import net from 'node:net'
import { WebSocketServer, type RawData, type WebSocket } from 'ws'
import { resolveSandbox, type SandboxTarget } from './allowlist.ts'
import type { BridgeConfig } from './config.ts'
import { createLineDecoder, frameLine } from './framing.ts'
import { parseSandboxQuery } from './routing.ts'

// WS close codes (RFC 6455): policy violation and internal error.
const CLOSE_POLICY = 1008
const CLOSE_INTERNAL = 1011

/**
 * Start the bridge: a WS server that, per connection, dials the requested
 * Sandbox over TCP and relays frames in both directions (wire-format-design §2,
 * scratch-plan §2.4). The relay is transparent — request/response correlation
 * and server→client push pass straight through, untouched.
 * @param config The bridge configuration (bind address, allowlists, port).
 * @returns The running WebSocket server.
 */
export function createBridge(config: BridgeConfig): WebSocketServer {
  const wss = new WebSocketServer({
    host: config.wsHost,
    port: config.wsPort,
    verifyClient: ({ origin }: { origin: string }) => config.originAllowlist.includes(origin),
  })
  wss.on('connection', (ws, request) => handleConnection(ws, config, request.url))
  return wss
}

function handleConnection(ws: WebSocket, config: BridgeConfig, requestUrl: string | undefined): void {
  const decode = createLineDecoder()
  const target = resolveSandbox(parseSandboxQuery(requestUrl), config)
  let tcp: net.Socket | null = null
  let ready = false
  const queue: string[] = []

  if (target === null) {
    ws.close(CLOSE_POLICY, 'sandbox_not_allowed')
    return
  }

  ws.on('message', (data) => {
    const message = decodeMessage(data)

    tcp ??= openSandbox(
      ws,
      target,
      decode,
      () => {
        ready = true
        for (const queued of queue) tcp?.write(frameLine(queued))
        queue.length = 0
      },
      () => {
        tcp = null
        ready = false
      },
    )

    if (ready) tcp.write(frameLine(message))
    else queue.push(message)
  })

  ws.on('close', () => tcp?.destroy())
  ws.on('error', () => tcp?.destroy())
}

/**
 * Decode a WS frame to its UTF-8 text. The editor sends text frames; binary
 * variants are handled defensively so the payload is never mangled.
 * @param data The raw WS frame.
 * @returns The frame decoded as a UTF-8 string.
 */
function decodeMessage(data: RawData): string {
  if (Buffer.isBuffer(data)) return data.toString('utf8')
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8')
  return Buffer.from(data).toString('utf8')
}

function openSandbox(
  ws: WebSocket,
  target: SandboxTarget,
  decode: (chunk: Buffer) => string[],
  onReady: () => void,
  onClose: () => void,
): net.Socket {
  const tcp = net.createConnection(target, onReady)

  tcp.on('data', (chunk: Buffer) => {
    for (const line of decode(chunk)) {
      if (ws.readyState === ws.OPEN) ws.send(line)
    }
  })
  tcp.on('error', (err) => {
    console.error(`McRemote bridge: sandbox ${target.host}:${target.port} unreachable: ${err.message}`)
    if (ws.readyState === ws.OPEN) ws.close(CLOSE_INTERNAL, 'sandbox_unreachable')
  })
  tcp.on('close', onClose)

  return tcp
}
