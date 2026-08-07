import { describe, expect, test } from 'vitest'
import type { ObserverStream } from '../src/observer'
import { selectActiveStream } from '../src/view-state'

const stream = (id: string): ObserverStream =>
  ({
    id,
    kind: id === 'main' ? 'main' : 'substream',
    status: 'connected',
    hello: {},
    frames: [],
  }) as ObserverStream

describe('WireScope stream tabs', () => {
  test('keeps the selected stream while snapshots update', () => {
    const streams = [stream('main'), stream('events'), stream('commands')]

    expect(selectActiveStream(streams, 'events').id).toBe('events')
  })

  test('falls back to the first stream when the selected stream ends', () => {
    const streams = [stream('main'), stream('commands')]

    expect(selectActiveStream(streams, 'events').id).toBe('main')
    expect(selectActiveStream(streams, null).id).toBe('main')
  })
})
