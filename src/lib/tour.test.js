import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./supabase', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) } }))
vi.mock('./appFlags', () => ({ readFlag: async () => false }))

import { shouldAutoStart, stepsFor, stepAt, stepGoal, partOf, TOUR_STEPS, TOUR_PARTS, markSeenLocally, clearSeenLocally } from './tour'

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
  it('every step has something to say', () => {
    for (const s of TOUR_STEPS) {
      expect(s.key).toBeTruthy()
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
    const seen = TOUR_STEPS.map((s) => partOf(s).index)
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1])
  })

  // THE POINT OF VERSION 3. There is no Next button, so a step with no goal is
  // a step nobody can ever get past.
  it('EVERY step has a goal', () => {
    const KINDS = ['begin', 'route', 'click', 'push', 'payee', 'end']
    for (const s of TOUR_STEPS) {
      const g = stepGoal(s, true)
      expect(g, `${s.key} has no goal`).toBeTruthy()
      expect(KINDS, `${s.key} goal kind`).toContain(g.kind)
    }
  })

  it('every step that asks for something says what', () => {
    // `begin` and `end` are the two cards with a BUTTON on them rather than an
    // instruction - the button is the instruction - so they are the only steps
    // allowed to carry no `do` line.
    const SELF_EXPLAINING = ['begin', 'end']
    for (const s of TOUR_STEPS) {
      if (SELF_EXPLAINING.includes(s.goal.kind)) {
        expect(s.do, `${s.key} should not have an instruction`).toBeNull()
      } else {
        expect(s.do, `${s.key} has no instruction`).toBeTruthy()
      }
    }
  })

  it('goals carry the argument their kind needs', () => {
    for (const s of TOUR_STEPS) {
      for (const network of [true, false]) {
        const g = stepGoal(s, network)
        if (g.kind === 'route') expect(typeof g.to).toBe('string')
        if (g.kind === 'scroll') expect(g.px).toBeGreaterThan(0)
        if (g.kind === 'click') expect(typeof g.anchor).toBe('string')
        if (g.kind === 'dwell') expect(g.ms).toBeGreaterThan(0)
      }
    }
  })

  it('a click goal points at the thing it spotlights', () => {
    // Otherwise it highlights one control and waits on another.
    for (const s of TOUR_STEPS.filter((x) => stepGoal(x, true).kind === 'click')) {
      expect(stepGoal(s, true).anchor).toBe(s.anchor)
    }
  })

  // THE HUB IS /global ON THE NETWORK SHELL, NOT /home. Getting this wrong
  // walked people round the old home page, which is the bug this pins down.
  //
  // It used to check the `hub` step. The walk was cut from twenty stops to ten
  // (3 Sep 2026) and the separate "this is the hub" step went with the rest of
  // the scroll goals - `welcome` opens on the hub and says so, so it is the one
  // carrying the per-shell path now.
  it('opens on the worldwide hub on the network shell', () => {
    const first = TOUR_STEPS.find((s) => s.key === 'welcome')
    expect(stepAt(first, true)).toBe('/global')
    expect(stepAt(first, false)).toBe('/home')
  })

  // THE WALK IS SHORT, AND NOTHING IN IT ASKS YOU TO SCROLL.
  //
  // Ethan on the twenty-step version: "I am scrolling on that page and nothing
  // is happening", and later "cut back any unnecessary steps, it should be easy
  // for the creators". Scroll goals were both the least reliable to detect and
  // the least instructive - reading a page is not something a walkthrough needs
  // to supervise - so every remaining step is a tap, a connection, or a wait.
  it('is ten stops or fewer and asks nobody to scroll', () => {
    expect(TOUR_STEPS.length).toBeLessThanOrEqual(10)
    expect(TOUR_STEPS.filter((s) => s.goal?.kind === 'scroll')).toHaveLength(0)
  })

  it('exactly one step is required, and it is notifications', () => {
    const required = TOUR_STEPS.filter((s) => s.required)
    expect(required).toHaveLength(1)
    expect(required[0].key).toBe('notifications')
    expect(stepGoal(required[0], true).kind).toBe('push')
  })

  it('the required step is the last thing before the sign-off', () => {
    // It has to be, or somebody who refuses is stuck mid-walk with the rest
    // of it unreachable.
    const i = TOUR_STEPS.findIndex((s) => s.required)
    expect(i).toBe(TOUR_STEPS.length - 2)
  })

  it('gives both shells a walk that ends in the sign-off and holds the gate', () => {
    // There are no network-ONLY steps left: the walk is six stops that exist on
    // both shells. The `on: 'network'` escape hatch stays in `stepsFor` for a
    // step that genuinely only makes sense in one of them, so what this asserts
    // is the property that has to hold either way - a complete walk, ending in
    // `done`, with the one required step in it.
    for (const network of [false, true]) {
      const walk = stepsFor({ network })
      expect(walk.length, `network=${network}`).toBeGreaterThan(3)
      expect(walk[walk.length - 1].key).toBe('done')
      expect(walk.filter((s) => s.required)).toHaveLength(1)
      // Nothing unreachable behind the gate.
      expect(walk.findIndex((s) => s.required)).toBe(walk.length - 2)
    }
  })

  it('the rooms step follows the right path on each shell', () => {
    const rooms = TOUR_STEPS.find((s) => s.key === 'rooms')
    expect(stepGoal(rooms, true).to).toBe('/rooms')
    expect(stepGoal(rooms, false).to).toBe('/chat')
  })

  it('starts and ends on a card that points at nothing', () => {
    for (const network of [true, false]) {
      const steps = stepsFor({ network })
      expect(steps[0].anchor).toBeNull()
      expect(steps[steps.length - 1].anchor).toBeNull()
    }
  })

  it('every anchored step that could be absent says so', () => {
    const CHROME = [
      'nav-home', 'nav-challenges', 'nav-chat', 'nav-messages',
      'nav-worldwide', 'avatar-menu', 'enable-push',
    ]
    for (const s of TOUR_STEPS.filter((x) => x.anchor && !CHROME.includes(x.anchor))) {
      expect(s.skipIfMissing, `${s.key}`).toBe(true)
    }
  })
})
