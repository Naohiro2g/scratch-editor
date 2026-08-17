import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  BRIDGE_TRANSPORT_PROTOCOL,
  decodeBrowserMessage,
  offersBridgeTransport,
  ONE_SHOT_HINT,
  ONE_SHOT_HINT_KEY,
} from '../src/transport.ts'

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/one-shot-transport-v1.json', import.meta.url), 'utf8'),
) as {
  probe_protocol: string
  selected_protocol: string
  hint_key: string
  hint: string
  sample_payload: string
  sample_message: string
}

describe('one-shot browser transport', () => {
  it('matches the shared exact fixture', () => {
    expect(BRIDGE_TRANSPORT_PROTOCOL).toBe(fixture.selected_protocol)
    expect(ONE_SHOT_HINT_KEY).toBe(fixture.hint_key)
    expect(ONE_SHOT_HINT).toBe(fixture.hint)
    expect(decodeBrowserMessage(fixture.sample_message)).toEqual({
      ok: true,
      message: {
        mode: 'one-shot',
        payload: fixture.sample_payload,
        byteLength: Buffer.byteLength(fixture.sample_message, 'utf8'),
      },
    })
  })

  it('leaves a persistent payload byte-for-byte unchanged', () => {
    expect(decodeBrowserMessage(fixture.sample_payload)).toEqual({
      ok: true,
      message: {
        mode: 'persistent',
        payload: fixture.sample_payload,
        byteLength: Buffer.byteLength(fixture.sample_payload, 'utf8'),
      },
    })
  })

  it('rejects unknown hints, extra fields, and oversized payloads', () => {
    expect(
      decodeBrowserMessage(JSON.stringify({ [ONE_SHOT_HINT_KEY]: 'future-v2', payload: fixture.sample_payload })),
    ).toEqual({ ok: false, reason: 'unsupported_transport_hint' })
    expect(
      decodeBrowserMessage(
        JSON.stringify({ [ONE_SHOT_HINT_KEY]: ONE_SHOT_HINT, payload: fixture.sample_payload, extra: true }),
      ),
    ).toEqual({ ok: false, reason: 'invalid_transport_envelope' })
    expect(
      decodeBrowserMessage(
        JSON.stringify({ [ONE_SHOT_HINT_KEY]: ONE_SHOT_HINT, payload: 'x'.repeat(64 * 1024 + 1) }),
      ),
    ).toEqual({ ok: false, reason: 'one_shot_payload_too_large' })
  })

  it('requires the selected protocol to be offered', () => {
    expect(offersBridgeTransport(`${fixture.probe_protocol}, ${fixture.selected_protocol}`)).toBe(true)
    expect(offersBridgeTransport(fixture.probe_protocol)).toBe(false)
    expect(offersBridgeTransport(undefined)).toBe(false)
  })
})
