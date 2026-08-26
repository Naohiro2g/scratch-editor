import {
  HANDOFF_ATTACH,
  HANDOFF_GRANT,
  HANDOFF_PROTOCOL_VERSION,
  HANDOFF_READY,
  HANDOFF_REDEEM,
  OBSERVER_END,
  OBSERVER_SNAPSHOT,
  type HandoffGrantMessage,
  type HandoffReadyMessage,
} from './handoff'
import { OBSERVER_SESSION_PROTOCOL_VERSION } from './session'

export type ScratchAdapterStatus = 'waiting-for-source' | 'channel-attached' | 'grant-redeemed'
export type ScratchAdapterErrorCode = 'grant-expired'

export interface ScratchAdapterError extends Error {
  code: ScratchAdapterErrorCode
}

export interface ScratchAdapterCallbacks {
  onSelected: () => void
  onStatus: (status: ScratchAdapterStatus) => void
  onEnvelope: (envelope: unknown) => void
  onTransportLost: () => void
  onError: (error: ScratchAdapterError) => void
}

export interface ScratchAdapterEnvironment {
  opener: Window
  sourceOrigin: string
  windowTarget: Pick<Window, 'addEventListener' | 'removeEventListener'>
  now?: () => number
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const isProtocolMessage = (value: unknown, type: string): value is Record<string, unknown> =>
  isObject(value) && value.type === type && value.protocol_version === HANDOFF_PROTOCOL_VERSION

const grantMessage = (value: unknown): HandoffGrantMessage | null => {
  if (!isProtocolMessage(value, HANDOFF_GRANT)) return null
  if (
    typeof value.grant !== 'string' ||
    value.grant.length < 32 ||
    typeof value.expires_at !== 'number' ||
    !Number.isFinite(value.expires_at)
  ) {
    return null
  }
  return value as unknown as HandoffGrantMessage
}

const adapterError = (code: ScratchAdapterErrorCode, message: string): ScratchAdapterError =>
  Object.assign(new Error(message), { code })

// Falls back to 0 for a source that predates history_window or sends a
// malformed one, rather than letting session.ts fail the whole envelope
// closed on an otherwise-good snapshot.
const droppedFramesOf = (value: unknown): number => {
  if (!isObject(value)) return 0
  const historyWindow = value.history_window
  if (!isObject(historyWindow)) return 0
  const droppedFrames = historyWindow.dropped_frames
  return typeof droppedFrames === 'number' && Number.isSafeInteger(droppedFrames) && droppedFrames >= 0
    ? droppedFrames
    : 0
}

export const startScratchMessageChannelAdapter = (
  environment: ScratchAdapterEnvironment,
  callbacks: ScratchAdapterCallbacks,
): (() => void) => {
  const now = environment.now ?? Date.now
  let port: MessagePort | null = null
  let stopped = false

  const cleanupPort = (): void => {
    if (!port) return
    port.removeEventListener('message', onPortMessage)
    port.removeEventListener('messageerror', onPortMessageError)
    port.close()
    port = null
  }

  const fail = (error: ScratchAdapterError): void => {
    if (stopped) return
    stopped = true
    cleanupPort()
    environment.windowTarget.removeEventListener('message', onWindowMessage as EventListener)
    callbacks.onError(error)
  }

  function onPortMessage(event: MessageEvent): void {
    const grant = grantMessage(event.data)
    if (grant) {
      if (grant.expires_at <= now()) {
        fail(adapterError('grant-expired', 'The observation grant expired before redemption.'))
        return
      }
      port?.postMessage({
        type: HANDOFF_REDEEM,
        protocol_version: HANDOFF_PROTOCOL_VERSION,
        grant: grant.grant,
      })
      callbacks.onStatus('grant-redeemed')
      return
    }
    if (isProtocolMessage(event.data, OBSERVER_SNAPSHOT)) {
      callbacks.onEnvelope({
        type: OBSERVER_SNAPSHOT,
        protocol_version: OBSERVER_SESSION_PROTOCOL_VERSION,
        snapshot: event.data.snapshot,
        history_window: { dropped_frames: droppedFramesOf(event.data) },
      })
      return
    }
    if (isProtocolMessage(event.data, OBSERVER_END)) {
      callbacks.onEnvelope({
        type: OBSERVER_END,
        protocol_version: OBSERVER_SESSION_PROTOCOL_VERSION,
        reason: event.data.reason,
      })
    }
  }

  function onPortMessageError(): void {
    if (stopped) return
    stopped = true
    cleanupPort()
    callbacks.onTransportLost()
  }

  function onWindowMessage(event: MessageEvent): void {
    if (
      stopped ||
      event.source !== environment.opener ||
      event.origin !== environment.sourceOrigin ||
      !isProtocolMessage(event.data, HANDOFF_ATTACH) ||
      event.ports.length !== 1 ||
      port
    ) {
      return
    }
    port = event.ports[0]
    environment.windowTarget.removeEventListener('message', onWindowMessage as EventListener)
    port.addEventListener('message', onPortMessage)
    port.addEventListener('messageerror', onPortMessageError)
    port.start()
    callbacks.onSelected()
    callbacks.onStatus('channel-attached')
  }

  environment.windowTarget.addEventListener('message', onWindowMessage as EventListener)
  const ready: HandoffReadyMessage = {
    type: HANDOFF_READY,
    protocol_version: HANDOFF_PROTOCOL_VERSION,
  }
  environment.opener.postMessage(ready, environment.sourceOrigin)
  callbacks.onStatus('waiting-for-source')

  return () => {
    if (stopped) return
    stopped = true
    environment.windowTarget.removeEventListener('message', onWindowMessage as EventListener)
    cleanupPort()
  }
}
