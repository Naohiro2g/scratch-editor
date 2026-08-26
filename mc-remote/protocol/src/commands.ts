/**
 * Per-method params and result shapes (wire-format-design §4). Coordinates are
 * deltas from the build origin. Protocol 22 represents a block as an object
 * with a resource ID and JSON-native state values.
 */

export type BlockStateValue = boolean | number | string

export interface BlockSpec {
  block_id: string
  state: Readonly<Record<string, BlockStateValue>>
}

export interface BlockValue {
  block_id: string
  state: Readonly<Record<string, BlockStateValue>>
}

/** `chat.post` — send a chat message. b1 uses an acknowledged request. */
export type ChatPostParams = readonly [message: string]

/** A fully-qualified Minecraft dimension identity (`namespace:path`). */
export type DimensionKey = string

/** A fully-qualified key or a path whose omitted namespace means `minecraft`. */
export type DimensionRef = string

export interface BuildContextResult {
  readonly dimension: DimensionKey
  readonly origin: readonly [number, number, number]
}

/** `build.setDimension` — update the stream-local build dimension. */
export type BuildSetDimensionParams = readonly [dimension: DimensionRef]
export type BuildSetDimensionResult = BuildContextResult

/** `build.setOrigin` — update the stream-local build origin. */
export type BuildSetOriginParams = readonly [x: number, y: number, z: number]
export type BuildSetOriginResult = BuildContextResult

/** `world.setBlock` — place one block. Read back explicitly when needed. */
export type SetBlockParams = readonly [x: number, y: number, z: number, block: BlockSpec]
export type SetBlockResult = null

/** `world.setBlocks` — fill a cuboid. b1 uses an acknowledged request. */
export type SetBlocksParams = readonly [
  x1: number,
  y1: number,
  z1: number,
  x2: number,
  y2: number,
  z2: number,
  block: BlockSpec,
]
export type SetBlocksResult = null

/** `world.getBlock` — read one block. Always a request. */
export type GetBlockParams = readonly [x: number, y: number, z: number]

/**
 * `world.getBlock` result: one fully qualified block ID and its full state.
 */
export type GetBlockResult = BlockValue

/** `world.getBlocks` — bounded inclusive cuboid query, ordered z fastest. */
export type GetBlocksParams = readonly [x1: number, y1: number, z1: number, x2: number, y2: number, z2: number]
export type GetBlocksResult = readonly BlockValue[]

/** `world.getHeight` — query the highest surface, optionally at or below maxY. */
export type GetHeightParams = readonly [x: number, z: number] | readonly [x: number, z: number, maxY: number]
export type GetHeightResult = number

/** `world.spawnParticle` — spawn a data-free particle, defaulting force to true when omitted. */
export type SpawnParticleParams =
  | readonly [
      x: number,
      y: number,
      z: number,
      offsetX: number,
      offsetY: number,
      offsetZ: number,
      particle: string,
      speed: number,
      count: number,
    ]
  | readonly [
      x: number,
      y: number,
      z: number,
      offsetX: number,
      offsetY: number,
      offsetZ: number,
      particle: string,
      speed: number,
      count: number,
      force: boolean,
    ]
export type SpawnParticleResult = number

/** `world.spawnEntity` — spawn one entity and return its connection-epoch handle. */
export type SpawnEntityParams = readonly [x: number, y: number, z: number, entity: string]
export type SpawnEntityResult = string

/** `connection.flush` — wait for earlier work in this connection epoch. */
export type ConnectionFlushParams = readonly []
export type ConnectionFlushResult = null

export interface EventsPollOptions {
  readonly max_events: number
}

export type EventsPollParams =
  | readonly [afterSequence: number]
  | readonly [afterSequence: number, options: EventsPollOptions]

/**
 * `pickaxe_poke` — protocol 23/b6 replacement for protocol 22/b5's
 * `block_right_click` (DECISIONS 2026-08-26-06). Gated server-side to block
 * right-clicks made while holding a pickaxe (`org.bukkit.Tag.ITEMS_PICKAXES`);
 * carries the same payload as the event it replaces plus the canonical item
 * type key.
 */
export interface PickaxePokeEvent {
  readonly sequence: number
  readonly type: 'pickaxe_poke'
  readonly dimension: DimensionKey
  readonly origin: readonly [number, number, number]
  readonly pos: readonly [number, number, number]
  readonly face: string
  readonly block: BlockValue
  readonly hand: 'main' | 'off'
  readonly item: string
}

export interface ChatPostedEvent {
  readonly sequence: number
  readonly type: 'chat_posted'
  readonly dimension: DimensionKey
  readonly origin: readonly [number, number, number]
  readonly message: string
}

export type ProjectileTarget =
  | { readonly kind: 'player' }
  | { readonly kind: 'entity'; readonly handle: string }
  | {
      readonly kind: 'block'
      readonly block: BlockValue
      readonly pos: readonly [number, number, number]
      readonly face?: string
    }

export interface ProjectileHitEvent {
  readonly sequence: number
  readonly type: 'projectile_hit'
  readonly dimension: DimensionKey
  readonly origin: readonly [number, number, number]
  readonly projectile: string
  readonly pos: readonly [number, number, number]
  readonly target: ProjectileTarget
}

export type McRemoteEvent = PickaxePokeEvent | ChatPostedEvent | ProjectileHitEvent

export interface EventsPollResult {
  readonly events: readonly McRemoteEvent[]
  readonly through_sequence: number
  readonly latest_sequence: number
  readonly filtered_out: number
  readonly overflow_dropped_total: number
  readonly capacity_dropped_total: number
  readonly explicitly_discarded_total: number
}
