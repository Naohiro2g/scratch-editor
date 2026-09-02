import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { parseObserverSnapshot } from '../src/observer'

const fixturePath = fileURLToPath(new URL('./fixtures/scratch-main-lifecycle.json', import.meta.url))
const eventsFixturePath = fileURLToPath(new URL('../../protocol/test/fixtures/events-v23.json', import.meta.url))
const spawnFixturePath = fileURLToPath(new URL('../../protocol/test/fixtures/spawn-v22.json', import.meta.url))
const dimensionsFixturePath = fileURLToPath(
  new URL('../../protocol/test/fixtures/dimensions-v22.json', import.meta.url),
)
const b7FixturePath = fileURLToPath(
  new URL('../../protocol/test/fixtures/direction-lightning-v23.1.json', import.meta.url),
)
const eventsFixture = JSON.parse(readFileSync(eventsFixturePath, 'utf8')) as {
  poll_requests: { default: unknown[]; rejected: unknown[][] }
  poll_result: Record<string, unknown>
}
const spawnFixture = JSON.parse(readFileSync(spawnFixturePath, 'utf8')) as {
  spawn_particle: {
    default_force: { params: unknown[]; result: number }
  }
  spawn_entity: { params: unknown[]; result: string; legacy_entity_first: unknown[] }
}
const dimensionsFixture = JSON.parse(readFileSync(dimensionsFixturePath, 'utf8')) as {
  custom_build_context: { dimension: string; origin: number[] }
  invalid_refs: string[]
}
const b7Fixture = JSON.parse(readFileSync(b7FixturePath, 'utf8')) as {
  methods: Record<string, string>
  direction: {
    valid_vectors: { id: string; result: number[] }[]
    invalid_vectors: { id: string; params?: unknown[] }[]
    method_cases: { id: string; method: string; params?: unknown[]; result?: number[] }[]
  }
  handles: { unresolved_strings: { handle: string }[] }
  lightning: { wire_cases: { id: string; method?: string; params?: unknown[]; result?: null }[] }
  reasons: string[]
  rejected_methods: string[]
}
// spawn-v22.json's spawn_entity.result predates the protocol 23 mcr_eh_ handle prefix
// (DECISIONS 2026-08-26-08) and is kept as-is since it is a protocol-22-labeled fixture;
// use a protocol 23 handle here instead when exercising the current parser.
const PROTOCOL_23_ENTITY_HANDLE = 'mcr_eh_example'
interface MutableSnapshotFixture {
  schema_version: number
  streams: { hello: { protocol: string }; frames: unknown[] }[]
}

describe('observer schema v1 compatibility set', () => {
  test('accepts the Scratch main-stream lifecycle fixture', () => {
    const lifecycle: unknown = JSON.parse(readFileSync(fixturePath, 'utf8'))
    expect(Array.isArray(lifecycle)).toBe(true)
    for (const snapshot of lifecycle as unknown[]) {
      expect(parseObserverSnapshot(snapshot)).toEqual(snapshot)
    }
  })

  test('anchors the lifecycle fixture b7 methods to the protocol owner fixture', () => {
    const lifecycle = JSON.parse(readFileSync(fixturePath, 'utf8')) as MutableSnapshotFixture[]
    const frames = lifecycle[1].streams[0].frames as {
      direction: string
      method: string
      payload: { params?: unknown; result?: unknown }
    }[]
    expect(lifecycle[1].streams[0].hello.protocol).toBe('23.1.0')
    for (const method of Object.values(b7Fixture.methods)) {
      expect(frames.some((frame) => frame.method === method)).toBe(true)
    }
    const ownerPlayerGet = b7Fixture.direction.method_cases.find((item) => item.id === 'B7-D30')
    const ownerLightning = b7Fixture.lightning.wire_cases.find((item) => item.id === 'B7-L01')
    expect(
      frames.find((frame) => frame.direction === 'send' && frame.method === ownerPlayerGet?.method)?.payload.params,
    ).toEqual(ownerPlayerGet?.params)
    expect(
      frames.find((frame) => frame.direction === 'receive' && frame.method === ownerPlayerGet?.method)?.payload
        .result,
    ).toEqual(ownerPlayerGet?.result)
    expect(
      frames.find((frame) => frame.direction === 'send' && frame.method === ownerLightning?.method)?.payload.params,
    ).toEqual(ownerLightning?.params)
    expect(
      frames.find((frame) => frame.direction === 'receive' && frame.method === ownerLightning?.method)?.payload
        .result,
    ).toEqual(ownerLightning?.result)
  })

  test.each(['token', 'pair_code', 'player_uuid', 'credential_id', 'device_label'])(
    'rejects forbidden field %s anywhere in a snapshot',
    (field) => {
      const lifecycle = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown[]
      const snapshot = structuredClone(parseObserverSnapshot(lifecycle[0]))
      const stream = snapshot.streams[0]
      Object.assign(stream, { [field]: 'secret' })
      expect(() => parseObserverSnapshot(snapshot)).toThrow(`unknown field: ${field}`)
    },
  )

  test('keeps target and stream identities distinct', () => {
    const lifecycle = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown[]
    const snapshot = structuredClone(parseObserverSnapshot(lifecycle[0]))
    const stream = snapshot.streams[0]
    stream.id = snapshot.target.id
    expect(() => parseObserverSnapshot(snapshot)).toThrow('target id must not be used as a stream id')
  })

  test('accepts a protocol 22 FAST notification followed by connection.flush', () => {
    const lifecycle = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown[]
    const snapshot = structuredClone(lifecycle[0]) as MutableSnapshotFixture
    snapshot.schema_version = 1
    snapshot.streams[0].hello.protocol = '22.0.0'
    snapshot.streams[0].frames = [
      {
        sequence: 1,
        observed_at: 1,
        direction: 'send',
        request_id: null,
        method: 'world.setBlock',
        payload: { params: [1, 2, 3, { block_id: 'oak_log', state: { axis: 'z' } }] },
      },
      {
        sequence: 2,
        observed_at: 2,
        direction: 'send',
        request_id: 2,
        method: 'connection.flush',
        payload: { params: [] },
      },
      {
        sequence: 3,
        observed_at: 3,
        direction: 'receive',
        request_id: 2,
        method: 'connection.flush',
        payload: { result: null },
      },
    ]
    expect(parseObserverSnapshot(snapshot)).toEqual(snapshot)
  })

  test('accepts strict events.poll params and the three b5 event DTOs', () => {
    const lifecycle = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown[]
    const snapshot = structuredClone(lifecycle[0]) as MutableSnapshotFixture
    snapshot.schema_version = 1
    snapshot.streams[0].hello.protocol = '22.0.0'
    snapshot.streams[0].frames = [
      {
        sequence: 1,
        observed_at: 1,
        direction: 'send',
        request_id: 1,
        method: 'events.poll',
        payload: { params: eventsFixture.poll_requests.default },
      },
      {
        sequence: 2,
        observed_at: 2,
        direction: 'receive',
        request_id: 1,
        method: 'events.poll',
        payload: { result: eventsFixture.poll_result },
      },
    ]
    expect(parseObserverSnapshot(snapshot)).toEqual(snapshot)
  })

  test('preserves a request DimensionRef and requires canonical dimension results', () => {
    const lifecycle = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown[]
    const snapshot = structuredClone(lifecycle[0]) as MutableSnapshotFixture
    snapshot.streams[0].frames = [
      {
        sequence: 1,
        observed_at: 1,
        direction: 'send',
        request_id: 1,
        method: 'build.setDimension',
        payload: { params: ['myworld:world'] },
      },
      {
        sequence: 2,
        observed_at: 2,
        direction: 'receive',
        request_id: 1,
        method: 'build.setDimension',
        payload: { result: dimensionsFixture.custom_build_context },
      },
    ]
    expect(parseObserverSnapshot(snapshot)).toEqual(snapshot)

    for (const ref of dimensionsFixture.invalid_refs) {
      ;(snapshot.streams[0].frames[0] as { payload: { params: string[] } }).payload.params = [ref]
      expect(() => parseObserverSnapshot(snapshot)).toThrow()
    }
  })

  test.each(eventsFixture.poll_requests.rejected)('rejects an obsolete or malformed events.poll shape', (params) => {
    const lifecycle = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown[]
    const snapshot = structuredClone(lifecycle[0]) as MutableSnapshotFixture
    snapshot.streams[0].hello.protocol = '22.0.0'
    snapshot.streams[0].frames = [
      {
        sequence: 1,
        observed_at: 1,
        direction: 'send',
        request_id: 1,
        method: 'events.poll',
        payload: { params },
      },
    ]
    expect(() => parseObserverSnapshot(snapshot)).toThrow()
  })

  test('accepts height and protocol 23 entity handle observations', () => {
    const lifecycle = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown[]
    const snapshot = structuredClone(lifecycle[0]) as MutableSnapshotFixture
    snapshot.schema_version = 1
    snapshot.streams[0].hello.protocol = '22.0.0'
    snapshot.streams[0].frames = [
      {
        sequence: 1,
        observed_at: 1,
        direction: 'send',
        request_id: 1,
        method: 'world.getHeight',
        payload: { params: [7, 9, 20] },
      },
      {
        sequence: 2,
        observed_at: 2,
        direction: 'receive',
        request_id: 1,
        method: 'world.getHeight',
        payload: { result: -1 },
      },
      {
        sequence: 3,
        observed_at: 3,
        direction: 'send',
        request_id: 2,
        method: 'world.spawnEntity',
        payload: { params: spawnFixture.spawn_entity.params },
      },
      {
        sequence: 4,
        observed_at: 4,
        direction: 'receive',
        request_id: 2,
        method: 'world.spawnEntity',
        payload: { result: PROTOCOL_23_ENTITY_HANDLE },
      },
      {
        sequence: 5,
        observed_at: 5,
        direction: 'send',
        request_id: 3,
        method: 'world.spawnParticle',
        payload: { params: spawnFixture.spawn_particle.default_force.params },
      },
      {
        sequence: 6,
        observed_at: 6,
        direction: 'receive',
        request_id: 3,
        method: 'world.spawnParticle',
        payload: { result: spawnFixture.spawn_particle.default_force.result },
      },
    ]
    expect(parseObserverSnapshot(snapshot)).toEqual(snapshot)
  })

  test('accepts all five protocol 23.1 direction and lightning methods without changing values', () => {
    const lifecycle = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown[]
    const snapshot = structuredClone(lifecycle[0]) as MutableSnapshotFixture
    snapshot.streams[0].hello.protocol = '23.1.0'
    const methodCase = (id: string) => {
      const value = b7Fixture.direction.method_cases.find((item) => item.id === id)
      if (!value) throw new Error(`missing owner fixture case ${id}`)
      return value
    }
    const lightning = b7Fixture.lightning.wire_cases.find((item) => item.id === 'B7-L01')
    const postRead = b7Fixture.direction.valid_vectors.find((item) => item.id === 'B7-D09')?.result
    if (!lightning?.method || !lightning.params || !postRead) throw new Error('incomplete b7 owner fixture')
    const playerGet = methodCase('B7-D30')
    const playerSet = methodCase('B7-D31')
    const entityGet = methodCase('B7-D35')
    const entitySet = methodCase('B7-D36')
    snapshot.streams[0].frames = [
      {
        sequence: 1,
        observed_at: 1,
        direction: 'send',
        request_id: 1,
        method: playerGet.method,
        payload: { params: playerGet.params },
      },
      {
        sequence: 2,
        observed_at: 2,
        direction: 'receive',
        request_id: 1,
        method: playerGet.method,
        payload: { result: playerGet.result },
      },
      {
        sequence: 3,
        observed_at: 3,
        direction: 'send',
        request_id: 2,
        method: playerSet.method,
        payload: { params: playerSet.params },
      },
      {
        sequence: 4,
        observed_at: 4,
        direction: 'receive',
        request_id: 2,
        method: playerSet.method,
        payload: { result: postRead },
      },
      {
        sequence: 5,
        observed_at: 5,
        direction: 'send',
        request_id: 3,
        method: entityGet.method,
        payload: { params: entityGet.params },
      },
      {
        sequence: 6,
        observed_at: 6,
        direction: 'receive',
        request_id: 3,
        method: entityGet.method,
        payload: { result: entityGet.result },
      },
      {
        sequence: 7,
        observed_at: 7,
        direction: 'send',
        request_id: 4,
        method: entitySet.method,
        payload: { params: entitySet.params },
      },
      {
        sequence: 8,
        observed_at: 8,
        direction: 'receive',
        request_id: 4,
        method: entitySet.method,
        payload: { result: postRead },
      },
      {
        sequence: 9,
        observed_at: 9,
        direction: 'send',
        request_id: 5,
        method: lightning.method,
        payload: { params: lightning.params },
      },
      {
        sequence: 10,
        observed_at: 10,
        direction: 'receive',
        request_id: 5,
        method: lightning.method,
        payload: { result: lightning.result },
      },
    ]

    expect(parseObserverSnapshot(snapshot)).toEqual(snapshot)
  })

  test('keeps entity handles opaque and observes lightning notifications from the owner fixture', () => {
    const lifecycle = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown[]
    const snapshot = structuredClone(lifecycle[0]) as MutableSnapshotFixture
    snapshot.streams[0].hello.protocol = '23.1.0'
    const entityGet = b7Fixture.direction.method_cases.find((item) => item.id === 'B7-D35')
    const notification = b7Fixture.lightning.wire_cases.find((item) => item.id === 'B7-L02')
    if (!entityGet?.result || !notification?.method || !notification.params) {
      throw new Error('incomplete b7 owner fixture')
    }
    snapshot.streams[0].frames = [
      ...b7Fixture.handles.unresolved_strings.flatMap(({ handle }, index) => [
        {
          sequence: index * 2 + 1,
          observed_at: index * 2 + 1,
          direction: 'send',
          request_id: index + 1,
          method: b7Fixture.methods.entity_get_direction,
          payload: { params: [handle] },
        },
        {
          sequence: index * 2 + 2,
          observed_at: index * 2 + 2,
          direction: 'receive',
          request_id: index + 1,
          method: b7Fixture.methods.entity_get_direction,
          payload: { result: entityGet.result },
        },
      ]),
      {
        sequence: 20,
        observed_at: 20,
        direction: 'send',
        request_id: null,
        method: notification.method,
        payload: { params: notification.params },
      },
    ]

    expect(parseObserverSnapshot(snapshot)).toEqual(snapshot)
  })

  test('preserves b7 reasons and rejects malformed or effect-only observations', () => {
    const lifecycle = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown[]
    const snapshot = structuredClone(lifecycle[0]) as MutableSnapshotFixture
    snapshot.streams[0].hello.protocol = '23.1.0'
    snapshot.streams[0].frames = b7Fixture.reasons.map((reason, index) => ({
      sequence: index + 1,
      observed_at: index + 1,
      direction: 'receive',
      request_id: index + 1,
      method: b7Fixture.methods.strike_lightning,
      payload: { error: { code: -32000, message: 'McRemote error', data: { reason } } },
    }))
    expect(parseObserverSnapshot(snapshot)).toEqual(snapshot)

    const malformedDirection = b7Fixture.direction.invalid_vectors.find((item) => item.id === 'B7-D24')?.params
    const malformedLightning = b7Fixture.lightning.wire_cases.find((item) => item.id === 'B7-L03')?.params
    if (!malformedDirection || !malformedLightning) throw new Error('incomplete b7 owner fixture')
    for (const [method, params] of [
      [b7Fixture.methods.player_set_direction, malformedDirection],
      [b7Fixture.methods.strike_lightning, malformedLightning],
    ] as const) {
      snapshot.streams[0].frames = [
        {
          sequence: 1,
          observed_at: 1,
          direction: 'send',
          request_id: 1,
          method,
          payload: { params },
        },
      ]
      expect(() => parseObserverSnapshot(snapshot)).toThrow()
    }

    snapshot.streams[0].frames = [
      {
        sequence: 1,
        observed_at: 1,
        direction: 'receive',
        request_id: 1,
        method: b7Fixture.methods.player_get_direction,
        payload: { result: [1, 2] },
      },
    ]
    expect(() => parseObserverSnapshot(snapshot)).toThrow('must be a three-number tuple')

    snapshot.streams[0].frames = [
      {
        sequence: 1,
        observed_at: 1,
        direction: 'receive',
        request_id: 1,
        method: b7Fixture.methods.strike_lightning,
        payload: { result: 1 },
      },
    ]
    expect(() => parseObserverSnapshot(snapshot)).toThrow('must be null')

    snapshot.streams[0].frames = [
      {
        sequence: 1,
        observed_at: 1,
        direction: 'send',
        request_id: 1,
        method: b7Fixture.rejected_methods[0],
        payload: { params: [1, 2, 3] },
      },
    ]
    expect(() => parseObserverSnapshot(snapshot)).toThrow('is not observable')
  })

  test('rejects malformed height and entity handle results', () => {
    const lifecycle = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown[]
    const snapshot = structuredClone(lifecycle[0]) as MutableSnapshotFixture
    snapshot.schema_version = 1
    snapshot.streams[0].hello.protocol = '22.0.0'
    snapshot.streams[0].frames = [
      {
        sequence: 1,
        observed_at: 1,
        direction: 'receive',
        request_id: 1,
        method: 'world.getHeight',
        payload: { result: 1.5 },
      },
    ]
    expect(() => parseObserverSnapshot(snapshot)).toThrow('must be an integer')

    snapshot.streams[0].frames = [
      {
        sequence: 2,
        observed_at: 2,
        direction: 'receive',
        request_id: 2,
        method: 'world.spawnEntity',
        payload: { result: 'raw-uuid' },
      },
    ]
    expect(() => parseObserverSnapshot(snapshot)).toThrow('must be an entity handle')

    snapshot.streams[0].frames = [
      {
        sequence: 3,
        observed_at: 3,
        direction: 'receive',
        request_id: 3,
        method: 'world.spawnEntity',
        payload: { result: 'mceh_legacy' },
      },
    ]
    expect(() => parseObserverSnapshot(snapshot)).toThrow('must be an entity handle')
  })

  test('rejects legacy spawn order and malformed particle params', () => {
    const lifecycle = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown[]
    const snapshot = structuredClone(lifecycle[0]) as MutableSnapshotFixture
    snapshot.schema_version = 1
    snapshot.streams[0].hello.protocol = '22.0.0'
    snapshot.streams[0].frames = [
      {
        sequence: 1,
        observed_at: 1,
        direction: 'send',
        request_id: 1,
        method: 'world.spawnEntity',
        payload: { params: spawnFixture.spawn_entity.legacy_entity_first },
      },
    ]
    expect(() => parseObserverSnapshot(snapshot)).toThrow('frame.payload.params[0] must be a finite number')

    snapshot.streams[0].frames = [
      {
        sequence: 2,
        observed_at: 2,
        direction: 'send',
        request_id: 2,
        method: 'world.spawnParticle',
        payload: { params: [1, 2, 3, -1, 0, 0, 'minecraft:flame', 0, 1] },
      },
    ]
    expect(() => parseObserverSnapshot(snapshot)).toThrow('must be a non-negative finite number')
  })

  test('rejects legacy protocol 21 block strings and synthetic setter results', () => {
    const lifecycle = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown[]
    const snapshot = structuredClone(lifecycle[0]) as MutableSnapshotFixture
    snapshot.schema_version = 1
    snapshot.streams[0].hello.protocol = '22.0.0'
    snapshot.streams[0].frames = [
      {
        sequence: 1,
        observed_at: 1,
        direction: 'send',
        request_id: 1,
        method: 'world.setBlock',
        payload: { params: [1, 2, 3, 'minecraft:stone'] },
      },
    ]
    expect(() => parseObserverSnapshot(snapshot)).toThrow()

    snapshot.streams[0].frames = [
      {
        sequence: 2,
        observed_at: 2,
        direction: 'receive',
        request_id: 1,
        method: 'world.setBlock',
        payload: { result: { block_id: 'minecraft:stone', state: {} } },
      },
    ]
    expect(() => parseObserverSnapshot(snapshot)).toThrow('must be null')
  })
})
