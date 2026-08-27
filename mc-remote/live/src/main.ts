import { startObserverClient, type ObserverClientErrorCode, type ObserverClientStatus } from './client'
import {
  OBSERVABLE_EVENT_CLASSES,
  OBSERVABLE_METHOD_GROUPS,
  filterCounts,
  filterFrames,
  loadFilterState,
  saveFilterState,
  visibleFrameSignature,
  type EventClass,
  type FilterState,
  type MethodGroup,
} from './frame-filter'
import { resolveLocale, translate, type Locale, type MessageKey } from './l10n'
import type { ObserverFrame, ObserverHello, ObserverSnapshot, ObserverStream } from './observer'
import type { ObserverHistoryWindow, ObserverSessionEndReason } from './session'
import type { StationAttachErrorCode } from './station'
import { createSameOriginStationAdapter, type StationAdapterStatus } from './station-adapter'
import './styles.css'
import { selectActiveStream, streamViewStatus } from './view-state'

const root = document.querySelector<HTMLElement>('#app')
if (!root) throw new Error('WireScope app root is missing')

const make = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag)
  if (className) element.className = className
  if (typeof text === 'string') element.textContent = text
  return element
}

const shell = make('div', 'shell')
const header = make('header', 'topbar')
const brand = make('div', 'brand')
brand.append(make('span', 'brand-mark', 'W'), make('strong', '', 'WireScope'))
const headerActions = make('div', 'topbar-actions')
const subtitle = make('span', 'subtitle')
const languageSwitch = make('button', 'language-switch')
languageSwitch.type = 'button'
headerActions.append(subtitle, languageSwitch)
header.append(brand, headerActions)

const status = make('section', 'status-card')
status.setAttribute('aria-live', 'polite')
const statusDot = make('span', 'status-dot')
const statusText = make('span')
status.append(statusDot, statusText)

const stationAttach = make('form', 'station-attach hidden')
const stationAttachCopy = make('div', 'station-attach-copy')
const stationAttachTitle = make('strong')
const stationAttachHelp = make('span', 'muted')
stationAttachCopy.append(stationAttachTitle, stationAttachHelp)
const stationAttachControls = make('div', 'station-attach-controls')
const stationAttachInput = make('input', 'station-attach-input')
stationAttachInput.type = 'text'
stationAttachInput.maxLength = 9
stationAttachInput.autocomplete = 'off'
stationAttachInput.autocapitalize = 'characters'
stationAttachInput.spellcheck = false
const stationAttachButton = make('button', 'station-attach-button')
stationAttachButton.type = 'submit'
stationAttachControls.append(stationAttachInput, stationAttachButton)
stationAttach.append(stationAttachCopy, stationAttachControls)

// Client-only display filter over the currently held frame window (never
// touches the wire or server event ring — see frame-filter.ts). Built once,
// outside `content`, so its search <input> elements are never torn down and
// rebuilt by renderSnapshot() and never lose focus/value while a viewer is
// mid-keystroke when a new frame arrives.
const filterPanel = make('section', 'panel filter-panel hidden')
const filterToggle = make('button', 'filter-toggle')
filterToggle.type = 'button'
const filterSummaryText = make('span', 'filter-summary')
const filterToggleRow = make('div', 'filter-toggle-row')
filterToggleRow.append(filterToggle, filterSummaryText)
const filterBody = make('div', 'filter-body hidden')
const filterMethodGroupHeading = make('h3')
const filterMethodGroupList = make('div', 'filter-switch-list')
const filterEventClassHeading = make('h3')
const filterEventClassList = make('div', 'filter-switch-list')
const filterSearchList = make('div', 'filter-search-list')
filterBody.append(
  filterMethodGroupHeading,
  filterMethodGroupList,
  filterEventClassHeading,
  filterEventClassList,
  filterSearchList,
)
filterPanel.append(filterToggleRow, filterBody)

interface FilterSwitchElements {
  root: HTMLElement
  input: HTMLInputElement
  labelText: HTMLElement
  count: HTMLElement
}

const methodGroupSwitchKey: Record<MethodGroup, MessageKey> = {
  connection: 'filterMethodGroupConnection',
  auth: 'filterMethodGroupAuth',
  build: 'filterMethodGroupBuild',
  catalog: 'filterMethodGroupCatalog',
  chat: 'filterMethodGroupChat',
  events: 'filterMethodGroupEvents',
  player: 'filterMethodGroupPlayer',
  world: 'filterMethodGroupWorld',
  other: 'filterMethodGroupOther',
}

const eventClassSwitchKey: Record<EventClass, MessageKey> = {
  pickaxe_poke: 'filterEventClassPickaxePoke',
  chat_posted: 'filterEventClassChatPosted',
  projectile_hit: 'filterEventClassProjectileHit',
  empty: 'filterEventClassEmpty',
  other: 'filterEventClassOther',
}

const makeFilterSwitch = (onToggle: (checked: boolean) => void): FilterSwitchElements => {
  const label = make('label', 'filter-switch')
  const input = make('input')
  input.type = 'checkbox'
  const labelText = make('span')
  const count = make('span', 'count filter-switch-count')
  label.append(input, labelText, count)
  input.addEventListener('change', () => onToggle(input.checked))
  return { root: label, input, labelText, count }
}

let filterState: FilterState = loadFilterState(window.localStorage)

const persistFilterState = (): void => saveFilterState(window.localStorage, filterState)

const methodGroupSwitches = new Map<MethodGroup, FilterSwitchElements>()
for (const group of OBSERVABLE_METHOD_GROUPS) {
  const elements = makeFilterSwitch((checked) => {
    filterState = {
      ...filterState,
      methodGroups: { ...filterState.methodGroups, [group]: checked },
    }
    persistFilterState()
    onFilterStateChanged()
  })
  methodGroupSwitches.set(group, elements)
  filterMethodGroupList.append(elements.root)
}

const eventClassSwitches = new Map<EventClass, FilterSwitchElements>()
for (const eventClass of OBSERVABLE_EVENT_CLASSES) {
  const elements = makeFilterSwitch((checked) => {
    filterState = {
      ...filterState,
      eventClasses: { ...filterState.eventClasses, [eventClass]: checked },
    }
    persistFilterState()
    onFilterStateChanged()
  })
  eventClassSwitches.set(eventClass, elements)
  filterEventClassList.append(elements.root)
}

const makeSearchField = (
  onEnabledChange: (checked: boolean) => void,
  onTextChange: (text: string) => void,
): { row: HTMLElement; enabledInput: HTMLInputElement; labelText: HTMLElement; textInput: HTMLInputElement } => {
  const row = make('label', 'filter-search')
  const enabledInput = make('input')
  enabledInput.type = 'checkbox'
  const labelText = make('span')
  const textInput = make('input', 'filter-search-text')
  textInput.type = 'text'
  row.append(enabledInput, labelText, textInput)
  enabledInput.addEventListener('change', () => onEnabledChange(enabledInput.checked))
  textInput.addEventListener('input', () => onTextChange(textInput.value))
  return { row, enabledInput, labelText, textInput }
}

const orSearch = makeSearchField(
  (checked) => {
    filterState = { ...filterState, orSearch: { ...filterState.orSearch, enabled: checked } }
    persistFilterState()
    onFilterStateChanged()
  },
  (text) => {
    filterState = { ...filterState, orSearch: { ...filterState.orSearch, text } }
    persistFilterState()
    onFilterStateChanged()
  },
)
const andSearch = makeSearchField(
  (checked) => {
    filterState = { ...filterState, andSearch: { ...filterState.andSearch, enabled: checked } }
    persistFilterState()
    onFilterStateChanged()
  },
  (text) => {
    filterState = { ...filterState, andSearch: { ...filterState.andSearch, text } }
    persistFilterState()
    onFilterStateChanged()
  },
)
orSearch.enabledInput.checked = filterState.orSearch.enabled
orSearch.textInput.value = filterState.orSearch.text
andSearch.enabledInput.checked = filterState.andSearch.enabled
andSearch.textInput.value = filterState.andSearch.text
filterSearchList.append(orSearch.row, andSearch.row)

for (const [group, elements] of methodGroupSwitches) elements.input.checked = filterState.methodGroups[group]
for (const [eventClass, elements] of eventClassSwitches) elements.input.checked = filterState.eventClasses[eventClass]

let filterPanelExpanded = false

const refreshFilterToggle = (): void => {
  filterToggle.textContent = t(filterPanelExpanded ? 'filterCollapse' : 'filterExpand')
  filterToggle.setAttribute('aria-expanded', String(filterPanelExpanded))
  filterBody.classList.toggle('hidden', !filterPanelExpanded)
}

filterToggle.addEventListener('click', () => {
  filterPanelExpanded = !filterPanelExpanded
  refreshFilterToggle()
})

// Re-applies the current filterState to the active stream's frame table
// without touching the filter panel's own DOM (search inputs keep focus).
let onFilterStateChanged: () => void = () => {}

const content = make('section', 'content empty')
shell.append(header, status, stationAttach, filterPanel, content)
root.append(shell)

type ViewStatus =
  | { kind: 'client'; status: ObserverClientStatus | 'starting' }
  | { kind: 'station'; status: StationAdapterStatus }
  | { kind: 'attach-error'; code: StationAttachErrorCode }
  | { kind: 'observing'; count: number }
  | { kind: 'ended'; reason: ObserverSessionEndReason }
  | { kind: 'error'; code: ObserverClientErrorCode }

let locale: Locale = resolveLocale(navigator.languages.length ? navigator.languages : [navigator.language])
let currentSnapshot: ObserverSnapshot | null = null
let currentHistoryWindow: ObserverHistoryWindow = { dropped_frames: 0 }
let currentStatus: ViewStatus = { kind: 'client', status: 'starting' }
let activeStreamId: string | null = null
let stationMode = false

const t = (key: MessageKey, values?: Readonly<Record<string, string | number>>): string =>
  translate(locale, key, values)

// Switch counts always reflect the current window, independent of the
// filter's own on/off state, and are shown next to every switch per the
// product decision — never hidden even when a switch is off.
const updateFilterPanel = (frames: readonly ObserverFrame[]): void => {
  const counts = filterCounts(frames)
  for (const [group, elements] of methodGroupSwitches) elements.count.textContent = String(counts.methodGroups[group])
  for (const [eventClass, elements] of eventClassSwitches) {
    elements.count.textContent = String(counts.eventClasses[eventClass])
  }
  const visible = filterFrames(frames, filterState).length
  filterSummaryText.textContent = t('filterSummary', { visible, total: frames.length })
}

const refreshFilterLabels = (): void => {
  filterMethodGroupHeading.textContent = t('filterMethodGroupHeading')
  filterEventClassHeading.textContent = t('filterEventClassHeading')
  for (const [group, elements] of methodGroupSwitches) elements.labelText.textContent = t(methodGroupSwitchKey[group])
  for (const [eventClass, elements] of eventClassSwitches) {
    elements.labelText.textContent = t(eventClassSwitchKey[eventClass])
  }
  orSearch.labelText.textContent = t('filterOrSearchLabel')
  andSearch.labelText.textContent = t('filterAndSearchLabel')
  orSearch.textInput.placeholder = t('filterSearchPlaceholder')
  andSearch.textInput.placeholder = t('filterSearchPlaceholder')
  refreshFilterToggle()
}

const valueText = (value: unknown): string => (typeof value === 'string' ? value : JSON.stringify(value))

const detail = (label: string, value: unknown): HTMLElement => {
  const item = make('div', 'detail')
  item.append(make('dt', '', label), make('dd', '', valueText(value)))
  return item
}

// --- Persistent target / history-window / streams DOM, built once. ---
// content.replaceChildren() only ever runs on the rare empty <-> snapshot
// transition below; every steady-state snapshot update (the observer client
// polls roughly once a second) mutates these same nodes in place instead of
// tearing them down, so an in-progress payload text selection in the frame
// table survives repeated snapshot arrivals. See updateStreamFrames below
// for why that specifically requires skipping unchanged content, not just
// keeping the DOM nodes reachable.
const target = make('section', 'target')
const targetEyebrow = make('span', 'eyebrow')
const targetTitle = make('h1')
const targetHeading = make('div', 'target-heading')
targetHeading.append(targetEyebrow, targetTitle)
const targetBadge = make('span', 'read-only-badge')
target.append(targetHeading, targetBadge)

const historyWindowNotice = make('p', 'history-window-notice hidden')

const streamTabs = make('div', 'stream-tabs')
streamTabs.setAttribute('role', 'tablist')
const streamStatusBadge = make('span', 'stream-status')
const streamToolbar = make('div', 'stream-toolbar')
streamToolbar.append(streamTabs, streamStatusBadge)

const streamLayout = make('div', 'stream-layout')
const streamPanel = make('article', 'stream')
streamPanel.setAttribute('role', 'tabpanel')
streamPanel.append(streamLayout)

const streamsSection = make('section', 'streams')
streamsSection.append(streamToolbar, streamPanel)

let contentMode: 'empty' | 'snapshot' = 'empty'
let mountedStreamId: string | null = null

interface StreamHelloState {
  readonly section: HTMLElement
  readonly heading: HTMLElement
  readonly list: HTMLDListElement
}

const buildStreamHello = (): StreamHelloState => {
  const section = make('section', 'panel handshake-panel')
  const heading = make('h2')
  const list = make('dl', 'details-grid')
  section.append(heading, list)
  return { section, heading, list }
}

const updateStreamHello = (state: StreamHelloState, hello: ObserverHello): void => {
  state.heading.textContent = t('handshake')
  const items = [
    detail(t('fieldProtocol'), hello.protocol),
    detail(t('fieldMinecraft'), hello.mc_version),
    detail(t('fieldSupported'), hello.supported_mc_versions.join(', ')),
  ]
  if (hello.permissions) {
    items.push(
      detail(t('fieldPermissions'), {
        online: hello.permissions.online,
        offline: hello.permissions.offline,
        build_range: hello.permissions.build_range,
      }),
    )
  }
  items.push(
    detail(t('fieldCatalogHash'), hello.catalog_hash ?? t('valueNone')),
    detail(t('fieldWorldConstants'), hello.world_constants),
    detail(t('fieldDimension'), hello.dimension),
    detail(t('fieldOrigin'), hello.origin.join(', ')),
  )
  state.list.replaceChildren(...items)
}

const streamHelloStates = new Map<string, StreamHelloState>()

interface StreamFramesState {
  readonly panel: HTMLElement
  readonly headingTitle: HTMLElement
  readonly countSpan: HTMLElement
  readonly bodyContainer: HTMLElement
  readonly headRow: HTMLTableRowElement
  readonly tableWrap: HTMLElement
  readonly tbody: HTMLTableSectionElement
  readonly emptyMessage: HTMLElement
  bodyMode: 'empty' | 'table' | null
  lastSignature: string | null
}

const buildStreamFrames = (): StreamFramesState => {
  const panel = make('section', 'panel frames-panel')
  const headingTitle = make('h2')
  const countSpan = make('span', 'count')
  const heading = make('div', 'panel-heading')
  heading.append(headingTitle, countSpan)
  const bodyContainer = make('div')
  panel.append(heading, bodyContainer)

  const emptyMessage = make('p', 'muted')

  const tableWrap = make('div', 'table-wrap')
  const tableElement = make('table')
  const head = make('thead')
  const headRow = make('tr')
  headRow.append(make('th'), make('th'), make('th'), make('th'))
  head.append(headRow)
  const tbody = make('tbody')
  tableElement.append(head, tbody)
  tableWrap.append(tableElement)

  return {
    panel,
    headingTitle,
    countSpan,
    bodyContainer,
    headRow,
    tableWrap,
    tbody,
    emptyMessage,
    bodyMode: null,
    lastSignature: null,
  }
}

const directionMessageKey = (frame: ObserverFrame): MessageKey =>
  frame.direction === 'send' && frame.request_id === null
    ? 'directionSentUnconfirmed'
    : frame.direction === 'send'
      ? 'directionSend'
      : 'directionReceive'

/**
 * Update one stream's frame table in place. Skips rebuilding the visible
 * rows entirely when `visibleFrameSignature` shows the filtered projection
 * is unchanged from the last render (`force` false) — the common case while
 * only hidden frames (a pending events.poll request, a filtered-out empty
 * poll pair) keep arriving every second. Rebuilding `tbody`'s children only
 * when something the viewer can actually see changed is what lets an
 * in-progress payload text selection survive that steady-state noise.
 * `force` bypasses the skip for a locale switch or a filter-state change,
 * where the visible set may be textually different (translated labels,
 * newly (un)hidden units) even when the signature happens to match.
 * @param state - the stream's persistent frame-table DOM state.
 * @param allFrames - the stream's currently held frames, in observed order.
 * @param force - re-render unconditionally, bypassing the signature check.
 */
const updateStreamFrames = (state: StreamFramesState, allFrames: readonly ObserverFrame[], force: boolean): void => {
  state.headingTitle.textContent = t('wireFrames')
  const headers = ['#', t('columnDirection'), t('columnMethod'), t('columnPayload')]
  headers.forEach((label, index) => {
    state.headRow.children[index].textContent = label
  })

  const signature = visibleFrameSignature(allFrames, filterState)
  if (!force && signature === state.lastSignature) return
  state.lastSignature = signature

  const frames = filterFrames(allFrames, filterState)
  state.countSpan.textContent = String(frames.length)

  if (frames.length === 0) {
    state.emptyMessage.textContent = t(allFrames.length === 0 ? 'noFrames' : 'noFramesMatchFilter')
    if (state.bodyMode !== 'empty') {
      state.bodyContainer.replaceChildren(state.emptyMessage)
      state.bodyMode = 'empty'
    }
    return
  }

  const rows = frames.map((frame) => {
    const row = make('tr')
    row.append(
      make('td', 'sequence', String(frame.sequence)),
      make('td', `direction direction-${frame.direction}`, t(directionMessageKey(frame))),
      make('td', 'method', frame.method),
      make('td', 'payload', valueText(frame.payload)),
    )
    return row
  })
  state.tbody.replaceChildren(...rows)
  if (state.bodyMode !== 'table') {
    state.bodyContainer.replaceChildren(state.tableWrap)
    state.bodyMode = 'table'
  }
}

const streamFramesStates = new Map<string, StreamFramesState>()

const updateStreamTabs = (streams: readonly ObserverStream[], activeStream: ObserverStream): void => {
  streamTabs.setAttribute('aria-label', t('streamTabs'))
  const tabs = streams.map((stream, index) => {
    const tab = make('button', `stream-tab${stream.id === activeStream.id ? ' active' : ''}`)
    tab.type = 'button'
    tab.id = `stream-tab-${index}`
    tab.setAttribute('role', 'tab')
    tab.setAttribute('aria-controls', `stream-panel-${index}`)
    tab.setAttribute('aria-selected', String(stream.id === activeStream.id))
    tab.tabIndex = stream.id === activeStream.id ? 0 : -1
    tab.append(
      make('span', 'stream-tab-kind', t(stream.kind === 'main' ? 'streamMain' : 'streamSubstream')),
      make('span', 'stream-tab-id', stream.id),
    )
    tab.addEventListener('click', () => {
      activeStreamId = stream.id
      if (currentSnapshot) renderSnapshot(currentSnapshot, { forceFrameTableRebuild: true })
    })
    return tab
  })
  streamTabs.replaceChildren(...tabs)

  const displayStatus = streamViewStatus(activeStream.status, currentStatus.kind === 'ended')
  const displayStatusKey: Record<typeof displayStatus, MessageKey> = {
    connected: 'streamConnected',
    error: 'streamError',
    ended: 'streamEnded',
  }
  streamStatusBadge.className = `stream-status ${displayStatus}`
  streamStatusBadge.textContent = t(displayStatusKey[displayStatus])
}

const renderEmpty = (): void => {
  filterPanel.classList.add('hidden')
  content.className = 'content empty'
  content.replaceChildren(
    make('h1', '', t(stationMode ? 'stationEmptyTitle' : 'emptyTitle')),
    make('p', '', t(stationMode ? 'stationEmptyBody' : 'emptyBody')),
  )
  contentMode = 'empty'
}

interface RenderSnapshotOptions {
  readonly forceFrameTableRebuild: boolean
}

const renderSnapshot = (
  snapshot: ObserverSnapshot,
  options: RenderSnapshotOptions = { forceFrameTableRebuild: false },
): void => {
  filterPanel.classList.remove('hidden')
  if (contentMode !== 'snapshot') {
    content.replaceChildren(target, historyWindowNotice, streamsSection)
    content.className = 'content'
    contentMode = 'snapshot'
  }

  targetEyebrow.textContent = t(snapshot.target.source_kind === 'scratch' ? 'sourceScratch' : 'sourcePython')
  targetTitle.textContent = snapshot.target.display_alias
  targetBadge.textContent = t('readOnly')

  const droppedFrames = currentHistoryWindow.dropped_frames
  historyWindowNotice.classList.toggle('hidden', droppedFrames <= 0)
  if (droppedFrames > 0) historyWindowNotice.textContent = t('historyWindowTruncated', { count: droppedFrames })

  const activeStream = selectActiveStream(snapshot.streams, activeStreamId)
  activeStreamId = activeStream.id
  const activeIndex = snapshot.streams.indexOf(activeStream)
  streamPanel.id = `stream-panel-${activeIndex}`
  streamPanel.setAttribute('aria-labelledby', `stream-tab-${activeIndex}`)
  updateStreamTabs(snapshot.streams, activeStream)

  let helloState = streamHelloStates.get(activeStream.id)
  if (!helloState) {
    helloState = buildStreamHello()
    streamHelloStates.set(activeStream.id, helloState)
  }
  updateStreamHello(helloState, activeStream.hello)

  let framesState = streamFramesStates.get(activeStream.id)
  if (!framesState) {
    framesState = buildStreamFrames()
    streamFramesStates.set(activeStream.id, framesState)
  }
  updateFilterPanel(activeStream.frames)
  updateStreamFrames(framesState, activeStream.frames, options.forceFrameTableRebuild)

  if (mountedStreamId !== activeStream.id) {
    streamLayout.replaceChildren(helloState.section, framesState.panel)
    mountedStreamId = activeStream.id
  }
}

const clientStatusKey: Record<ObserverClientStatus | 'starting', MessageKey> = {
  starting: 'statusStarting',
  'direct-navigation': 'statusDirectNavigation',
  'waiting-for-source': 'statusWaitingForSource',
  'channel-attached': 'statusChannelAttached',
  'grant-redeemed': 'statusGrantRedeemed',
}

const errorStatusKey: Record<ObserverClientErrorCode, MessageKey> = {
  'grant-expired': 'errorGrantExpired',
  'target-changed': 'errorTargetChanged',
  'invalid-end': 'errorInvalidEnd',
  'invalid-history-window': 'errorInvalidHistoryWindow',
  'invalid-session': 'errorInvalidSession',
  'invalid-snapshot': 'errorInvalidSnapshot',
}

const stationStatusKey: Record<StationAdapterStatus, MessageKey> = {
  'station-ready': 'statusStationReady',
  'station-target-not-ready': 'statusStationTargetNotReady',
  'station-attaching': 'statusStationAttaching',
  'station-attached': 'statusStationAttached',
}

const attachErrorStatusKey: Record<StationAttachErrorCode, MessageKey> = {
  'target-not-ready': 'attachErrorTargetNotReady',
  'malformed-code': 'attachErrorMalformedCode',
  'invalid-code': 'attachErrorInvalidCode',
  'attempts-exhausted': 'attachErrorAttemptsExhausted',
  'code-expired': 'attachErrorCodeExpired',
  'already-redeemed': 'attachErrorAlreadyRedeemed',
  'invalid-request': 'attachErrorInvalidRequest',
}

const endStatusKey: Record<ObserverSessionEndReason, MessageKey> = {
  'target-ended': 'endTarget',
  'source-closed': 'endSource',
  backpressure: 'endBackpressure',
  'capacity-exhausted': 'endCapacityExhausted',
  'transport-lost': 'endTransportLost',
}

const nextLocale: Record<Locale, Locale> = {
  en: 'ja',
  ja: 'ja-Hira',
  'ja-Hira': 'en',
}

const renderStatus = (): void => {
  statusDot.className = 'status-dot'
  if (currentStatus.kind === 'client') {
    statusText.textContent = t(clientStatusKey[currentStatus.status])
    return
  }
  if (currentStatus.kind === 'station') {
    statusText.textContent = t(stationStatusKey[currentStatus.status])
    if (currentStatus.status === 'station-attached') statusDot.className = 'status-dot connected'
    return
  }
  if (currentStatus.kind === 'attach-error') {
    statusDot.className = 'status-dot ended'
    statusText.textContent = t(attachErrorStatusKey[currentStatus.code])
    return
  }
  if (currentStatus.kind === 'observing') {
    statusDot.className = 'status-dot connected'
    statusText.textContent = t('statusObserving', {
      count: currentStatus.count,
      streams: t(currentStatus.count === 1 ? 'streamCountOne' : 'streamCountMany'),
    })
    return
  }
  statusDot.className = 'status-dot ended'
  statusText.textContent =
    currentStatus.kind === 'ended' ? t(endStatusKey[currentStatus.reason]) : t(errorStatusKey[currentStatus.code])
}

const renderStationAttach = (): void => {
  const visible =
    stationMode &&
    (currentStatus.kind === 'attach-error' ||
      (currentStatus.kind === 'station' && currentStatus.status !== 'station-attached'))
  stationAttach.classList.toggle('hidden', !visible)
  const attaching = currentStatus.kind === 'station' && currentStatus.status === 'station-attaching'
  stationAttachInput.disabled = attaching
  stationAttachButton.disabled = attaching
  stationAttachTitle.textContent = t('stationAttachTitle')
  stationAttachHelp.textContent = t('stationAttachHelp')
  stationAttachInput.placeholder = t('stationAttachPlaceholder')
  stationAttachInput.setAttribute('aria-label', t('stationAttachInputLabel'))
  stationAttachButton.textContent = t('stationAttachSubmit')
}

// `forceFrameTableRebuild` only needs to be true for an actual locale switch
// (translated row labels must refresh even when the visible frame set
// itself did not change). The periodic per-snapshot call from
// startObserverClient's onStatus/onSnapshot below passes the default
// (false) so routine ~1s poll noise never touches the frame table.
const refreshLocale = (options: RenderSnapshotOptions = { forceFrameTableRebuild: false }): void => {
  document.documentElement.lang = locale
  document.title = t('documentTitle')
  subtitle.textContent = t('subtitle')
  languageSwitch.textContent = t('languageSwitch')
  languageSwitch.setAttribute('aria-label', t('languageSwitchLabel'))
  languageSwitch.title = t('languageSwitchLabel')
  languageSwitch.lang = nextLocale[locale]
  refreshFilterLabels()
  if (currentSnapshot) renderSnapshot(currentSnapshot, options)
  else renderEmpty()
  renderStationAttach()
  renderStatus()
}

onFilterStateChanged = (): void => {
  if (currentSnapshot) renderSnapshot(currentSnapshot, { forceFrameTableRebuild: true })
}

languageSwitch.addEventListener('click', () => {
  locale = nextLocale[locale]
  refreshLocale({ forceFrameTableRebuild: true })
})

refreshLocale()

const stationAdapter = createSameOriginStationAdapter(
  { currentOrigin: window.location.origin },
  {
    onStatus: (stationStatus) => {
      stationMode = true
      currentStatus = { kind: 'station', status: stationStatus }
      refreshLocale()
    },
    onAttachError: (code) => {
      stationMode = true
      currentStatus = { kind: 'attach-error', code }
      renderStationAttach()
      renderStatus()
    },
  },
)

stationAttach.addEventListener('submit', (event) => {
  event.preventDefault()
  const value = stationAttachInput.value
  stationAttachInput.value = ''
  stationAdapter.submitAttachCode(value)
})

const cleanup = startObserverClient(
  {
    currentOrigin: window.location.origin,
    opener: window.opener as Window | null,
    referrer: document.referrer,
    windowTarget: window,
    stationAdapter,
  },
  {
    onStatus: (clientStatus) => {
      stationMode = false
      currentStatus = { kind: 'client', status: clientStatus }
      renderStationAttach()
      renderStatus()
    },
    onSnapshot: (snapshot, historyWindow) => {
      currentSnapshot = snapshot
      currentHistoryWindow = historyWindow
      currentStatus = { kind: 'observing', count: snapshot.streams.length }
      refreshLocale()
    },
    onEnd: (reason) => {
      currentStatus = { kind: 'ended', reason }
      refreshLocale()
    },
    onError: (error) => {
      console.error('startObserverClient: invalid observer session data', {
        code: error.code,
        message: error.message,
      })
      currentStatus = { kind: 'error', code: error.code }
      renderStationAttach()
      renderStatus()
    },
  },
)

window.addEventListener('beforeunload', cleanup, { once: true })
