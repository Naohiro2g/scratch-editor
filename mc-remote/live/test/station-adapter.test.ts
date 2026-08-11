import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test, vi } from 'vitest'
import { STATION_JSON_CONTENT_TYPE, STATION_NDJSON_CONTENT_TYPE } from '../src/station'
import { createSameOriginStationAdapter } from '../src/station-adapter'

const contractFixturePath = fileURLToPath(new URL('./fixtures/station-attach-v1.json', import.meta.url))
const sessionFixturePath = fileURLToPath(new URL('./fixtures/observer-session-lifecycle.ndjson', import.meta.url))
const contractFixture = JSON.parse(readFileSync(contractFixturePath, 'utf8')) as {
  bootstrap_ready: unknown
  bootstrap_not_ready: unknown
}
const sessionFixture = readFileSync(sessionFixturePath, 'utf8')

const jsonResponse = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': STATION_JSON_CONTENT_TYPE },
  })

const streamResponse = (value: string): Response =>
  new Response(value, {
    status: 200,
    headers: { 'Content-Type': STATION_NDJSON_CONTENT_TYPE },
  })

const callbacks = () => ({
  onEnvelope: vi.fn((value: unknown) => {
    const envelope = value as { type?: string }
    return envelope.type === 'mcremote.wirescope.end'
  }),
  onTransportLost: vi.fn(),
  onUnavailable: vi.fn(),
})

describe('same-origin WireScope station adapter', () => {
  test('bootstraps, sends a canonical code, and streams the shared NDJSON fixture', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(contractFixture.bootstrap_ready))
      .mockResolvedValueOnce(streamResponse(sessionFixture))
    const onStatus = vi.fn()
    const onAttachError = vi.fn()
    const stationCallbacks = callbacks()
    const adapter = createSameOriginStationAdapter(
      { currentOrigin: 'http://127.0.0.1:43123', fetch: fetchImpl },
      { onStatus, onAttachError },
    )
    const cleanup = adapter.start(stationCallbacks)

    await vi.waitFor(() => expect(onStatus).toHaveBeenCalledWith('station-ready'))
    adapter.submitAttachCode('0000-0000')
    await vi.waitFor(() => expect(stationCallbacks.onEnvelope).toHaveBeenCalledTimes(2))

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:43123/__mcremote/wirescope/bootstrap/v1',
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
      }),
    )
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:43123/__mcremote/wirescope/attach/v1',
      expect.objectContaining({
        method: 'POST',
        body: '{"attach_code":"00000000"}',
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
      }),
    )
    expect(onStatus).toHaveBeenCalledWith('station-attaching')
    expect(onStatus).toHaveBeenCalledWith('station-attached')
    expect(stationCallbacks.onTransportLost).not.toHaveBeenCalled()
    expect(onAttachError).not.toHaveBeenCalled()
    cleanup()
  })

  test('fails closed when bootstrap is missing, oversized, or not exact', async () => {
    for (const response of [
      jsonResponse({ ...(contractFixture.bootstrap_ready as object), target_id: 'target-01' }),
      jsonResponse({ value: 'x'.repeat(5000) }),
      new Response('missing', { status: 404, headers: { 'Content-Type': STATION_JSON_CONTENT_TYPE } }),
    ]) {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response)
      const stationCallbacks = callbacks()
      const adapter = createSameOriginStationAdapter(
        { currentOrigin: 'http://127.0.0.1:43123', fetch: fetchImpl },
        { onStatus: vi.fn(), onAttachError: vi.fn() },
      )
      const cleanup = adapter.start(stationCallbacks)
      await vi.waitFor(() => expect(stationCallbacks.onUnavailable).toHaveBeenCalledTimes(1))
      cleanup()
    }
  })

  test('reports bounded attach errors without consuming the adapter', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(contractFixture.bootstrap_not_ready))
      .mockResolvedValueOnce(jsonResponse({ error: 'target-not-ready' }, 409))
      .mockResolvedValueOnce(streamResponse(sessionFixture))
    const onStatus = vi.fn()
    const onAttachError = vi.fn()
    const stationCallbacks = callbacks()
    const adapter = createSameOriginStationAdapter(
      { currentOrigin: 'http://127.0.0.1:43123', fetch: fetchImpl },
      { onStatus, onAttachError },
    )
    const cleanup = adapter.start(stationCallbacks)

    await vi.waitFor(() => expect(onStatus).toHaveBeenCalledWith('station-target-not-ready'))
    adapter.submitAttachCode('00000000')
    await vi.waitFor(() => expect(onAttachError).toHaveBeenCalledWith('target-not-ready'))
    adapter.submitAttachCode('00000000')
    await vi.waitFor(() => expect(stationCallbacks.onEnvelope).toHaveBeenCalledTimes(2))

    expect(fetchImpl).toHaveBeenCalledTimes(3)
    cleanup()
  })

  test('rejects malformed input locally without an attach request', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(contractFixture.bootstrap_ready))
    const onStatus = vi.fn()
    const onAttachError = vi.fn()
    const adapter = createSameOriginStationAdapter(
      { currentOrigin: 'http://127.0.0.1:43123', fetch: fetchImpl },
      { onStatus, onAttachError },
    )
    const cleanup = adapter.start(callbacks())
    await vi.waitFor(() => expect(onStatus).toHaveBeenCalledWith('station-ready'))

    adapter.submitAttachCode('not-a-code')
    expect(onAttachError).toHaveBeenCalledWith('malformed-code')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    cleanup()
  })

  test.each([
    ['missing final LF', sessionFixture.trimEnd()],
    ['CRLF framing', sessionFixture.replaceAll('\n', '\r\n')],
    ['UTF-8 BOM', `\uFEFF${sessionFixture}`],
    ['oversized line', `${'x'.repeat(512 * 1024 + 1)}\n`],
  ])('maps %s to transport-lost', async (_label, body) => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(contractFixture.bootstrap_ready))
      .mockResolvedValueOnce(streamResponse(body))
    const stationCallbacks = callbacks()
    stationCallbacks.onEnvelope.mockReturnValue(false)
    const onStatus = vi.fn()
    const adapter = createSameOriginStationAdapter(
      { currentOrigin: 'http://127.0.0.1:43123', fetch: fetchImpl },
      { onStatus, onAttachError: vi.fn() },
    )
    const cleanup = adapter.start(stationCallbacks)
    await vi.waitFor(() => expect(onStatus).toHaveBeenCalledWith('station-ready'))

    adapter.submitAttachCode('00000000')
    await vi.waitFor(() => expect(stationCallbacks.onTransportLost).toHaveBeenCalledTimes(1))
    cleanup()
  })
})
