import type { ObserverSnapshot } from './observer'

export const HANDOFF_PROTOCOL_VERSION = 1 as const
export const HANDOFF_READY = 'mcremote.wirescope.ready' as const
export const HANDOFF_ATTACH = 'mcremote.wirescope.attach' as const
export const HANDOFF_GRANT = 'mcremote.wirescope.grant' as const
export const HANDOFF_REDEEM = 'mcremote.wirescope.redeem' as const
export const OBSERVER_SNAPSHOT = 'mcremote.wirescope.snapshot' as const
export const OBSERVER_END = 'mcremote.wirescope.end' as const

export interface HandoffReadyMessage {
  type: typeof HANDOFF_READY
  protocol_version: typeof HANDOFF_PROTOCOL_VERSION
}

export interface HandoffAttachMessage {
  type: typeof HANDOFF_ATTACH
  protocol_version: typeof HANDOFF_PROTOCOL_VERSION
}

export interface HandoffGrantMessage {
  type: typeof HANDOFF_GRANT
  protocol_version: typeof HANDOFF_PROTOCOL_VERSION
  grant: string
  expires_at: number
}

export interface HandoffRedeemMessage {
  type: typeof HANDOFF_REDEEM
  protocol_version: typeof HANDOFF_PROTOCOL_VERSION
  grant: string
}

export interface ObserverSnapshotMessage {
  type: typeof OBSERVER_SNAPSHOT
  protocol_version: typeof HANDOFF_PROTOCOL_VERSION
  snapshot: ObserverSnapshot
}

export interface ObserverEndMessage {
  type: typeof OBSERVER_END
  protocol_version: typeof HANDOFF_PROTOCOL_VERSION
  reason: 'target-ended' | 'source-closed'
}
