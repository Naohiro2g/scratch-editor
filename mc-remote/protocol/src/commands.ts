/**
 * Per-method params and result shapes (wire-format-design §4). Coordinates are
 * deltas from the build origin; `block` is a canonical block_state_ref string.
 */

/** `chat.post` — send a chat message. Send-only by default. */
export type ChatPostParams = readonly [message: string]

/** `world.setBlock` — place one block. Send-only by default. */
export type SetBlockParams = readonly [x: number, y: number, z: number, block: string]

/** `world.setBlocks` — fill a cuboid. Send-only by default. */
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
