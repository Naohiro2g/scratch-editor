/**
 * Method names (wire-format-design §4). `method` is the existing TCP command's
 * dot name, used verbatim on the wire.
 */
export const Method = {
  hello: 'hello',
  chatPost: 'chat.post',
  worldSetBlock: 'world.setBlock',
  worldSetBlocks: 'world.setBlocks',
  worldGetBlock: 'world.getBlock',
} as const

export type Method = (typeof Method)[keyof typeof Method]
