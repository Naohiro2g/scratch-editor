import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { parseObserverSnapshot } from '../src/observer'

const fixturePath = fileURLToPath(new URL('./fixtures/scratch-main-lifecycle.json', import.meta.url))

describe('observer schema v1', () => {
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
})
