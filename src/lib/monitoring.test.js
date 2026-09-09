import { describe, expect, it, beforeEach } from 'vitest'
import { installGlobalHandlers, resetReportedForTests } from './monitoring'

// THE HALF OF CRASH REPORTING THAT HAD NO TEST, AND WAS THEREFORE MISSING.
//
// `captureError` had exactly one caller - the React error boundary - so every
// fault outside a render was invisible to the admin panel, and `client_errors`
// held zero rows on 9 Sep 2026 while the platform was demonstrably not perfect.
// Nothing went red, because nothing was asserting that a thrown error anywhere
// else reaches the reporter at all.
describe('global crash handlers', () => {
  let reported
  const report = (...args) => reported.push(args)

  beforeEach(() => {
    reported = []
    resetReportedForTests()
    installGlobalHandlers({ report })
  })

  const throwIt = (error, extra = {}) =>
    window.dispatchEvent(Object.assign(new Event('error'), { error, message: error?.message, ...extra }))
  const rejectIt = (reason) =>
    window.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason }))

  it('reports an error thrown outside React render', () => {
    throwIt(new Error('handler blew up'))
    expect(reported).toHaveLength(1)
    expect(reported[0][0].message).toBe('handler blew up')
  })

  it('reports an unhandled promise rejection', () => {
    rejectIt(new Error('await went nowhere'))
    expect(reported.map(([e]) => e.message)).toEqual(['await went nowhere'])
  })

  it('survives a rejection thrown with something that is not an Error', () => {
    rejectIt('a bare string')
    expect(reported[0][0]).toBeInstanceOf(Error)
    expect(reported[0][0].message).toBe('a bare string')
  })

  // A throw inside a rAF loop re-arms and throws again sixty times a second.
  // Without this the panel would receive sixty RPCs a second from a phone that
  // is already in trouble.
  it('reports one repeating fault once per page load', () => {
    for (let i = 0; i < 60; i += 1) throwIt(new Error('same fault every frame'))
    expect(reported).toHaveLength(1)
  })

  it('caps how many distinct faults one page load can report', () => {
    for (let i = 0; i < 40; i += 1) throwIt(new Error(`distinct fault ${i}`))
    expect(reported.length).toBeLessThanOrEqual(8)
  })

  // An <img> or <script> that 404s fires the same event with no `error` on it.
  it('ignores a resource that failed to load', () => {
    window.dispatchEvent(Object.assign(new Event('error'), { error: null, message: 'load failed' }))
    expect(reported).toHaveLength(0)
  })

  it('ignores the known non-bugs Sentry is already told to drop', () => {
    throwIt(new Error('ResizeObserver loop limit exceeded'))
    throwIt(new Error('AbortError: the operation was aborted'))
    rejectIt(new Error('Failed to fetch'))
    expect(reported).toHaveLength(0)
  })
})
