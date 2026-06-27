import { describe, expect, it } from 'vitest'
import { peekSandbox } from '../src/routing.ts'

describe('peekSandbox', () => {
  it('reads the sandbox hint from a hello message', () => {
    const hello = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'hello',
      params: { protocol: '21.0.0', sandbox: 'sb2.mc-remote.com' },
    })
    expect(peekSandbox(hello)).toBe('sb2.mc-remote.com')
  })

  it('returns undefined when no sandbox is present', () => {
    expect(peekSandbox(JSON.stringify({ params: { protocol: '21.0.0' } }))).toBeUndefined()
  })

  it('returns undefined for positional params', () => {
    expect(peekSandbox(JSON.stringify({ method: 'world.setBlock', params: [0, 0, 0, 'stone'] }))).toBeUndefined()
  })

  it('returns undefined for unparseable input', () => {
    expect(peekSandbox('not json')).toBeUndefined()
  })
})
