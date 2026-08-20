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

/** Build dimensions accepted by `build.setWorld`. */
export type BuildWorld = 'overworld' | 'nether' | 'the_end'

/** `build.setWorld` — update the stream-local build dimension. */
export type BuildSetWorldParams = readonly [dimension: BuildWorld]

/** `build.setOrigin` — update the stream-local build origin. */
export type BuildSetOriginParams = readonly [x: number, y: number, z: number]

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

/** `world.spawnEntity` — spawn one entity and return its connection-epoch handle. */
export type SpawnEntityParams = readonly [entity: string, x: number, y: number, z: number]
export type SpawnEntityResult = string

/** `connection.flush` — wait for earlier work in this connection epoch. */
export type ConnectionFlushParams = readonly []
export type ConnectionFlushResult = null
