import { parseObserverSnapshot, type ObserverSnapshot } from './observer'

export const OBSERVER_SESSION_PROTOCOL_VERSION = 1 as const
export const OBSERVER_SESSION_SNAPSHOT = 'mcremote.wirescope.snapshot' as const
export const OBSERVER_SESSION_END = 'mcremote.wirescope.end' as const

export interface ObserverHistoryWindow {
  dropped_frames: number
}

export interface ObserverSessionSnapshotEnvelope {
  type: typeof OBSERVER_SESSION_SNAPSHOT
  protocol_version: typeof OBSERVER_SESSION_PROTOCOL_VERSION
  snapshot: ObserverSnapshot
  history_window: ObserverHistoryWindow
}

export type ObserverSessionWireEndReason = 'target-ended' | 'source-closed' | 'backpressure' | 'capacity-exhausted'

export type ObserverSessionEndReason = ObserverSessionWireEndReason | 'transport-lost'

export interface ObserverSessionEndEnvelope {
  type: typeof OBSERVER_SESSION_END
  protocol_version: typeof OBSERVER_SESSION_PROTOCOL_VERSION
  reason: ObserverSessionWireEndReason
}

export type ObserverSessionEnvelope = ObserverSessionSnapshotEnvelope | ObserverSessionEndEnvelope

export type ObserverSessionErrorCode =
  | 'invalid-end'
  | 'invalid-history-window'
  | 'invalid-session'
  | 'invalid-snapshot'
  | 'target-changed'

export interface ObserverSessionError extends Error {
  code: ObserverSessionErrorCode
}

export interface ObserverSessionCallbacks {
  onSnapshot: (snapshot: ObserverSnapshot, historyWindow: ObserverHistoryWindow) => void
  onEnd: (reason: ObserverSessionEndReason) => void
  onError: (error: ObserverSessionError) => void
}

export interface ObserverSession {
  receive: (value: unknown) => void
  transportLost: () => void
  close: () => void
}

const objectValue = (value: unknown, context: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw sessionError('invalid-session', `${context} must be an object`)
  }
  return value as Record<string, unknown>
}

const exactFields = (value: Record<string, unknown>, allowed: readonly string[], context: string): void => {
  const allowedSet = new Set(allowed)
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) {
      throw sessionError('invalid-session', `${context} unknown field: ${key}`)
    }
  }
}

const sessionError = (code: ObserverSessionErrorCode, message: string): ObserverSessionError =>
  Object.assign(new Error(message), { code })

const parseHistoryWindow = (value: unknown): ObserverHistoryWindow => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw sessionError('invalid-history-window', 'history_window must be an object')
  }
  const historyWindow = value as Record<string, unknown>
  if (Object.keys(historyWindow).some((key) => key !== 'dropped_frames')) {
    throw sessionError('invalid-history-window', 'history_window contains an unknown field')
  }
  if (
    typeof historyWindow.dropped_frames !== 'number' ||
    !Number.isSafeInteger(historyWindow.dropped_frames) ||
    historyWindow.dropped_frames < 0
  ) {
    throw sessionError('invalid-history-window', 'history_window.dropped_frames must be a non-negative safe integer')
  }
  return { dropped_frames: historyWindow.dropped_frames }
}

export const parseObserverSessionEnvelope = (value: unknown): ObserverSessionEnvelope => {
  const envelope = objectValue(value, 'observer session envelope')
  if (envelope.protocol_version !== OBSERVER_SESSION_PROTOCOL_VERSION) {
    throw sessionError('invalid-session', 'observer session protocol version is unsupported')
  }
  if (envelope.type === OBSERVER_SESSION_SNAPSHOT) {
    exactFields(envelope, ['type', 'protocol_version', 'snapshot', 'history_window'], 'snapshot envelope')
    let snapshot: ObserverSnapshot
    try {
      snapshot = parseObserverSnapshot(envelope.snapshot)
    } catch (error) {
      throw sessionError('invalid-snapshot', error instanceof Error ? error.message : String(error))
    }
    return {
      type: OBSERVER_SESSION_SNAPSHOT,
      protocol_version: OBSERVER_SESSION_PROTOCOL_VERSION,
      snapshot,
      history_window: parseHistoryWindow(envelope.history_window),
    }
  }
  if (envelope.type === OBSERVER_SESSION_END) {
    exactFields(envelope, ['type', 'protocol_version', 'reason'], 'end envelope')
    if (
      envelope.reason !== 'target-ended' &&
      envelope.reason !== 'source-closed' &&
      envelope.reason !== 'backpressure' &&
      envelope.reason !== 'capacity-exhausted'
    ) {
      throw sessionError('invalid-end', 'observer session end reason is invalid')
    }
    return {
      type: OBSERVER_SESSION_END,
      protocol_version: OBSERVER_SESSION_PROTOCOL_VERSION,
      reason: envelope.reason,
    }
  }
  throw sessionError('invalid-session', 'observer session envelope type is unsupported')
}

export const createObserverSession = (callbacks: ObserverSessionCallbacks): ObserverSession => {
  let terminal = false
  let targetId: string | null = null
  let droppedFrames = 0

  const fail = (error: ObserverSessionError): void => {
    if (terminal) return
    terminal = true
    callbacks.onError(error)
  }

  return {
    receive: (value) => {
      if (terminal) return
      let envelope: ObserverSessionEnvelope
      try {
        envelope = parseObserverSessionEnvelope(value)
      } catch (error) {
        fail(
          error instanceof Error && 'code' in error
            ? (error as ObserverSessionError)
            : sessionError('invalid-session', error instanceof Error ? error.message : String(error)),
        )
        return
      }
      if (envelope.type === OBSERVER_SESSION_END) {
        terminal = true
        callbacks.onEnd(envelope.reason)
        return
      }
      if (targetId && envelope.snapshot.target.id !== targetId) {
        fail(sessionError('target-changed', 'The source changed observation targets within one session.'))
        return
      }
      if (envelope.history_window.dropped_frames < droppedFrames) {
        fail(
          sessionError(
            'invalid-history-window',
            'history_window.dropped_frames decreased within one observer session',
          ),
        )
        return
      }
      targetId = envelope.snapshot.target.id
      droppedFrames = envelope.history_window.dropped_frames
      callbacks.onSnapshot(envelope.snapshot, envelope.history_window)
    },
    transportLost: () => {
      if (terminal) return
      terminal = true
      callbacks.onEnd('transport-lost')
    },
    close: () => {
      terminal = true
    },
  }
}
