import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import {
  normalizeStationAttachCode,
  parseStationAttachError,
  parseStationBootstrap,
  STATION_ATTACH_PATH,
  STATION_ATTACH_PROTOCOL_VERSION,
  STATION_ATTACH_REQUEST_MAX_BYTES,
  STATION_BOOTSTRAP_MAX_BYTES,
  STATION_BOOTSTRAP_PATH,
  STATION_CONTENT_SECURITY_POLICY,
  STATION_ERROR_MAX_BYTES,
  STATION_JSON_CONTENT_TYPE,
  STATION_NDJSON_CONTENT_TYPE,
  STATION_NDJSON_LINE_MAX_BYTES,
  STATION_REQUIRED_RESPONSE_HEADERS,
} from '../src/station'

const fixturePath = fileURLToPath(new URL('./fixtures/station-attach-v1.json', import.meta.url))
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
  protocol_version: number
  paths: { bootstrap: string; attach: string }
  content_types: { json: string; ndjson: string }
  limits: Record<string, number>
  bootstrap_ready: unknown
  bootstrap_not_ready: unknown
  attach_request: { attach_code: string }
  attach_errors: { status: number; body: unknown; consumes_attempt: boolean }[]
  required_response_headers: Record<string, string>
}

describe('WireScope station attach contract', () => {
  test('keeps the transport constants aligned with the shared fixture', () => {
    expect(fixture.protocol_version).toBe(STATION_ATTACH_PROTOCOL_VERSION)
    expect(fixture.paths).toEqual({ bootstrap: STATION_BOOTSTRAP_PATH, attach: STATION_ATTACH_PATH })
    expect(fixture.content_types).toEqual({ json: STATION_JSON_CONTENT_TYPE, ndjson: STATION_NDJSON_CONTENT_TYPE })
    expect(fixture.limits).toEqual({
      bootstrap_response_max_bytes: STATION_BOOTSTRAP_MAX_BYTES,
      error_response_max_bytes: STATION_ERROR_MAX_BYTES,
      attach_request_max_bytes: STATION_ATTACH_REQUEST_MAX_BYTES,
      ndjson_line_max_bytes: STATION_NDJSON_LINE_MAX_BYTES,
    })
    expect(fixture.required_response_headers).toEqual(STATION_REQUIRED_RESPONSE_HEADERS)
    expect(readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8')).toContain(
      `content="${STATION_CONTENT_SECURITY_POLICY}"`,
    )
  })

  test('strictly parses ready and not-ready bootstrap responses', () => {
    expect(parseStationBootstrap(fixture.bootstrap_ready)?.station_ready).toBe(true)
    expect(parseStationBootstrap(fixture.bootstrap_not_ready)?.station_ready).toBe(false)
    expect(parseStationBootstrap({ ...(fixture.bootstrap_ready as object), target_id: 'secret' })).toBeNull()
    expect(
      parseStationBootstrap({
        ...(fixture.bootstrap_ready as object),
        artifact: { manifest_sha256: 'A'.repeat(64) },
      }),
    ).toBeNull()
  })

  test('fixes every bounded attach error and its attempt accounting', () => {
    expect(
      fixture.attach_errors.map(({ status, body, consumes_attempt }) => ({
        status,
        error: parseStationAttachError(body),
        consumes_attempt,
      })),
    ).toEqual([
      { status: 409, error: 'target-not-ready', consumes_attempt: false },
      { status: 400, error: 'malformed-code', consumes_attempt: false },
      { status: 403, error: 'invalid-code', consumes_attempt: true },
      { status: 429, error: 'attempts-exhausted', consumes_attempt: true },
      { status: 410, error: 'code-expired', consumes_attempt: false },
      { status: 409, error: 'already-redeemed', consumes_attempt: false },
      { status: 400, error: 'invalid-request', consumes_attempt: false },
    ])
    expect(parseStationAttachError({ error: 'target-not-ready', retry_after: 1 })).toBeNull()
  })

  test('normalizes only the ambiguity-free eight-symbol attach code', () => {
    expect(normalizeStationAttachCode('0000-0000')).toBe(fixture.attach_request.attach_code)
    expect(normalizeStationAttachCode('abcd-efgh')).toBe('ABCDEFGH')
    expect(normalizeStationAttachCode('abcd-ilou')).toBeNull()
    expect(normalizeStationAttachCode('too-short')).toBeNull()
  })
})
