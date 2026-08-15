import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  SCRATCH_SELECTION_WINDOW_MS,
  sourceOriginFromReferrer,
  startObserverClient,
  type ObserverStationAdapter,
} from '../src/client'

const fixturePath = fileURLToPath(new URL('./fixtures/scratch-main-lifecycle.json', import.meta.url))

describe('WireScope observer client', () => {
  afterEach(() => vi.useRealTimers())

  test('derives only a distinct absolute source origin from referrer', () => {
    expect(sourceOriginFromReferrer('https://scratch.example/projects/1', 'https://live.example')).toBe(
      'https://scratch.example',
    )
    expect(sourceOriginFromReferrer('https://live.example/editor', 'https://live.example')).toBeNull()
    expect(sourceOriginFromReferrer('', 'https://live.example')).toBeNull()
    expect(sourceOriginFromReferrer('not a url', 'https://live.example')).toBeNull()
  })

  test('announces readiness only to the exact referrer origin', () => {
    const postMessage = vi.fn()
    const opener = { postMessage } as unknown as Window
    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()
    const onStatus = vi.fn()
    const cleanup = startObserverClient(
      {
        currentOrigin: 'https://live.example',
        opener,
        referrer: 'https://scratch.example/editor',
        windowTarget: { addEventListener, removeEventListener },
      },
      {
        onStatus,
        onSnapshot: vi.fn(),
        onEnd: vi.fn(),
        onError: vi.fn(),
      },
    )

    expect(postMessage).toHaveBeenCalledWith(
      { type: 'mcremote.wirescope.ready', protocol_version: 1 },
      'https://scratch.example',
    )
    expect(addEventListener).toHaveBeenCalledWith('message', expect.any(Function))
    cleanup()
    expect(removeEventListener).toHaveBeenCalledWith('message', expect.any(Function))
  })

  test('does not announce readiness for direct navigation', () => {
    const postMessage = vi.fn()
    const opener = { postMessage } as unknown as Window
    const onStatus = vi.fn()
    startObserverClient(
      {
        currentOrigin: 'https://live.example',
        opener,
        referrer: '',
        windowTarget: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
      },
      {
        onStatus,
        onSnapshot: vi.fn(),
        onEnd: vi.fn(),
        onError: vi.fn(),
      },
    )

    expect(postMessage).not.toHaveBeenCalled()
    expect(onStatus).toHaveBeenCalledWith('direct-navigation')
  })

  test('redeems an attached one-time grant and accepts a valid snapshot', async () => {
    let windowMessage: ((event: MessageEvent) => void) | null = null
    const opener = { postMessage: vi.fn() } as unknown as Window
    const onSnapshot = vi.fn()
    const onError = vi.fn()
    const channel = new MessageChannel()
    const sourceMessages: unknown[] = []
    channel.port1.addEventListener('message', (event) => sourceMessages.push(event.data))
    channel.port1.start()
    const cleanup = startObserverClient(
      {
        currentOrigin: 'https://live.example',
        opener,
        referrer: 'https://scratch.example/editor',
        windowTarget: {
          addEventListener: (_type, listener) => {
            windowMessage = listener as (event: MessageEvent) => void
          },
          removeEventListener: vi.fn(),
        },
        now: () => 5_000,
      },
      {
        onStatus: vi.fn(),
        onSnapshot,
        onEnd: vi.fn(),
        onError,
      },
    )

    expect(windowMessage).not.toBeNull()
    const attachEvent = {
      source: opener,
      origin: 'https://scratch.example',
      data: { type: 'mcremote.wirescope.attach', protocol_version: 1 },
      ports: [channel.port2],
    } as MessageEvent
    windowMessage?.(attachEvent)
    channel.port1.postMessage({
      type: 'mcremote.wirescope.grant',
      protocol_version: 1,
      grant: 'a'.repeat(48),
      expires_at: 20_000,
    })
    await vi.waitFor(() => {
      expect(sourceMessages).toContainEqual({
        type: 'mcremote.wirescope.redeem',
        protocol_version: 1,
        grant: 'a'.repeat(48),
      })
    })

    const snapshots = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown[]
    channel.port1.postMessage({
      type: 'mcremote.wirescope.snapshot',
      protocol_version: 1,
      snapshot: snapshots[0],
    })
    await vi.waitFor(() => expect(onSnapshot).toHaveBeenCalledWith(snapshots[0], { dropped_frames: 0 }))
    expect(onError).not.toHaveBeenCalled()

    cleanup()
    channel.port1.close()
  })

  test('falls back to the station adapter only after the Scratch selection window', () => {
    vi.useFakeTimers()
    let windowMessage: ((event: MessageEvent) => void) | null = null
    const opener = { postMessage: vi.fn() } as unknown as Window
    const removeEventListener = vi.fn()
    const stationCleanup = vi.fn()
    const stationAdapter: ObserverStationAdapter = { start: vi.fn(() => stationCleanup) }
    const cleanup = startObserverClient(
      {
        currentOrigin: 'https://live.example',
        opener,
        referrer: 'https://scratch.example/editor',
        windowTarget: {
          addEventListener: (_type, listener) => {
            windowMessage = listener as (event: MessageEvent) => void
          },
          removeEventListener,
        },
        stationAdapter,
      },
      {
        onStatus: vi.fn(),
        onSnapshot: vi.fn(),
        onEnd: vi.fn(),
        onError: vi.fn(),
      },
    )

    expect(windowMessage).not.toBeNull()
    expect(stationAdapter.start).not.toHaveBeenCalled()
    windowMessage?.({
      source: {} as Window,
      origin: 'https://scratch.example',
      data: { type: 'mcremote.wirescope.attach', protocol_version: 1 },
      ports: [],
    } as MessageEvent)
    windowMessage?.({
      source: opener,
      origin: 'https://scratch.example',
      data: { type: 'mcremote.wirescope.attach', protocol_version: 2 },
      ports: [],
    } as MessageEvent)
    vi.advanceTimersByTime(SCRATCH_SELECTION_WINDOW_MS - 1)
    expect(stationAdapter.start).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(removeEventListener).toHaveBeenCalledWith('message', expect.any(Function))
    expect(stationAdapter.start).toHaveBeenCalledTimes(1)

    cleanup()
    expect(stationCleanup).toHaveBeenCalledTimes(1)
  })

  test('does not fall back after accepting an exact Scratch attach', () => {
    vi.useFakeTimers()
    let windowMessage: ((event: MessageEvent) => void) | null = null
    const opener = { postMessage: vi.fn() } as unknown as Window
    const stationAdapter: ObserverStationAdapter = { start: vi.fn(() => vi.fn()) }
    const channel = new MessageChannel()
    const cleanup = startObserverClient(
      {
        currentOrigin: 'https://live.example',
        opener,
        referrer: 'https://scratch.example/editor',
        windowTarget: {
          addEventListener: (_type, listener) => {
            windowMessage = listener as (event: MessageEvent) => void
          },
          removeEventListener: vi.fn(),
        },
        stationAdapter,
      },
      {
        onStatus: vi.fn(),
        onSnapshot: vi.fn(),
        onEnd: vi.fn(),
        onError: vi.fn(),
      },
    )

    windowMessage?.({
      source: opener,
      origin: 'https://scratch.example',
      data: { type: 'mcremote.wirescope.attach', protocol_version: 1 },
      ports: [channel.port2],
    } as MessageEvent)
    vi.advanceTimersByTime(SCRATCH_SELECTION_WINDOW_MS)

    expect(stationAdapter.start).not.toHaveBeenCalled()
    cleanup()
    channel.port1.close()
  })
})
