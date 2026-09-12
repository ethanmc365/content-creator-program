import { describe, expect, it, beforeEach } from 'vitest'
import { CONTEXT_MARK, describeReason, installGlobalHandlers, resetReportedForTests } from './monitoring'
import { explain, GUIDE_ENTRIES } from './errorGuide'
import { splitDetail } from '../components/admin/ErrorWatch'

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

// THE REPORTER WAS OVERWRITING THE EVIDENCE, AND ONE OF THE TWO ERRORS SITTING
// ON THE PANEL ON 12 SEP 2026 WAS THE PROOF.
//
// It read: message "Pa", detail two frames both inside `monitoring-*.js`. Not
// one fact in it was about the thing that failed, because `new Error(msg)` was
// being constructed in this file - so the stack it carried was the reporter's
// own. Ethan: "the information provided doesn't really help me." It could not:
// the only shape a rejection had to be to survive intact was `instanceof
// Error`, and in a bundled app most of them are not.
//
// `describeReason` is tested as the pure function it is rather than through the
// listeners. The handlers are module-global and deliberately deduplicate a
// repeated fault per page load, so a second `describe` that installs them again
// gets its reports swallowed by the first block's copy - which is a property of
// the brake working, not a bug, and not a thing to design a test around.
describe('what a rejection keeps', () => {
  it('keeps a real Error untouched', () => {
    const e = new Error('the real one')
    expect(describeReason(e).message).toBe('the real one')
    expect(describeReason(e).name).toBe('Error')
  })

  it('keeps the type and the stack of a non-Error that had one', () => {
    const d = describeReason({ name: 'PostgrestError', message: 'permission denied', stack: 'at theCaller (app.js:9:9)' })
    expect(d.name).toBe('PostgrestError')
    expect(d.stack).toContain('theCaller')
    expect(d.stack).not.toContain('monitoring')
  })

  it("carries a supabase error's code and hint, which is the actionable half", () => {
    const d = describeReason({ message: 'permission denied for table rewards', code: '42501', hint: 'check the policy' })
    expect(d.extra).toMatchObject({ code: '42501', hint: 'check the policy' })
  })

  // "Pa" on its own is a minified identifier and says nothing at all. The type
  // in front of it at least says WHAT KIND of object arrived, which is the
  // first thing worth knowing about it.
  it('names the type when the message is a bare minified token', () => {
    expect(describeReason({ name: 'DOMException', message: 'Pa' }).message).toBe('DOMException: Pa')
  })

  it('says so plainly when a minified token arrives with no type at all', () => {
    expect(describeReason({ message: 'Pa' }).message).toBe('Non-Error thrown: Pa')
  })

  it('falls back to details or hint when there is no message at all', () => {
    expect(describeReason({ details: 'the row was not there' }).message).toBe('the row was not there')
  })

  it('survives null, a string and an object with nothing on it', () => {
    expect(describeReason(null).message).toBe('Unhandled promise rejection')
    expect(describeReason('a bare string').message).toBe('a bare string')
    expect(describeReason({}).message).toBe('Unhandled promise rejection')
  })
})

// The panel and the reporter agree on one text column carrying two things.
describe('the detail field', () => {
  it('round-trips the stack and the context through the marker', () => {
    const ctx = { viewport: '375x812', trail: ['opened: /global', 'pressed: button "Play"'] }
    const stored = `Error: x\n  at y${CONTEXT_MARK}${JSON.stringify(ctx)}`
    expect(splitDetail(stored)).toEqual({ frames: 'Error: x\n  at y', ctx })
  })

  // Every row written before 12 Sep 2026 is all stack and no marker, and losing
  // those frames would be trading a real fault for a cosmetic one.
  it('treats a row written before the marker existed as all stack', () => {
    expect(splitDetail('at a\nat b')).toEqual({ frames: 'at a\nat b', ctx: null })
  })

  it('keeps the frames when the context blob was truncated mid-JSON', () => {
    const { frames, ctx } = splitDetail(`at a${CONTEXT_MARK}{"viewport":"375x8`)
    expect(frames).toBe('at a')
    expect(ctx).toBeNull()
  })
})

// A wrong explanation on a monitoring panel sends somebody looking in the wrong
// place, so the table has to answer "I do not know" rather than guess.
describe('the error guide', () => {
  it('explains the WebKit insertBefore crash, which is one of the two live rows', () => {
    const g = explain({ message: 'The object can not be found here.' })
    expect(g.means).toMatch(/DOM node/i)
    expect(g.cause).toMatch(/translation|extension/i)
  })

  it('explains a stale tab asking for a chunk that a deploy replaced', () => {
    expect(explain({ message: 'Failed to fetch dynamically imported module: /assets/x.js' })).toBeTruthy()
  })

  it('says nothing at all about a fault it does not recognise', () => {
    expect(explain({ message: 'something nobody has written an entry for yet' })).toBeNull()
  })

  it('matches on the stored detail too, not only the message', () => {
    expect(explain({ message: '', detail: 'QuotaExceededError: exceeded the quota' })).toBeTruthy()
  })

  it('gives every entry all four fields', () => {
    for (const g of GUIDE_ENTRIES) {
      expect(g.match).toBeInstanceOf(RegExp)
      for (const k of ['severity', 'means', 'cause', 'todo']) expect(typeof g[k]).toBe('string')
    }
  })
})
