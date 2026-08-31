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

/**
 * b6 sign trio (wire-format-design §5.8.1, DECISIONS 2026-08-26-05). A bare
 * `string` is plain-text shorthand; `color` is one of the 16 standard
 * Adventure `NamedTextColor` tokens or `#RRGGBB`; `decorations` is a subset
 * of `bold`/`italic`/`underlined`/`strikethrough`/`obfuscated`.
 */
export type LineSpec =
  | string
  | { readonly text: string; readonly color?: string; readonly decorations?: readonly string[] }

/** Canonical `world.getSign` line shape: all fields always present, decorations name-sorted. */
export interface LineValue {
  readonly text: string
  readonly color: string
  readonly decorations: readonly string[]
}

export type SignFace = 'front' | 'back'
export type SignFaceLines = readonly [LineValue, LineValue, LineValue, LineValue]

/** `world.getSign` — read-only; permitted even when the sign is waxed. */
export type GetSignParams = readonly [x: number, y: number, z: number]
export interface GetSignResult {
  readonly front: SignFaceLines
  readonly back: SignFaceLines
  readonly waxed: boolean
}

/** `world.setSign` — replace each named face's 4 lines in one no-merge write. */
export type SetSignParams = readonly [
  x: number,
  y: number,
  z: number,
  lines: {
    readonly front?: readonly [LineSpec, LineSpec, LineSpec, LineSpec]
    readonly back?: readonly [LineSpec, LineSpec, LineSpec, LineSpec]
  },
]
export type SetSignResult = null

/** `world.updateSignLine` — PATCH exactly one 0-indexed line on one face. */
export type UpdateSignLineParams = readonly [
  x: number,
  y: number,
  z: number,
  face: SignFace,
  line_index: number,
  line: LineSpec,
]
export type UpdateSignLineResult = null

/**
 * b7 direction (wire-format-design §5.8.2). Values are finite direction
 * components. Results are normalized, rounded to at most six decimal places
 * with HALF_UP, and never carry negative zero.
 */
export type DirectionValue = readonly [x: number, y: number, z: number]

/** `player.getDirection` — read the paired player's current direction. */
export type PlayerGetDirectionParams = readonly []
export type PlayerGetDirectionResult = DirectionValue

/** `player.setDirection` — normalize a nonzero vector and change rotation only. */
export type PlayerSetDirectionParams = readonly [x: number, y: number, z: number]
export type PlayerSetDirectionResult = DirectionValue

/** `entity.getDirection` — read one current-epoch opaque handle's direction. */
export type EntityGetDirectionParams = readonly [handle: string]
export type EntityGetDirectionResult = DirectionValue

/** `entity.setDirection` — normalize a nonzero vector and change rotation only. */
export type EntitySetDirectionParams = readonly [handle: string, x: number, y: number, z: number]
export type EntitySetDirectionResult = DirectionValue

/** `world.strikeLightning` — request one full, damage-capable strike at an origin-relative position. */
export type StrikeLightningParams = readonly [x: number, y: number, z: number]
export type StrikeLightningResult = null
