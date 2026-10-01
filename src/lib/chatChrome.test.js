import { describe, it, expect, vi, afterEach } from 'vitest'
import { setChatChromeHidden, noteReaderGesture, readerMovedChrome } from './chatChrome'

// The translate shake: a scroll the APP made (a pin after a translation grew the
// thread) must never move the header, or header -> box size -> pin -> scroll
// -> header loops for ever.
describe('chat header follows the reader only', () => {
  afterEach(() => { vi.useRealTimers(); setChatChromeHidden(false) })

  it('ignores a scroll with no touch, wheel or key behind it', () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    expect(readerMovedChrome()).toBe(false)
  })

  it('follows a scroll the reader made', () => {
    vi.useFakeTimers()
    vi.setSystemTime(20_000)
    noteReaderGesture()
    expect(readerMovedChrome()).toBe(true)
  })

  it('cannot flip twice faster than a person could', () => {
    vi.useFakeTimers()
    vi.setSystemTime(30_000)
    noteReaderGesture()
    setChatChromeHidden(true)
    expect(readerMovedChrome()).toBe(false)
    vi.setSystemTime(30_400)
    expect(readerMovedChrome()).toBe(true)
  })

  it('the gesture window closes on its own', () => {
    vi.useFakeTimers()
    vi.setSystemTime(40_000)
    noteReaderGesture()
    vi.setSystemTime(41_500)
    expect(readerMovedChrome()).toBe(false)
  })
})
