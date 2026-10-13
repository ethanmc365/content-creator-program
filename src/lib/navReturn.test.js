// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { installNavReturn, isReturnVisit, markReturn } from './navReturn'

// Swiping back to a page already seen must not replay its entrance (13 Oct 2026).
describe('going back is not arriving', () => {
  afterEach(() => { vi.useRealTimers() })

  it('a popstate opens the window and flags the document', () => {
    installNavReturn()
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(isReturnVisit()).toBe(true)
    expect(document.documentElement.hasAttribute('data-nav-return')).toBe(true)
  })

  it('the next tap closes it, so a tab switch still animates', () => {
    installNavReturn()
    markReturn()
    window.dispatchEvent(new Event('pointerdown'))
    expect(isReturnVisit()).toBe(false)
    expect(document.documentElement.hasAttribute('data-nav-return')).toBe(false)
  })

  it('closes by itself', () => {
    vi.useFakeTimers()
    markReturn()
    vi.advanceTimersByTime(2600)
    expect(isReturnVisit()).toBe(false)
    expect(document.documentElement.hasAttribute('data-nav-return')).toBe(false)
  })
})
