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
  'player.getPos',
  'player.setPos',
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
  ref?: string
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
  exactFields(data, ['reason', 'ref', 'allowed', 'bounds', 'violating'], 'frame.payload.error.data')
  if (typeof data.reason !== 'undefined' && typeof data.reason !== 'string') {
    throw new Error('frame.payload.error.data.reason must be a string')
  }
  if (typeof data.ref !== 'undefined' && typeof data.ref !== 'string') {
    throw new Error('frame.payload.error.data.ref must be a string')
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
  if (typeof data.ref === 'string') parsed.ref = data.ref
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

const parseResult = (method: ObservedMethod, value: unknown): unknown => {
  if (method === 'hello') return parseHello(value)
  if (method === 'player.getPos' || method === 'player.setPos') return parsePosition(value)
  if (method === 'world.getBlock') {
    if (typeof value !== 'string') throw new Error('frame.payload.result must be a string')
    return value
  }
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
