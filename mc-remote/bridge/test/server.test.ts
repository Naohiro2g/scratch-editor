import { once } from 'node:events'
import { readFileSync } from 'node:fs'
import net from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocket, type WebSocketServer } from 'ws'
import { createBridge } from '../src/server.ts'

const transportFixture = JSON.parse(
  readFileSync(new URL('./fixtures/one-shot-transport-v1.json', import.meta.url), 'utf8'),
) as {
  probe_protocol: string
  selected_protocol: string
  hint_key: string
  hint: string
  sample_payload: string
  sample_message: string
}

function transportProtocols(): string[] {
  return [transportFixture.probe_protocol, transportFixture.selected_protocol]
}

function oneShot(payload: string): string {
  return JSON.stringify({
    [transportFixture.hint_key]: transportFixture.hint,
    payload,
  })
}

describe('createBridge', () => {
  const servers: (net.Server | WebSocketServer)[] = []
  const sockets: WebSocket[] = []

  afterEach(async () => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    for (const socket of sockets.splice(0)) {
      await closeWebSocket(socket)
    }
    for (const server of servers.splice(0).reverse()) {
      await closeServer(server)
    }
  })

  it('keeps the WSS route context across plugin TCP closes', async () => {
    const { server: sandbox, nextClose, nextMessage } = await startSandbox()
    servers.push(sandbox)

    const sandboxPort = getPort(sandbox)
    const bridge = createBridge({
      wsHost: '127.0.0.1',
      wsPort: 0,
      originAllowlist: ['https://scratch.mc-remote.com'],
      sandboxAllowlist: ['127.0.0.1'],
      defaultSandbox: '127.0.0.1',
      sandboxPort,
    })
    servers.push(bridge)
    await once(bridge, 'listening')

    const ws = new WebSocket(`ws://127.0.0.1:${getPort(bridge)}/?sandbox=127.0.0.1`, transportProtocols(), {
      headers: { Origin: 'https://scratch.mc-remote.com' },
    })
    sockets.push(ws)
    await once(ws, 'open')

    const firstMessage = '{"jsonrpc":"2.0","id":1,"method":"hello","params":{"protocol":"21.0.0"}}'
    const firstTcpMessage = nextMessage()
    const firstTcpClose = nextClose()
    ws.send(firstMessage)
    expect(await firstTcpMessage).toBe(`${firstMessage}\n`)
    await firstTcpClose
    expect(ws.readyState).toBe(WebSocket.OPEN)

    const secondMessage = '{"jsonrpc":"2.0","id":2,"method":"auth.pairBegin","params":{"token_type":"session"}}'
    const secondTcpMessage = nextMessage()
    ws.send(secondMessage)
    expect(await secondTcpMessage).toBe(`${secondMessage}\n`)
  })

  it('runs pairBegin, repeated pairPoll, authenticated hello, and a persistent command in order', async () => {
    const requests = [
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'hello', params: { protocol: '21.0.0' } }),
      JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'auth.pairBegin',
        params: { token_type: 'session' },
      }),
      JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'auth.pairPoll', params: { pairing_id: 'pair-1' } }),
      JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'auth.pairPoll', params: { pairing_id: 'pair-1' } }),
      JSON.stringify({
        jsonrpc: '2.0',
        id: 5,
        method: 'hello',
        params: { protocol: '21.0.0', auth: { token: 'test-session-token' } },
      }),
      JSON.stringify({ jsonrpc: '2.0', id: 6, method: 'chat.post', params: ['hello'] }),
    ]
    const modes = ['persistent', 'one-shot', 'one-shot', 'one-shot', 'persistent', 'persistent'] as const
    const responses = [
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        error: {
          code: -32000,
          message: 'auth required',
          data: { reason: 'auth_required' },
        },
      }),
      JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        result: { pairing_id: 'pair-1', pair_code: '827419', expires_in: 120 },
      }),
      JSON.stringify({ jsonrpc: '2.0', id: 3, result: { status: 'pending' } }),
      JSON.stringify({ jsonrpc: '2.0', id: 4, result: { status: 'ok', token: 'test-session-token' } }),
      JSON.stringify({
        jsonrpc: '2.0',
        id: 5,
        result: { protocol: '21.0.0', catalogHash: null, world_constants: { y_sea: 63 } },
      }),
      JSON.stringify({ jsonrpc: '2.0', id: 6, result: { posted: true } }),
    ]
    let connectionCount = 0
    const received: string[] = []
    const receivedConnections: number[] = []
    const sandbox = net.createServer((socket) => {
      const connectionNumber = connectionCount++
      let buffer = ''
      socket.on('data', (data: Buffer) => {
        buffer += data.toString('utf8')
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (line.length === 0) continue
          const request = JSON.parse(line) as { id: number }
          received.push(line)
          receivedConnections.push(connectionNumber)
          socket.write(`${responses[request.id - 1]}\n`)
        }
      })
    })
    servers.push(sandbox)
    sandbox.listen(0, '127.0.0.1')
    await once(sandbox, 'listening')

    const bridge = createBridge({
      wsHost: '127.0.0.1',
      wsPort: 0,
      originAllowlist: ['https://scratch.mc-remote.com'],
      sandboxAllowlist: ['127.0.0.1'],
      defaultSandbox: '127.0.0.1',
      sandboxPort: getPort(sandbox),
    })
    servers.push(bridge)
    await once(bridge, 'listening')

    const ws = new WebSocket(`ws://127.0.0.1:${getPort(bridge)}/?sandbox=127.0.0.1`, transportProtocols(), {
      headers: { Origin: 'https://scratch.mc-remote.com' },
    })
    sockets.push(ws)
    await once(ws, 'open')

    let responseIndex = 0
    let resolveComplete: () => void
    const complete = new Promise<void>((resolve) => {
      resolveComplete = resolve
    })
    ws.on('message', (data) => {
      expect(Buffer.from(data as Buffer).toString('utf8')).toBe(responses[responseIndex])
      responseIndex += 1
      if (responseIndex < requests.length) {
        const request = requests[responseIndex]
        ws.send(modes[responseIndex] === 'one-shot' ? oneShot(request) : request)
      } else resolveComplete()
    })
    ws.send(requests[0])

    await complete
    expect(received).toEqual(requests)
    expect(receivedConnections).toEqual([0, 1, 2, 3, 4, 4])
    expect(connectionCount).toBe(5)
    expect(ws.readyState).toBe(WebSocket.OPEN)
  })

  it('matches the exact one-shot transport fixture', () => {
    expect(oneShot(transportFixture.sample_payload)).toBe(transportFixture.sample_message)
  })

  it('retires the old generation before delivering a one-shot response without waiting for EOF', async () => {
    const originalCreateConnection = net.createConnection
    let bridgeConnectionCount = 0
    let oneShotClientDestroyed = false
    vi.spyOn(net, 'createConnection').mockImplementation(((options: net.TcpNetConnectOpts, listener?: () => void) => {
      const connectionNumber = bridgeConnectionCount++
      const socket = originalCreateConnection(options, listener)
      const destroy = socket.destroy.bind(socket)
      socket.destroy = (error?: Error) => {
        if (connectionNumber === 1) oneShotClientDestroyed = true
        return destroy(error)
      }
      return socket
    }) as typeof net.createConnection)
    const requests: string[] = []
    const socketsByRequest: net.Socket[] = []
    let firstSocketClosed = false
    const sandbox = net.createServer((socket) => {
      socket.once('data', (data: Buffer) => {
        const request = data.toString('utf8')
        requests.push(request)
        socketsByRequest.push(socket)
        if (requests.length === 1) {
          socket.once('close', () => {
            firstSocketClosed = true
          })
          socket.write(
            `${JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              error: { code: -32000, message: 'auth required', data: { reason: 'auth_required' } },
            })}\n`,
          )
          return
        }
        socket.write(
          `${JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            result: { pairing_id: 'pair-1', pair_code: '827419', expires_in: 120 },
          })}\n`,
        )
      })
    })
    servers.push(sandbox)
    sandbox.listen(0, '127.0.0.1')
    await once(sandbox, 'listening')

    const bridge = createBridge({
      wsHost: '127.0.0.1',
      wsPort: 0,
      originAllowlist: ['https://scratch.mc-remote.com'],
      sandboxAllowlist: ['127.0.0.1'],
      defaultSandbox: '127.0.0.1',
      sandboxPort: getPort(sandbox),
    })
    servers.push(bridge)
    await once(bridge, 'listening')

    const ws = new WebSocket(`ws://127.0.0.1:${getPort(bridge)}/?sandbox=127.0.0.1`, transportProtocols(), {
      headers: { Origin: 'https://scratch.mc-remote.com' },
    })
    sockets.push(ws)
    await once(ws, 'open')

    const hello = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'hello', params: { protocol: '21.0.0' } })
    ws.send(hello)
    const [authRequired] = (await once(ws, 'message')) as [Buffer]
    const authRequiredMessage = JSON.parse(authRequired.toString()) as { error: { data: { reason: string } } }
    expect(authRequiredMessage.error.data.reason).toBe('auth_required')

    ws.send(oneShot(transportFixture.sample_payload))
    const [pairBeginResult] = (await once(ws, 'message')) as [Buffer]
    const pairBeginMessage = JSON.parse(pairBeginResult.toString()) as { result: { pairing_id: string } }
    expect(pairBeginMessage.result.pairing_id).toBe('pair-1')
    expect(firstSocketClosed).toBe(true)
    expect(oneShotClientDestroyed).toBe(true)
    expect(socketsByRequest[0]).not.toBe(socketsByRequest[1])
    expect(requests).toEqual([`${hello}\n`, `${transportFixture.sample_payload}\n`])
  })

  it('rejects an unknown transport hint before opening a backend connection', async () => {
    let connections = 0
    const sandbox = net.createServer(() => {
      connections += 1
    })
    servers.push(sandbox)
    sandbox.listen(0, '127.0.0.1')
    await once(sandbox, 'listening')

    const bridge = createBridge({
      wsHost: '127.0.0.1',
      wsPort: 0,
      originAllowlist: ['https://scratch.mc-remote.com'],
      sandboxAllowlist: ['127.0.0.1'],
      defaultSandbox: '127.0.0.1',
      sandboxPort: getPort(sandbox),
    })
    servers.push(bridge)
    await once(bridge, 'listening')

    const ws = new WebSocket(`ws://127.0.0.1:${getPort(bridge)}/`, transportProtocols(), {
      headers: { Origin: 'https://scratch.mc-remote.com' },
    })
    sockets.push(ws)
    await once(ws, 'open')
    ws.send(JSON.stringify({ [transportFixture.hint_key]: 'future-v2', payload: transportFixture.sample_payload }))
    const [code, reason] = (await once(ws, 'close')) as [number, Buffer]
    expect(code).toBe(1008)
    expect(reason.toString()).toBe('unsupported_transport_hint')
    expect(connections).toBe(0)
  })

  it('closes a timed-out one-shot generation without retrying it', async () => {
    let received = 0
    let resolveReceived: () => void
    const firstRequest = new Promise<void>((resolve) => {
      resolveReceived = resolve
    })
    const sandbox = net.createServer((socket) => {
      socket.once('data', () => {
        received += 1
        resolveReceived()
      })
    })
    servers.push(sandbox)
    sandbox.listen(0, '127.0.0.1')
    await once(sandbox, 'listening')

    const bridge = createBridge({
      wsHost: '127.0.0.1',
      wsPort: 0,
      originAllowlist: ['https://scratch.mc-remote.com'],
      sandboxAllowlist: ['127.0.0.1'],
      defaultSandbox: '127.0.0.1',
      sandboxPort: getPort(sandbox),
    })
    servers.push(bridge)
    await once(bridge, 'listening')

    const ws = new WebSocket(`ws://127.0.0.1:${getPort(bridge)}/`, transportProtocols(), {
      headers: { Origin: 'https://scratch.mc-remote.com' },
    })
    sockets.push(ws)
    await once(ws, 'open')
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    ws.send(oneShot(transportFixture.sample_payload))
    await firstRequest
    const closed = once(ws, 'close')
    await vi.advanceTimersByTimeAsync(10_000)
    const [code, reason] = (await closed) as [number, Buffer]
    expect(code).toBe(1011)
    expect(reason.toString()).toBe('one_shot_timeout')
    expect(received).toBe(1)
  })

  it('bounds messages queued behind one-shot work and never replays the request', async () => {
    let received = 0
    let resolveReceived: () => void
    const firstRequest = new Promise<void>((resolve) => {
      resolveReceived = resolve
    })
    const sandbox = net.createServer((socket) => {
      socket.on('data', () => {
        received += 1
        resolveReceived()
      })
    })
    servers.push(sandbox)
    sandbox.listen(0, '127.0.0.1')
    await once(sandbox, 'listening')

    const bridge = createBridge({
      wsHost: '127.0.0.1',
      wsPort: 0,
      originAllowlist: ['https://scratch.mc-remote.com'],
      sandboxAllowlist: ['127.0.0.1'],
      defaultSandbox: '127.0.0.1',
      sandboxPort: getPort(sandbox),
    })
    servers.push(bridge)
    await once(bridge, 'listening')

    const ws = new WebSocket(`ws://127.0.0.1:${getPort(bridge)}/`, transportProtocols(), {
      headers: { Origin: 'https://scratch.mc-remote.com' },
    })
    sockets.push(ws)
    await once(ws, 'open')
    ws.send(oneShot(transportFixture.sample_payload))
    await firstRequest
    for (let id = 10; id < 27; id += 1) {
      ws.send(JSON.stringify({ jsonrpc: '2.0', id, method: 'hello', params: { protocol: '21.0.0' } }))
    }
    const [code, reason] = (await once(ws, 'close')) as [number, Buffer]
    expect(code).toBe(1011)
    expect(reason.toString()).toBe('bridge_queue_overflow')
    expect(received).toBe(1)
  })

  it('requires the one-shot WebSocket subprotocol', async () => {
    const sandbox = net.createServer()
    servers.push(sandbox)
    sandbox.listen(0, '127.0.0.1')
    await once(sandbox, 'listening')

    const bridge = createBridge({
      wsHost: '127.0.0.1',
      wsPort: 0,
      originAllowlist: ['https://scratch.mc-remote.com'],
      sandboxAllowlist: ['127.0.0.1'],
      defaultSandbox: '127.0.0.1',
      sandboxPort: getPort(sandbox),
    })
    servers.push(bridge)
    await once(bridge, 'listening')

    const ws = new WebSocket(`ws://127.0.0.1:${getPort(bridge)}/`, {
      headers: { Origin: 'https://scratch.mc-remote.com' },
    })
    sockets.push(ws)
    const error = await new Promise<Error>((resolve) => ws.once('error', resolve))
    expect(error.message).toContain('Unexpected server response')
  })
})

async function startSandbox(): Promise<{
  server: net.Server
  nextClose: () => Promise<void>
  nextMessage: () => Promise<string>
}> {
  const closePending: (() => void)[] = []
  const closes: boolean[] = []
  const pending: ((message: string) => void)[] = []
  const messages: string[] = []
  const server = net.createServer((socket) => {
    socket.once('data', (data: Buffer) => {
      const message = data.toString('utf8')
      const resolve = pending.shift()
      if (resolve) resolve(message)
      else messages.push(message)
      socket.end()
    })
    socket.once('close', () => {
      const resolve = closePending.shift()
      if (resolve) resolve()
      else closes.push(true)
    })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')

  return {
    server,
    nextClose: () => {
      const closed = closes.shift()
      if (closed) return Promise.resolve()
      return new Promise((resolve) => closePending.push(resolve))
    },
    nextMessage: () => {
      const message = messages.shift()
      if (message !== undefined) return Promise.resolve(message)
      return new Promise((resolve) => pending.push(resolve))
    },
  }
}

function getPort(server: net.Server | WebSocketServer): number {
  const address = server.address()
  if (typeof address !== 'object' || address === null) {
    throw new Error('server is not listening on a TCP port')
  }
  return address.port
}

async function closeWebSocket(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) return
  socket.close()
  await once(socket, 'close')
}

async function closeServer(server: net.Server | WebSocketServer): Promise<void> {
  if ('closeAllConnections' in server) {
    server.closeAllConnections()
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error?: Error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}
