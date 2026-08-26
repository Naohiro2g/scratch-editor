import { startObserverClient, type ObserverClientErrorCode, type ObserverClientStatus } from './client'
import {
  OBSERVABLE_EVENT_CLASSES,
  OBSERVABLE_METHOD_GROUPS,
  filterCounts,
  filterFrames,
  loadFilterState,
  saveFilterState,
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

const renderHello = (hello: ObserverHello): HTMLElement => {
  const section = make('section', 'panel handshake-panel')
  section.append(make('h2', '', t('handshake')))
  const list = make('dl', 'details-grid')
  list.append(
    detail(t('fieldProtocol'), hello.protocol),
    detail(t('fieldMinecraft'), hello.mc_version),
    detail(t('fieldSupported'), hello.supported_mc_versions.join(', ')),
  )
  if (hello.permissions) {
    list.append(
      detail(t('fieldPermissions'), {
        online: hello.permissions.online,
        offline: hello.permissions.offline,
        build_range: hello.permissions.build_range,
      }),
    )
  }
  list.append(
    detail(t('fieldCatalogHash'), hello.catalog_hash ?? t('valueNone')),
    detail(t('fieldWorldConstants'), hello.world_constants),
    detail(t('fieldDimension'), hello.dimension),
    detail(t('fieldOrigin'), hello.origin.join(', ')),
  )
  section.append(list)
  return section
}

const renderFrames = (allFrames: ObserverFrame[]): HTMLElement => {
  updateFilterPanel(allFrames)
  const frames = filterFrames(allFrames, filterState)
  const section = make('section', 'panel frames-panel')
  const heading = make('div', 'panel-heading')
  heading.append(make('h2', '', t('wireFrames')), make('span', 'count', String(frames.length)))
  section.append(heading)
  if (frames.length === 0) {
    section.append(make('p', 'muted', t(allFrames.length === 0 ? 'noFrames' : 'noFramesMatchFilter')))
    return section
  }
  const tableWrap = make('div', 'table-wrap')
  const table = make('table')
  const head = make('thead')
  const headRow = make('tr')
  for (const label of ['#', t('columnDirection'), t('columnMethod'), t('columnPayload')]) {
    headRow.append(make('th', '', label))
  }
  head.append(headRow)
  const body = make('tbody')
  for (const frame of frames) {
    const row = make('tr')
    row.append(
      make('td', 'sequence', String(frame.sequence)),
      make(
        'td',
        `direction direction-${frame.direction}`,
        t(
          frame.direction === 'send' && frame.request_id === null
            ? 'directionSentUnconfirmed'
            : frame.direction === 'send'
              ? 'directionSend'
              : 'directionReceive',
        ),
      ),
      make('td', 'method', frame.method),
      make('td', 'payload', valueText(frame.payload)),
    )
    body.append(row)
  }
  table.append(head, body)
  tableWrap.append(table)
  section.append(tableWrap)
  return section
}

const renderStream = (stream: ObserverStream, index: number): HTMLElement => {
  const section = make('article', 'stream')
  section.id = `stream-panel-${index}`
  section.setAttribute('role', 'tabpanel')
  section.setAttribute('aria-labelledby', `stream-tab-${index}`)
  const layout = make('div', 'stream-layout')
  layout.append(renderHello(stream.hello), renderFrames(stream.frames))
  section.append(layout)
  return section
}

const renderStreamTabs = (streams: readonly ObserverStream[], activeStream: ObserverStream): HTMLElement => {
  const toolbar = make('div', 'stream-toolbar')
  const tabs = make('div', 'stream-tabs')
  tabs.setAttribute('role', 'tablist')
  tabs.setAttribute('aria-label', t('streamTabs'))
  streams.forEach((stream, index) => {
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
      if (currentSnapshot) renderSnapshot(currentSnapshot)
    })
    tabs.append(tab)
  })
  const displayStatus = streamViewStatus(activeStream.status, currentStatus.kind === 'ended')
  const displayStatusKey: Record<typeof displayStatus, MessageKey> = {
    connected: 'streamConnected',
    error: 'streamError',
    ended: 'streamEnded',
  }
  toolbar.append(tabs, make('span', `stream-status ${displayStatus}`, t(displayStatusKey[displayStatus])))
  return toolbar
}

const renderEmpty = (): void => {
  filterPanel.classList.add('hidden')
  content.className = 'content empty'
  content.replaceChildren(
    make('h1', '', t(stationMode ? 'stationEmptyTitle' : 'emptyTitle')),
    make('p', '', t(stationMode ? 'stationEmptyBody' : 'emptyBody')),
  )
}

const renderSnapshot = (snapshot: ObserverSnapshot): void => {
  filterPanel.classList.remove('hidden')
  content.replaceChildren()
  content.className = 'content'
  const target = make('section', 'target')
  const heading = make('div', 'target-heading')
  heading.append(
    make('span', 'eyebrow', t(snapshot.target.source_kind === 'scratch' ? 'sourceScratch' : 'sourcePython')),
    make('h1', '', snapshot.target.display_alias),
  )
  target.append(heading, make('span', 'read-only-badge', t('readOnly')))
  content.append(target)
  if (currentHistoryWindow.dropped_frames > 0) {
    content.append(
      make('p', 'history-window-notice', t('historyWindowTruncated', { count: currentHistoryWindow.dropped_frames })),
    )
  }
  const streams = make('section', 'streams')
  const activeStream = selectActiveStream(snapshot.streams, activeStreamId)
  activeStreamId = activeStream.id
  const activeIndex = snapshot.streams.indexOf(activeStream)
  streams.append(renderStreamTabs(snapshot.streams, activeStream), renderStream(activeStream, activeIndex))
  content.append(streams)
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

const refreshLocale = (): void => {
  document.documentElement.lang = locale
  document.title = t('documentTitle')
  subtitle.textContent = t('subtitle')
  languageSwitch.textContent = t('languageSwitch')
  languageSwitch.setAttribute('aria-label', t('languageSwitchLabel'))
  languageSwitch.title = t('languageSwitchLabel')
  languageSwitch.lang = nextLocale[locale]
  refreshFilterLabels()
  if (currentSnapshot) renderSnapshot(currentSnapshot)
  else renderEmpty()
  renderStationAttach()
  renderStatus()
}

onFilterStateChanged = (): void => {
  if (currentSnapshot) renderSnapshot(currentSnapshot)
}

languageSwitch.addEventListener('click', () => {
  locale = nextLocale[locale]
  refreshLocale()
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
