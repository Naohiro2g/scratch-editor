/**
 * `hello` handshake (wire-format-design §6). One per connection; carries
 * identity / auth / build context. The reply envelope is flat and stable from
 * b1 to the final form — clients read whether `catalogHash` is filled, not
 * whether fields exist.
 */

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
  world?: string
  origin?: Origin
}

/** `hello` request params (object — the only object-params method). */
export interface HelloParams {
  protocol: string
  client?: HelloClient
  auth?: HelloAuth
  sandbox?: string
  build?: BuildContext
}

export interface HelloPermissions {
  online: boolean
  offline: boolean
  buildRange?: number | string
}

/**
 * `hello` reply result. Flat and stable across betas. `catalogHash` is always
 * present but `null` until auth + catalog arrive in a later beta.
 */
export interface HelloResult {
  protocol: string
  mc_version: string
  supported_mc_versions: readonly string[]
  catalogHash: string | null
  session?: string
  player?: string
  world?: string
  origin?: Origin
  permissions?: HelloPermissions
  server?: string
}
