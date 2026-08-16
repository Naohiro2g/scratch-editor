import { once } from 'node:events'
import net from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocket, type WebSocketServer } from 'ws'
import { createBridge } from '../src/server.ts'

describe('createBridge', () => {
  const servers: (net.Server | WebSocketServer)[] = []
  const sockets: WebSocket[] = []

  afterEach(async () => {
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

    const ws = new WebSocket(`ws://127.0.0.1:${getPort(bridge)}/?sandbox=127.0.0.1`, {
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

  it('redials when the next request follows a final TCP response immediately', async () => {
    const originalCreateConnection = net.createConnection
    vi.spyOn(net, 'createConnection').mockImplementation(((options: net.TcpNetConnectOpts, listener?: () => void) =>
      originalCreateConnection({ ...options, allowHalfOpen: true }, listener)) as typeof net.createConnection)
    const requests = [
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'hello', params: { protocol: '21.0.0' } }),
      JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'auth.pairBegin',
        params: { token_type: 'session' },
      }),
      JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'auth.pairPoll', params: { pairing_id: 'pair-1' } }),
      JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'hello',
        params: { protocol: '21.0.0', auth: { token: 'test-session-token' } },
      }),
    ]
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
      JSON.stringify({ jsonrpc: '2.0', id: 3, result: { status: 'ok', token: 'test-session-token' } }),
      JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        result: { protocol: '21.0.0', catalogHash: null, world_constants: { y_sea: 63 } },
      }),
    ]
    let connectionCount = 0
    const received: string[] = []
    const sandbox = net.createServer((socket) => {
      const connectionNumber = connectionCount++
      socket.once('data', (data: Buffer) => {
        received.push(data.toString('utf8'))
        socket.end(`${responses[connectionNumber]}\n`)
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

    const ws = new WebSocket(`ws://127.0.0.1:${getPort(bridge)}/?sandbox=127.0.0.1`, {
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
      if (responseIndex < requests.length) ws.send(requests[responseIndex])
      else resolveComplete()
    })
    ws.send(requests[0])

    await complete
    expect(received).toEqual(requests.map((request) => `${request}\n`))
    expect(connectionCount).toBe(requests.length)
    expect(ws.readyState).toBe(WebSocket.OPEN)
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
