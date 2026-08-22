import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./supabase', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) } }))
vi.mock('./appFlags', () => ({ readFlag: async () => false }))

import { shouldAutoStart, stepsFor, partOf, TOUR_STEPS, TOUR_PARTS, markSeenLocally, clearSeenLocally } from './tour'

const member = {
  is_admin: false, is_test: false, status: 'active', onboarded: true, tour_completed_at: null,
}

describe('who gets walked round', () => {
  beforeEach(() => { clearSeenLocally() })

  it('a brand new creator, once the switch is on', () => {
    expect(shouldAutoStart({ profile: member, enabled: true, layout: 'desktop' })).toBe(true)
  })

  // THE ONE THAT MATTERS. Every creator already on the platform was backfilled
  // with a tour_completed_at by migration 107, and the switch is off besides.
  it('NOBODY at all while the switch is off', () => {
    expect(shouldAutoStart({ profile: member, enabled: false, layout: 'desktop' })).toBe(false)
  })

  it('nobody who has already been walked round', () => {
    const done = { ...member, tour_completed_at: '2026-08-22T00:00:00Z' }
    expect(shouldAutoStart({ profile: done, enabled: true, layout: 'desktop' })).toBe(false)
  })

  it('not an admin, who is the one demonstrating it', () => {
    expect(shouldAutoStart({ profile: { ...member, is_admin: true }, enabled: true, layout: 'desktop' })).toBe(false)
  })

  it('not a test account', () => {
    expect(shouldAutoStart({ profile: { ...member, is_test: true }, enabled: true, layout: 'desktop' })).toBe(false)
  })

  it('not somebody still waiting on approval, or refused', () => {
    for (const status of ['pending', 'declined', 'suspended', 'muted']) {
      expect(shouldAutoStart({ profile: { ...member, status }, enabled: true, layout: 'desktop' })).toBe(false)
    }
  })

  it('not somebody mid-onboarding', () => {
    expect(shouldAutoStart({ profile: { ...member, onboarded: false }, enabled: true, layout: 'desktop' })).toBe(false)
  })

  it('not twice on the same layout', () => {
    markSeenLocally('desktop')
    expect(shouldAutoStart({ profile: member, enabled: true, layout: 'desktop' })).toBe(false)
    // But the phone walk points at different chrome, so it has not been seen.
    expect(shouldAutoStart({ profile: member, enabled: true, layout: 'mobile' })).toBe(true)
  })

  it('never without a profile', () => {
    expect(shouldAutoStart({ profile: null, enabled: true, layout: 'desktop' })).toBe(false)
  })
})

describe('the steps', () => {
  it('every step has somewhere to go and something to say', () => {
    for (const s of TOUR_STEPS) {
      expect(s.key).toBeTruthy()
      expect(s.route).toBeTruthy()
      expect(s.title.length).toBeGreaterThan(4)
      expect(s.body.length).toBeGreaterThan(20)
    }
  })

  it('has unique keys, or the progress bar double-counts', () => {
    expect(new Set(TOUR_STEPS.map((s) => s.key)).size).toBe(TOUR_STEPS.length)
  })

  it('every step belongs to a real part', () => {
    const parts = new Set(TOUR_PARTS.map((p) => p.key))
    for (const s of TOUR_STEPS) expect(parts.has(s.part)).toBe(true)
  })

  it('the parts run in order, never back and forth', () => {
    // A walk that goes people, work, people reads as a shuffled list. The
    // order of TOUR_STEPS has to agree with the order of TOUR_PARTS.
    const seen = TOUR_STEPS.map((s) => partOf(s).index)
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1])
  })

  // THE ONE HARD GATE. Everything on the walk is a place you can skip past
  // except the last thing, which is turning notifications on - because a brief
  // somebody did not hear about is a brief they did not enter.
  it('exactly one step is required, and it is notifications', () => {
    const required = TOUR_STEPS.filter((s) => s.required)
    expect(required).toHaveLength(1)
    expect(required[0].key).toBe('notifications')
    expect(required[0].action).toBe('push')
  })

  it('every OTHER action step can be passed over', () => {
    for (const s of TOUR_STEPS.filter((x) => x.action && !x.required)) {
      expect(s.required).toBeFalsy()
    }
  })

  it('the required step is the last thing before the sign-off', () => {
    // It has to be last, or somebody who refuses is stuck in the middle of the
    // walk with the rest of it unreachable.
    const i = TOUR_STEPS.findIndex((s) => s.required)
    expect(i).toBe(TOUR_STEPS.length - 2)
  })

  it('drops the network steps when the network shell is off', () => {
    const legacy = stepsFor({ network: false })
    const network = stepsFor({ network: true })
    expect(legacy.length).toBeLessThan(network.length)
    // Nothing pointing at a page that does not exist yet.
    for (const s of legacy) expect(s.on).toBe('both')
    // And the walk still ends properly on the legacy shell.
    expect(legacy[legacy.length - 1].key).toBe('done')
    expect(legacy.some((s) => s.required)).toBe(true)
  })

  it('starts and ends on a card that points at nothing', () => {
    for (const network of [true, false]) {
      const steps = stepsFor({ network })
      expect(steps[0].anchor).toBeNull()
      expect(steps[steps.length - 1].anchor).toBeNull()
    }
  })

  it('every anchored step that could be absent says so', () => {
    // A spotlight on an element that is not there lands at the viewport
    // origin. Anything that depends on there being content must opt in to
    // being skipped instead.
    // Chrome that is always painted for the shell the step belongs to.
    // `nav-worldwide` is on this list rather than marked skippable because the
    // step that uses it only runs when the network shell is on, and the tab is
    // unconditional in that tab set.
    const CHROME = [
      'nav-home', 'nav-challenges', 'nav-chat', 'nav-messages',
      'nav-worldwide', 'avatar-menu', 'enable-push',
    ]
    for (const s of TOUR_STEPS.filter((x) => x.anchor && !CHROME.includes(x.anchor))) {
      expect(s.skipIfMissing).toBe(true)
    }
  })
})
