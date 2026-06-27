/**
 * Error model (wire-format-design §7.3). Errors ride on the standard JSON-RPC
 * `error` object. `code` carries only the JSON-RPC family; the stable meaning
 * lives in `data.reason`, which UI / AI / tests branch on.
 */

/** JSON-RPC reserved codes plus the base of the server-defined range. */
export const ErrorCode = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
  /** Base of the implementation-defined range -32000..-32099. */
  serverError: -32000,
} as const

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]

/** Stable `data.reason` enum carried on protocol errors (b1 set). */
export const ErrorReason = {
  /** Parse failure of the block ref (broken brackets, etc.). */
  malformedRef: 'malformed_ref',
  /** Syntax OK but the block does not exist. */
  unknownBlock: 'unknown_block',
  /** Property name not valid for that block (`stone[axis=y]`). */
  unknownProperty: 'unknown_property',
  /** Value out of range (`oak_log[axis=w]`); may carry `allowed`. */
  invalidPropertyValue: 'invalid_property_value',
  /** get/setBlock target chunk not loaded. */
  unloadedChunk: 'unloaded_chunk',
} as const

export type ErrorReason = (typeof ErrorReason)[keyof typeof ErrorReason]

/** JSON-RPC `error.code` family for each reason (wire-format-design §7.3). */
export const ERROR_REASON_CODE: Record<ErrorReason, ErrorCode> = {
  [ErrorReason.malformedRef]: ErrorCode.invalidParams,
  [ErrorReason.unknownBlock]: ErrorCode.invalidParams,
  [ErrorReason.unknownProperty]: ErrorCode.invalidParams,
  [ErrorReason.invalidPropertyValue]: ErrorCode.invalidParams,
  [ErrorReason.unloadedChunk]: ErrorCode.serverError,
}

/** `error.data` payload. `ref` echoes the offending input and is required. */
export interface ProtocolErrorData {
  reason: ErrorReason
  ref: string
  /** Allowed values; returned for `invalid_property_value` when known. */
  allowed?: readonly string[]
}
