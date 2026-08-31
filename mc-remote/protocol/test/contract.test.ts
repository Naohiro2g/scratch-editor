import { describe, expect, it } from 'vitest'
import type {
  BlockSpec,
  BlockValue,
  BuildContextResult,
  BuildSetDimensionParams,
  ConnectionFlushParams,
  ConnectionFlushResult,
  DirectionValue,
  EntityGetDirectionParams,
  EntityGetDirectionResult,
  EntitySetDirectionParams,
  EntitySetDirectionResult,
  EventsPollParams,
  EventsPollResult,
  GetBlocksParams,
  GetBlocksResult,
  GetHeightParams,
  GetHeightResult,
  GetSignParams,
  GetSignResult,
  LineSpec,
  LineValue,
  McRemoteEvent,
  PlayerGetDirectionParams,
  PlayerGetDirectionResult,
  PlayerSetDirectionParams,
  PlayerSetDirectionResult,
  SetBlockResult,
  SetBlocksResult,
  SetSignParams,
  SetSignResult,
  SpawnParticleParams,
  SpawnParticleResult,
  SpawnEntityParams,
  SpawnEntityResult,
  StrikeLightningParams,
  StrikeLightningResult,
  UpdateSignLineParams,
  UpdateSignLineResult,
} from '../src/index.ts'
import { ERROR_REASON_CODE, ErrorCode, ErrorReason, JSONRPC_VERSION, Method, PROTOCOL_VERSION } from '../src/index.ts'
import dimensionsFixture from './fixtures/dimensions-v22.json'
import directionLightningFixture from './fixtures/direction-lightning-v23.1.json'
import eventsFixture from './fixtures/events-v23.json'
import signFixture from './fixtures/sign-v23.json'
import spawnFixture from './fixtures/spawn-v22.json'

describe('protocol constants', () => {
  it('advertises the clean protocol semver without a channel suffix', () => {
    expect(PROTOCOL_VERSION).toBe('23.1.0')
  })

  it('pins the JSON-RPC envelope version', () => {
    expect(JSONRPC_VERSION).toBe('2.0')
  })

  it('uses the TCP dot names as wire methods', () => {
    expect(Method.hello).toBe('hello')
    expect(Method.catalogGet).toBe('catalog.get')
    expect(Method.chatPost).toBe('chat.post')
    expect(Method.buildSetDimension).toBe('build.setDimension')
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
    expect(Method.worldGetSign).toBe('world.getSign')
    expect(Method.worldSetSign).toBe('world.setSign')
    expect(Method.worldUpdateSignLine).toBe('world.updateSignLine')
    expect(Method.playerGetDirection).toBe('player.getDirection')
    expect(Method.playerSetDirection).toBe('player.setDirection')
    expect(Method.entityGetDirection).toBe('entity.getDirection')
    expect(Method.entitySetDirection).toBe('entity.setDirection')
    expect(Method.worldStrikeLightning).toBe('world.strikeLightning')
    expect(Object.values(Method)).not.toContain('world.strikeLightningEffect')
  })
})

describe('b7 direction and full lightning owner fixture', () => {
  it('pins the knowledge contract, protocol, methods, and unique case IDs', () => {
    expect(directionLightningFixture.knowledge_contract).toEqual({
      commit: '4ce7acd8644d3d895701dc6e103d87d99c6b21d2',
      path: '10-protocol/wire-format-design_ja.md',
      section: '5.8.2',
    })
    expect(directionLightningFixture.protocol).toBe(PROTOCOL_VERSION)
    expect(directionLightningFixture.methods).toMatchObject({
      player_get_direction: Method.playerGetDirection,
      player_set_direction: Method.playerSetDirection,
      entity_get_direction: Method.entityGetDirection,
      entity_set_direction: Method.entitySetDirection,
      strike_lightning: Method.worldStrikeLightning,
    })
    expect(directionLightningFixture.rejected_methods).toEqual(['world.strikeLightningEffect'])
    expect(Object.values(Method)).not.toContain(directionLightningFixture.rejected_methods[0])

    for (const reason of directionLightningFixture.reasons) {
      expect(Object.values(ErrorReason)).toContain(reason)
      expect(ERROR_REASON_CODE[reason as ErrorReason]).toBeTypeOf('number')
    }

    const serialized = JSON.stringify(directionLightningFixture)
    const ids = [...serialized.matchAll(/"id":"(B7-[DHLP]\d+)"/g)].map((match) => match[1])
    expect(ids.length).toBeGreaterThanOrEqual(50)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('B7-D: mirrors DirectionValue params/results, normalization edges, and post-read invariants', () => {
    const vectors = directionLightningFixture.direction.valid_vectors
    const byName = Object.fromEntries(vectors.map((item) => [item.name, item]))
    const base: DirectionValue = byName.magnitude_equivalence_base.result as DirectionValue
    const scaled: DirectionValue = byName.magnitude_equivalence_scaled.result as DirectionValue
    const getParams: PlayerGetDirectionParams = []
    const getResult: PlayerGetDirectionResult = directionLightningFixture.direction.method_cases[0]
      .result as DirectionValue
    const setParams: PlayerSetDirectionParams = [1, 2, 3]
    const setResult: PlayerSetDirectionResult = base
    const entityGetParams: EntityGetDirectionParams = ['mcr_eh_fixture-current']
    const entityGetResult: EntityGetDirectionResult = byName.positive_x.result as DirectionValue
    const entitySetParams: EntitySetDirectionParams = ['mcr_eh_fixture-current', 1, 2, 3]
    const entitySetResult: EntitySetDirectionResult = scaled

    expect(vectors.filter((item) => /^(positive|negative)_[xyz]$/.test(item.name))).toHaveLength(6)
    expect(base).toEqual(scaled)
    expect(byName.subnormal.result).toEqual([1, 0, 0])
    expect(byName.double_max_value.result).toEqual([0.707107, 0.707107, 0])
    expect(byName.signed_zero_component.result).toEqual([0, 1, 0])
    expect(byName.half_up_boundary.result).toEqual([0.123457, 0.99235, 0])
    expect(directionLightningFixture.direction.output).toMatchObject({
      decimal_places: 6,
      rounding: 'HALF_UP',
      negative_zero: 0,
      norm_tolerance: 0.0000015,
    })
    for (const vector of vectors) {
      expect(Math.abs(Math.hypot(...vector.result) - 1)).toBeLessThanOrEqual(
        directionLightningFixture.direction.output.norm_tolerance,
      )
    }
    expect(getParams).toEqual([])
    expect(getResult).toEqual([0, 0, 1])
    expect(setParams).toEqual([1, 2, 3])
    expect(setResult).toEqual(base)
    expect(entityGetParams[0]).toMatch(/^mcr_eh_/)
    expect(entityGetResult).toEqual([1, 0, 0])
    expect(entitySetParams).toHaveLength(4)
    expect(entitySetResult).toEqual(scaled)

    const invalidReasons = new Set(directionLightningFixture.direction.invalid_vectors.map((item) => item.reason))
    expect(invalidReasons).toEqual(new Set([ErrorReason.zeroDirection, ErrorReason.invalidParams]))
    expect(directionLightningFixture.direction.method_cases[1]).toMatchObject({
      work_cost: 1,
      order: ['params', 'permission', 'work', 'set_rotation', 'post_read'],
      invariants: ['position', 'dimension'],
    })
  })

  it('B7-H: collapses unresolved handles and releases terminal handles after the first exact reason', () => {
    const unresolved = directionLightningFixture.handles.unresolved_strings
    expect(unresolved.map((item) => item.name)).toEqual(['empty', 'foreign', 'unknown', 'old_epoch', 'old_format'])
    expect(new Set(unresolved.map((item) => item.reason))).toEqual(new Set([ErrorReason.entityNotFound]))
    expect(directionLightningFixture.handles.invalid_type.reason).toBe(ErrorReason.invalidParams)
    expect(directionLightningFixture.handles.terminal_transitions).toEqual([
      expect.objectContaining({
        first_reason: ErrorReason.entityUnavailable,
        handle_released: true,
        next_reason: ErrorReason.entityNotFound,
      }),
      expect.objectContaining({
        first_reason: ErrorReason.entityDimensionChanged,
        handle_released: true,
        next_reason: ErrorReason.entityNotFound,
      }),
    ])
  })

  it('B7-L: fixes exact wire, permission order, rate/work boundaries, FIFO, and full-strike calls', () => {
    const wire = directionLightningFixture.lightning.wire_cases[0]
    const params: StrikeLightningParams = wire.params as StrikeLightningParams
    const result: StrikeLightningResult = wire.result
    expect(params).toEqual([1.25, 2.5, -3.75])
    expect(wire.exact_target).toEqual([201.25, 2.5, 196.25])
    expect(result).toBeNull()
    expect(directionLightningFixture.lightning.permission_order).toEqual([
      'params',
      'bound_identity',
      'construction_permission',
      'mcr.lightning',
      'build_range',
      'rate',
      'work',
      'chunk',
      'full_strike',
    ])
    expect(directionLightningFixture.lightning.rate_policy).toMatchObject({
      window_ticks: 20,
      connection_accepts: 1,
      player_accepts: 1,
      global_same_tick_accepts: 2,
      global_window_accepts: 8,
      atomic: true,
      refund_after_later_failure: false,
    })
    expect(directionLightningFixture.lightning.work_policy).toMatchObject({
      cost: 256,
      distribution_max_work_per_request: 4096,
      below_cost_rejection: ErrorReason.workLimitExceeded,
      refund_after_later_failure: false,
    })
    expect(directionLightningFixture.lightning.request_mode_cases[1]).toMatchObject({
      action: 'defer_fifo_head',
      allows_overtake: false,
    })
    expect(directionLightningFixture.lightning.paper_cases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'loaded_chunk', load_chunk_calls: 0, full_strike_calls: 1, effect_calls: 0 }),
        expect.objectContaining({
          name: 'generated_chunk',
          load_chunk_calls: 1,
          full_strike_calls: 1,
          effect_calls: 0,
        }),
        expect.objectContaining({
          name: 'chunk_load_failure',
          full_strike_calls: 0,
          reason: ErrorReason.backpressure,
        }),
        expect.objectContaining({ name: 'full_strike', api: 'World#strikeLightning', calls: 1, cause: 'CUSTOM' }),
        expect.objectContaining({ name: 'paper_exception', reason: ErrorReason.internalError, retry: false }),
      ]),
    )
  })

  it('B7-P: keeps ParticleBuilder Stage 1 wire-compatible with protocol 23 spawnParticle', () => {
    const regression = directionLightningFixture.particle_builder_regression
    const defaultParams = regression.cases[0].params as SpawnParticleParams
    const explicitFalseParams = regression.cases[1].params as SpawnParticleParams
    const defaultResult: SpawnParticleResult = regression.cases[0].result
    expect(regression).toMatchObject({ stage: 1, wire_changed: false, method: Method.worldSpawnParticle })
    expect(regression.default_receiver).toBe('world')
    expect(defaultParams).toHaveLength(9)
    expect(regression.cases[0]).toMatchObject({ effective_force: true, representative_render: 'minecraft:flame' })
    expect(explicitFalseParams).toHaveLength(10)
    expect(explicitFalseParams[9]).toBe(false)
    expect(defaultResult).toBe(4)
    expect(regression.cases.slice(2).map((item) => item.reason)).toEqual([
      ErrorReason.unknownParticle,
      ErrorReason.particleDataRequired,
      ErrorReason.backpressure,
      ErrorReason.workLimitExceeded,
    ])
  })
})

describe('dimension identity', () => {
  it('keeps standard short refs and general namespaces while results are canonical', () => {
    const standard = [dimensionsFixture.accepted_refs[0].input] as BuildSetDimensionParams
    const custom = [dimensionsFixture.accepted_refs[3].input] as BuildSetDimensionParams
    const context = dimensionsFixture.custom_build_context as BuildContextResult
    expect(standard).toEqual(['overworld'])
    expect(custom).toEqual(['myworld:world'])
    expect(context.dimension).toBe('myworld:world')
  })

  it('pins the exact default and excludes legacy world aliases', () => {
    expect(dimensionsFixture.default_dimension).toBe('minecraft:overworld')
    expect(dimensionsFixture.not_aliases).toEqual(['world', 'normal', 'nether', 'end'])
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
    // spawnFixture.spawn_entity.result is spawn-v22.json's historical protocol-22
    // mceh_ example, kept unchanged as a history fixture (2026-08-26 handle
    // cleanup) — reused here for params only, never asserted as a current
    // (protocol 23) SpawnEntityResult. The current positive handle comes from
    // events-v23.json's mcr_eh_ value instead.
    const handle: SpawnEntityResult = eventsFixture.projectile_targets.entity.handle
    expect(heightParams).toEqual([3, 4, 20])
    expect(height).toBe(-1)
    expect(particleParams).toHaveLength(9)
    expect(forcedParticleParams[9]).toBe(false)
    expect(accepted).toBe(4)
    expect(spawnParams[3]).toBe('minecraft:allay')
    expect(handle).toMatch(/^mcr_eh_/)
    expect(spawnFixture.spawn_entity.result).toMatch(/^mceh_/)
    expect(spawnFixture.spawn_particle.default_force.effective_force).toBe(true)
  })

  it('keeps events.poll options and cumulative loss fields in one bounded result', () => {
    const defaultParams = eventsFixture.poll_requests.default as EventsPollParams
    const boundedParams = eventsFixture.poll_requests.bounded as EventsPollParams
    const result = eventsFixture.poll_result as EventsPollResult
    expect(defaultParams).toEqual([0])
    expect(boundedParams).toEqual([0, { max_events: 3 }])
    expect(result.events.map((event) => event.type)).toEqual(['pickaxe_poke', 'chat_posted', 'projectile_hit'])
    const pokeEvent = result.events[0]
    if (pokeEvent.type !== 'pickaxe_poke') throw new Error('expected the first fixture event to be pickaxe_poke')
    expect(pokeEvent.item).toBe('minecraft:diamond_pickaxe')
    expect(result.through_sequence).toBe(3)
    expect(result.overflow_dropped_total).toBe(0)
    expect(eventsFixture.limits).toEqual({
      max_compact_jsonrpc_response_bytes: 61_440,
      max_observer_frame_bytes: 65_536,
    })
  })

  it('carries no protocol-22 mceh_ entity handles in the current protocol 23 events fixture', () => {
    expect(JSON.stringify(eventsFixture)).not.toContain('mceh_')
  })

  it('rejects the protocol-22 block_right_click event type under protocol 23', () => {
    const legacyEvent = eventsFixture.legacy_rejected_events.block_right_click
    expect(legacyEvent.type).toBe('block_right_click')
    const currentTypes = eventsFixture.poll_result.events.map((event) => event.type)
    expect(currentTypes).not.toContain(legacyEvent.type)
    // @ts-expect-error block_right_click is not a member of the McRemoteEvent union in protocol 23.
    const rejected: McRemoteEvent = legacyEvent
    expect(rejected).toBeDefined()
  })
})

describe('b6 sign trio', () => {
  it('registers world.getSign/setSign/updateSignLine with no error-family gap', () => {
    for (const reason of [ErrorReason.notASign, ErrorReason.signWaxed, ErrorReason.signUpdateFailed]) {
      expect(ERROR_REASON_CODE[reason]).toBe(ErrorCode.serverError)
    }
    expect(ERROR_REASON_CODE[ErrorReason.invalidPropertyValue]).toBe(ErrorCode.invalidParams)
  })

  it('B6-S01: accepts string shorthand and object LineSpec with named/hex colors and decorations', () => {
    const cases = signFixture.line_specs['B6-S01']
    const shorthand: LineSpec = cases.string_shorthand
    const namedColor: LineSpec = cases.object_named_color
    const hexColor: LineSpec = cases.object_hex_color
    const allDecorations: LineSpec = cases.object_all_decorations
    expect(shorthand).toBe('Hello')
    expect(namedColor).toEqual({ text: 'Hello', color: 'gold', decorations: ['bold'] })
    expect(hexColor).toMatchObject({ color: '#1A2B3C' })
    expect(allDecorations).toMatchObject({ decorations: signFixture.decorations.canonical_order })
    expect(signFixture.colors.named).toHaveLength(16)
  })

  it('B6-S02: canonical LineValue always carries all fields, defaults to black, decorations name-sorted', () => {
    const cases = signFixture.line_values['B6-S02']
    const fromShorthand: LineValue = cases.from_string_shorthand
    const sorted: LineValue = cases.from_object_unsorted_input.result
    expect(fromShorthand).toEqual({ text: 'Hello', color: 'black', decorations: [] })
    expect(Object.keys(fromShorthand)).toEqual(['text', 'color', 'decorations'])
    expect(sorted.decorations).toEqual(['bold', 'obfuscated', 'underlined'])
    expect(sorted.decorations).toEqual([...sorted.decorations].sort())
  })

  it('B6-S03: world.getSign returns front/back 4-line snapshots and waxed, readable while waxed', () => {
    const testCase = signFixture.get_sign['B6-S03']
    const params: GetSignParams = testCase.params as GetSignParams
    const result: GetSignResult = testCase.result
    expect(params).toEqual([1, 2, 3])
    expect(result.front).toHaveLength(4)
    expect(result.back).toHaveLength(4)
    expect(result.waxed).toBe(true)
  })

  it('B6-S04: world.setSign replaces named faces in one no-merge write, result null', () => {
    const testCase = signFixture.set_sign['B6-S04']
    const params: SetSignParams = testCase.params as SetSignParams
    const result: SetSignResult = testCase.result
    expect(params[3].front).toHaveLength(4)
    expect(params[3].back).toHaveLength(4)
    expect(result).toBeNull()
  })

  it('B6-S05: world.updateSignLine PATCHes one 0-indexed line on one face, result null', () => {
    const testCase = signFixture.update_sign_line['B6-S05']
    const params: UpdateSignLineParams = testCase.params as UpdateSignLineParams
    const result: UpdateSignLineResult = testCase.result
    expect(params[3]).toBe('front')
    expect(params[4]).toBe(0)
    expect(result).toBeNull()
  })

  it('B6-S06: shape/face/index violations are invalid_params, unknown style tokens are invalid_property_value', () => {
    const cases = signFixture.invalid_params['B6-S06']
    const byCase = Object.fromEntries(cases.map((item) => [item.case, item]))
    expect(byCase.wrong_param_count.reason).toBe(ErrorReason.invalidParams)
    expect(byCase.face_out_of_enum.reason).toBe(ErrorReason.invalidParams)
    expect(byCase.face_out_of_enum.data?.path).toBe('params[3]')
    expect(byCase.line_index_out_of_range.reason).toBe(ErrorReason.invalidParams)
    expect(byCase.unknown_color_token.reason).toBe(ErrorReason.invalidPropertyValue)
    expect(byCase.unknown_color_token.data?.property).toBe('color')
    expect(byCase.unknown_decoration_token.reason).toBe(ErrorReason.invalidPropertyValue)
    expect(byCase.unknown_decoration_token.data?.property).toBe('decorations')
  })

  it('B6-S07: not_a_sign, sign_waxed, and sign_update_failed are stable write/read reasons', () => {
    const cases = signFixture.errors['B6-S07']
    expect(cases.not_a_sign.reason).toBe(ErrorReason.notASign)
    expect(cases.sign_waxed.reason).toBe(ErrorReason.signWaxed)
    expect(cases.sign_update_failed.reason).toBe(ErrorReason.signUpdateFailed)
  })
})
