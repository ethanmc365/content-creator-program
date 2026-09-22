import { describe, it, expect, vi, afterEach } from 'vitest'
import { onResume, laterOf } from './resume'

describe('laterOf', () => {
  it('keeps the later watermark whichever side it is on', () => {
    expect(laterOf('2026-09-22T10:00:00Z', '2026-09-22T09:00:00Z')).toBe('2026-09-22T10:00:00.000Z')
    expect(laterOf('2026-09-22T09:00:00Z', '2026-09-22T10:00:00Z')).toBe('2026-09-22T10:00:00.000Z')
  })
  it('treats a missing side as nothing', () => {
    expect(laterOf(null, '2026-09-22T10:00:00Z')).toBe('2026-09-22T10:00:00.000Z')
    expect(laterOf('2026-09-22T10:00:00Z', undefined)).toBe('2026-09-22T10:00:00.000Z')
    expect(laterOf(null, null)).toBeNull()
  })
})

describe('onResume', () => {
  afterEach(() => vi.useRealTimers())

  it('fires once for a burst of focus + visible + online', () => {
    vi.useFakeTimers()
    const cb = vi.fn()
    const off = onResume(cb)
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('online'))
    vi.advanceTimersByTime(500)
    expect(cb).toHaveBeenCalledTimes(1)
    off()
  })

  it('stops listening when released', () => {
    vi.useFakeTimers()
    const cb = vi.fn()
    onResume(cb)()
    window.dispatchEvent(new Event('focus'))
    vi.advanceTimersByTime(500)
    expect(cb).not.toHaveBeenCalled()
  })
})
