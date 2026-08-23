import { describe, it, expect, vi, beforeEach } from 'vitest'

// Onboarding imports the whole app world (Supabase, the map, the uploader).
// `draftProblems` is a pure function and the only thing under test, so the
// modules with side effects at import time are stubbed away.
vi.mock('../lib/supabase', () => ({ supabase: {} }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({}) }))
vi.mock('../lib/geocode', () => ({ geocodeCity: async () => null }))
vi.mock('../lib/upload', () => ({ uploadFile: async () => '' }))

import { draftProblems, STEPS, loadDraft, saveDraft, clearDraft } from './Onboarding'

const FULL = {
  name: 'Alex Test',
  photo_url: 'https://example.test/a.jpg',
  dob: '1997-04-18',
  city: 'Bristol',
  country: 'United Kingdom',
  country_code: 'GB',
  bio: 'Bristol based creator',
  about: 'A few lines about me.',
  instagram_url: 'https://instagram.com/alextest',
  tiktok_url: '',
  youtube_url: '',
  languages: ['English'],
  countries_visited: ['France'],
}
const PHONE = { phone: '7700 900123', phone_country: '+44' }

describe('onboarding steps', () => {
  it('is nine screens across four parts, two of them optional', () => {
    expect(STEPS).toHaveLength(9)
    expect(new Set(STEPS.map((s) => s.part)).size).toBe(4)
    // Welcome, the extras screen and the review are the ones that never block.
    expect(STEPS.filter((s) => !s.need).map((s) => s.key)).toEqual(['welcome', 'extras', 'review'])
    // Only ONE screen has fields on it of which none are required.
    expect(STEPS.filter((s) => s.skippable).map((s) => s.key)).toEqual(['extras'])
  })

  it('every step key is unique, or the jump buttons collide', () => {
    expect(new Set(STEPS.map((s) => s.key)).size).toBe(STEPS.length)
  })
})

// A HALF-FINISHED APPLICATION SURVIVES A REFRESH.
//
// Nine screens is a lot to lose to a stray back-swipe or a browser reloading a
// backgrounded tab, and both happen: this form is filled in on a phone by
// somebody who heard about the programme ten minutes ago.
describe('the saved draft', () => {
  beforeEach(() => { clearDraft('u1') })

  it('comes back exactly as it went in', () => {
    saveDraft('u1', { name: 'Alex', languages: ['English'] }, 3)
    expect(loadDraft('u1')).toEqual({ draft: { name: 'Alex', languages: ['English'] }, step: 3, at: expect.any(Number) })
  })

  it('is per account, so a shared laptop does not leak one draft into another', () => {
    saveDraft('u1', { name: 'Alex' }, 2)
    expect(loadDraft('u2')).toBeNull()
  })

  it('is gone once the application has been sent', () => {
    saveDraft('u1', { name: 'Alex' }, 2)
    clearDraft('u1')
    expect(loadDraft('u1')).toBeNull()
  })

  // A draft written by an older version of this form, or one somebody has
  // hand-edited, must never take the sign-up down with it.
  it('shrugs off rubbish rather than throwing', () => {
    localStorage.setItem('tryp_onboarding_draft_u1', 'not json at all')
    expect(loadDraft('u1')).toBeNull()
    localStorage.setItem('tryp_onboarding_draft_u1', '"a string"')
    expect(loadDraft('u1')).toBeNull()
  })
})

describe('draftProblems', () => {
  it('is empty for a complete application', () => {
    expect(draftProblems(FULL, PHONE)).toEqual([])
  })

  it('names each missing field and says which screen it lives on', () => {
    const problems = draftProblems({ ...FULL, bio: '' }, PHONE)
    expect(problems).toHaveLength(1)
    expect(problems[0].step).toBe('story')
    // The whole point of the rewrite: it says WHAT, not "fill in all boxes".
    expect(problems[0].text).toMatch(/bio/i)
  })

  it('accepts any one social account, and requires at least one', () => {
    const none = { ...FULL, instagram_url: '', tiktok_url: '', youtube_url: '' }
    expect(draftProblems(none, PHONE).some((p) => p.step === 'socials')).toBe(true)
    for (const key of ['instagram_url', 'tiktok_url', 'youtube_url']) {
      expect(draftProblems({ ...none, [key]: 'https://x.test/a' }, PHONE)).toEqual([])
    }
  })

  it('needs the dialling code as well as the number', () => {
    expect(draftProblems(FULL, { phone: '7700 900123', phone_country: '' })).toHaveLength(1)
    expect(draftProblems(FULL, { phone: '', phone_country: '+44' })).toHaveLength(1)
  })

  it('treats whitespace as empty', () => {
    expect(draftProblems({ ...FULL, about: '   ' }, PHONE)).toHaveLength(1)
    expect(draftProblems({ ...FULL, city: '  ' }, PHONE)).toHaveLength(1)
  })

  it('does NOT require the four optional things', () => {
    const bare = {
      ...FULL, favourite_quote: '', other_links: [], bucket_list: [],
    }
    expect(draftProblems(bare, PHONE)).toEqual([])
  })

  it('requires the country CODE, not just the typed name', () => {
    // A name with no code is exactly the state that used to leave a creator
    // unroutable to any market.
    const noCode = { ...FULL, country: 'England', country_code: '' }
    expect(draftProblems(noCode, PHONE).some((p) => p.step === 'based')).toBe(true)
  })

  it('lists everything wrong at once, so the review screen can show them all', () => {
    const empty = {
      name: '', photo_url: '', dob: null, city: '', country: '', country_code: '',
      bio: '', about: '', instagram_url: '', tiktok_url: '', youtube_url: '',
      languages: [], countries_visited: [],
    }
    const problems = draftProblems(empty, { phone: '', phone_country: '' })
    // name, photo, country, town, birthday, phone, one social, bio, about,
    // languages, one country on the map.
    expect(problems).toHaveLength(11)
    // And every one of them points at a screen that actually exists.
    const keys = new Set(STEPS.map((s) => s.key))
    for (const p of problems) expect(keys.has(p.step)).toBe(true)
  })
})
