import type { ObserverStream, StreamStatus } from './observer'

export const selectActiveStream = (
  streams: readonly ObserverStream[],
  activeStreamId: string | null,
): ObserverStream => streams.find((stream) => stream.id === activeStreamId) ?? streams[0]

export type StreamViewStatus = StreamStatus | 'ended'

export const streamViewStatus = (snapshotStatus: StreamStatus, sessionEnded: boolean): StreamViewStatus =>
  sessionEnded ? 'ended' : snapshotStatus
