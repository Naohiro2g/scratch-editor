import { describe, expect, it } from 'vitest'
import type {
  BlockSpec,
  BlockValue,
  ConnectionFlushParams,
  ConnectionFlushResult,
  EventsPollParams,
  EventsPollResult,
  GetBlocksParams,
  GetBlocksResult,
  GetHeightParams,
  GetHeightResult,
  SetBlockResult,
  SetBlocksResult,
  SpawnParticleParams,
  SpawnParticleResult,
  SpawnEntityParams,
  SpawnEntityResult,
} from '../src/index.ts'
import { ERROR_REASON_CODE, ErrorCode, ErrorReason, JSONRPC_VERSION, Method, PROTOCOL_VERSION } from '../src/index.ts'
import eventsFixture from './fixtures/events-v22.json'
import spawnFixture from './fixtures/spawn-v22.json'

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
    expect(Method.worldSpawnParticle).toBe('world.spawnParticle')
    expect(Method.worldSpawnEntity).toBe('world.spawnEntity')
    expect(Method.connectionFlush).toBe('connection.flush')
    expect(Method.eventsPoll).toBe('events.poll')
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

  it('keeps height and spawn results as small scalar values', () => {
    const heightParams: GetHeightParams = [3, 4, 20]
    const height: GetHeightResult = -1
    const particleParams = spawnFixture.spawn_particle.default_force.params as SpawnParticleParams
    const forcedParticleParams = spawnFixture.spawn_particle.explicit_false.params as SpawnParticleParams
    const accepted: SpawnParticleResult = spawnFixture.spawn_particle.default_force.result
    const spawnParams = spawnFixture.spawn_entity.params as SpawnEntityParams
    const handle: SpawnEntityResult = spawnFixture.spawn_entity.result
    expect(heightParams).toEqual([3, 4, 20])
    expect(height).toBe(-1)
    expect(particleParams).toHaveLength(9)
    expect(forcedParticleParams[9]).toBe(false)
    expect(accepted).toBe(4)
    expect(spawnParams[3]).toBe('minecraft:allay')
    expect(handle).toMatch(/^mceh_/)
    expect(spawnFixture.spawn_particle.default_force.effective_force).toBe(true)
  })

  it('keeps events.poll options and cumulative loss fields in one bounded result', () => {
    const defaultParams = eventsFixture.poll_requests.default as EventsPollParams
    const boundedParams = eventsFixture.poll_requests.bounded as EventsPollParams
    const result = eventsFixture.poll_result as EventsPollResult
    expect(defaultParams).toEqual([0])
    expect(boundedParams).toEqual([0, { max_events: 3 }])
    expect(result.events.map((event) => event.type)).toEqual(['block_right_click', 'chat_posted', 'projectile_hit'])
    expect(result.through_sequence).toBe(3)
    expect(result.overflow_dropped_total).toBe(0)
    expect(eventsFixture.limits).toEqual({
      max_compact_jsonrpc_response_bytes: 61_440,
      max_observer_frame_bytes: 65_536,
    })
  })
})
