/**
 * `hello` handshake (wire-format-design §6). One per connection; carries
 * identity / auth / build context. The reply envelope is flat and stable from
 * b1 to the final form — clients read whether `catalogHash` is filled, not
 * whether fields exist.
 */
import type { DimensionKey, DimensionRef } from './commands'

/** Build origin as an absolute `[x, y, z]` triple. */
export type Origin = readonly [x: number, y: number, z: number]

export interface HelloClient {
  name: string
  version: string
  locale?: string
}

/** Auth modes (token / pair). Concrete shape lands in a later beta. */
export interface HelloAuth {
  token?: string
}

/** Build context. Omitted means overworld at origin (200, 0, 200). */
export interface BuildContext {
  dimension?: DimensionRef
  origin?: Origin
}

/** `hello` request params (object — the only object-params method). */
export interface HelloParams {
  protocol: string
  client?: HelloClient
  auth?: HelloAuth
  build?: BuildContext
}

export interface HelloPermissions {
  online: boolean
  offline: boolean
  buildRange?: number | string
}

export interface WorldConstants {
  /** Sea level advertised as world information; not used in coordinate math. */
  y_sea: number | null
}

/**
 * `hello` reply result. `catalogHash` is always present but `null` until
 * auth + catalog arrive in a later beta. World/profile constants are grouped
 * under `world_constants` so later constants can be added without scattering
 * top-level fields.
 */
export interface HelloResult {
  protocol: string
  mc_version: string
  supported_mc_versions: readonly string[]
  catalogHash: string | null
  world_constants: WorldConstants
  session?: string
  player?: string
  dimension: DimensionKey
  origin: Origin
  permissions?: HelloPermissions
  server?: string
}
