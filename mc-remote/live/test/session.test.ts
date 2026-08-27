import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test, vi } from 'vitest'
import {
  createObserverSession,
  OBSERVER_SESSION_END,
  OBSERVER_SESSION_PROTOCOL_VERSION,
  OBSERVER_SESSION_SNAPSHOT,
  parseObserverSessionEnvelope,
  type ObserverSessionEndReason,
} from '../src/session'

const fixturePath = fileURLToPath(new URL('./fixtures/scratch-main-lifecycle.json', import.meta.url))
const sessionFixturePath = fileURLToPath(new URL('./fixtures/observer-session-lifecycle.ndjson', import.meta.url))
const eventsFixturePath = fileURLToPath(new URL('../../protocol/test/fixtures/events-v23.json', import.meta.url))
const snapshots = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown[]
const eventsFixture = JSON.parse(readFileSync(eventsFixturePath, 'utf8')) as {
  limits: { max_compact_jsonrpc_response_bytes: number; max_observer_frame_bytes: number }
  poll_result: { events: Record<string, unknown>[] }
}

const snapshotEnvelope = (snapshot: unknown, droppedFrames = 0) => ({
  type: OBSERVER_SESSION_SNAPSHOT,
  protocol_version: OBSERVER_SESSION_PROTOCOL_VERSION,
  snapshot,
  history_window: { dropped_frames: droppedFrames },
})

const callbacks = () => ({
  onSnapshot: vi.fn(),
  onEnd: vi.fn(),
  onError: vi.fn(),
})

describe('observer session core', () => {
  test('accepts the transport-neutral NDJSON lifecycle fixture', () => {
    const events = callbacks()
    const session = createObserverSession(events)
    const envelopes = readFileSync(sessionFixturePath, 'utf8')
      .trimEnd()
      .split('\n')
      .map((line) => JSON.parse(line) as unknown)

    for (const envelope of envelopes) session.receive(envelope)

    expect(events.onSnapshot).toHaveBeenCalledWith(snapshots[1], { dropped_frames: 7 })
    expect(events.onEnd).toHaveBeenCalledWith('target-ended')
    expect(events.onError).not.toHaveBeenCalled()
  })

  test('applies a snapshot and its history window atomically', () => {
    const events = callbacks()
    const session = createObserverSession(events)

    session.receive(snapshotEnvelope(snapshots[0], 7))

    expect(events.onSnapshot).toHaveBeenCalledWith(snapshots[0], { dropped_frames: 7 })
    expect(events.onError).not.toHaveBeenCalled()
  })

  test('requires dropped frames to increase monotonically within a session', () => {
    const events = callbacks()
    const session = createObserverSession(events)

    session.receive(snapshotEnvelope(snapshots[0], 7))
    session.receive(snapshotEnvelope(snapshots[1], 6))

    expect(events.onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'invalid-history-window' }))
    expect(events.onSnapshot).toHaveBeenCalledTimes(1)
  })

  test('keeps one target identity for the lifetime of a session', () => {
    const events = callbacks()
    const session = createObserverSession(events)
    const changedTarget = structuredClone(snapshots[1]) as {
      target: { id: string }
    }
    changedTarget.target.id = 'target-other'

    session.receive(snapshotEnvelope(snapshots[0]))
    session.receive(snapshotEnvelope(changedTarget))

    expect(events.onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'target-changed' }))
    expect(events.onSnapshot).toHaveBeenCalledTimes(1)
  })

  test.each<ObserverSessionEndReason>(['target-ended', 'source-closed', 'backpressure', 'capacity-exhausted'])(
    'accepts the wire end reason %s',
    (reason) => {
      const events = callbacks()
      const session = createObserverSession(events)

      session.receive({
        type: OBSERVER_SESSION_END,
        protocol_version: OBSERVER_SESSION_PROTOCOL_VERSION,
        reason,
      })

      expect(events.onEnd).toHaveBeenCalledWith(reason)
      expect(events.onError).not.toHaveBeenCalled()
    },
  )

  test('synthesizes transport-lost locally and ignores later input', () => {
    const events = callbacks()
    const session = createObserverSession(events)

    session.transportLost()
    session.receive(snapshotEnvelope(snapshots[0]))

    expect(events.onEnd).toHaveBeenCalledWith('transport-lost')
    expect(events.onSnapshot).not.toHaveBeenCalled()
  })

  test('rejects an unknown protocol version without changing schema v1', () => {
    const events = callbacks()
    const session = createObserverSession(events)

    session.receive({ ...snapshotEnvelope(snapshots[0]), protocol_version: 2 })

    expect(events.onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'invalid-session' }))
  })

  test('rejects transport-lost as a wire end reason', () => {
    const events = callbacks()
    const session = createObserverSession(events)

    session.receive({
      type: OBSERVER_SESSION_END,
      protocol_version: OBSERVER_SESSION_PROTOCOL_VERSION,
      reason: 'transport-lost',
    })

    expect(events.onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'invalid-end' }))
    expect(events.onEnd).not.toHaveBeenCalled()
  })

  test('keeps a maximum-sized events.poll response within one observer session frame', () => {
    const result = structuredClone(eventsFixture.poll_result)
    const chatEvent = structuredClone(result.events[1])
    let message = ''
    const escapedUnit = '\\"\\\n漢'
    const jsonRpcResponse = () => ({
      jsonrpc: '2.0',
      id: 1,
      result: { ...result, events: [{ ...chatEvent, message }] },
    })
    while (
      Buffer.byteLength(
        JSON.stringify({
          ...jsonRpcResponse(),
          result: { ...jsonRpcResponse().result, events: [{ ...chatEvent, message: message + escapedUnit }] },
        }),
      ) <= eventsFixture.limits.max_compact_jsonrpc_response_bytes
    ) {
      message += escapedUnit
    }

    const responseBytes = Buffer.byteLength(JSON.stringify(jsonRpcResponse()))
    const snapshot = structuredClone(snapshots[0]) as {
      streams: { frames: unknown[] }[]
    }
    snapshot.streams[0].frames = [
      {
        sequence: 1,
        observed_at: 1,
        direction: 'receive',
        request_id: 1,
        method: 'events.poll',
        payload: { result: jsonRpcResponse().result },
      },
    ]
    const envelope = snapshotEnvelope(snapshot)
    const envelopeBytes = Buffer.byteLength(JSON.stringify(envelope)) + 1

    expect(responseBytes).toBeLessThanOrEqual(eventsFixture.limits.max_compact_jsonrpc_response_bytes)
    expect(responseBytes).toBeGreaterThan(eventsFixture.limits.max_compact_jsonrpc_response_bytes - 16)
    expect(envelopeBytes).toBeLessThanOrEqual(eventsFixture.limits.max_observer_frame_bytes)
    expect(parseObserverSessionEnvelope(envelope)).toEqual(envelope)
  })
})
