import type { ObserverSnapshot } from './observer'
import {
  startScratchMessageChannelAdapter,
  type ScratchAdapterErrorCode,
  type ScratchAdapterStatus,
} from './scratch-adapter'
import {
  createObserverSession,
  type ObserverHistoryWindow,
  type ObserverSessionEndReason,
  type ObserverSessionErrorCode,
} from './session'

export const SCRATCH_SELECTION_WINDOW_MS = 2_000

export type ObserverClientStatus = 'direct-navigation' | ScratchAdapterStatus
export type ObserverClientErrorCode = ScratchAdapterErrorCode | ObserverSessionErrorCode

export interface ObserverClientError extends Error {
  code: ObserverClientErrorCode
}

export interface ObserverClientCallbacks {
  onStatus: (status: ObserverClientStatus) => void
  onSnapshot: (snapshot: ObserverSnapshot, historyWindow: ObserverHistoryWindow) => void
  onEnd: (reason: ObserverSessionEndReason) => void
  onError: (error: ObserverClientError) => void
}

export interface ObserverStationAdapterCallbacks {
  onEnvelope: (envelope: unknown) => void
  onTransportLost: () => void
  onUnavailable: () => void
}

export interface ObserverStationAdapter {
  start: (callbacks: ObserverStationAdapterCallbacks) => () => void
}

export interface ObserverClientEnvironment {
  currentOrigin: string
  opener: Window | null
  referrer: string
  windowTarget: Pick<Window, 'addEventListener' | 'removeEventListener'>
  now?: () => number
  setTimeout?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>
  clearTimeout?: (timer: ReturnType<typeof setTimeout>) => void
  stationAdapter?: ObserverStationAdapter
}

export const sourceOriginFromReferrer = (referrer: string, currentOrigin: string): string | null => {
  if (!referrer) return null
  try {
    const origin = new URL(referrer).origin
    return origin === currentOrigin ? null : origin
  } catch {
    return null
  }
}

export const startObserverClient = (
  environment: ObserverClientEnvironment,
  callbacks: ObserverClientCallbacks,
): (() => void) => {
  const sourceOrigin = sourceOriginFromReferrer(environment.referrer, environment.currentOrigin)
  const setTimer = environment.setTimeout ?? setTimeout
  const clearTimer = environment.clearTimeout ?? clearTimeout
  let stopped = false
  let selection: 'scratch-candidate' | 'scratch' | 'station' | 'none' = 'none'
  let selectionTimer: ReturnType<typeof setTimeout> | null = null
  let activeAdapterCleanup = (): void => {}

  const finish = (action: () => void): void => {
    if (stopped) return
    stopped = true
    if (selectionTimer !== null) clearTimer(selectionTimer)
    selectionTimer = null
    activeAdapterCleanup()
    activeAdapterCleanup = () => {}
    action()
  }

  const session = createObserverSession({
    onSnapshot: callbacks.onSnapshot,
    onEnd: (reason) => finish(() => callbacks.onEnd(reason)),
    onError: (error) => finish(() => callbacks.onError(error)),
  })

  const startStationOrDirectNavigation = (): void => {
    if (stopped) return
    if (!environment.stationAdapter) {
      selection = 'none'
      callbacks.onStatus('direct-navigation')
      return
    }
    selection = 'station'
    const startState = { active: true }
    const cleanup = environment.stationAdapter.start({
      onEnvelope: (envelope) => {
        session.receive(envelope)
        if (stopped) startState.active = false
      },
      onTransportLost: () => {
        session.transportLost()
        if (stopped) startState.active = false
      },
      onUnavailable: () => {
        startState.active = false
        if (stopped || selection !== 'station') return
        selection = 'none'
        const stopAdapter = activeAdapterCleanup
        activeAdapterCleanup = () => {}
        stopAdapter()
        callbacks.onStatus('direct-navigation')
      },
    })
    if (startState.active) activeAdapterCleanup = cleanup
    else cleanup()
  }

  if (environment.opener && sourceOrigin) {
    selection = 'scratch-candidate'
    const startState = { selected: false }
    const scratchCleanup = startScratchMessageChannelAdapter(
      {
        opener: environment.opener,
        sourceOrigin,
        windowTarget: environment.windowTarget,
        now: environment.now,
      },
      {
        onSelected: () => {
          if (stopped || selection !== 'scratch-candidate') return
          startState.selected = true
          selection = 'scratch'
          if (selectionTimer !== null) clearTimer(selectionTimer)
          selectionTimer = null
        },
        onStatus: callbacks.onStatus,
        onEnvelope: session.receive,
        onTransportLost: session.transportLost,
        onError: (error) => finish(() => callbacks.onError(error)),
      },
    )
    activeAdapterCleanup = scratchCleanup
    if (!startState.selected) {
      selectionTimer = setTimer(() => {
        if (stopped || selection !== 'scratch-candidate') return
        activeAdapterCleanup()
        activeAdapterCleanup = () => {}
        startStationOrDirectNavigation()
      }, SCRATCH_SELECTION_WINDOW_MS)
    }
  } else {
    startStationOrDirectNavigation()
  }

  return () => {
    if (stopped) return
    stopped = true
    if (selectionTimer !== null) clearTimer(selectionTimer)
    selectionTimer = null
    activeAdapterCleanup()
    activeAdapterCleanup = () => {}
    session.close()
  }
}
