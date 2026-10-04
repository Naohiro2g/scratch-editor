import { describe, expect, it } from 'vitest'
import type { ChatPostResult } from '../src/index'
import { Method, PROTOCOL_VERSION } from '../src/index'
import fixture from './fixtures/chat-event-compat-v23.2.json'

describe('b9 chat and event compatibility owner fixture', () => {
  it('pins the unchanged protocol and ratified contracts with unique case IDs', () => {
    expect(fixture.schema).toBe('mcremote.chat-event-compat.v23.2')
    expect(fixture.protocol).toBe(PROTOCOL_VERSION)
    expect(fixture.knowledge_contract.commit).toBe('900f6f4b8027d265a62ba7f139d4f3b1bbe78100')
    expect(fixture.knowledge_contract.decisions).toEqual(['2026-10-03-01', '2026-10-03-02'])
    expect(fixture.chat_post.method).toBe(Method.chatPost)
    expect(fixture.event_batches.method).toBe(Method.eventsPoll)
    const cases = [
      ...fixture.chat_post.cases,
      ...fixture.event_batches.cases,
      ...fixture.event_batches.stateful_rejections,
    ]
    expect(cases).toHaveLength(33)
    expect(new Set(cases.map((item) => item.id)).size).toBe(cases.length)
  })

  it('exposes null as the acknowledged chat result and preserves all events in server responses', () => {
    const result: ChatPostResult = null
    expect(fixture.chat_post.cases.filter((item) => item.accept).map((item) => item.result)).toEqual([result])
    const mixed = fixture.event_batches.cases.find((item) => item.id === 'B9-E01')
    expect(mixed?.result.events.map((item) => item.type)).toEqual(['pickaxe_poke', 'future_event', 'chat_posted'])
  })
})
