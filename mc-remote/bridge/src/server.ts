import net from 'node:net'
import { WebSocketServer, type RawData, type VerifyClientCallbackSync, type WebSocket } from 'ws'
import { resolveSandbox, type SandboxTarget } from './allowlist.ts'
import type { BridgeConfig } from './config.ts'
import { createLineDecoder, frameLine } from './framing.ts'
import { parseSandboxQuery } from './routing.ts'
import {
  BRIDGE_TRANSPORT_PROTOCOL,
  decodeBrowserMessage,
  offersBridgeTransport,
  type BrowserMessage,
} from './transport.ts'

// WS close codes (RFC 6455): policy violation and internal error.
const CLOSE_POLICY = 1008
const CLOSE_INTERNAL = 1011
const ONE_SHOT_TIMEOUT_MS = 10_000
const MAX_QUEUED_MESSAGES = 16
const MAX_QUEUED_BYTES = 1024 * 1024

interface BackendGeneration {
  mode: 'persistent' | 'one-shot'
  socket: net.Socket
  ready: boolean
  pending: string[]
  decode: (chunk: Buffer) => string[]
  timeout: NodeJS.Timeout | null
  queuedResponses: number
  fromQueue: boolean
}

/**
 * Start the bridge: a WS server that, per connection, dials the requested
 * Sandbox over TCP and relays frames in both directions (wire-format-design §2,
 * scratch-plan §2.4). Only the outer one-shot transport envelope is decoded;
 * its JSON-RPC payload remains untouched.
 * @param config The bridge configuration (bind address, allowlists, port).
 * @returns The running WebSocket server.
 */
export function createBridge(config: BridgeConfig): WebSocketServer {
  const verifyClient: VerifyClientCallbackSync = ({ origin, req }) =>
    config.originAllowlist.includes(origin) && offersBridgeTransport(req.headers['sec-websocket-protocol'])
  const wss = new WebSocketServer({
    host: config.wsHost,
    port: config.wsPort,
    verifyClient,
    handleProtocols: (protocols) => (protocols.has(BRIDGE_TRANSPORT_PROTOCOL) ? BRIDGE_TRANSPORT_PROTOCOL : false),
  })
  wss.on('connection', (ws, request) => handleConnection(ws, config, request.url))
  return wss
}

function handleConnection(ws: WebSocket, config: BridgeConfig, requestUrl: string | undefined): void {
  const resolvedTarget = resolveSandbox(parseSandboxQuery(requestUrl), config)
  let backend: BackendGeneration | null = null
  let oneShotBlocked = false
  let serialQueueActive = false
  let queuedRequestInFlight = false
  const queue: BrowserMessage[] = []
  let queuedBytes = 0

  if (resolvedTarget === null) {
    ws.close(CLOSE_POLICY, 'sandbox_not_allowed')
    return
  }
  const target: SandboxTarget = resolvedTarget

  function closeBridge(code: number, reason: string): void {
    if (backend !== null) retire(backend)
    queue.length = 0
    queuedBytes = 0
    if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) ws.close(code, reason)
  }

  function retire(candidate: BackendGeneration): void {
    if (backend === candidate) backend = null
    if (candidate.timeout !== null) clearTimeout(candidate.timeout)
    candidate.timeout = null
    candidate.ready = false
    candidate.socket.destroy()
  }

  function completeQueuedRequest(): void {
    if (!queuedRequestInFlight) return
    queuedRequestInFlight = false
    drainQueue()
  }

  function drainQueue(): void {
    if (oneShotBlocked || queuedRequestInFlight) return
    const next = queue.shift()
    if (next === undefined) {
      serialQueueActive = false
      return
    }
    queuedBytes -= next.byteLength
    queuedRequestInFlight = true
    dispatch(next, true)
  }

  function enqueue(message: BrowserMessage): void {
    if (queue.length >= MAX_QUEUED_MESSAGES || queuedBytes + message.byteLength > MAX_QUEUED_BYTES) {
      closeBridge(CLOSE_INTERNAL, 'bridge_queue_overflow')
      return
    }
    queue.push(message)
    queuedBytes += message.byteLength
    serialQueueActive = true
  }

  function forwardPersistentResponse(candidate: BackendGeneration, line: string): void {
    if (backend !== candidate || ws.readyState !== ws.OPEN) return
    ws.send(line, (error) => {
      if (error) {
        closeBridge(CLOSE_INTERNAL, 'browser_transport_lost')
        return
      }
      if (candidate.queuedResponses > 0) {
        candidate.queuedResponses -= 1
        completeQueuedRequest()
      }
    })
  }

  function completeOneShot(candidate: BackendGeneration, line: string): void {
    if (backend !== candidate) return
    backend = null
    if (candidate.timeout !== null) clearTimeout(candidate.timeout)
    candidate.timeout = null
    candidate.ready = false
    candidate.socket.once('close', () => {
      if (ws.readyState !== ws.OPEN) {
        oneShotBlocked = false
        return
      }
      ws.send(line, (error) => {
        oneShotBlocked = false
        if (error) {
          closeBridge(CLOSE_INTERNAL, 'browser_transport_lost')
          return
        }
        if (candidate.fromQueue) completeQueuedRequest()
        else drainQueue()
      })
    })
    candidate.socket.destroy()
  }

  function openBackend(mode: 'persistent' | 'one-shot', fromQueue: boolean): BackendGeneration {
    const candidate = {} as BackendGeneration
    const socket = net.createConnection(target, () => {
      if (backend !== candidate || ws.readyState !== ws.OPEN) {
        socket.destroy()
        return
      }
      candidate.ready = true
      for (const payload of candidate.pending) socket.write(frameLine(payload))
      candidate.pending.length = 0
    })
    Object.assign(candidate, {
      mode,
      socket,
      ready: false,
      pending: [],
      decode: createLineDecoder(),
      timeout: null,
      queuedResponses: 0,
      fromQueue,
    })
    backend = candidate

    socket.on('data', (chunk: Buffer) => {
      if (backend !== candidate) return
      for (const line of candidate.decode(chunk)) {
        if (candidate.mode === 'one-shot') {
          completeOneShot(candidate, line)
          return
        }
        forwardPersistentResponse(candidate, line)
      }
    })
    socket.on('error', (error) => {
      if (backend !== candidate) return
      console.error(`McRemote bridge: sandbox ${target.host}:${target.port} unreachable: ${error.message}`)
      closeBridge(CLOSE_INTERNAL, 'sandbox_unreachable')
    })
    socket.on('end', () => {
      if (backend !== candidate) return
      if (candidate.mode === 'one-shot') {
        closeBridge(CLOSE_INTERNAL, 'one_shot_incomplete_response')
        return
      }
      retire(candidate)
      drainQueue()
    })
    socket.on('close', () => {
      if (backend !== candidate) return
      if (candidate.mode === 'one-shot') {
        closeBridge(CLOSE_INTERNAL, 'one_shot_incomplete_response')
        return
      }
      backend = null
      candidate.ready = false
      drainQueue()
    })

    if (mode === 'one-shot') {
      candidate.timeout = setTimeout(() => {
        if (backend !== candidate) return
        retire(candidate)
        closeBridge(CLOSE_INTERNAL, 'one_shot_timeout')
      }, ONE_SHOT_TIMEOUT_MS)
    }
    return candidate
  }

  function write(candidate: BackendGeneration, payload: string): void {
    if (candidate.ready) candidate.socket.write(frameLine(payload))
    else candidate.pending.push(payload)
  }

  function sendPersistent(payload: string, fromQueue: boolean): void {
    backend ??= openBackend('persistent', false)
    if (backend.mode !== 'persistent') {
      enqueue({ mode: 'persistent', payload, byteLength: Buffer.byteLength(payload, 'utf8') })
      return
    }
    if (fromQueue) backend.queuedResponses += 1
    write(backend, payload)
  }

  function sendOneShot(payload: string, fromQueue: boolean): void {
    if (backend !== null) retire(backend)
    oneShotBlocked = true
    const candidate = openBackend('one-shot', fromQueue)
    write(candidate, payload)
  }

  function dispatch(message: BrowserMessage, fromQueue: boolean): void {
    if (message.mode === 'one-shot') sendOneShot(message.payload, fromQueue)
    else sendPersistent(message.payload, fromQueue)
  }

  ws.on('message', (data) => {
    const decoded = decodeBrowserMessage(decodeMessage(data))
    if (!decoded.ok) {
      closeBridge(CLOSE_POLICY, decoded.reason)
      return
    }
    if (oneShotBlocked || serialQueueActive) {
      enqueue(decoded.message)
      if (!oneShotBlocked) drainQueue()
      return
    }
    dispatch(decoded.message, false)
  })

  ws.on('close', () => {
    if (backend !== null) retire(backend)
  })
  ws.on('error', () => {
    if (backend !== null) retire(backend)
  })
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
