/**
 * Method names (wire-format-design §4). `method` is the existing TCP command's
 * dot name, used verbatim on the wire.
 */
export const Method = {
  hello: 'hello',
  catalogGet: 'catalog.get',
  chatPost: 'chat.post',
  buildSetWorld: 'build.setWorld',
  buildSetOrigin: 'build.setOrigin',
  worldSetBlock: 'world.setBlock',
  worldSetBlocks: 'world.setBlocks',
  worldGetBlock: 'world.getBlock',
  worldGetBlocks: 'world.getBlocks',
  worldGetHeight: 'world.getHeight',
  worldSpawnEntity: 'world.spawnEntity',
  connectionFlush: 'connection.flush',
  playerGetPose: 'player.getPose',
  playerSetPose: 'player.setPose',
} as const

export type Method = (typeof Method)[keyof typeof Method]
