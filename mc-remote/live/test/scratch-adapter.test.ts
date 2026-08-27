import { describe, expect, test, vi } from 'vitest'
import { startScratchMessageChannelAdapter, type ScratchAdapterEnvironment } from '../src/scratch-adapter'

interface FakePort {
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
  postMessage: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  start: ReturnType<typeof vi.fn>
  listeners: Record<string, (event: { data: unknown }) => void>
}

const fakePort = (): FakePort => {
  const listeners: FakePort['listeners'] = {}
  return {
    addEventListener: vi.fn((type: string, listener: (event: { data: unknown }) => void) => {
      listeners[type] = listener
    }),
    removeEventListener: vi.fn(),
    postMessage: vi.fn(),
    close: vi.fn(),
    start: vi.fn(),
    listeners,
  }
}

/**
 * Drive the adapter from startup through a HANDOFF_ATTACH so a port is
 * selected and the returned fake port's captured `message` listener can be
 * used to simulate an `OBSERVER_SNAPSHOT` arriving from the Scratch source.
 * @returns the attached fake port and the adapter's `onEnvelope` spy.
 */
const attachedAdapter = () => {
  const opener = { postMessage: vi.fn() } as unknown as Window
  const windowListeners: Record<string, (event: unknown) => void> = {}
  const windowTarget = {
    addEventListener: vi.fn((type: string, listener: (event: unknown) => void) => {
      windowListeners[type] = listener
    }),
    removeEventListener: vi.fn(),
  }
  const environment: ScratchAdapterEnvironment = {
    opener,
    sourceOrigin: 'https://scratch.example',
    windowTarget,
  }
  const onEnvelope = vi.fn()
  startScratchMessageChannelAdapter(environment, {
    onSelected: vi.fn(),
    onStatus: vi.fn(),
    onEnvelope,
    onTransportLost: vi.fn(),
    onError: vi.fn(),
  })

  const port = fakePort()
  windowListeners.message({
    source: opener,
    origin: 'https://scratch.example',
    data: { type: 'mcremote.wirescope.attach', protocol_version: 1 },
    ports: [port],
  })

  return { port, onEnvelope }
}

describe('scratch-adapter OBSERVER_SNAPSHOT history_window', () => {
  test('forwards a valid history_window.dropped_frames from the source unchanged', () => {
    const { port, onEnvelope } = attachedAdapter()
    port.listeners.message({
      data: {
        type: 'mcremote.wirescope.snapshot',
        protocol_version: 1,
        snapshot: { schema: 'mcremote.observer' },
        history_window: { dropped_frames: 7 },
      },
    })
    expect(onEnvelope).toHaveBeenCalledWith(expect.objectContaining({ history_window: { dropped_frames: 7 } }))
  })

  test('falls back to 0 when the source has no history_window (older Scratch build)', () => {
    const { port, onEnvelope } = attachedAdapter()
    port.listeners.message({
      data: {
        type: 'mcremote.wirescope.snapshot',
        protocol_version: 1,
        snapshot: { schema: 'mcremote.observer' },
      },
    })
    expect(onEnvelope).toHaveBeenCalledWith(expect.objectContaining({ history_window: { dropped_frames: 0 } }))
  })

  test('falls back to 0 for a malformed history_window rather than forwarding it', () => {
    const { port, onEnvelope } = attachedAdapter()
    port.listeners.message({
      data: {
        type: 'mcremote.wirescope.snapshot',
        protocol_version: 1,
        snapshot: { schema: 'mcremote.observer' },
        history_window: { dropped_frames: -3 },
      },
    })
    expect(onEnvelope).toHaveBeenCalledWith(expect.objectContaining({ history_window: { dropped_frames: 0 } }))
  })
})
