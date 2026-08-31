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

/** Stable `data.reason` enum carried on protocol errors through protocol 23.1. */
export const ErrorReason = {
  invalidParams: 'invalid_params',
  /** A player-bound authenticated operation has no bound identity. */
  authRequired: 'auth_required',
  /** A direction vector contains only positive or negative zero. */
  zeroDirection: 'zero_direction',
  /** Syntax OK but the block does not exist. */
  unknownBlock: 'unknown_block',
  /** Property name not valid for that block (`stone[axis=y]`). */
  unknownProperty: 'unknown_property',
  /** Value out of range (`oak_log[axis=w]`); may carry `allowed`. */
  invalidPropertyValue: 'invalid_property_value',
  /** Build policy, range, or authorization denied the operation. */
  buildDenied: 'build_denied',
  permissionDenied: 'permission_denied',
  playerOffline: 'player_offline',
  unknownDimension: 'unknown_dimension',
  teleportFailed: 'teleport_failed',
  heightNotFound: 'height_not_found',
  unknownParticle: 'unknown_particle',
  particleDataRequired: 'particle_data_required',
  unknownEntity: 'unknown_entity',
  entityNotSpawnable: 'entity_not_spawnable',
  backpressure: 'backpressure',
  workLimitExceeded: 'work_limit_exceeded',
  entityCapacityExhausted: 'entity_capacity_exhausted',
  entityHandleNotFound: 'entity_handle_not_found',
  entityRemoved: 'entity_removed',
  entityUnloaded: 'entity_unloaded',
  entityDimensionChanged: 'entity_dimension_changed',
  /** b7 direction: an opaque handle cannot be resolved in the current epoch. */
  entityNotFound: 'entity_not_found',
  /** b7 direction: the first observation of a removed, unloaded, or invalid target. */
  entityUnavailable: 'entity_unavailable',
  entitySpawnFailed: 'entity_spawn_failed',
  internalError: 'internal_error',
  /** b6 sign (wire-format-design §5.8.1): the target block is not a sign. */
  notASign: 'not_a_sign',
  /** b6 sign: a honeycomb-waxed sign rejects writes; reads remain allowed. */
  signWaxed: 'sign_waxed',
  /** b6 sign: the write's mutation point rejected a stale BlockState snapshot. */
  signUpdateFailed: 'sign_update_failed',
} as const

export type ErrorReason = (typeof ErrorReason)[keyof typeof ErrorReason]

/** JSON-RPC `error.code` family for each reason (wire-format-design §7.3). */
export const ERROR_REASON_CODE: Record<ErrorReason, ErrorCode> = {
  [ErrorReason.invalidParams]: ErrorCode.invalidParams,
  [ErrorReason.authRequired]: ErrorCode.serverError,
  [ErrorReason.zeroDirection]: ErrorCode.invalidParams,
  [ErrorReason.unknownBlock]: ErrorCode.invalidParams,
  [ErrorReason.unknownProperty]: ErrorCode.invalidParams,
  [ErrorReason.invalidPropertyValue]: ErrorCode.invalidParams,
  [ErrorReason.unknownDimension]: ErrorCode.invalidParams,
  [ErrorReason.unknownParticle]: ErrorCode.invalidParams,
  [ErrorReason.particleDataRequired]: ErrorCode.invalidParams,
  [ErrorReason.unknownEntity]: ErrorCode.invalidParams,
  [ErrorReason.entityNotSpawnable]: ErrorCode.invalidParams,
  [ErrorReason.buildDenied]: ErrorCode.serverError,
  [ErrorReason.permissionDenied]: ErrorCode.serverError,
  [ErrorReason.playerOffline]: ErrorCode.serverError,
  [ErrorReason.teleportFailed]: ErrorCode.serverError,
  [ErrorReason.heightNotFound]: ErrorCode.serverError,
  [ErrorReason.backpressure]: ErrorCode.serverError,
  [ErrorReason.workLimitExceeded]: ErrorCode.serverError,
  [ErrorReason.entityCapacityExhausted]: ErrorCode.serverError,
  [ErrorReason.entityHandleNotFound]: ErrorCode.serverError,
  [ErrorReason.entityRemoved]: ErrorCode.serverError,
  [ErrorReason.entityUnloaded]: ErrorCode.serverError,
  [ErrorReason.entityDimensionChanged]: ErrorCode.serverError,
  [ErrorReason.entityNotFound]: ErrorCode.serverError,
  [ErrorReason.entityUnavailable]: ErrorCode.serverError,
  [ErrorReason.entitySpawnFailed]: ErrorCode.serverError,
  [ErrorReason.internalError]: ErrorCode.internalError,
  [ErrorReason.notASign]: ErrorCode.serverError,
  [ErrorReason.signWaxed]: ErrorCode.serverError,
  [ErrorReason.signUpdateFailed]: ErrorCode.serverError,
}

/** Safe structured `error.data` fields used by protocol 22. */
export interface ProtocolErrorData {
  reason: ErrorReason
  path?: string
  block_id?: string
  dimension?: string
  property?: string
  value?: boolean | number | string
  /** Allowed values; returned for `invalid_property_value` when known. */
  allowed?: readonly (boolean | number | string)[]
  /** Optional build bounds returned with `build_denied` when known. */
  bounds?: unknown
  /** Optional offending coordinate or region returned with `build_denied`. */
  violating?: unknown
}
