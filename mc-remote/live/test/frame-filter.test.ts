import { describe, expect, it } from 'vitest'
import {
  ALL_METHOD_GROUPS,
  defaultFilterState,
  EVENT_CLASSES,
  eventClassesForPollResponse,
  FILTER_STORAGE_KEY,
  FILTER_STORAGE_VERSION,
  filterCounts,
  filterFrames,
  filterUnitPasses,
  groupIntoFilterUnits,
  loadFilterState,
  methodGroupFor,
  OBSERVABLE_EVENT_CLASSES,
  OBSERVABLE_METHOD_GROUPS,
  parseStoredFilterState,
  saveFilterState,
  textMatches,
  visibleFrameSignature,
  type FilterState,
  type KeyValueStorage,
} from '../src/frame-filter'
import type { ObserverFrame, ObserverPayload } from '../src/observer'

let sequence = 0
const frame = (
  method: ObserverFrame['method'],
  direction: ObserverFrame['direction'],
  payload: ObserverPayload,
  requestId: ObserverFrame['request_id'] = 1,
): ObserverFrame => {
  sequence += 1
  return { sequence, observed_at: sequence, direction, request_id: requestId, method, payload }
}

const pollRequest = (requestId: ObserverFrame['request_id'] = 1): ObserverFrame =>
  frame('events.poll', 'send', { params: [0] }, requestId)

const pollResponse = (
  events: readonly { type: string }[],
  requestId: ObserverFrame['request_id'] = 1,
): ObserverFrame =>
  frame(
    'events.poll',
    'receive',
    {
      result: {
        events,
        through_sequence: 1,
        latest_sequence: 1,
        filtered_out: 0,
        overflow_dropped_total: 0,
        capacity_dropped_total: 0,
        explicitly_discarded_total: 0,
      },
    },
    requestId,
  )

class MemoryStorage implements KeyValueStorage {
  private readonly items = new Map<string, string>()
  getItem(key: string): string | null {
    return this.items.has(key) ? (this.items.get(key) ?? null) : null
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value)
  }
}

describe('methodGroupFor', () => {
  it('classifies each known wire namespace, folding hello into connection', () => {
    expect(methodGroupFor('hello')).toBe('connection')
    expect(methodGroupFor('connection.flush')).toBe('connection')
    expect(methodGroupFor('auth.pairBegin')).toBe('auth')
    expect(methodGroupFor('build.setDimension')).toBe('build')
    expect(methodGroupFor('catalog.get')).toBe('catalog')
    expect(methodGroupFor('chat.post')).toBe('chat')
    expect(methodGroupFor('events.poll')).toBe('events')
    expect(methodGroupFor('player.getPos')).toBe('player')
    expect(methodGroupFor('world.setBlock')).toBe('world')
  })

  it('classifies an unrecognized method as other', () => {
    expect(methodGroupFor('entity.getDirection')).toBe('other')
    expect(methodGroupFor('entity.setDirection')).toBe('other')
    expect(methodGroupFor('')).toBe('other')
  })
})

describe('OBSERVABLE_METHOD_GROUPS / OBSERVABLE_EVENT_CLASSES', () => {
  it('excludes auth and catalog, which OBSERVED_METHODS never routes a frame to', () => {
    expect(OBSERVABLE_METHOD_GROUPS).not.toContain('auth')
    expect(OBSERVABLE_METHOD_GROUPS).not.toContain('catalog')
  })

  it('keeps other for the observed protocol 23.1 entity methods', () => {
    expect(OBSERVABLE_METHOD_GROUPS).toContain('other')
    expect(methodGroupFor('entity.getDirection')).toBe('other')
  })

  it('keeps every group with at least one observed member', () => {
    for (const group of ['connection', 'build', 'chat', 'events', 'player', 'world'] as const) {
      expect(OBSERVABLE_METHOD_GROUPS).toContain(group)
    }
  })

  it('is a strict subset of ALL_METHOD_GROUPS', () => {
    for (const group of OBSERVABLE_METHOD_GROUPS) expect(ALL_METHOD_GROUPS).toContain(group)
    expect(OBSERVABLE_METHOD_GROUPS.length).toBeLessThan(ALL_METHOD_GROUPS.length)
  })

  it('excludes the other event class, which parseEvent() can never classify into', () => {
    expect(OBSERVABLE_EVENT_CLASSES).not.toContain('other')
    expect(OBSERVABLE_EVENT_CLASSES).toEqual(EVENT_CLASSES.filter((eventClass) => eventClass !== 'other'))
  })
})

describe('eventClassesForPollResponse', () => {
  it('classifies the three protocol 23 event types', () => {
    expect(eventClassesForPollResponse(pollResponse([{ type: 'pickaxe_poke' }]).payload)).toEqual(['pickaxe_poke'])
    expect(eventClassesForPollResponse(pollResponse([{ type: 'chat_posted' }]).payload)).toEqual(['chat_posted'])
    expect(eventClassesForPollResponse(pollResponse([{ type: 'projectile_hit' }]).payload)).toEqual([
      'projectile_hit',
    ])
  })

  it('classifies a response with zero events as empty', () => {
    expect(eventClassesForPollResponse(pollResponse([]).payload)).toEqual(['empty'])
  })

  it('classifies an unknown event type as other', () => {
    expect(eventClassesForPollResponse(pollResponse([{ type: 'block_right_click' }]).payload)).toEqual(['other'])
  })

  it('returns every distinct class present in a multi-event response', () => {
    const classes = eventClassesForPollResponse(
      pollResponse([{ type: 'pickaxe_poke' }, { type: 'chat_posted' }, { type: 'pickaxe_poke' }]).payload,
    )
    expect(classes).not.toBeNull()
    expect(new Set(classes)).toEqual(new Set(['pickaxe_poke', 'chat_posted']))
  })

  it('returns null for a payload with no events.poll result shape', () => {
    expect(eventClassesForPollResponse({ params: [0] })).toBeNull()
    expect(eventClassesForPollResponse({ error: { code: -1, message: 'x' } })).toBeNull()
  })
})

describe('textMatches', () => {
  it('matches case-insensitively', () => {
    expect(textMatches('Hello World', 'WORLD')).toBe(true)
    expect(textMatches('Hello World', 'world')).toBe(true)
  })

  it('matches as a substring, not a whole-word match', () => {
    expect(textMatches('minecraft:diamond_pickaxe', 'diamond')).toBe(true)
    expect(textMatches('minecraft:diamond_pickaxe', 'pickax')).toBe(true)
  })

  it('accepts comma-separated multiple keywords, matching on any one', () => {
    expect(textMatches('chat_posted', 'pickaxe_poke, chat_posted')).toBe(true)
    expect(textMatches('projectile_hit', 'pickaxe_poke, chat_posted')).toBe(false)
  })

  it('trims keyword whitespace and ignores empty keywords', () => {
    expect(textMatches('hello world', '  world  ,, ')).toBe(true)
  })

  it('never matches when the search text has no keywords', () => {
    expect(textMatches('anything', '')).toBe(false)
    expect(textMatches('anything', ' , , ')).toBe(false)
  })
})

describe('groupIntoFilterUnits', () => {
  it('keeps non-events.poll frames as their own unit', () => {
    const units = groupIntoFilterUnits([frame('chat.post', 'send', { params: ['hi'] })])
    expect(units).toHaveLength(1)
    expect(units[0].frames).toHaveLength(1)
  })

  it('pairs an events.poll request and response by request_id', () => {
    const units = groupIntoFilterUnits([pollRequest(7), pollResponse([], 7)])
    expect(units).toHaveLength(1)
    expect(units[0].frames).toHaveLength(2)
  })

  it('does not pair frames with different request_ids', () => {
    const units = groupIntoFilterUnits([pollRequest(1), pollResponse([], 2)])
    expect(units).toHaveLength(2)
    expect(units.every((unit) => unit.frames.length === 1)).toBe(true)
  })

  it('keeps an unpaired trailing request as its own single-frame unit (orphan request)', () => {
    const units = groupIntoFilterUnits([pollRequest(1)])
    expect(units).toHaveLength(1)
    expect(units[0].frames).toHaveLength(1)
    expect(units[0].frames[0].direction).toBe('send')
  })

  it('keeps an unpaired leading response as its own single-frame unit (orphan response)', () => {
    const units = groupIntoFilterUnits([pollResponse([], 1)])
    expect(units).toHaveLength(1)
    expect(units[0].frames).toHaveLength(1)
    expect(units[0].frames[0].direction).toBe('receive')
  })

  it('interleaves unrelated frames between a request and its later response without breaking the pair', () => {
    const units = groupIntoFilterUnits([
      pollRequest(1),
      frame('chat.post', 'send', { params: ['hi'] }),
      pollResponse([], 1),
    ])
    expect(units).toHaveLength(2)
    expect(units.some((unit) => unit.frames.length === 2)).toBe(true)
  })
})

describe('filterUnitPasses: truth table', () => {
  const state = (overrides: Partial<FilterState>): FilterState => ({ ...defaultFilterState(), ...overrides })
  const chatFrame = () => frame('chat.post', 'send', { params: ['hello there'] })

  it('shows a frame when its method group is on and no search is enabled', () => {
    expect(filterUnitPasses({ frames: [chatFrame()] }, state({}))).toBe(true)
  })

  it('hides a frame when its method group is off', () => {
    const off = state({ methodGroups: { ...defaultFilterState().methodGroups, chat: false } })
    expect(filterUnitPasses({ frames: [chatFrame()] }, off)).toBe(false)
  })

  it('base pass alone is enough regardless of search switches left off', () => {
    const bothOff = state({
      orSearch: { enabled: false, text: 'nomatch' },
      andSearch: { enabled: false, text: 'nomatch' },
    })
    expect(filterUnitPasses({ frames: [chatFrame()] }, bothOff)).toBe(true)
  })

  it('or-search alone can rescue a unit whose method group is off', () => {
    const rescued = state({
      methodGroups: { ...defaultFilterState().methodGroups, chat: false },
      orSearch: { enabled: true, text: 'hello' },
    })
    expect(filterUnitPasses({ frames: [chatFrame()] }, rescued)).toBe(true)
  })

  it('or-search enabled but not matching does not rescue a filtered-out unit', () => {
    const notRescued = state({
      methodGroups: { ...defaultFilterState().methodGroups, chat: false },
      orSearch: { enabled: true, text: 'nomatch' },
    })
    expect(filterUnitPasses({ frames: [chatFrame()] }, notRescued)).toBe(false)
  })

  it('and-search enabled requires a match even when base pass is true', () => {
    const gated = state({ andSearch: { enabled: true, text: 'nomatch' } })
    expect(filterUnitPasses({ frames: [chatFrame()] }, gated)).toBe(false)
  })

  it('and-search enabled and matching still shows a unit that base-passes', () => {
    const gated = state({ andSearch: { enabled: true, text: 'hello' } })
    expect(filterUnitPasses({ frames: [chatFrame()] }, gated)).toBe(true)
  })

  it('and-search can veto a unit rescued by or-search', () => {
    const vetoed = state({
      methodGroups: { ...defaultFilterState().methodGroups, chat: false },
      orSearch: { enabled: true, text: 'hello' },
      andSearch: { enabled: true, text: 'nomatch' },
    })
    expect(filterUnitPasses({ frames: [chatFrame()] }, vetoed)).toBe(false)
  })

  it('events.poll passes only when its event class is also on', () => {
    const unit = { frames: [pollRequest(), pollResponse([{ type: 'pickaxe_poke' }])] as const }
    expect(filterUnitPasses(unit, state({}))).toBe(true)
    const pokeOff = state({ eventClasses: { ...defaultFilterState().eventClasses, pickaxe_poke: false } })
    expect(filterUnitPasses(unit, pokeOff)).toBe(false)
  })

  it('events.poll group off hides the unit even if its event class is on', () => {
    const unit = { frames: [pollRequest(), pollResponse([{ type: 'pickaxe_poke' }])] as const }
    const groupOff = state({ methodGroups: { ...defaultFilterState().methodGroups, events: false } })
    expect(filterUnitPasses(unit, groupOff)).toBe(false)
  })
})

describe('default filter state', () => {
  it('turns every method group on', () => {
    const state = defaultFilterState()
    for (const group of ALL_METHOD_GROUPS) expect(state.methodGroups[group]).toBe(true)
  })

  it('turns every event class on except empty', () => {
    const state = defaultFilterState()
    expect(state.eventClasses.empty).toBe(false)
    expect(state.eventClasses.pickaxe_poke).toBe(true)
    expect(state.eventClasses.chat_posted).toBe(true)
    expect(state.eventClasses.projectile_hit).toBe(true)
    expect(state.eventClasses.other).toBe(true)
  })

  it('turns both search fields off with empty text', () => {
    const state = defaultFilterState()
    expect(state.orSearch).toEqual({ enabled: false, text: '' })
    expect(state.andSearch).toEqual({ enabled: false, text: '' })
  })

  it('hides empty polls by default and shows everything else in a mixed window', () => {
    const frames = [
      pollRequest(1),
      pollResponse([], 1),
      pollRequest(2),
      pollResponse([{ type: 'pickaxe_poke' }], 2),
      frame('chat.post', 'send', { params: ['hi'] }),
    ]
    const visible = filterFrames(frames, defaultFilterState())
    expect(visible.map((f) => f.sequence)).toEqual([frames[2].sequence, frames[3].sequence, frames[4].sequence])
  })
})

describe('events.poll pair visibility', () => {
  it('shows both request and response frames together, never just one', () => {
    const requestFrame = pollRequest(1)
    const responseFrame = pollResponse([{ type: 'pickaxe_poke' }], 1)
    const visible = filterFrames([requestFrame, responseFrame], defaultFilterState())
    expect(visible).toEqual([requestFrame, responseFrame])
  })

  it('hides both request and response frames together for a filtered-out class', () => {
    const requestFrame = pollRequest(1)
    const responseFrame = pollResponse([], 1)
    const visible = filterFrames([requestFrame, responseFrame], defaultFilterState())
    expect(visible).toEqual([])
  })

  it('shows a pair if it contains a mix of types where at least one is enabled', () => {
    const state = {
      ...defaultFilterState(),
      eventClasses: { ...defaultFilterState().eventClasses, chat_posted: false },
    }
    const requestFrame = pollRequest(1)
    const responseFrame = pollResponse([{ type: 'chat_posted' }, { type: 'pickaxe_poke' }], 1)
    expect(filterFrames([requestFrame, responseFrame], state)).toEqual([requestFrame, responseFrame])
  })

  it('never shows a pending request-only events.poll unit, even with the events group on', () => {
    const requestFrame = pollRequest(1)
    expect(filterFrames([requestFrame], defaultFilterState())).toEqual([])
  })

  it('does not show a pending request even when it matches an enabled "or" search', () => {
    const requestFrame = frame('events.poll', 'send', { params: [0] }, 1)
    const state: FilterState = { ...defaultFilterState(), orSearch: { enabled: true, text: 'events.poll' } }
    expect(filterFrames([requestFrame], state)).toEqual([])
  })

  it('shows the pair once the response for a previously pending request arrives', () => {
    const requestFrame = pollRequest(1)
    expect(filterFrames([requestFrame], defaultFilterState())).toEqual([])
    const responseFrame = pollResponse([{ type: 'pickaxe_poke' }], 1)
    expect(filterFrames([requestFrame, responseFrame], defaultFilterState())).toEqual([requestFrame, responseFrame])
  })

  it('does not misjudge an orphan response missing its request as unclassified-empty', () => {
    const responseFrame = pollResponse([{ type: 'pickaxe_poke' }], 1)
    expect(filterFrames([responseFrame], defaultFilterState())).toEqual([responseFrame])
  })

  it('hides an orphan empty response the same as a paired empty response', () => {
    const responseFrame = pollResponse([], 1)
    expect(filterFrames([responseFrame], defaultFilterState())).toEqual([])
  })

  it('shows a completed empty-response pair together once the "empty" class switch is on', () => {
    const requestFrame = pollRequest(1)
    const responseFrame = pollResponse([], 1)
    const state: FilterState = {
      ...defaultFilterState(),
      eventClasses: { ...defaultFilterState().eventClasses, empty: true },
    }
    expect(filterFrames([requestFrame, responseFrame], state)).toEqual([requestFrame, responseFrame])
  })

  it('shows a completed error-response pair together, ungated by the event-class switches', () => {
    const requestFrame = pollRequest(1)
    const errorResponseFrame = frame(
      'events.poll',
      'receive',
      { error: { code: -32000, message: 'backpressure', data: { reason: 'backpressure' } } },
      1,
    )
    const allEventClassesOff: FilterState = {
      ...defaultFilterState(),
      eventClasses: Object.fromEntries(
        EVENT_CLASSES.map((eventClass) => [eventClass, false]),
      ) as FilterState['eventClasses'],
    }
    expect(filterFrames([requestFrame, errorResponseFrame], allEventClassesOff)).toEqual([
      requestFrame,
      errorResponseFrame,
    ])
  })
})

describe('visibleFrameSignature', () => {
  it('does not change when a hidden (pending or filtered-out) poll is added', () => {
    const frames = [frame('chat.post', 'send', { params: ['hi'] })]
    const before = visibleFrameSignature(frames, defaultFilterState())
    const withPendingPoll = [...frames, pollRequest(2)]
    expect(visibleFrameSignature(withPendingPoll, defaultFilterState())).toBe(before)
    const withHiddenEmptyPair = [...withPendingPoll, pollResponse([], 2)]
    expect(visibleFrameSignature(withHiddenEmptyPair, defaultFilterState())).toBe(before)
  })

  it('changes when a visible frame (a player/event frame) is added', () => {
    const frames = [frame('chat.post', 'send', { params: ['hi'] })]
    const before = visibleFrameSignature(frames, defaultFilterState())
    const withVisibleEvent = [...frames, pollRequest(2), pollResponse([{ type: 'pickaxe_poke' }], 2)]
    expect(visibleFrameSignature(withVisibleEvent, defaultFilterState())).not.toBe(before)
  })
})

describe('filterFrames does not mutate or drop the held window', () => {
  it('returns a filtered view without discarding frames outside the returned array', () => {
    const frames = [frame('chat.post', 'send', { params: ['hi'] }), pollRequest(1), pollResponse([], 1)]
    const before = frames.slice()
    filterFrames(frames, defaultFilterState())
    expect(frames).toEqual(before)
  })

  it('changing the filter state never loses frames from the original window, only what is shown', () => {
    const frames = [frame('chat.post', 'send', { params: ['hi'] }), pollRequest(1), pollResponse([], 1)]
    const restrictive: FilterState = {
      ...defaultFilterState(),
      methodGroups: Object.fromEntries(
        ALL_METHOD_GROUPS.map((group) => [group, false]),
      ) as FilterState['methodGroups'],
    }
    expect(filterFrames(frames, restrictive)).toEqual([])
    expect(filterFrames(frames, defaultFilterState()).length).toBeGreaterThan(0)
    expect(frames).toHaveLength(3)
  })
})

describe('filterCounts', () => {
  it('counts are independent of the current filter switch state', () => {
    const frames = [frame('chat.post', 'send', { params: ['hi'] })]
    const allOn = filterCounts(frames)
    expect(allOn.methodGroups.chat).toBe(1)
    // Counting itself takes no FilterState, so there is nothing to toggle off and
    // re-derive: this assertion documents that filterCounts never reads switches.
    expect(allOn.methodGroups.chat).toBe(filterCounts(frames).methodGroups.chat)
  })

  it('counts one filter unit per method group, and one events.poll pair as a single unit', () => {
    const frames = [pollRequest(1), pollResponse([], 1), frame('chat.post', 'send', { params: ['hi'] })]
    const counts = filterCounts(frames)
    expect(counts.methodGroups.events).toBe(1)
    expect(counts.methodGroups.chat).toBe(1)
  })

  it('counts a multi-type poll response toward each event class it carries', () => {
    const frames = [pollRequest(1), pollResponse([{ type: 'pickaxe_poke' }, { type: 'chat_posted' }], 1)]
    const counts = filterCounts(frames)
    expect(counts.eventClasses.pickaxe_poke).toBe(1)
    expect(counts.eventClasses.chat_posted).toBe(1)
    expect(counts.eventClasses.projectile_hit).toBe(0)
  })
})

describe('localStorage persistence', () => {
  it('uses a versioned key', () => {
    expect(FILTER_STORAGE_KEY).toBe('mcremote.wirescope.frame-filter')
    expect(FILTER_STORAGE_VERSION).toBe(1)
  })

  it('round-trips a modified filter state through save and load', () => {
    const storage = new MemoryStorage()
    const modified: FilterState = {
      ...defaultFilterState(),
      methodGroups: { ...defaultFilterState().methodGroups, chat: false },
      eventClasses: { ...defaultFilterState().eventClasses, other: false },
      orSearch: { enabled: true, text: 'poke' },
      andSearch: { enabled: true, text: 'oak' },
    }
    saveFilterState(storage, modified)
    expect(loadFilterState(storage)).toEqual(modified)
  })

  it('falls back to defaults when nothing is stored yet', () => {
    const storage = new MemoryStorage()
    expect(loadFilterState(storage)).toEqual(defaultFilterState())
  })

  it('falls back to defaults for a corrupt (non-JSON) stored value', () => {
    expect(parseStoredFilterState('not json{{{')).toEqual(defaultFilterState())
  })

  it('falls back to defaults for a mismatched storage version', () => {
    expect(parseStoredFilterState(JSON.stringify({ version: 999, methodGroups: {}, eventClasses: {} }))).toEqual(
      defaultFilterState(),
    )
  })

  it('falls back per-field for a partially-shaped stored value rather than discarding everything', () => {
    const raw = JSON.stringify({
      version: FILTER_STORAGE_VERSION,
      methodGroups: { chat: false, world: 'not-a-boolean' },
      eventClasses: { pickaxe_poke: false },
      orSearch: { enabled: true },
      andSearch: null,
    })
    const restored = parseStoredFilterState(raw)
    expect(restored.methodGroups.chat).toBe(false)
    expect(restored.methodGroups.world).toBe(true)
    expect(restored.eventClasses.pickaxe_poke).toBe(false)
    expect(restored.eventClasses.empty).toBe(false)
    expect(restored.orSearch).toEqual({ enabled: true, text: '' })
    expect(restored.andSearch).toEqual(defaultFilterState().andSearch)
  })

  it('does not throw when the underlying storage throws (e.g. disabled/private-mode localStorage)', () => {
    const throwingStorage: KeyValueStorage = {
      getItem: () => {
        throw new Error('storage disabled')
      },
      setItem: () => {
        throw new Error('storage disabled')
      },
    }
    expect(() => loadFilterState(throwingStorage)).not.toThrow()
    expect(loadFilterState(throwingStorage)).toEqual(defaultFilterState())
    expect(() => saveFilterState(throwingStorage, defaultFilterState())).not.toThrow()
  })
})
