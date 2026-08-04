/**
 * `catalog.get` contract (wire-format-design §7.2.1). Catalogs describe the
 * registry used by the authenticated server connection; they are not bundled
 * client defaults.
 */

export type CatalogScalar = boolean | number | string

export interface BlockCatalogEntry {
  states: Readonly<Record<string, readonly CatalogScalar[]>>
  default_state: Readonly<Record<string, CatalogScalar>>
  [key: string]: unknown
}

export interface CatalogBody {
  block: Readonly<Record<string, BlockCatalogEntry>>
  entity: Readonly<Record<string, Readonly<Record<string, unknown>>>>
  particle: Readonly<Record<string, Readonly<Record<string, unknown>>>>
}

/** `catalog.get` uses positional params and accepts no arguments. */
export type CatalogGetParams = readonly []

/**
 * The digest covers only `block`, `entity`, and `particle`; `catalogHash`
 * carries the SHA-256 hex digest advertised by `hello` for verification.
 */
export interface CatalogGetResult extends CatalogBody {
  catalogHash: string
}
