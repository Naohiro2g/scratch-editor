/**
 * Method names (wire-format-design §4). `method` is the existing TCP command's
 * dot name, used verbatim on the wire.
 */
export const Method = {
  hello: 'hello',
  catalogGet: 'catalog.get',
  chatPost: 'chat.post',
  buildSetDimension: 'build.setDimension',
  buildSetOrigin: 'build.setOrigin',
  worldSetBlock: 'world.setBlock',
  worldSetBlocks: 'world.setBlocks',
  worldGetBlock: 'world.getBlock',
  worldGetBlocks: 'world.getBlocks',
  worldGetHeight: 'world.getHeight',
  worldSpawnParticle: 'world.spawnParticle',
  worldPlaySound: 'world.playSound',
  worldPlayBlockSound: 'world.playBlockSound',
  worldSpawnEntity: 'world.spawnEntity',
  connectionFlush: 'connection.flush',
  eventsPoll: 'events.poll',
  playerGetPose: 'player.getPose',
  playerSetPose: 'player.setPose',
  worldGetSign: 'world.getSign',
  worldSetSign: 'world.setSign',
  worldUpdateSignLine: 'world.updateSignLine',
  playerGetDirection: 'player.getDirection',
  playerSetDirection: 'player.setDirection',
  entityGetDirection: 'entity.getDirection',
  entitySetDirection: 'entity.setDirection',
  worldStrikeLightning: 'world.strikeLightning',
  worldGetNearbyEntities: 'world.getNearbyEntities',
  entityGetPose: 'entity.getPose',
  entitySetPose: 'entity.setPose',
  entityRemove: 'entity.remove',
} as const

export type Method = (typeof Method)[keyof typeof Method]
