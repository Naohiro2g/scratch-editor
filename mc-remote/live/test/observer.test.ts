import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { parseObserverSnapshot } from '../src/observer'

const fixturePath = fileURLToPath(new URL('./fixtures/scratch-main-lifecycle.json', import.meta.url))
interface MutableSnapshotFixture {
  schema_version: number
  streams: { hello: { protocol: string }; frames: unknown[] }[]
}

describe('observer schema v1.1', () => {
  test('accepts the Scratch main-stream lifecycle fixture', () => {
    const lifecycle: unknown = JSON.parse(readFileSync(fixturePath, 'utf8'))
    expect(Array.isArray(lifecycle)).toBe(true)
    for (const snapshot of lifecycle as unknown[]) {
      expect(parseObserverSnapshot(snapshot)).toEqual(snapshot)
    }
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
    snapshot.schema_version = 1.1
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

  test('accepts protocol 22 height and entity handle observations', () => {
    const lifecycle = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown[]
    const snapshot = structuredClone(lifecycle[0]) as MutableSnapshotFixture
    snapshot.schema_version = 1.1
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
        payload: { params: ['minecraft:allay', 1, 2, 3] },
      },
      {
        sequence: 4,
        observed_at: 4,
        direction: 'receive',
        request_id: 2,
        method: 'world.spawnEntity',
        payload: { result: 'mceh_example' },
      },
    ]
    expect(parseObserverSnapshot(snapshot)).toEqual(snapshot)
  })

  test('rejects malformed height and entity handle results', () => {
    const lifecycle = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown[]
    const snapshot = structuredClone(lifecycle[0]) as MutableSnapshotFixture
    snapshot.schema_version = 1.1
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
  })

  test('rejects legacy protocol 21 block strings and synthetic setter results', () => {
    const lifecycle = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown[]
    const snapshot = structuredClone(lifecycle[0]) as MutableSnapshotFixture
    snapshot.schema_version = 1.1
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
