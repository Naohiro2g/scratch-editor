import type { ObservedMethod, ObserverFrame, ObserverPayload, RequestId } from './observer'

/**
 * Client-only WireScope display filter over the currently held frame window.
 * This never touches the wire, the server event ring, or frame payloads —
 * it only decides which already-observed frames to render.
 *
 * The eight method groups below are a candidate mapping derived from the
 * wire method catalog (wire-format-design_ja.md §4) and the extension's own
 * dispatch table, merging `hello` into `connection` to land on exactly
 * eight plus "other". `auth` and `catalog` are included for a stable,
 * forward-compatible taxonomy even though `OBSERVED_METHODS` (observer.ts)
 * does not currently allow either namespace through to the observer, so
 * both will show a persistent 0 count today. This mapping has not been
 * human-confirmed; see the transport slip.
 */
export const METHOD_GROUPS = ['connection', 'auth', 'build', 'catalog', 'chat', 'events', 'player', 'world'] as const

export type NamedMethodGroup = (typeof METHOD_GROUPS)[number]
export type MethodGroup = NamedMethodGroup | 'other'
export const ALL_METHOD_GROUPS: readonly MethodGroup[] = [...METHOD_GROUPS, 'other']

const METHOD_GROUP_BY_PREFIX: ReadonlyMap<string, NamedMethodGroup> = new Map([
  ['hello', 'connection'],
  ['connection.', 'connection'],
  ['auth.', 'auth'],
  ['build.', 'build'],
  ['catalog.', 'catalog'],
  ['chat.', 'chat'],
  ['events.', 'events'],
  ['player.', 'player'],
  ['world.', 'world'],
])

export const methodGroupFor = (method: string): MethodGroup => {
  for (const [prefix, group] of METHOD_GROUP_BY_PREFIX) {
    if (method === prefix || method.startsWith(prefix)) return group
  }
  return 'other'
}

/**
 * `events.poll` response event classification. Order matches the product
 * decision: the three protocol 23 event types, then "empty" (a poll whose
 * response carried zero events — the dominant steady-state noise this
 * filter exists to hide), then "other" for any unrecognized event type.
 */
export const EVENT_CLASSES = ['pickaxe_poke', 'chat_posted', 'projectile_hit', 'empty', 'other'] as const
export type EventClass = (typeof EVENT_CLASSES)[number]

const KNOWN_EVENT_TYPES: ReadonlySet<string> = new Set(['pickaxe_poke', 'chat_posted', 'projectile_hit'])

/**
 * Classify an `events.poll` RESPONSE payload into the set of event classes
 * it carries. A response with zero events classifies as exactly `['empty']`.
 * A response carrying multiple event types returns all of their classes, so
 * the pair shows if the viewer has enabled any one of them.
 * @param payload - the `events.poll` receive frame's payload.
 * @returns the classes present in this response, or null if the payload
 *     does not have the expected `events.poll` result shape (e.g. an error
 *     response, or a request-direction frame with no result yet).
 */
export const eventClassesForPollResponse = (payload: ObserverPayload): EventClass[] | null => {
  if (!('result' in payload)) return null
  const result = payload.result
  if (!result || typeof result !== 'object' || !Array.isArray((result as { events?: unknown }).events)) return null
  const events = (result as { events: unknown[] }).events
  if (events.length === 0) return ['empty']
  const classes = new Set<EventClass>()
  for (const event of events) {
    const type = event && typeof event === 'object' ? (event as { type?: unknown }).type : undefined
    classes.add(typeof type === 'string' && KNOWN_EVENT_TYPES.has(type) ? (type as EventClass) : 'other')
  }
  return [...classes]
}

export interface SearchFieldState {
  readonly enabled: boolean
  readonly text: string
}

export interface FilterState {
  readonly methodGroups: Readonly<Record<MethodGroup, boolean>>
  readonly eventClasses: Readonly<Record<EventClass, boolean>>
  readonly orSearch: SearchFieldState
  readonly andSearch: SearchFieldState
}

const allTrue = <K extends string>(keys: readonly K[]): Record<K, boolean> =>
  Object.fromEntries(keys.map((key) => [key, true])) as Record<K, boolean>

export const defaultFilterState = (): FilterState => ({
  methodGroups: allTrue(ALL_METHOD_GROUPS),
  eventClasses: { ...allTrue(EVENT_CLASSES), empty: false },
  orSearch: { enabled: false, text: '' },
  andSearch: { enabled: false, text: '' },
})

/**
 * Split a comma-separated keyword list into individual, trimmed, non-empty
 * lowercase keywords.
 * @param text - raw search box text.
 * @returns keywords, or an empty array if `text` has none.
 */
const keywordsOf = (text: string): string[] =>
  text
    .split(',')
    .map((keyword) => keyword.trim().toLowerCase())
    .filter((keyword) => keyword.length > 0)

/**
 * Case-insensitive substring match against a comma-separated keyword list.
 * A frame matches if the haystack contains ANY of the keywords (keywords
 * within one box are OR'd together); this is a UX judgment call, not a
 * value from a locked contract — see the transport slip.
 * @param haystack - searchable text for one frame or one poll pair.
 * @param text - raw search box text (may contain multiple keywords).
 * @returns whether any keyword matches, or false if there are no keywords.
 */
export const textMatches = (haystack: string, text: string): boolean => {
  const keywords = keywordsOf(text)
  if (keywords.length === 0) return false
  const lowerHaystack = haystack.toLowerCase()
  return keywords.some((keyword) => lowerHaystack.includes(keyword))
}

const payloadText = (payload: ObserverPayload): string => {
  try {
    return JSON.stringify(payload)
  } catch {
    return ''
  }
}

const frameSearchText = (frame: ObserverFrame): string => `${frame.method} ${payloadText(frame.payload)}`

/**
 * One renderable filter unit: either a single non-`events.poll` frame, or
 * an `events.poll` request/response pair (or the lone surviving half of a
 * pair split by the window boundary or ring loss). Visibility is decided
 * per unit; both frames of a pair share the same decision.
 */
export interface FilterUnit {
  readonly frames: readonly [ObserverFrame] | readonly [ObserverFrame, ObserverFrame]
}

/**
 * Group a stream's frames into filter units, pairing `events.poll`
 * send/receive frames by `request_id`. Non-`events.poll` frames are always
 * their own unit. Pairing preserves the original frame order (by the send
 * frame's position, or the lone frame's position for an orphan).
 * @param frames - a stream's currently held frames, in observed order.
 * @returns filter units in stable display order.
 */
export const groupIntoFilterUnits = (frames: readonly ObserverFrame[]): FilterUnit[] => {
  interface Draft {
    frames: ObserverFrame[]
  }
  const units: Draft[] = []
  const pendingPollByRequestId = new Map<RequestId, Draft>()
  for (const frame of frames) {
    if (frame.method !== 'events.poll' || frame.request_id === null) {
      units.push({ frames: [frame] })
      continue
    }
    const pending = pendingPollByRequestId.get(frame.request_id)
    if (frame.direction === 'send') {
      if (pending) {
        // A second send with the same request_id should not happen; keep
        // both as distinct units rather than silently dropping either.
        units.push({ frames: [frame] })
        continue
      }
      const draft: Draft = { frames: [frame] }
      pendingPollByRequestId.set(frame.request_id, draft)
      units.push(draft)
      continue
    }
    if (pending?.frames.length === 1) {
      pending.frames.push(frame)
      pendingPollByRequestId.delete(frame.request_id)
      continue
    }
    units.push({ frames: [frame] })
  }
  return units.map((draft) =>
    draft.frames.length === 2
      ? { frames: [draft.frames[0], draft.frames[1]] as const }
      : { frames: [draft.frames[0]] as const },
  )
}

const receiveFrameOf = (unit: FilterUnit): ObserverFrame | null =>
  unit.frames.find((frame) => frame.direction === 'receive') ?? null

const unitMethod = (unit: FilterUnit): ObservedMethod => unit.frames[0].method

const unitSearchText = (unit: FilterUnit): string => unit.frames.map(frameSearchText).join(' ')

/**
 * The event classes a filter unit should be judged against for the
 * "event分類" axis. Only `events.poll` units are classified; everything
 * else has no event-class gate (event classes are irrelevant, i.e. the
 * "not events.poll" branch of the base-pass formula). An `events.poll`
 * unit with no receive frame yet (an orphan request, still pending or
 * whose response fell outside the window) is unclassifiable and must not
 * be treated as "empty" — it returns null, meaning "do not gate on event
 * class" rather than "gate and hide".
 * @param unit - the filter unit.
 * @returns event classes to test against the event-class switches, or null
 *     if this unit is not a classifiable `events.poll` response.
 */
const eventClassesOf = (unit: FilterUnit): EventClass[] | null => {
  if (unitMethod(unit) !== 'events.poll') return null
  const receiveFrame = receiveFrameOf(unit)
  if (!receiveFrame) return null
  return eventClassesForPollResponse(receiveFrame.payload)
}

/**
 * The filter's core decision logic, applied per filter unit.
 * @param unit - one non-poll frame, or one `events.poll` pair/orphan.
 * @param state - current filter state.
 * @returns whether this unit should be rendered.
 */
export const filterUnitPasses = (unit: FilterUnit, state: FilterState): boolean => {
  const group = methodGroupFor(unitMethod(unit))
  const groupOn = state.methodGroups[group]
  const classes = eventClassesOf(unit)
  const eventGateOn = classes === null || classes.some((eventClass) => state.eventClasses[eventClass])
  const basePass = groupOn && eventGateOn

  const searchText = unitSearchText(unit)
  const orMatches = state.orSearch.enabled && textMatches(searchText, state.orSearch.text)
  const andMatches = !state.andSearch.enabled || textMatches(searchText, state.andSearch.text)

  return (basePass || orMatches) && andMatches
}

/**
 * Filter a stream's frames down to the ones the current filter state shows,
 * preserving original order and never splitting a pair.
 * @param frames - a stream's currently held frames, in observed order.
 * @param state - current filter state.
 * @returns the frames to render.
 */
export const filterFrames = (frames: readonly ObserverFrame[], state: FilterState): ObserverFrame[] => {
  const units = groupIntoFilterUnits(frames)
  const visible: ObserverFrame[] = []
  for (const unit of units) {
    if (filterUnitPasses(unit, state)) visible.push(...unit.frames)
  }
  return visible
}

export interface FilterCounts {
  readonly methodGroups: Readonly<Record<MethodGroup, number>>
  readonly eventClasses: Readonly<Record<EventClass, number>>
}

/**
 * Per-switch counts against the current window, independent of the current
 * filter state (a switch's own count never changes as you flip it) and
 * independent of `dropped_frames`. Each filter unit contributes once to its
 * method group; `events.poll` units additionally contribute once to each
 * event class they carry (a multi-type response counts toward each class
 * a viewer might toggle).
 * @param frames - a stream's currently held frames, in observed order.
 * @returns counts to display next to each switch.
 */
export const filterCounts = (frames: readonly ObserverFrame[]): FilterCounts => {
  const methodGroups = Object.fromEntries(ALL_METHOD_GROUPS.map((group) => [group, 0])) as Record<MethodGroup, number>
  const eventClasses = Object.fromEntries(EVENT_CLASSES.map((eventClass) => [eventClass, 0])) as Record<
    EventClass,
    number
  >
  for (const unit of groupIntoFilterUnits(frames)) {
    methodGroups[methodGroupFor(unitMethod(unit))] += 1
    const classes = eventClassesOf(unit)
    if (classes) for (const eventClass of classes) eventClasses[eventClass] += 1
  }
  return { methodGroups, eventClasses }
}

/**
 * Minimal storage interface `loadFilterState`/`saveFilterState` need — a
 * subset of `Storage` so tests can inject an in-memory fake instead of a
 * real `localStorage`, which is not available in this project's default
 * (non-browser) unit test environment.
 */
export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export const FILTER_STORAGE_KEY = 'mcremote.wirescope.frame-filter'
export const FILTER_STORAGE_VERSION = 1

interface StoredFilterStateV1 {
  version: typeof FILTER_STORAGE_VERSION
  methodGroups: Partial<Record<MethodGroup, boolean>>
  eventClasses: Partial<Record<EventClass, boolean>>
  orSearch: Partial<SearchFieldState>
  andSearch: Partial<SearchFieldState>
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const mergedBooleanRecord = <K extends string>(keys: readonly K[], stored: unknown, fallback: Record<K, boolean>) => {
  const merged = { ...fallback }
  if (isPlainObject(stored)) {
    for (const key of keys) {
      const value = stored[key]
      if (typeof value === 'boolean') merged[key] = value
    }
  }
  return merged
}

const mergedSearchField = (stored: unknown, fallback: SearchFieldState): SearchFieldState => {
  if (!isPlainObject(stored)) return fallback
  const enabled = typeof stored.enabled === 'boolean' ? stored.enabled : fallback.enabled
  const text = typeof stored.text === 'string' ? stored.text : fallback.text
  return { enabled, text }
}

/**
 * Parse a raw `localStorage` value into a `FilterState`, filling in
 * defaults field-by-field for anything missing, malformed, or from a
 * different storage version — never throwing on a corrupt value.
 * @param raw - the raw string previously returned by `getItem`, or null.
 * @returns a valid `FilterState`; `defaultFilterState()` if `raw` is
 *     missing, is not valid JSON, or carries a different `version`.
 */
export const parseStoredFilterState = (raw: string | null): FilterState => {
  const fallback = defaultFilterState()
  if (raw === null) return fallback
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return fallback
  }
  if (!isPlainObject(parsed) || parsed.version !== FILTER_STORAGE_VERSION) return fallback
  const stored = parsed as unknown as StoredFilterStateV1
  return {
    methodGroups: mergedBooleanRecord(ALL_METHOD_GROUPS, stored.methodGroups, fallback.methodGroups),
    eventClasses: mergedBooleanRecord(EVENT_CLASSES, stored.eventClasses, fallback.eventClasses),
    orSearch: mergedSearchField(stored.orSearch, fallback.orSearch),
    andSearch: mergedSearchField(stored.andSearch, fallback.andSearch),
  }
}

/**
 * Load filter preferences from storage. Frame/payload content and search
 * history are never persisted — only the switch/search UI state itself.
 * @param storage - typically `window.localStorage`.
 * @returns the restored `FilterState`, or defaults on first use / corrupt
 *     / version-mismatched storage.
 */
export const loadFilterState = (storage: KeyValueStorage): FilterState => {
  try {
    return parseStoredFilterState(storage.getItem(FILTER_STORAGE_KEY))
  } catch {
    return defaultFilterState()
  }
}

/**
 * Persist filter preferences. Best-effort: a storage failure (quota,
 * disabled storage, private browsing) is swallowed rather than breaking
 * the filter UI.
 * @param storage - typically `window.localStorage`.
 * @param state - the current `FilterState` to persist.
 */
export const saveFilterState = (storage: KeyValueStorage, state: FilterState): void => {
  const stored: StoredFilterStateV1 = {
    version: FILTER_STORAGE_VERSION,
    methodGroups: state.methodGroups,
    eventClasses: state.eventClasses,
    orSearch: state.orSearch,
    andSearch: state.andSearch,
  }
  try {
    storage.setItem(FILTER_STORAGE_KEY, JSON.stringify(stored))
  } catch {
    // Ignore quota/availability failures; filter preferences are UI sugar.
  }
}
