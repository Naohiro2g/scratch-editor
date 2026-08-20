import { describe, expect, it } from 'vitest'
import type {
  BlockSpec,
  BlockValue,
  ConnectionFlushParams,
  ConnectionFlushResult,
  GetBlocksParams,
  GetBlocksResult,
  GetHeightParams,
  GetHeightResult,
  SetBlockResult,
  SetBlocksResult,
  SpawnEntityParams,
  SpawnEntityResult,
} from '../src/index.ts'
import { ERROR_REASON_CODE, ErrorCode, ErrorReason, JSONRPC_VERSION, Method, PROTOCOL_VERSION } from '../src/index.ts'

describe('protocol constants', () => {
  it('advertises the clean protocol semver without a channel suffix', () => {
    expect(PROTOCOL_VERSION).toBe('22.0.0')
  })

  it('pins the JSON-RPC envelope version', () => {
    expect(JSONRPC_VERSION).toBe('2.0')
  })

  it('uses the TCP dot names as wire methods', () => {
    expect(Method.hello).toBe('hello')
    expect(Method.catalogGet).toBe('catalog.get')
    expect(Method.chatPost).toBe('chat.post')
    expect(Method.buildSetWorld).toBe('build.setWorld')
    expect(Method.buildSetOrigin).toBe('build.setOrigin')
    expect(Method.worldSetBlock).toBe('world.setBlock')
    expect(Method.worldSetBlocks).toBe('world.setBlocks')
    expect(Method.worldGetBlock).toBe('world.getBlock')
    expect(Method.worldGetBlocks).toBe('world.getBlocks')
    expect(Method.worldGetHeight).toBe('world.getHeight')
    expect(Method.worldSpawnEntity).toBe('world.spawnEntity')
    expect(Method.connectionFlush).toBe('connection.flush')
    expect(Method.playerGetPose).toBe('player.getPose')
    expect(Method.playerSetPose).toBe('player.setPose')
  })
})

describe('error model', () => {
  it('maps every protocol 22 reason to a JSON-RPC code family', () => {
    for (const reason of Object.values(ErrorReason)) {
      expect(ERROR_REASON_CODE[reason]).toBeTypeOf('number')
    }
  })

  it('routes block-validation reasons to invalid params and build policy to the server range', () => {
    expect(ERROR_REASON_CODE[ErrorReason.unknownBlock]).toBe(ErrorCode.invalidParams)
    expect(ERROR_REASON_CODE[ErrorReason.invalidParams]).toBe(ErrorCode.invalidParams)
    expect(ERROR_REASON_CODE[ErrorReason.buildDenied]).toBe(ErrorCode.serverError)
  })
})

describe('structured block values', () => {
  it('uses the same exact object shape for set input and canonical output', () => {
    const spec: BlockSpec = { block_id: 'oak_log', state: { axis: 'z' } }
    const value: BlockValue = { block_id: 'minecraft:oak_log', state: { axis: 'z' } }
    expect(Object.keys(spec)).toEqual(['block_id', 'state'])
    expect(Object.keys(value)).toEqual(['block_id', 'state'])
  })

  it('keeps bounded getBlocks positional params and ordered BlockValue results', () => {
    const params: GetBlocksParams = [0, 0, 0, 1, 1, 1]
    const result: GetBlocksResult = [
      { block_id: 'minecraft:stone', state: {} },
      { block_id: 'minecraft:oak_log', state: { axis: 'z' } },
    ]
    expect(params).toHaveLength(6)
    expect(result[1].state.axis).toBe('z')
  })

  it('uses null acknowledgements for setters and connection.flush', () => {
    const setBlockResult: SetBlockResult = null
    const setBlocksResult: SetBlocksResult = null
    const flushParams: ConnectionFlushParams = []
    const flushResult: ConnectionFlushResult = null
    expect(setBlockResult).toBeNull()
    expect(setBlocksResult).toBeNull()
    expect(flushParams).toEqual([])
    expect(flushResult).toBeNull()
  })

  it('keeps height queries and entity handles as small scalar results', () => {
    const heightParams: GetHeightParams = [3, 4, 20]
    const height: GetHeightResult = -1
    const spawnParams: SpawnEntityParams = ['minecraft:allay', 1, 2, 3]
    const handle: SpawnEntityResult = 'mceh_example'
    expect(heightParams).toEqual([3, 4, 20])
    expect(height).toBe(-1)
    expect(spawnParams[0]).toBe('minecraft:allay')
    expect(handle).toMatch(/^mceh_/)
  })
})
