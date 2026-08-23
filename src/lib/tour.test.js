import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./supabase', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) } }))
vi.mock('./appFlags', () => ({ readFlag: async () => false }))

import {
  shouldAutoStart, stepsFor, stepAt, stepGoal, partOf, goalAccepts, variantFor,
  TOUR_STEPS, TOUR_PARTS, markSeenLocally, clearSeenLocally,
} from './tour'

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
        if (g.kind === 'route') expect(typeof g.to === 'string' || Array.isArray(g.any)).toBe(true)
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

  // THE WHOLE POINT OF VERSION 4. A step that points at content rather than at
  // chrome has to survive that content not existing - no live brief, an empty
  // directory, a rail that is not drawn on a phone. Three ways out, and every
  // such step must take one of them or it is a dead end with a Skip button.
  it('every step that points at something that might not be there has a way out', () => {
    const CHROME = [
      'nav-home', 'nav-challenges', 'nav-chat', 'nav-messages',
      'nav-worldwide', 'nav-calendar', 'avatar-menu', 'enable-push', 'search',
    ]
    for (const s of TOUR_STEPS.filter((x) => x.anchor && !CHROME.includes(x.anchor))) {
      expect(!!(s.empty || s.door || s.skipIfMissing), `${s.key} has no fallback`).toBe(true)
    }
  })

  it('the chrome steps that can genuinely be absent are marked skippable', () => {
    for (const key of ['search', 'calendar']) {
      expect(TOUR_STEPS.find((s) => s.key === key).skipIfMissing, key).toBe(true)
    }
  })

  // A CARD THAT ASKS FOR SOMETHING MUST HAVE SOMETHING TO PRESS.
  //
  // A step with no anchor draws no highlight, so "open your rewards" is an
  // instruction with nothing on the screen that carries it out - rewards, the
  // creator network and the milestones all live behind the avatar menu, which
  // is shut. Every anchorless step whose goal is a navigation therefore needs a
  // door on the card, a set of choices, or a `to` the tour itself walks them to.
  it('every anchorless step that asks you to navigate carries its own way there', () => {
    for (const s of TOUR_STEPS) {
      if (s.anchor) continue
      const g = stepGoal(s, true)
      if (g.kind !== 'route') continue
      expect(!!(s.door || s.choices), `${s.key} has no door`).toBe(true)
    }
  })

  it('an empty variant is a complete step in its own right', () => {
    for (const s of TOUR_STEPS.filter((x) => x.empty)) {
      expect(s.empty.body.length, `${s.key}`).toBeGreaterThan(20)
      expect(s.empty.do, `${s.key}`).toBeTruthy()
      expect(s.empty.goal?.kind, `${s.key}`).toBeTruthy()
    }
  })
})

describe('what a step resolves to', () => {
  const brief = TOUR_STEPS.find((s) => s.key === 'brief')

  it('a live brief on the board is the normal step', () => {
    const v = variantFor(brief, { network: true, present: true, pathname: '/challenges' })
    expect(v.variant).toBe('normal')
    expect(v.anchor).toBe('challenge-card')
    expect(v.goal.kind).toBe('route')
  })

  // NO CHALLENGE RUNNING. This is the case Ethan asked about: the walk must not
  // ask somebody to open a brief that does not exist.
  it('an empty challenge board says so and moves on by itself', () => {
    const v = variantFor(brief, { network: true, present: false, pathname: '/challenges' })
    expect(v.variant).toBe('empty')
    expect(v.anchor).toBeNull()
    expect(v.goal.kind).toBe('dwell')
    expect(v.body).toMatch(/when a brief goes live/i)
  })

  // …and the step that asks you to scroll THROUGH a brief goes with it, because
  // there is no brief under the card to scroll.
  it('the read-the-brief step disappears when no brief was opened', () => {
    const read = TOUR_STEPS.find((s) => s.key === 'brief-read')
    expect(variantFor(read, { network: true, present: true, pathname: '/challenges' })).toBeNull()
    expect(variantFor(read, { network: true, present: true, pathname: '/challenges/abc' })).toBeTruthy()
  })

  it('a missing anchor with no fallback drops the step entirely', () => {
    const search = TOUR_STEPS.find((s) => s.key === 'search')
    expect(variantFor(search, { network: true, present: false, pathname: '/global' })).toBeNull()
  })

  it('a missing rail link falls back to a door on the card', () => {
    const board = TOUR_STEPS.find((s) => s.key === 'board')
    const v = variantFor(board, { network: true, present: false, pathname: '/global' })
    expect(v.variant).toBe('unanchored')
    expect(v.anchor).toBeNull()
    expect(v.door.to).toBe('/board')
  })

  it('resolves the shell-specific goal once, so the host never has to', () => {
    const rooms = TOUR_STEPS.find((s) => s.key === 'rooms')
    expect(variantFor(rooms, { network: true, present: true }).goal.to).toBe('/rooms')
    expect(variantFor(rooms, { network: false, present: true }).goal.to).toBe('/chat')
  })
})

describe('when a route goal is satisfied', () => {
  it('a single destination matches by prefix', () => {
    expect(goalAccepts({ kind: 'route', to: '/challenges/' }, '/challenges/abc')).toBe(true)
    expect(goalAccepts({ kind: 'route', to: '/challenges/' }, '/challenges')).toBe(false)
  })

  it('any one of several destinations will do', () => {
    const g = { kind: 'route', any: ['/leaderboard', '/resources'] }
    expect(goalAccepts(g, '/resources')).toBe(true)
    expect(goalAccepts(g, '/leaderboard')).toBe(true)
    expect(goalAccepts(g, '/refer')).toBe(false)
  })

  it('never claims a goal of another kind', () => {
    expect(goalAccepts({ kind: 'scroll', px: 100 }, '/anything')).toBe(false)
    expect(goalAccepts(null, '/anything')).toBe(false)
  })
})
