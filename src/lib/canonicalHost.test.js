import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { goCanonical } from './canonicalHost'

// THE REGRESSION THIS FILE EXISTS FOR (3 Sep 2026).
//
// Consolidating the two origins with a server-side 308 put every installed app
// back into Safari: a home-screen app is scoped to the origin it was added
// from, and a redirect to a different origin is a navigation out of scope, so
// the OS hands the page to the browser. Ethan photographed the result - address
// bar on top, share sheet at the bottom.
//
// So the one rule these tests exist to hold is: AN INSTALLED APP IS NEVER MOVED
// BETWEEN ORIGINS. A test that only checked "the alias redirects" would have
// passed before the fix and after it.

const ALIAS = 'content-creator-program.vercel.app'
const CANON = 'trypcreators.vercel.app'

function setLocation({ hostname, pathname = '/', search = '', hash = '' }) {
  const replace = vi.fn()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { hostname, pathname, search, hash, replace },
  })
  return replace
}

function setDisplayMode(mode) {
  window.matchMedia = vi.fn((q) => ({
    matches: mode ? q.includes(mode) : false,
    media: q, addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {},
  }))
}

describe('goCanonical', () => {
  beforeEach(() => {
    setDisplayMode(null)
    Object.defineProperty(window.navigator, 'standalone', { configurable: true, value: undefined })
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('moves a BROWSER off the alias host, keeping the whole path', () => {
    const replace = setLocation({ hostname: ALIAS, pathname: '/challenges', search: '?tab=leaderboard', hash: '#top' })
    expect(goCanonical()).toBe(true)
    expect(replace).toHaveBeenCalledWith(`https://${CANON}/challenges?tab=leaderboard#top`)
  })

  it('moves a browser off the bare root too', () => {
    const replace = setLocation({ hostname: ALIAS })
    expect(goCanonical()).toBe(true)
    expect(replace).toHaveBeenCalledWith(`https://${CANON}/`)
  })

  it('LEAVES AN INSTALLED APP ALONE, even on the alias host', () => {
    // This is the bug. Every other assertion in this file could pass while the
    // product was broken for everybody who had added it to a home screen.
    for (const mode of ['standalone', 'fullscreen', 'minimal-ui']) {
      setDisplayMode(mode)
      const replace = setLocation({ hostname: ALIAS, pathname: '/home' })
      expect(goCanonical(), `display-mode: ${mode} was redirected`).toBe(false)
      expect(replace).not.toHaveBeenCalled()
    }
  })

  it('leaves an iOS home-screen app alone, which reports it a different way', () => {
    // iOS Safari answers `navigator.standalone` and nothing else - no
    // display-mode match at all - so a check that only asked matchMedia would
    // redirect exactly the platform Ethan was holding.
    setDisplayMode(null)
    Object.defineProperty(window.navigator, 'standalone', { configurable: true, value: true })
    const replace = setLocation({ hostname: ALIAS, pathname: '/home' })
    expect(goCanonical()).toBe(false)
    expect(replace).not.toHaveBeenCalled()
  })

  it('does nothing on the canonical host, in a browser or installed', () => {
    let replace = setLocation({ hostname: CANON, pathname: '/rooms' })
    expect(goCanonical()).toBe(false)
    expect(replace).not.toHaveBeenCalled()

    setDisplayMode('standalone')
    replace = setLocation({ hostname: CANON, pathname: '/rooms' })
    expect(goCanonical()).toBe(false)
    expect(replace).not.toHaveBeenCalled()
  })

  it('does nothing on localhost, or anywhere it does not recognise', () => {
    for (const host of ['localhost', 'content-creator-program-abc123-contentcreatorprogram.vercel.app']) {
      const replace = setLocation({ hostname: host, pathname: '/' })
      expect(goCanonical(), `${host} was redirected`).toBe(false)
      expect(replace).not.toHaveBeenCalled()
    }
  })

  it('survives a webview whose matchMedia throws', () => {
    window.matchMedia = vi.fn(() => { throw new Error('not implemented') })
    const replace = setLocation({ hostname: ALIAS, pathname: '/' })
    // It cannot prove this is an installed app, so it treats it as a browser -
    // but it must not crash the very first line of the app to find that out.
    expect(() => goCanonical()).not.toThrow()
    expect(replace).toHaveBeenCalled()
  })
})
