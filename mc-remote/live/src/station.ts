import { OBSERVER_SCHEMA, OBSERVER_SCHEMA_VERSION } from './observer'
import { OBSERVER_SESSION_PROTOCOL_VERSION } from './session'

export const STATION_ATTACH_PROTOCOL_VERSION = 1 as const
export const STATION_BOOTSTRAP_PATH = '/__mcremote/wirescope/bootstrap/v1' as const
export const STATION_ATTACH_PATH = '/__mcremote/wirescope/attach/v1' as const

export const STATION_JSON_CONTENT_TYPE = 'application/json' as const
export const STATION_NDJSON_CONTENT_TYPE = 'application/x-ndjson' as const
export const STATION_BOOTSTRAP_MAX_BYTES = 4 * 1024
export const STATION_ERROR_MAX_BYTES = 4 * 1024
export const STATION_ATTACH_REQUEST_MAX_BYTES = 1024
export const STATION_NDJSON_LINE_MAX_BYTES = 512 * 1024

export const STATION_ATTACH_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ' as const

export const STATION_CONTENT_SECURITY_POLICY =
  "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" as const

export const STATION_REQUIRED_RESPONSE_HEADERS = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy': STATION_CONTENT_SECURITY_POLICY,
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
} as const

export type StationAttachErrorCode =
  | 'target-not-ready'
  | 'malformed-code'
  | 'invalid-code'
  | 'attempts-exhausted'
  | 'code-expired'
  | 'already-redeemed'
  | 'invalid-request'

export interface StationBootstrap {
  station_attach_protocol_version: typeof STATION_ATTACH_PROTOCOL_VERSION
  observer_session_protocol_version: typeof OBSERVER_SESSION_PROTOCOL_VERSION
  observer_schema: {
    name: typeof OBSERVER_SCHEMA
    version: typeof OBSERVER_SCHEMA_VERSION
  }
  artifact: {
    manifest_sha256: string
  }
  station_ready: boolean
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const hasExactFields = (value: Record<string, unknown>, fields: readonly string[]): boolean => {
  const actual = Object.keys(value).sort()
  const expected = [...fields].sort()
  return actual.length === expected.length && actual.every((field, index) => field === expected[index])
}

export const parseStationBootstrap = (value: unknown): StationBootstrap | null => {
  if (
    !isObject(value) ||
    !hasExactFields(value, [
      'station_attach_protocol_version',
      'observer_session_protocol_version',
      'observer_schema',
      'artifact',
      'station_ready',
    ]) ||
    value.station_attach_protocol_version !== STATION_ATTACH_PROTOCOL_VERSION ||
    value.observer_session_protocol_version !== OBSERVER_SESSION_PROTOCOL_VERSION ||
    typeof value.station_ready !== 'boolean' ||
    !isObject(value.observer_schema) ||
    !hasExactFields(value.observer_schema, ['name', 'version']) ||
    value.observer_schema.name !== OBSERVER_SCHEMA ||
    value.observer_schema.version !== OBSERVER_SCHEMA_VERSION ||
    !isObject(value.artifact) ||
    !hasExactFields(value.artifact, ['manifest_sha256']) ||
    typeof value.artifact.manifest_sha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(value.artifact.manifest_sha256)
  ) {
    return null
  }
  return value as unknown as StationBootstrap
}

const stationAttachErrorCodes = new Set<StationAttachErrorCode>([
  'target-not-ready',
  'malformed-code',
  'invalid-code',
  'attempts-exhausted',
  'code-expired',
  'already-redeemed',
  'invalid-request',
])

export const parseStationAttachError = (value: unknown): StationAttachErrorCode | null => {
  if (!isObject(value) || !hasExactFields(value, ['error']) || typeof value.error !== 'string') return null
  return stationAttachErrorCodes.has(value.error as StationAttachErrorCode)
    ? (value.error as StationAttachErrorCode)
    : null
}

export const normalizeStationAttachCode = (value: string): string | null => {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/^([0-9A-Z]{4})-([0-9A-Z]{4})$/, '$1$2')
  if (normalized.length !== 8) return null
  for (const character of normalized) {
    if (!STATION_ATTACH_CODE_ALPHABET.includes(character)) return null
  }
  return normalized
}
