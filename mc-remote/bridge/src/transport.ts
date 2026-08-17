export const BRIDGE_TRANSPORT_PROBE_PROTOCOL = 'mcremote.bridge.probe.v1'
export const BRIDGE_TRANSPORT_PROTOCOL = 'mcremote.bridge.one-shot.v1'
export const ONE_SHOT_HINT_KEY = 'mcremote_bridge_transport'
export const ONE_SHOT_HINT = 'one-shot-v1'

export interface BrowserMessage {
  mode: 'persistent' | 'one-shot'
  payload: string
  byteLength: number
}

export type BrowserMessageResult =
  | { ok: true; message: BrowserMessage }
  | { ok: false; reason: 'invalid_transport_envelope' | 'one_shot_payload_too_large' | 'unsupported_transport_hint' }

const MAX_ONE_SHOT_PAYLOAD_BYTES = 64 * 1024
const ONE_SHOT_ENVELOPE_PREFIX = /^\s*\{\s*"mcremote_bridge_transport"\s*:/

/**
 * Check that the browser offered the exact Bridge transport implemented by
 * this build. The probe protocol is deliberately offered first: an older
 * Bridge selects it by default, which lets the browser fail closed.
 * @param header The Sec-WebSocket-Protocol request header.
 * @returns Whether the required transport protocol was offered.
 */
export function offersBridgeTransport(header: string | undefined): boolean {
  if (header === undefined) return false
  return header
    .split(',')
    .map((protocol) => protocol.trim())
    .includes(BRIDGE_TRANSPORT_PROTOCOL)
}

/**
 * Decode only the Scratch-to-Bridge transport envelope. A normal WebSocket
 * message remains an opaque JSON-RPC payload and is not validated here.
 * @param rawMessage One complete browser WebSocket message.
 * @returns The transport mode and untouched plugin payload, or a close reason.
 */
export function decodeBrowserMessage(rawMessage: string): BrowserMessageResult {
  if (!ONE_SHOT_ENVELOPE_PREFIX.test(rawMessage)) return persistent(rawMessage)

  let candidate: unknown
  try {
    candidate = JSON.parse(rawMessage)
  } catch {
    return { ok: false, reason: 'invalid_transport_envelope' }
  }

  if (candidate === null || Array.isArray(candidate) || typeof candidate !== 'object') {
    return { ok: false, reason: 'invalid_transport_envelope' }
  }

  const envelope = candidate as Record<string, unknown>
  if (envelope[ONE_SHOT_HINT_KEY] !== ONE_SHOT_HINT) {
    return { ok: false, reason: 'unsupported_transport_hint' }
  }
  const keys = Object.keys(envelope)
  if (keys.length !== 2 || !keys.includes('payload') || typeof envelope.payload !== 'string') {
    return { ok: false, reason: 'invalid_transport_envelope' }
  }
  if (Buffer.byteLength(envelope.payload, 'utf8') > MAX_ONE_SHOT_PAYLOAD_BYTES) {
    return { ok: false, reason: 'one_shot_payload_too_large' }
  }
  return {
    ok: true,
    message: {
      mode: 'one-shot',
      payload: envelope.payload,
      byteLength: Buffer.byteLength(rawMessage, 'utf8'),
    },
  }
}

function persistent(payload: string): BrowserMessageResult {
  return {
    ok: true,
    message: {
      mode: 'persistent',
      payload,
      byteLength: Buffer.byteLength(payload, 'utf8'),
    },
  }
}
