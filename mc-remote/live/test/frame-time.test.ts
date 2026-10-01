import { describe, expect, test, vi } from 'vitest'
import { formatFrameTime } from '../src/frame-time'

describe('WireScope frame time', () => {
  test('shows a compact local clock and a complete hover time', () => {
    vi.stubEnv('TZ', 'Asia/Tokyo')
    const time = formatFrameTime(Date.UTC(2026, 9, 1, 3, 4, 5, 67))
    expect(time).toEqual({
      clock: '12:04:05',
      detail: '2026-10-01 12:04:05.067 Asia/Tokyo (UTC+09:00)',
      iso: '2026-10-01T03:04:05.067Z',
    })
    vi.unstubAllEnvs()
  })

  test('keeps an out-of-range observer timestamp from crashing the table', () => {
    expect(formatFrameTime(Number.MAX_VALUE)).toEqual({
      clock: '—',
      detail: String(Number.MAX_VALUE),
      iso: null,
    })
  })
})
