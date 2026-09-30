import { describe, expect, it } from 'vitest'
import type { PlayBlockSoundParams, PlayBlockSoundResult, PlaySoundParams, PlaySoundResult } from '../src/index.ts'
import { ERROR_REASON_CODE, ErrorCode, ErrorReason, Method, PROTOCOL_VERSION } from '../src/index.ts'
import fixture from './fixtures/entity-particle-v23.2.json'

describe('B8 sound and resource owner fixture', () => {
  it('pins the contract, method mirror, and stable errors', () => {
    expect(fixture.schema).toBe('mcremote.entity-particle.v23.2')
    expect(fixture.protocol).toBe(PROTOCOL_VERSION)
    expect(fixture.methods.sound).toBe(Method.worldPlaySound)
    expect(fixture.methods.block_sound).toBe(Method.worldPlayBlockSound)
    expect(fixture.knowledge_contract.sections).toEqual(['5.0.2', '5.8.3'])
    expect(ERROR_REASON_CODE[ErrorReason.unknownSound]).toBe(ErrorCode.invalidParams)
    expect(ERROR_REASON_CODE[ErrorReason.noBlock]).toBe(ErrorCode.serverError)
    const ids = [
      ...fixture.nearby.cases,
      ...fixture.nearby.handle_transaction_cases,
      ...fixture.entity_lifecycle.cases,
      ...fixture.particle_stage_2.cases,
      ...fixture.sound.cases,
      ...fixture.resource_ids.cases,
    ].map((item) => item.id)
    expect(ids).toHaveLength(111)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('covers both sound shapes, option bounds, and resource input forms', () => {
    const sound: PlaySoundParams = fixture.sound.cases[0].params as PlaySoundParams
    const blockSound: PlayBlockSoundParams = fixture.sound.cases[5].params as PlayBlockSoundParams
    const soundResult: PlaySoundResult = fixture.sound.cases[0].result as PlaySoundResult
    const blockSoundResult: PlayBlockSoundResult = fixture.sound.cases[5].result as PlayBlockSoundResult
    expect(sound).toEqual([0.25, 64.5, -3, 'entity.cow.ambient'])
    expect(blockSound).toEqual([1, 2, -3, 'place'])
    expect([soundResult, blockSoundResult]).toEqual([null, null])
    expect(fixture.sound.cases.filter((item) => item.result === null)).toHaveLength(11)
    expect(fixture.sound.cases.find((item) => item.id === 'B8-S20')).toMatchObject({
      reason: 'no_block',
      code: -32000,
    })
    expect(fixture.sound.cases.find((item) => item.id === 'B8-S21')).toMatchObject({
      reason: 'player_offline',
      code: -32000,
    })
    for (const kind of ['block', 'dimension', 'particle', 'entity', 'sound']) {
      const cases = fixture.resource_ids.cases.filter((item) => item.kind === kind)
      expect(cases).toHaveLength(3)
      expect(cases.map((item) => ('canonical' in item ? 'accepted' : 'rejected'))).toEqual([
        'accepted',
        'accepted',
        'rejected',
      ])
      expect(cases[0].canonical).toBe(cases[1].canonical)
    }
    expect(fixture.resource_ids.cases.find((item) => item.id === 'B8-R06')).toMatchObject({
      reason: 'invalid_params',
    })
    expect(fixture.sound.validation_order.sound.slice(0, 4)).toEqual([
      'params_and_options',
      'sound_resolution',
      'self_binding',
      'self_online',
    ])
    expect(fixture.sound.cases.find((item) => item.id === 'B8-S23')).toMatchObject({
      reason: 'unknown_sound',
      precedence: ['unknown_sound', 'auth_required'],
    })
  })
})
