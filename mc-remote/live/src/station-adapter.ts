import type { ObserverStationAdapter, ObserverStationAdapterCallbacks } from './client'
import {
  normalizeStationAttachCode,
  parseStationAttachError,
  parseStationBootstrap,
  STATION_ATTACH_PATH,
  STATION_BOOTSTRAP_MAX_BYTES,
  STATION_BOOTSTRAP_PATH,
  STATION_ERROR_MAX_BYTES,
  STATION_JSON_CONTENT_TYPE,
  STATION_NDJSON_CONTENT_TYPE,
  STATION_NDJSON_LINE_MAX_BYTES,
  type StationAttachErrorCode,
  type StationBootstrap,
} from './station'

export type StationAdapterStatus =
  | 'station-ready'
  | 'station-target-not-ready'
  | 'station-attaching'
  | 'station-attached'

export interface StationAdapterViewCallbacks {
  onStatus: (status: StationAdapterStatus) => void
  onAttachError: (code: StationAttachErrorCode) => void
}

export interface SameOriginStationAdapter extends ObserverStationAdapter {
  submitAttachCode: (value: string) => void
}

export interface StationAdapterEnvironment {
  currentOrigin: string
  fetch?: typeof fetch
}

const expectedErrorStatus: Record<StationAttachErrorCode, number> = {
  'target-not-ready': 409,
  'malformed-code': 400,
  'invalid-code': 403,
  'attempts-exhausted': 429,
  'code-expired': 410,
  'already-redeemed': 409,
  'invalid-request': 400,
}

const concatBytes = (left: Uint8Array, right: Uint8Array): Uint8Array<ArrayBuffer> => {
  const result = new Uint8Array(left.byteLength + right.byteLength)
  result.set(left)
  result.set(right, left.byteLength)
  return result
}

const readBoundedBody = async (response: Response, maxBytes: number): Promise<Uint8Array> => {
  if (!response.body) throw new Error('response body is missing')
  const reader = response.body.getReader()
  let result = new Uint8Array()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return result
      if (result.byteLength + value.byteLength > maxBytes) throw new Error('response body exceeds its byte limit')
      result = concatBytes(result, value)
    }
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  }
}

const decodeJson = (bytes: Uint8Array): unknown => {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  return JSON.parse(text) as unknown
}

const assertContentType = (response: Response, expected: string): void => {
  if (response.headers.get('Content-Type') !== expected) {
    throw new Error(`response Content-Type must be ${expected}`)
  }
}

const readNdjson = async (
  response: Response,
  onEnvelope: ObserverStationAdapterCallbacks['onEnvelope'],
): Promise<boolean> => {
  if (!response.body) throw new Error('NDJSON response body is missing')
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let pending = new Uint8Array()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        if (pending.byteLength !== 0) throw new Error('NDJSON response ended without LF')
        return false
      }
      pending = concatBytes(pending, value)
      let lineEnd = pending.indexOf(0x0a)
      while (lineEnd !== -1) {
        const line = pending.slice(0, lineEnd)
        pending = pending.slice(lineEnd + 1)
        if (line.byteLength === 0) throw new Error('NDJSON response contains an empty line')
        if (line.byteLength > STATION_NDJSON_LINE_MAX_BYTES) throw new Error('NDJSON line exceeds its byte limit')
        if (line.includes(0x0d)) throw new Error('NDJSON response must use LF delimiters')
        if (line[0] === 0xef && line[1] === 0xbb && line[2] === 0xbf) {
          throw new Error('NDJSON response must not contain a UTF-8 BOM')
        }
        const envelope = JSON.parse(decoder.decode(line)) as unknown
        if (onEnvelope(envelope)) {
          await reader.cancel().catch(() => {})
          return true
        }
        lineEnd = pending.indexOf(0x0a)
      }
      if (pending.byteLength > STATION_NDJSON_LINE_MAX_BYTES) throw new Error('NDJSON line exceeds its byte limit')
    }
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  }
}

export const createSameOriginStationAdapter = (
  environment: StationAdapterEnvironment,
  viewCallbacks: StationAdapterViewCallbacks,
): SameOriginStationAdapter => {
  const fetchImpl = environment.fetch ?? fetch
  let callbacks: ObserverStationAdapterCallbacks | null = null
  let controller: AbortController | null = null
  let bootstrap: StationBootstrap | null = null
  let attachInFlight = false
  let stopped = true
  const isStopped = (): boolean => stopped

  const request = (path: string): string => new URL(path, environment.currentOrigin).href

  const transportLost = (): void => {
    if (stopped || !callbacks) return
    callbacks.onTransportLost()
  }

  const attach = async (attachCode: string): Promise<void> => {
    if (!callbacks || !controller) return
    viewCallbacks.onStatus('station-attaching')
    try {
      const response = await fetchImpl(request(STATION_ATTACH_PATH), {
        method: 'POST',
        headers: {
          Accept: STATION_NDJSON_CONTENT_TYPE,
          'Content-Type': STATION_JSON_CONTENT_TYPE,
        },
        body: JSON.stringify({ attach_code: attachCode }),
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: controller.signal,
      })
      if (isStopped()) return
      if (response.status !== 200) {
        assertContentType(response, STATION_JSON_CONTENT_TYPE)
        const body = decodeJson(await readBoundedBody(response, STATION_ERROR_MAX_BYTES))
        const errorCode = parseStationAttachError(body)
        if (!errorCode || response.status !== expectedErrorStatus[errorCode])
          throw new Error('invalid attach error response')
        attachInFlight = false
        viewCallbacks.onAttachError(errorCode)
        return
      }
      assertContentType(response, STATION_NDJSON_CONTENT_TYPE)
      viewCallbacks.onStatus('station-attached')
      const ended = await readNdjson(response, callbacks.onEnvelope)
      if (!ended) transportLost()
    } catch {
      if (!isStopped()) transportLost()
    }
  }

  const start = (nextCallbacks: ObserverStationAdapterCallbacks): (() => void) => {
    if (!stopped) throw new Error('same-origin station adapter is already started')
    stopped = false
    callbacks = nextCallbacks
    const startController = new AbortController()
    controller = startController
    void (async () => {
      try {
        const response = await fetchImpl(request(STATION_BOOTSTRAP_PATH), {
          method: 'GET',
          headers: { Accept: STATION_JSON_CONTENT_TYPE },
          cache: 'no-store',
          credentials: 'omit',
          redirect: 'error',
          referrerPolicy: 'no-referrer',
          signal: startController.signal,
        })
        if (isStopped()) return
        if (response.status !== 200) throw new Error('station bootstrap is unavailable')
        assertContentType(response, STATION_JSON_CONTENT_TYPE)
        bootstrap = parseStationBootstrap(decodeJson(await readBoundedBody(response, STATION_BOOTSTRAP_MAX_BYTES)))
        if (!bootstrap) throw new Error('station bootstrap is invalid')
        viewCallbacks.onStatus(bootstrap.station_ready ? 'station-ready' : 'station-target-not-ready')
      } catch {
        if (!isStopped()) nextCallbacks.onUnavailable()
      }
    })()

    return () => {
      if (stopped) return
      stopped = true
      controller?.abort()
      callbacks = null
      controller = null
      bootstrap = null
      attachInFlight = false
    }
  }

  return {
    start,
    submitAttachCode: (value) => {
      if (stopped || !bootstrap || attachInFlight) return
      const attachCode = normalizeStationAttachCode(value)
      if (!attachCode) {
        viewCallbacks.onAttachError('malformed-code')
        return
      }
      attachInFlight = true
      void attach(attachCode)
    },
  }
}
