import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseObserverSnapshot } from '../src/observer'

const soundFixturePath = new URL('../../protocol/test/fixtures/entity-particle-v23.2.json', import.meta.url)
const fixture = JSON.parse(readFileSync(soundFixturePath, 'utf8')) as {
  protocol: string
  sound: { cases: { id: string; method: string; params: unknown[]; result?: null; reason?: string }[] }
  resource_ids: { cases: { id: string; kind: string; input: string; canonical?: string; reason?: string }[] }
}
const lifecycle = JSON.parse(
  readFileSync(new URL('./fixtures/scratch-main-lifecycle.json', import.meta.url), 'utf8'),
) as unknown[]
interface MutableSnapshot {
  streams: { hello: { protocol: string }; frames: unknown[] }[]
}
const snapshotFor = (method: string, payload: Record<string, unknown>, requestId: number | null = 1) => {
  const snapshot = structuredClone(lifecycle[0]) as MutableSnapshot
  snapshot.streams[0].hello.protocol = fixture.protocol
  snapshot.streams[0].frames = [
    {
      sequence: 1,
      observed_at: 1,
      direction: 'params' in payload ? 'send' : 'receive',
      request_id: requestId,
      method,
      payload,
    },
  ]
  return snapshot
}

describe('B8 sound observer', () => {
  it('accepts valid requests, notifications, and null results', () => {
    for (const item of fixture.sound.cases.filter((entry) => 'result' in entry)) {
      const requestId = item.id === 'B8-S01' || item.id === 'B8-S06' ? null : 1
      const request = parseObserverSnapshot(snapshotFor(item.method, { params: item.params }, requestId))
      expect(request.streams[0].frames[0].payload).toEqual({ params: item.params })
      expect(parseObserverSnapshot(snapshotFor(item.method, { result: null })).streams[0].frames[0].payload).toEqual({
        result: null,
      })
    }
  })

  it('rejects malformed sound shapes and option values', () => {
    for (const item of fixture.sound.cases.filter(
      (entry) => entry.reason === 'invalid_params' || entry.id === 'B8-S11',
    )) {
      expect(() => parseObserverSnapshot(snapshotFor(item.method, { params: item.params })), item.id).toThrow()
    }
    expect(() => parseObserverSnapshot(snapshotFor('world.playSound', { result: 1 }))).toThrow()
    expect(() =>
      parseObserverSnapshot(snapshotFor('world.playBlockSound', { params: [0, 0, 0, 'place'] }, null)),
    ).not.toThrow()
  })

  it('checks the shared resource reference matrix and short typed particle IDs', () => {
    for (const item of fixture.resource_ids.cases) {
      const frame =
        item.kind === 'block'
          ? ['world.setBlock', [0, 0, 0, { block_id: item.input, state: {} }]]
          : item.kind === 'dimension'
            ? ['build.setDimension', [item.input]]
            : item.kind === 'entity'
              ? ['world.spawnEntity', [0, 0, 0, item.input]]
              : item.kind === 'particle'
                ? ['world.spawnParticle', [0, 0, 0, 0, 0, 0, item.input, 0, 1]]
                : ['world.playSound', [0, 0, 0, item.input]]
      const observe = () => parseObserverSnapshot(snapshotFor(frame[0] as string, { params: frame[1] }))
      if (item.canonical) expect(observe, item.id).not.toThrow()
      else expect(observe, item.id).toThrow()
    }
    expect(() =>
      parseObserverSnapshot(
        snapshotFor('world.spawnParticle', {
          params: [0, 0, 0, 0, 0, 0, { particle_id: 'dust', data: { color: [1, 2, 3], size: 1 } }, 0, 1],
        }),
      ),
    ).not.toThrow()
  })
})
