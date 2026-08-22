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
    const KINDS = ['route', 'scroll', 'click', 'connect', 'push', 'dwell', 'end']
    for (const s of TOUR_STEPS) {
      const g = stepGoal(s, true)
      expect(g, `${s.key} has no goal`).toBeTruthy()
      expect(KINDS, `${s.key} goal kind`).toContain(g.kind)
    }
  })

  it('every step that asks for something says what', () => {
    // The instruction is the only line that matters if they read nothing else.
    for (const s of TOUR_STEPS) {
      if (stepGoal(s, true).kind === 'end') continue
      expect(s.do, `${s.key} has no instruction`).toBeTruthy()
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
  it('sends people to the worldwide hub on the network shell', () => {
    const hub = TOUR_STEPS.find((s) => s.key === 'hub')
    expect(stepAt(hub, true)).toBe('/global')
    expect(stepAt(hub, false)).toBe('/home')
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

  it('drops the network steps when the network shell is off', () => {
    const legacy = stepsFor({ network: false })
    const network = stepsFor({ network: true })
    expect(legacy.length).toBeLessThan(network.length)
    for (const s of legacy) expect(s.on).toBe('both')
    expect(legacy[legacy.length - 1].key).toBe('done')
    expect(legacy.some((s) => s.required)).toBe(true)
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
