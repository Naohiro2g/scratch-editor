import { describe, expect, it } from 'vitest'
import { ERROR_REASON_CODE, ErrorCode, ErrorReason, JSONRPC_VERSION, Method, PROTOCOL_VERSION } from '../src/index.ts'

describe('protocol constants', () => {
  it('advertises the clean protocol semver without a channel suffix', () => {
    expect(PROTOCOL_VERSION).toBe('21.0.0')
  })

  it('pins the JSON-RPC envelope version', () => {
    expect(JSONRPC_VERSION).toBe('2.0')
  })

  it('uses the TCP dot names as wire methods', () => {
    expect(Method.hello).toBe('hello')
    expect(Method.chatPost).toBe('chat.post')
    expect(Method.worldSetBlock).toBe('world.setBlock')
    expect(Method.worldSetBlocks).toBe('world.setBlocks')
    expect(Method.worldGetBlock).toBe('world.getBlock')
  })
})

describe('error model', () => {
  it('maps every b1 reason to a JSON-RPC code family', () => {
    for (const reason of Object.values(ErrorReason)) {
      expect(ERROR_REASON_CODE[reason]).toBeTypeOf('number')
    }
  })

  it('routes ref-validation reasons to invalid params and world-state to the server range', () => {
    expect(ERROR_REASON_CODE[ErrorReason.malformedRef]).toBe(ErrorCode.invalidParams)
    expect(ERROR_REASON_CODE[ErrorReason.unknownBlock]).toBe(ErrorCode.invalidParams)
    expect(ERROR_REASON_CODE[ErrorReason.unloadedChunk]).toBe(ErrorCode.serverError)
  })
})
