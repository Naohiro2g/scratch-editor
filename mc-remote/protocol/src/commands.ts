/**
 * Per-method params and result shapes (wire-format-design §4). Coordinates are
 * deltas from the build origin; `block` is a canonical block_state_ref string.
 */

/** `chat.post` — send a chat message. b1 uses an acknowledged request. */
export type ChatPostParams = readonly [message: string]

/** Build dimensions accepted by `build.setWorld`. */
export type BuildWorld = 'overworld' | 'nether' | 'the_end'

/** `build.setWorld` — update the stream-local build dimension. */
export type BuildSetWorldParams = readonly [dimension: BuildWorld]

/** `build.setOrigin` — update the stream-local build origin. */
export type BuildSetOriginParams = readonly [x: number, y: number, z: number]

/** `world.setBlock` — place one block. b1 uses an acknowledged request. */
export type SetBlockParams = readonly [x: number, y: number, z: number, block: string]

/** `world.setBlocks` — fill a cuboid. b1 uses an acknowledged request. */
export type SetBlocksParams = readonly [
  x1: number,
  y1: number,
  z1: number,
  x2: number,
  y2: number,
  z2: number,
  block: string,
]

/** `world.getBlock` — read one block. Always a request. */
export type GetBlockParams = readonly [x: number, y: number, z: number]

/**
 * `world.getBlock` result: the canonical block_state_ref, or the empty string
 * when the value is unavailable (wire-format-design §4).
 */
export type GetBlockResult = string
