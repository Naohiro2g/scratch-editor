import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { eventClassesForPollResponse } from '../src/frame-filter'
import { parseObserverSnapshot } from '../src/observer'

const fixture = JSON.parse(
  readFileSync(new URL('../../protocol/test/fixtures/chat-event-compat-v23.2.json', import.meta.url), 'utf8'),
) as {
  chat_post: { cases: { id: string; result: unknown; accept: boolean }[] }
  event_batches: {
    cases: { id: string; result: unknown; accept: boolean; expected_observer?: unknown }[]
  }
}
const lifecycle = JSON.parse(
  readFileSync(new URL('./fixtures/scratch-main-lifecycle.json', import.meta.url), 'utf8'),
) as { streams: { hello: { protocol: string }; frames: unknown[] }[] }[]

const snapshotFor = (method: string, result: unknown) => {
  const snapshot = structuredClone(lifecycle[0])
  snapshot.streams[0].hello.protocol = '23.3.0'
  snapshot.streams[0].frames = [
    { sequence: 1, observed_at: 1, direction: 'receive', request_id: 1, method, payload: { result } },
  ]
  return snapshot
}

describe('b9 shared chat and event compatibility fixture', () => {
  it('accepts only null chat.post success results', () => {
    for (const item of fixture.chat_post.cases) {
      const parse = () => parseObserverSnapshot(snapshotFor('chat.post', item.result))
      if (item.accept) expect(parse, item.id).not.toThrow()
      else expect(parse, item.id).toThrow('must be null')
    }
  })

  it('summarizes unknown types without exposing opaque fields or hiding known-event failures', () => {
    for (const item of fixture.event_batches.cases) {
      const parse = () => parseObserverSnapshot(snapshotFor('events.poll', item.result))
      if (item.accept) {
        const payload = parse().streams[0].frames[0].payload
        expect(payload, item.id).toEqual({ result: item.expected_observer })
        if (item.id === 'B9-E02') expect(eventClassesForPollResponse(payload)).toEqual(['other'])
      } else expect(parse, item.id).toThrow()
    }
  })
})
