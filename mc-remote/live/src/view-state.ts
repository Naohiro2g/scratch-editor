import type { ObserverStream } from './observer'

export const selectActiveStream = (
  streams: readonly ObserverStream[],
  activeStreamId: string | null,
): ObserverStream => streams.find((stream) => stream.id === activeStreamId) ?? streams[0]
