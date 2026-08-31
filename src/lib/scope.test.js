import { describe, it, expect } from 'vitest'
import { inScope } from './scope'

// `inScope` decides whether a challenge, a room or a market page belongs to the
// person looking at it. It is three lines and it emptied the challenges page,
// so it is worth pinning down exactly what each input means.
describe('inScope', () => {
  const uk = 'uk-id'
  const es = 'es-id'

  it('lets an unscoped row through whatever the scopes are', () => {
    // A row with no community_id predates markets, or was written by a code
    // path that forgets the column. Either way it must not vanish.
    expect(inScope(new Set([uk]), null)).toBe(true)
    expect(inScope(new Set(), null)).toBe(true)
    expect(inScope(null, undefined)).toBe(true)
  })

  it('matches on membership', () => {
    expect(inScope(new Set([uk, es]), es)).toBe(true)
    expect(inScope(new Set([uk]), es)).toBe(false)
  })

  // THE DISTINCTION THAT BROKE THE CHALLENGES PAGE ON A PHONE.
  //
  // `null` means "we could not work out which markets you are in" and has to
  // fail open, because the alternative is emptying the page a creator uses to
  // enter the live challenge. An empty Set means "we asked, and you are in no
  // markets", which correctly hides everything.
  //
  // `loadMyScopes` used to return an EMPTY SET when `getUser()` had not
  // resolved a session yet, and cached it - so one lost race on a cold start
  // hid every challenge for the rest of the session. It returns `null` now.
  it('fails open when the scopes could not be determined', () => {
    expect(inScope(null, uk)).toBe(true)
    expect(inScope(undefined, uk)).toBe(true)
  })

  it('hides scoped rows from somebody genuinely in no markets', () => {
    expect(inScope(new Set(), uk)).toBe(false)
  })
})
