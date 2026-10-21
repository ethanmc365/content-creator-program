import { describe, it, expect, vi, afterEach } from 'vitest'
import { onResume, laterOf, _setAwaySince } from './resume'

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
    _setAwaySince(null)
    const cb = vi.fn()
    const off = onResume(cb)
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('online'))
    vi.advanceTimersByTime(500)
    expect(cb).toHaveBeenCalledTimes(1)
    off()
  })

  it('ignores a focus after only a few seconds away (photo picker, share sheet)', () => {
    vi.useFakeTimers()
    const cb = vi.fn()
    const off = onResume(cb)
    _setAwaySince(Date.now() - 3000)
    window.dispatchEvent(new Event('focus'))
    vi.advanceTimersByTime(500)
    expect(cb).not.toHaveBeenCalled()
    off()
  })

  it('refreshes after being away long enough, and always when back online', () => {
    vi.useFakeTimers()
    const cb = vi.fn()
    const off = onResume(cb)
    _setAwaySince(Date.now() - 60000)
    window.dispatchEvent(new Event('focus'))
    vi.advanceTimersByTime(500)
    expect(cb).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(5000)
    _setAwaySince(Date.now() - 1000)
    window.dispatchEvent(new Event('online'))
    vi.advanceTimersByTime(500)
    expect(cb).toHaveBeenCalledTimes(2)
    off()
  })

  it('a focus and a visibilitychange from one short trip away both stay quiet', () => {
    vi.useFakeTimers()
    const cb = vi.fn()
    const off = onResume(cb)
    _setAwaySince(Date.now() - 2000)
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(300)
    window.dispatchEvent(new Event('focus'))
    vi.advanceTimersByTime(2000)
    window.dispatchEvent(new Event('focus'))
    vi.advanceTimersByTime(500)
    expect(cb).not.toHaveBeenCalled()
    off()
  })

  it('stops listening when released', () => {
    vi.useFakeTimers()
    _setAwaySince(null)
    const cb = vi.fn()
    onResume(cb)()
    window.dispatchEvent(new Event('focus'))
    vi.advanceTimersByTime(500)
    expect(cb).not.toHaveBeenCalled()
  })
})
