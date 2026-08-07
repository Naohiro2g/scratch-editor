import {
  HANDOFF_ATTACH,
  HANDOFF_GRANT,
  HANDOFF_PROTOCOL_VERSION,
  HANDOFF_READY,
  HANDOFF_REDEEM,
  OBSERVER_END,
  OBSERVER_SNAPSHOT,
  type HandoffAttachMessage,
  type HandoffGrantMessage,
  type HandoffReadyMessage,
  type ObserverEndMessage,
  type ObserverSnapshotMessage,
} from './handoff'
import { parseObserverSnapshot, type ObserverSnapshot } from './observer'

export type ObserverClientStatus = 'direct-navigation' | 'waiting-for-source' | 'channel-attached' | 'grant-redeemed'

export type ObserverClientErrorCode = 'grant-expired' | 'target-changed' | 'invalid-end' | 'invalid-snapshot'

export interface ObserverClientError extends Error {
  code: ObserverClientErrorCode
}

export interface ObserverClientCallbacks {
  onStatus: (status: ObserverClientStatus) => void
  onSnapshot: (snapshot: ObserverSnapshot) => void
  onEnd: (reason: ObserverEndMessage['reason']) => void
  onError: (error: ObserverClientError) => void
}

export interface ObserverClientEnvironment {
  currentOrigin: string
  opener: Window | null
  referrer: string
  windowTarget: Pick<Window, 'addEventListener' | 'removeEventListener'>
  now?: () => number
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

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const isProtocolMessage = (value: unknown, type: string): boolean =>
  isObject(value) && value.type === type && value.protocol_version === HANDOFF_PROTOCOL_VERSION

const clientError = (code: ObserverClientErrorCode, message: string): ObserverClientError =>
  Object.assign(new Error(message), { code })

const isObserverClientError = (error: unknown): error is ObserverClientError =>
  error instanceof Error &&
  'code' in error &&
  (error.code === 'grant-expired' ||
    error.code === 'target-changed' ||
    error.code === 'invalid-end' ||
    error.code === 'invalid-snapshot')

const grantMessage = (value: unknown): HandoffGrantMessage | null => {
  if (!isProtocolMessage(value, HANDOFF_GRANT) || !isObject(value)) return null
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

export const startObserverClient = (
  environment: ObserverClientEnvironment,
  callbacks: ObserverClientCallbacks,
): (() => void) => {
  const sourceOrigin = sourceOriginFromReferrer(environment.referrer, environment.currentOrigin)
  const sourceWindow = environment.opener
  const now = environment.now ?? Date.now
  let port: MessagePort | null = null
  let targetId: string | null = null
  let ended = false

  const fail = (error: ObserverClientError): void => {
    if (ended) return
    ended = true
    port?.close()
    callbacks.onError(error)
  }

  const onPortMessage = (event: MessageEvent): void => {
    const grant = grantMessage(event.data)
    if (grant) {
      if (grant.expires_at <= now()) {
        fail(clientError('grant-expired', 'The observation grant expired before redemption.'))
        return
      }
      const redeem = {
        type: HANDOFF_REDEEM,
        protocol_version: HANDOFF_PROTOCOL_VERSION,
        grant: grant.grant,
      }
      port?.postMessage(redeem)
      callbacks.onStatus('grant-redeemed')
      return
    }
    if (isProtocolMessage(event.data, OBSERVER_SNAPSHOT) && isObject(event.data)) {
      try {
        const snapshot = parseObserverSnapshot(event.data.snapshot)
        if (targetId && snapshot.target.id !== targetId) {
          throw clientError('target-changed', 'The source changed observation targets within one session.')
        }
        targetId = snapshot.target.id
        callbacks.onSnapshot(snapshot)
      } catch (error) {
        fail(
          isObserverClientError(error)
            ? error
            : clientError('invalid-snapshot', error instanceof Error ? error.message : String(error)),
        )
      }
      return
    }
    if (isProtocolMessage(event.data, OBSERVER_END) && isObject(event.data)) {
      const reason = event.data.reason
      if (reason !== 'target-ended' && reason !== 'source-closed') {
        fail(clientError('invalid-end', 'The source sent an invalid observer end reason.'))
        return
      }
      ended = true
      port?.close()
      callbacks.onEnd(reason)
    }
  }

  const onWindowMessage = (event: MessageEvent): void => {
    if (
      ended ||
      !sourceWindow ||
      !sourceOrigin ||
      event.source !== sourceWindow ||
      event.origin !== sourceOrigin ||
      !isProtocolMessage(event.data, HANDOFF_ATTACH) ||
      event.ports.length !== 1 ||
      port
    ) {
      return
    }
    port = event.ports[0] ?? null
    port.addEventListener('message', onPortMessage)
    port.start()
    callbacks.onStatus('channel-attached')
  }

  environment.windowTarget.addEventListener('message', onWindowMessage as EventListener)
  if (!sourceWindow || !sourceOrigin) {
    callbacks.onStatus('direct-navigation')
  } else {
    const ready: HandoffReadyMessage = {
      type: HANDOFF_READY,
      protocol_version: HANDOFF_PROTOCOL_VERSION,
    }
    sourceWindow.postMessage(ready, sourceOrigin)
    callbacks.onStatus('waiting-for-source')
  }

  return () => {
    ended = true
    port?.close()
    environment.windowTarget.removeEventListener('message', onWindowMessage as EventListener)
  }
}

export const isAttachMessage = (value: unknown): value is HandoffAttachMessage =>
  isProtocolMessage(value, HANDOFF_ATTACH)

export const isSnapshotMessage = (value: unknown): value is ObserverSnapshotMessage =>
  isProtocolMessage(value, OBSERVER_SNAPSHOT)
