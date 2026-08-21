export const OBSERVER_SCHEMA = 'mcremote.observer' as const
export const OBSERVER_SCHEMA_VERSION = 1 as const

export const OBSERVED_METHODS = [
  'hello',
  'build.setWorld',
  'build.setOrigin',
  'chat.post',
  'world.setBlock',
  'world.setBlocks',
  'world.getBlock',
  'world.getBlocks',
  'world.getHeight',
  'world.spawnParticle',
  'world.spawnEntity',
  'connection.flush',
  'events.poll',
  'player.getPos',
  'player.setPos',
  'player.getPose',
  'player.setPose',
] as const

export type ObservedMethod = (typeof OBSERVED_METHODS)[number]
export type SourceKind = 'scratch' | 'python'
export type StreamKind = 'main' | 'substream'
export type StreamStatus = 'connected' | 'error'
export type FrameDirection = 'send' | 'receive'
export type RequestId = string | number | null

export interface ObserverPermissions {
  online?: boolean
  offline?: boolean
  build_range?: number | string
}

export interface ObserverWorldConstants {
  y_sea: number | null
}

export interface ObserverHello {
  protocol: string
  mc_version: string
  supported_mc_versions: string[]
  catalog_hash: string | null
  world?: string
  origin?: [number, number, number]
  world_constants: ObserverWorldConstants
  permissions?: ObserverPermissions
}

export interface ObserverErrorData {
  reason?: string
  block_id?: string
  property?: string
  value?: string | number | boolean | null
  path?: string
  allowed?: (string | number | boolean)[]
  bounds?: number[]
  violating?: number[]
}

export interface ObserverError {
  code: string | number | null
  message: string
  data?: ObserverErrorData
}

export type ObserverPayload = { params: unknown } | { result: unknown } | { error: ObserverError }

export interface ObserverFrame {
  sequence: number
  observed_at: number
  direction: FrameDirection
  request_id: RequestId
  method: ObservedMethod
  payload: ObserverPayload
}

export interface ObserverStream {
  id: string
  kind: StreamKind
  status: StreamStatus
  hello: ObserverHello
  frames: ObserverFrame[]
}

export interface ObserverTarget {
  id: string
  display_alias: string
  source_kind: SourceKind
}

export interface ObserverSnapshot {
  schema: typeof OBSERVER_SCHEMA
  schema_version: typeof OBSERVER_SCHEMA_VERSION
  emitted_at: number
  target: ObserverTarget
  streams: ObserverStream[]
}

const OBSERVED_METHOD_SET = new Set<string>(OBSERVED_METHODS)

const objectValue = (value: unknown, context: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${context} must be an object`)
  }
  return value as Record<string, unknown>
}

const exactFields = (value: Record<string, unknown>, allowed: readonly string[], context: string): void => {
  const allowedSet = new Set(allowed)
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) throw new Error(`${context} unknown field: ${key}`)
  }
}

const requiredString = (value: unknown, context: string): string => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${context} must be a non-empty string`)
  }
  return value
}

const finiteNumber = (value: unknown, context: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${context} must be a finite number`)
  }
  return value
}

const stringArray = (value: unknown, context: string): string[] => {
  if (!Array.isArray(value)) throw new Error(`${context} must be a string array`)
  const strings: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') throw new Error(`${context} must be a string array`)
    strings.push(item)
  }
  return strings
}

const numberTuple = (value: unknown, context: string): [number, number, number] => {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error(`${context} must be a three-number tuple`)
  }
  return [
    finiteNumber(value[0], `${context}[0]`),
    finiteNumber(value[1], `${context}[1]`),
    finiteNumber(value[2], `${context}[2]`),
  ]
}

const optionalBoolean = (value: unknown, context: string): boolean | undefined => {
  if (typeof value === 'undefined') return undefined
  if (typeof value !== 'boolean') throw new Error(`${context} must be a boolean`)
  return value
}

const parsePermissions = (value: unknown): ObserverPermissions | undefined => {
  if (typeof value === 'undefined') return undefined
  const permissions = objectValue(value, 'permissions')
  exactFields(permissions, ['online', 'offline', 'build_range'], 'permissions')
  const buildRange = permissions.build_range
  if (typeof buildRange !== 'undefined' && typeof buildRange !== 'number' && typeof buildRange !== 'string') {
    throw new Error('permissions.build_range must be a number or string')
  }
  return {
    online: optionalBoolean(permissions.online, 'permissions.online'),
    offline: optionalBoolean(permissions.offline, 'permissions.offline'),
    build_range: buildRange,
  }
}

const parseHello = (value: unknown): ObserverHello => {
  const hello = objectValue(value, 'hello')
  exactFields(
    hello,
    [
      'protocol',
      'mc_version',
      'supported_mc_versions',
      'catalog_hash',
      'world',
      'origin',
      'world_constants',
      'permissions',
    ],
    'hello',
  )
  if (hello.catalog_hash !== null && typeof hello.catalog_hash !== 'string') {
    throw new Error('hello.catalog_hash must be a string or null')
  }
  const constants = objectValue(hello.world_constants, 'hello.world_constants')
  exactFields(constants, ['y_sea'], 'hello.world_constants')
  if (constants.y_sea !== null) {
    finiteNumber(constants.y_sea, 'hello.world_constants.y_sea')
  }
  const parsed: ObserverHello = {
    protocol: requiredString(hello.protocol, 'hello.protocol'),
    mc_version: requiredString(hello.mc_version, 'hello.mc_version'),
    supported_mc_versions: stringArray(hello.supported_mc_versions, 'hello.supported_mc_versions'),
    catalog_hash: hello.catalog_hash,
    world_constants: {
      y_sea: constants.y_sea === null ? null : finiteNumber(constants.y_sea, 'hello.world_constants.y_sea'),
    },
  }
  if (typeof hello.world !== 'undefined') {
    parsed.world = requiredString(hello.world, 'hello.world')
  }
  if (typeof hello.origin !== 'undefined') {
    parsed.origin = numberTuple(hello.origin, 'hello.origin')
  }
  const permissions = parsePermissions(hello.permissions)
  if (permissions) parsed.permissions = permissions
  return parsed
}

const parseErrorData = (value: unknown): ObserverErrorData | undefined => {
  if (typeof value === 'undefined') return undefined
  const data = objectValue(value, 'frame.payload.error.data')
  exactFields(
    data,
    ['reason', 'block_id', 'property', 'value', 'path', 'allowed', 'bounds', 'violating'],
    'frame.payload.error.data',
  )
  if (typeof data.reason !== 'undefined' && typeof data.reason !== 'string') {
    throw new Error('frame.payload.error.data.reason must be a string')
  }
  for (const field of ['block_id', 'property', 'path'] as const) {
    if (typeof data[field] !== 'undefined' && typeof data[field] !== 'string') {
      throw new Error(`frame.payload.error.data.${field} must be a string`)
    }
  }
  const allowed = data.allowed
  if (
    typeof allowed !== 'undefined' &&
    (!Array.isArray(allowed) ||
      allowed.some((item) => typeof item !== 'string' && typeof item !== 'number' && typeof item !== 'boolean'))
  ) {
    throw new Error('frame.payload.error.data.allowed must contain JSON scalars')
  }
  const parseVector = (item: unknown, context: string): number[] | undefined => {
    if (typeof item === 'undefined') return undefined
    if (!Array.isArray(item)) throw new Error(`${context} must be a number array`)
    return item.map((entry, index) => finiteNumber(entry, `${context}[${index}]`))
  }
  const parsed: ObserverErrorData = {}
  if (typeof data.reason === 'string') parsed.reason = data.reason
  if (typeof data.block_id === 'string') parsed.block_id = data.block_id
  if (typeof data.property === 'string') parsed.property = data.property
  if (typeof data.path === 'string') parsed.path = data.path
  if (typeof data.value !== 'undefined') parsed.value = jsonScalar(data.value, 'frame.payload.error.data.value')
  if (Array.isArray(allowed)) {
    parsed.allowed = allowed.map((item) => {
      if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
        return item
      }
      throw new Error('frame.payload.error.data.allowed must contain JSON scalars')
    })
  }
  const bounds = parseVector(data.bounds, 'frame.payload.error.data.bounds')
  const violating = parseVector(data.violating, 'frame.payload.error.data.violating')
  if (bounds) parsed.bounds = bounds
  if (violating) parsed.violating = violating
  return parsed
}

const parseError = (value: unknown): ObserverError => {
  const error = objectValue(value, 'frame.payload.error')
  exactFields(error, ['code', 'message', 'data'], 'frame.payload.error')
  if (error.code !== null && typeof error.code !== 'string' && typeof error.code !== 'number') {
    throw new Error('frame.payload.error.code must be a string, number, or null')
  }
  const parsed: ObserverError = {
    code: error.code,
    message: requiredString(error.message, 'frame.payload.error.message'),
  }
  const data = parseErrorData(error.data)
  if (data) parsed.data = data
  return parsed
}

const jsonScalar = (value: unknown, context: string): string | number | boolean | null => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  throw new Error(`${context} must be a JSON scalar`)
}

interface ObserverBlock {
  block_id: string
  state: Record<string, string | number | boolean>
}

const parseBlock = (value: unknown, context: string, canonicalId: boolean): ObserverBlock => {
  const block = objectValue(value, context)
  exactFields(block, ['block_id', 'state'], context)
  const blockId = requiredString(block.block_id, `${context}.block_id`)
  const resourcePattern = canonicalId ? /^[a-z0-9_.-]+:[a-z0-9_./-]+$/ : /^(?:[a-z0-9_.-]+:)?[a-z0-9_./-]+$/
  if (!resourcePattern.test(blockId)) throw new Error(`${context}.block_id must be a resource ID`)
  const state = objectValue(block.state, `${context}.state`)
  const parsedState: Record<string, string | number | boolean> = {}
  for (const [property, item] of Object.entries(state)) {
    if (!/^[a-z0-9_]+$/.test(property)) throw new Error(`${context}.state has an invalid property`)
    const scalarValue = jsonScalar(item, `${context}.state.${property}`)
    if (scalarValue === null) throw new Error(`${context}.state.${property} must not be null`)
    parsedState[property] = scalarValue
  }
  return { block_id: blockId, state: parsedState }
}

const exactParams = (value: unknown, length: number): unknown[] => {
  if (!Array.isArray(value) || value.length !== length) {
    throw new Error(`frame.payload.params must contain exactly ${length} items`)
  }
  return value
}

const integer = (value: unknown, context: string): number => {
  const number = finiteNumber(value, context)
  if (!Number.isInteger(number)) throw new Error(`${context} must be an integer`)
  return number
}

const nonNegativeFiniteNumber = (value: unknown, context: string): number => {
  const number = finiteNumber(value, context)
  if (number < 0) throw new Error(`${context} must be a non-negative finite number`)
  return number
}

const nonNegativeInteger = (value: unknown, context: string): number => {
  const number = integer(value, context)
  if (number < 0) throw new Error(`${context} must be a non-negative integer`)
  return number
}

const canonicalResourceId = (value: unknown, context: string): string => {
  const resourceId = requiredString(value, context)
  if (!/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(resourceId)) {
    throw new Error(`${context} must be a canonical resource ID`)
  }
  return resourceId
}

const faceToken = (value: unknown, context: string): string => {
  const face = requiredString(value, context)
  if (!/^[a-z_]+$/.test(face)) throw new Error(`${context} must be a face token`)
  return face
}

const parseEventsPollParams = (value: unknown): unknown[] => {
  if (!Array.isArray(value) || (value.length !== 1 && value.length !== 2)) {
    throw new Error('frame.payload.params must contain after_sequence and optional options')
  }
  const afterSequence = nonNegativeInteger(value[0], 'frame.payload.params[0]')
  if (value.length === 1) return [afterSequence]
  const options = objectValue(value[1], 'frame.payload.params[1]')
  exactFields(options, ['max_events'], 'frame.payload.params[1]')
  if (Object.keys(options).length !== 1) {
    throw new Error('frame.payload.params[1] must contain max_events')
  }
  const maxEvents = integer(options.max_events, 'frame.payload.params[1].max_events')
  if (maxEvents <= 0) throw new Error('frame.payload.params[1].max_events must be positive')
  return [afterSequence, { max_events: maxEvents }]
}

const parseEventCommon = (
  value: Record<string, unknown>,
  fields: readonly string[],
  context: string,
): Record<string, unknown> => {
  exactFields(value, ['sequence', 'type', 'world', 'origin', ...fields], context)
  const sequence = integer(value.sequence, `${context}.sequence`)
  if (sequence < 1) throw new Error(`${context}.sequence must be positive`)
  return {
    sequence,
    type: requiredString(value.type, `${context}.type`),
    world: requiredString(value.world, `${context}.world`),
    origin: numberTuple(value.origin, `${context}.origin`).map((item, index) =>
      integer(item, `${context}.origin[${index}]`),
    ),
  }
}

const parseProjectileTarget = (value: unknown, context: string): Record<string, unknown> => {
  const target = objectValue(value, context)
  if (target.kind === 'player') {
    exactFields(target, ['kind'], context)
    return { kind: 'player' }
  }
  if (target.kind === 'entity') {
    exactFields(target, ['kind', 'handle'], context)
    const handle = requiredString(target.handle, `${context}.handle`)
    if (!/^mceh_[\x21-\x7e]+$/.test(handle)) throw new Error(`${context}.handle must be an entity handle`)
    return { kind: 'entity', handle }
  }
  if (target.kind === 'block') {
    exactFields(target, ['kind', 'block', 'pos', 'face'], context)
    const result: Record<string, unknown> = {
      kind: 'block',
      block: parseBlock(target.block, `${context}.block`, true),
      pos: numberTuple(target.pos, `${context}.pos`).map((item, index) => integer(item, `${context}.pos[${index}]`)),
    }
    if (typeof target.face !== 'undefined') result.face = faceToken(target.face, `${context}.face`)
    return result
  }
  throw new Error(`${context}.kind must be block, entity, or player`)
}

const parseEvent = (value: unknown, index: number): Record<string, unknown> => {
  const context = `frame.payload.result.events[${index}]`
  const event = objectValue(value, context)
  if (event.type === 'block_right_click') {
    const hand = requiredString(event.hand, `${context}.hand`)
    if (hand !== 'main' && hand !== 'off') throw new Error(`${context}.hand must be main or off`)
    return {
      ...parseEventCommon(event, ['pos', 'face', 'block', 'hand'], context),
      pos: numberTuple(event.pos, `${context}.pos`).map((item, position) =>
        integer(item, `${context}.pos[${position}]`),
      ),
      face: faceToken(event.face, `${context}.face`),
      block: parseBlock(event.block, `${context}.block`, true),
      hand,
    }
  }
  if (event.type === 'chat_posted') {
    exactFields(event, ['sequence', 'type', 'world', 'origin', 'message'], context)
    if (typeof event.message !== 'string') throw new Error(`${context}.message must be a string`)
    return { ...parseEventCommon(event, ['message'], context), message: event.message }
  }
  if (event.type === 'projectile_hit') {
    return {
      ...parseEventCommon(event, ['projectile', 'pos', 'target'], context),
      projectile: canonicalResourceId(event.projectile, `${context}.projectile`),
      pos: numberTuple(event.pos, `${context}.pos`),
      target: parseProjectileTarget(event.target, `${context}.target`),
    }
  }
  throw new Error(`${context}.type is not observable`)
}

const parseEventsPollResult = (value: unknown): Record<string, unknown> => {
  const result = objectValue(value, 'frame.payload.result')
  exactFields(
    result,
    [
      'events',
      'through_sequence',
      'latest_sequence',
      'filtered_out',
      'overflow_dropped_total',
      'capacity_dropped_total',
      'explicitly_discarded_total',
    ],
    'frame.payload.result',
  )
  if (!Array.isArray(result.events)) throw new Error('frame.payload.result.events must be an array')
  const throughSequence = nonNegativeInteger(result.through_sequence, 'frame.payload.result.through_sequence')
  const latestSequence = nonNegativeInteger(result.latest_sequence, 'frame.payload.result.latest_sequence')
  if (throughSequence > latestSequence) throw new Error('frame.payload.result cursor bounds are inconsistent')
  const filteredOut = nonNegativeInteger(result.filtered_out, 'frame.payload.result.filtered_out')
  const explicitlyDiscardedTotal = nonNegativeInteger(
    result.explicitly_discarded_total,
    'frame.payload.result.explicitly_discarded_total',
  )
  if (filteredOut !== 0 || explicitlyDiscardedTotal !== 0) {
    throw new Error('b5 filter and explicit discard totals must remain zero')
  }
  const events = result.events.map(parseEvent)
  let priorSequence = 0
  for (const event of events) {
    const sequence = event.sequence as number
    if (sequence <= priorSequence || sequence > throughSequence) {
      throw new Error('frame.payload.result event sequences are inconsistent')
    }
    priorSequence = sequence
  }
  return {
    events,
    through_sequence: throughSequence,
    latest_sequence: latestSequence,
    filtered_out: 0,
    overflow_dropped_total: nonNegativeInteger(
      result.overflow_dropped_total,
      'frame.payload.result.overflow_dropped_total',
    ),
    capacity_dropped_total: nonNegativeInteger(
      result.capacity_dropped_total,
      'frame.payload.result.capacity_dropped_total',
    ),
    explicitly_discarded_total: 0,
  }
}

const parseParams = (method: ObservedMethod, value: unknown): unknown => {
  if (method === 'hello') {
    const params = objectValue(value, 'frame.payload.params')
    exactFields(params, ['protocol', 'client', 'build'], 'frame.payload.params')
    const result: Record<string, unknown> = {
      protocol: requiredString(params.protocol, 'frame.payload.params.protocol'),
    }
    if (typeof params.client !== 'undefined') {
      const client = objectValue(params.client, 'frame.payload.params.client')
      exactFields(client, ['name', 'version', 'locale'], 'frame.payload.params.client')
      result.client = {
        name: requiredString(client.name, 'frame.payload.params.client.name'),
        version: requiredString(client.version, 'frame.payload.params.client.version'),
        ...(typeof client.locale === 'string' ? { locale: client.locale } : {}),
      }
    }
    if (typeof params.build !== 'undefined') {
      const build = objectValue(params.build, 'frame.payload.params.build')
      exactFields(build, ['world', 'origin'], 'frame.payload.params.build')
      result.build = {
        ...(typeof build.world === 'string' ? { world: build.world } : {}),
        ...(typeof build.origin !== 'undefined'
          ? { origin: numberTuple(build.origin, 'frame.payload.params.build.origin') }
          : {}),
      }
    }
    return result
  }
  if (method === 'world.setBlock') {
    const params = exactParams(value, 4)
    return [
      integer(params[0], 'frame.payload.params[0]'),
      integer(params[1], 'frame.payload.params[1]'),
      integer(params[2], 'frame.payload.params[2]'),
      parseBlock(params[3], 'frame.payload.params[3]', false),
    ]
  }
  if (method === 'world.setBlocks') {
    const params = exactParams(value, 7)
    return [
      ...params.slice(0, 6).map((item, index) => integer(item, `frame.payload.params[${index}]`)),
      parseBlock(params[6], 'frame.payload.params[6]', false),
    ]
  }
  if (method === 'world.getBlock') {
    return exactParams(value, 3).map((item, index) => integer(item, `frame.payload.params[${index}]`))
  }
  if (method === 'world.getBlocks') {
    return exactParams(value, 6).map((item, index) => integer(item, `frame.payload.params[${index}]`))
  }
  if (method === 'world.getHeight') {
    if (!Array.isArray(value) || (value.length !== 2 && value.length !== 3)) {
      throw new Error('frame.payload.params must contain 2 or 3 items')
    }
    return value.map((item, index) => integer(item, `frame.payload.params[${index}]`))
  }
  if (method === 'world.spawnEntity') {
    const params = exactParams(value, 4)
    return [
      ...params.slice(0, 3).map((item, index) => finiteNumber(item, `frame.payload.params[${index}]`)),
      canonicalResourceId(params[3], 'frame.payload.params[3]'),
    ]
  }
  if (method === 'world.spawnParticle') {
    if (!Array.isArray(value) || (value.length !== 9 && value.length !== 10)) {
      throw new Error('frame.payload.params must contain 9 or 10 items')
    }
    return [
      ...value.slice(0, 3).map((item, index) => finiteNumber(item, `frame.payload.params[${index}]`)),
      ...value.slice(3, 6).map((item, index) => nonNegativeFiniteNumber(item, `frame.payload.params[${index + 3}]`)),
      canonicalResourceId(value[6], 'frame.payload.params[6]'),
      nonNegativeFiniteNumber(value[7], 'frame.payload.params[7]'),
      nonNegativeInteger(value[8], 'frame.payload.params[8]'),
      ...(value.length === 10 ? [optionalBoolean(value[9], 'frame.payload.params[9]')] : []),
    ]
  }
  if (method === 'connection.flush') return exactParams(value, 0)
  if (method === 'events.poll') return parseEventsPollParams(value)
  if (!Array.isArray(value)) throw new Error('frame.payload.params must be an array')
  return value.map((item, index) => jsonScalar(item, `frame.payload.params[${index}]`))
}

const parsePosition = (value: unknown): { world: string; pos: [number, number, number] } => {
  const position = objectValue(value, 'frame.payload.result')
  exactFields(position, ['world', 'pos'], 'frame.payload.result')
  return {
    world: requiredString(position.world, 'frame.payload.result.world'),
    pos: numberTuple(position.pos, 'frame.payload.result.pos'),
  }
}

const parsePose = (value: unknown): { world: string; pos: [number, number, number]; yaw: number; pitch: number } => {
  const pose = objectValue(value, 'frame.payload.result')
  exactFields(pose, ['world', 'pos', 'yaw', 'pitch'], 'frame.payload.result')
  return {
    world: requiredString(pose.world, 'frame.payload.result.world'),
    pos: numberTuple(pose.pos, 'frame.payload.result.pos'),
    yaw: finiteNumber(pose.yaw, 'frame.payload.result.yaw'),
    pitch: finiteNumber(pose.pitch, 'frame.payload.result.pitch'),
  }
}

const parseResult = (method: ObservedMethod, value: unknown): unknown => {
  if (method === 'hello') return parseHello(value)
  if (method === 'player.getPos' || method === 'player.setPos') return parsePosition(value)
  if (method === 'player.getPose' || method === 'player.setPose') return parsePose(value)
  if (method === 'world.setBlock' || method === 'world.setBlocks' || method === 'connection.flush') {
    if (value !== null) throw new Error('frame.payload.result must be null')
    return null
  }
  if (method === 'world.getBlock') return parseBlock(value, 'frame.payload.result', true)
  if (method === 'world.getBlocks') {
    if (!Array.isArray(value)) throw new Error('frame.payload.result must be an array')
    return value.map((item, index) => parseBlock(item, `frame.payload.result[${index}]`, true))
  }
  if (method === 'world.getHeight') return integer(value, 'frame.payload.result')
  if (method === 'world.spawnParticle') return nonNegativeInteger(value, 'frame.payload.result')
  if (method === 'world.spawnEntity') {
    const handle = requiredString(value, 'frame.payload.result')
    if (!/^mceh_[\x21-\x7e]+$/.test(handle)) throw new Error('frame.payload.result must be an entity handle')
    return handle
  }
  if (method === 'events.poll') return parseEventsPollResult(value)
  return jsonScalar(value, 'frame.payload.result')
}

const parsePayload = (method: ObservedMethod, value: unknown): ObserverPayload => {
  const payload = objectValue(value, 'frame.payload')
  exactFields(payload, ['params', 'result', 'error'], 'frame.payload')
  const present = ['params', 'result', 'error'].filter((key) => Object.prototype.hasOwnProperty.call(payload, key))
  if (present.length !== 1) throw new Error('frame.payload must contain exactly one payload kind')
  if (present[0] === 'params') return { params: parseParams(method, payload.params) }
  if (present[0] === 'result') return { result: parseResult(method, payload.result) }
  return { error: parseError(payload.error) }
}

const parseFrame = (value: unknown): ObserverFrame => {
  const frame = objectValue(value, 'frame')
  exactFields(frame, ['sequence', 'observed_at', 'direction', 'request_id', 'method', 'payload'], 'frame')
  if (frame.direction !== 'send' && frame.direction !== 'receive') {
    throw new Error('frame.direction must be send or receive')
  }
  if (!OBSERVED_METHOD_SET.has(String(frame.method))) {
    throw new Error(`frame.method is not observable: ${String(frame.method)}`)
  }
  const requestId = frame.request_id
  if (requestId !== null && typeof requestId !== 'string' && typeof requestId !== 'number') {
    throw new Error('frame.request_id must be a string, number, or null')
  }
  const method = frame.method as ObservedMethod
  if (
    requestId === null &&
    (frame.direction !== 'send' || (method !== 'world.setBlock' && method !== 'world.setBlocks'))
  ) {
    throw new Error('frame.request_id may be null only for a setter notification')
  }
  return {
    sequence: finiteNumber(frame.sequence, 'frame.sequence'),
    observed_at: finiteNumber(frame.observed_at, 'frame.observed_at'),
    direction: frame.direction,
    request_id: requestId,
    method,
    payload: parsePayload(method, frame.payload),
  }
}

const parseStream = (value: unknown): ObserverStream => {
  const stream = objectValue(value, 'stream')
  exactFields(stream, ['id', 'kind', 'status', 'hello', 'frames'], 'stream')
  if (stream.kind !== 'main' && stream.kind !== 'substream') {
    throw new Error('stream.kind must be main or substream')
  }
  if (stream.status !== 'connected' && stream.status !== 'error') {
    throw new Error('stream.status must be connected or error')
  }
  if (!Array.isArray(stream.frames)) throw new Error('stream.frames must be an array')
  return {
    id: requiredString(stream.id, 'stream.id'),
    kind: stream.kind,
    status: stream.status,
    hello: parseHello(stream.hello),
    frames: stream.frames.map(parseFrame),
  }
}

export const parseObserverSnapshot = (value: unknown): ObserverSnapshot => {
  const snapshot = objectValue(value, 'snapshot')
  exactFields(snapshot, ['schema', 'schema_version', 'emitted_at', 'target', 'streams'], 'snapshot')
  if (snapshot.schema !== OBSERVER_SCHEMA) {
    throw new Error(`unsupported observer schema: ${String(snapshot.schema)}`)
  }
  if (snapshot.schema_version !== OBSERVER_SCHEMA_VERSION) {
    throw new Error(`unsupported observer schema version: ${String(snapshot.schema_version)}`)
  }
  const target = objectValue(snapshot.target, 'target')
  exactFields(target, ['id', 'display_alias', 'source_kind'], 'target')
  if (target.source_kind !== 'scratch' && target.source_kind !== 'python') {
    throw new Error('target.source_kind must be scratch or python')
  }
  if (!Array.isArray(snapshot.streams) || snapshot.streams.length === 0) {
    throw new Error('snapshot.streams must be a non-empty array')
  }
  const parsedTarget: ObserverTarget = {
    id: requiredString(target.id, 'target.id'),
    display_alias: requiredString(target.display_alias, 'target.display_alias'),
    source_kind: target.source_kind,
  }
  const streams = snapshot.streams.map(parseStream)
  if (streams.some((stream) => stream.id === parsedTarget.id)) {
    throw new Error('target id must not be used as a stream id')
  }
  if (new Set(streams.map((stream) => stream.id)).size !== streams.length) {
    throw new Error('stream ids must be unique within a target')
  }
  return {
    schema: OBSERVER_SCHEMA,
    schema_version: OBSERVER_SCHEMA_VERSION,
    emitted_at: finiteNumber(snapshot.emitted_at, 'snapshot.emitted_at'),
    target: parsedTarget,
    streams,
  }
}
