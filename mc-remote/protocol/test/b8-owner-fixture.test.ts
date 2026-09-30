import { describe, expect, it } from 'vitest'
import type {
  EntityGetPoseParams,
  EntityGetPoseResult,
  EntityRemoveParams,
  EntityRemoveResult,
  EntitySetPoseParams,
  EntitySetPoseResult,
  GetNearbyEntitiesParams,
  GetNearbyEntitiesResult,
  SpawnParticleParams,
} from '../src/index.ts'
import { ERROR_REASON_CODE, ErrorCode, ErrorReason, Method, PROTOCOL_VERSION } from '../src/index.ts'
import fixture from './fixtures/entity-particle-v23.2.json'

interface Candidate {
  uuid: string
  absolute_pos: readonly number[]
  player?: boolean
  dimension?: string
  valid?: boolean
}

interface NearbyCase {
  id: string
  params?: readonly number[]
  origin?: readonly number[]
  candidates?: readonly Candidate[]
  selected_uuids?: readonly string[]
  chunk_bounds?: readonly number[]
  chunk_columns?: number
  work_cost?: number
}

const nearbyCases = fixture.nearby.cases as NearbyCase[]
const nearbyCase = (id: string): NearbyCase => {
  const found = nearbyCases.find((item) => item.id === id)
  if (!found) throw new Error(`B8 owner fixture missing nearby case ${id}`)
  return found
}

describe('B8 shared owner fixture', () => {
  it('identifies the landed contract and gives every case a unique ID', () => {
    expect(fixture.knowledge_contract).toEqual({
      commit: '0318332a2b3395a5d74b46d7da6946030a2fc172',
      path: '10-protocol/wire-format-design_ja.md',
      sections: ['5.0.2', '5.8.3'],
      decisions: ['2026-09-30-01', '2026-09-30-02', '2026-09-30-06'],
    })
    expect(fixture.protocol).toBe(PROTOCOL_VERSION)
    expect(fixture.methods).toEqual({
      nearby: Method.worldGetNearbyEntities,
      get_pose: Method.entityGetPose,
      set_pose: Method.entitySetPose,
      remove: Method.entityRemove,
      particle: Method.worldSpawnParticle,
      sound: Method.worldPlaySound,
      block_sound: Method.worldPlayBlockSound,
    })
    expect(ErrorReason.particleDataUnsupported).toBe('particle_data_unsupported')
    expect(ERROR_REASON_CODE[ErrorReason.particleDataUnsupported]).toBe(ErrorCode.invalidParams)
    const ids = [
      ...fixture.nearby.cases,
      ...fixture.nearby.handle_transaction_cases,
      ...fixture.entity_lifecycle.cases,
      ...fixture.particle_stage_2.cases,
    ].map((item) => item.id)
    expect(ids).toHaveLength(59)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('mirrors the exact B8 method params and result shapes', () => {
    const nearby = nearbyCase('B8-N02')
    const nearbyParams: GetNearbyEntitiesParams = nearby.params as GetNearbyEntitiesParams
    const nearbyResult: GetNearbyEntitiesResult = [{ handle: 'mcr_eh_cow', type: 'minecraft:cow', pos: [3, 4, 0] }]
    const getPose: EntityGetPoseParams = fixture.entity_lifecycle.cases[0].params as EntityGetPoseParams
    const getPoseResult: EntityGetPoseResult = fixture.entity_lifecycle.cases[0].result as EntityGetPoseResult
    const setPose: EntitySetPoseParams = fixture.entity_lifecycle.cases[1].params as EntitySetPoseParams
    const setPoseResult: EntitySetPoseResult = fixture.entity_lifecycle.cases[1].result as EntitySetPoseResult
    const remove: EntityRemoveParams = fixture.entity_lifecycle.cases[3].params as EntityRemoveParams
    const removeResult: EntityRemoveResult = fixture.entity_lifecycle.cases[3].result as EntityRemoveResult
    const particle: SpawnParticleParams = fixture.particle_stage_2.cases[3].params as SpawnParticleParams

    expect(nearbyParams).toEqual([0, 0, 0, 5, 2])
    expect(nearbyResult).toEqual(nearby.result)
    expect(getPose).toEqual(['mcr_eh_pose'])
    expect(getPoseResult.dimension).toBe('minecraft:overworld')
    expect(setPose).toHaveLength(7)
    expect(setPoseResult.dimension).toBe('minecraft:the_nether')
    expect(remove).toEqual(['mcr_eh_pose'])
    expect(removeResult).toBeNull()
    expect(particle[6]).toMatchObject({ particle_id: 'minecraft:dust', data: { color: [0, 0, 0], size: 0.01 } })
  })

  it('keeps the runtime defaults within the protocol caps', () => {
    const caps = fixture.nearby.protocol_caps
    const policy = fixture.nearby.distribution_policy
    expect([caps.radius_min, caps.radius_max, caps.max_entities_min, caps.max_entities_max]).toEqual([0, 64, 1, 64])
    expect([policy.max_radius, policy.max_entities, policy.may_lower, policy.may_raise]).toEqual([
      64,
      64,
      true,
      false,
    ])
    for (const id of ['B8-N08', 'B8-N09', 'B8-N10', 'B8-N11', 'B8-N12']) {
      expect(nearbyCase(id)).toMatchObject({ reason: 'invalid_params', candidate_search_calls: 0 })
    }
  })

  it('calculates chunk columns from geometry, including negative and maximum boundaries', () => {
    for (const id of ['B8-N05', 'B8-N06', 'B8-N07']) {
      const item = nearbyCase(id)
      if (!item.params || !item.chunk_bounds || item.chunk_columns === undefined || item.work_cost === undefined) {
        throw new Error(`B8 owner fixture missing geometry for ${id}`)
      }
      const [x, , z, radius, maxEntities] = item.params
      const [minX, maxX, minZ, maxZ] = item.chunk_bounds
      expect([minX, maxX, minZ, maxZ]).toEqual([
        Math.floor(Math.floor(x - radius) / 16),
        Math.floor(Math.floor(x + radius) / 16),
        Math.floor(Math.floor(z - radius) / 16),
        Math.floor(Math.floor(z + radius) / 16),
      ])
      expect(item.chunk_columns).toBe((maxX - minX + 1) * (maxZ - minZ + 1))
      expect(item.work_cost).toBe(item.chunk_columns + maxEntities)
    }
    expect(nearbyCase('B8-N07').work_cost).toBe(145)
    expect(fixture.nearby.cases.find((item) => item.id === 'B8-N19')).toMatchObject({
      chunk_spans_decimal: ['9223372036854775807', '2'],
      reason: 'work_limit_exceeded',
    })
    const [wide, two] = ['9223372036854775807', '2'].map(BigInt)
    expect(wide * two).toBeGreaterThan(9223372036854775807n)
  })

  it('selects the sphere boundary and sorts by unrounded distance then UUID', () => {
    for (const id of ['B8-N01', 'B8-N02', 'B8-N03', 'B8-N04']) {
      const item = nearbyCase(id)
      if (!item.params || !item.candidates || !item.selected_uuids) {
        throw new Error(`B8 owner fixture missing candidates for ${id}`)
      }
      const origin = item.origin ?? [0, 0, 0]
      const center = item.params.slice(0, 3).map((value, index) => value + origin[index])
      const radiusSquared = item.params[3] ** 2
      const seen = new Set<string>()
      const selected = item.candidates
        .filter(
          (candidate) =>
            !candidate.player &&
            (!candidate.dimension || candidate.dimension === fixture.nearby.stream_dimension) &&
            candidate.valid !== false,
        )
        .filter((candidate) => {
          if (seen.has(candidate.uuid)) return false
          seen.add(candidate.uuid)
          return true
        })
        .map((candidate) => ({
          uuid: candidate.uuid,
          distanceSquared: candidate.absolute_pos.reduce(
            (sum, value, index) => sum + (value - center[index]) ** 2,
            0,
          ),
        }))
        .filter((candidate) => candidate.distanceSquared <= radiusSquared)
        .sort((a, b) => a.distanceSquared - b.distanceSquared || (a.uuid < b.uuid ? -1 : a.uuid > b.uuid ? 1 : 0))
        .slice(0, item.params[4])
        .map((candidate) => candidate.uuid)
      expect(selected).toEqual(item.selected_uuids)
    }
    expect(fixture.nearby.cases.find((item) => item.id === 'B8-N02')).toMatchObject({
      result: [{ handle: 'mcr_eh_cow', type: 'minecraft:cow', pos: [3, 4, 0] }],
    })
  })

  it('covers atomic handle changes, snapshot candidate disappearance, pose movement, and removal', () => {
    expect(fixture.nearby.handle_transaction_cases.find((item) => item.id === 'B8-H04')).toMatchObject({
      projected_size: 257,
      reason: 'entity_capacity_exhausted',
      old_handle_preserved: true,
      registry_commit_count: 0,
    })
    expect(fixture.nearby.handle_transaction_cases.find((item) => item.id === 'B8-H05')).toMatchObject({
      max_entities: 2,
      result_uuids: ['00000000-0000-0000-0000-000000000031'],
      staged_handle_revokes: 1,
    })
    expect(fixture.nearby.handle_transaction_cases.find((item) => item.id === 'B8-H06')).toMatchObject({
      result: [],
      reason: null,
    })
    expect(fixture.nearby.handle_transaction_cases.find((item) => item.id === 'B8-H07')).toMatchObject({
      old_handle_preserved: true,
      registry_commit_count: 0,
    })
    expect(fixture.entity_lifecycle.cases.find((item) => item.id === 'B8-E02')).toMatchObject({
      teleport_calls: 1,
      work_cost: 1,
      issued_dimension_after_success: 'minecraft:the_nether',
    })
    expect(fixture.entity_lifecycle.cases.find((item) => item.id === 'B8-E04')).toMatchObject({
      result: null,
      handle_valid_after_success: false,
      next_reason: 'entity_not_found',
    })
  })

  it('covers typed particle bounds, omission, and unsupported data without changing shorthand', () => {
    expect(fixture.particle_stage_2.dust_color_channel_range).toEqual([0, 255])
    expect(fixture.particle_stage_2.dust_size_range).toEqual([0.01, 4])
    for (const id of ['B8-P04', 'B8-P05']) {
      expect(fixture.particle_stage_2.cases.find((item) => item.id === id)).toMatchObject({ result: 1 })
    }
    for (const id of ['B8-P06', 'B8-P07', 'B8-P08', 'B8-P09', 'B8-P10', 'B8-P11', 'B8-P15']) {
      expect(fixture.particle_stage_2.cases.find((item) => item.id === id)).toMatchObject({
        reason: 'invalid_params',
      })
    }
    expect(fixture.particle_stage_2.cases.find((item) => item.id === 'B8-P16')).toMatchObject({
      reason: 'particle_data_required',
    })
    expect(fixture.particle_stage_2.cases.find((item) => item.id === 'B8-P18')).toMatchObject({
      reason: 'particle_data_unsupported',
    })
    expect(fixture.particle_stage_2.cases.find((item) => item.id === 'B8-P17')).toMatchObject({
      reason: 'particle_data_required',
    })
  })
})
