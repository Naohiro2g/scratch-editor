import { startObserverClient, type ObserverClientErrorCode, type ObserverClientStatus } from './client'
import type { ObserverEndMessage } from './handoff'
import { resolveLocale, translate, type Locale, type MessageKey } from './l10n'
import type { ObserverFrame, ObserverHello, ObserverSnapshot, ObserverStream } from './observer'
import './styles.css'
import { selectActiveStream } from './view-state'

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

const content = make('section', 'content empty')
shell.append(header, status, content)
root.append(shell)

type ViewStatus =
  | { kind: 'client'; status: ObserverClientStatus | 'starting' }
  | { kind: 'observing'; count: number }
  | { kind: 'ended'; reason: ObserverEndMessage['reason'] }
  | { kind: 'error'; code: ObserverClientErrorCode }

let locale: Locale = resolveLocale(navigator.languages.length ? navigator.languages : [navigator.language])
let currentSnapshot: ObserverSnapshot | null = null
let currentStatus: ViewStatus = { kind: 'client', status: 'starting' }
let activeStreamId: string | null = null

const t = (key: MessageKey, values?: Readonly<Record<string, string | number>>): string =>
  translate(locale, key, values)

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
    detail(t('fieldWorld'), hello.world ?? '—'),
    detail(t('fieldOrigin'), hello.origin?.join(', ') ?? '—'),
  )
  section.append(list)
  return section
}

const renderFrames = (frames: ObserverFrame[]): HTMLElement => {
  const section = make('section', 'panel frames-panel')
  const heading = make('div', 'panel-heading')
  heading.append(make('h2', '', t('wireFrames')), make('span', 'count', String(frames.length)))
  section.append(heading)
  if (frames.length === 0) {
    section.append(make('p', 'muted', t('noFrames')))
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
        t(frame.direction === 'send' ? 'directionSend' : 'directionReceive'),
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
  toolbar.append(
    tabs,
    make(
      'span',
      `stream-status ${activeStream.status}`,
      t(activeStream.status === 'connected' ? 'streamConnected' : 'streamError'),
    ),
  )
  return toolbar
}

const renderEmpty = (): void => {
  content.className = 'content empty'
  content.replaceChildren(make('h1', '', t('emptyTitle')), make('p', '', t('emptyBody')))
}

const renderSnapshot = (snapshot: ObserverSnapshot): void => {
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
  'invalid-snapshot': 'errorInvalidSnapshot',
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
    currentStatus.kind === 'ended'
      ? t(currentStatus.reason === 'target-ended' ? 'endTarget' : 'endSource')
      : t(errorStatusKey[currentStatus.code])
}

const refreshLocale = (): void => {
  document.documentElement.lang = locale
  document.title = t('documentTitle')
  subtitle.textContent = t('subtitle')
  languageSwitch.textContent = t('languageSwitch')
  languageSwitch.setAttribute('aria-label', t('languageSwitchLabel'))
  languageSwitch.title = t('languageSwitchLabel')
  languageSwitch.lang = nextLocale[locale]
  if (currentSnapshot) renderSnapshot(currentSnapshot)
  else renderEmpty()
  renderStatus()
}

languageSwitch.addEventListener('click', () => {
  locale = nextLocale[locale]
  refreshLocale()
})

refreshLocale()

const cleanup = startObserverClient(
  {
    currentOrigin: window.location.origin,
    opener: window.opener as Window | null,
    referrer: document.referrer,
    windowTarget: window,
  },
  {
    onStatus: (clientStatus) => {
      currentStatus = { kind: 'client', status: clientStatus }
      renderStatus()
    },
    onSnapshot: (snapshot) => {
      currentSnapshot = snapshot
      currentStatus = { kind: 'observing', count: snapshot.streams.length }
      refreshLocale()
    },
    onEnd: (reason) => {
      currentStatus = { kind: 'ended', reason }
      renderStatus()
    },
    onError: (error) => {
      console.error('startObserverClient: invalid observer session data', {
        code: error.code,
        message: error.message,
      })
      currentStatus = { kind: 'error', code: error.code }
      renderStatus()
    },
  },
)

window.addEventListener('beforeunload', cleanup, { once: true })
