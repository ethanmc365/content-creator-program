import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./supabase', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) } }))
vi.mock('./appFlags', () => ({ readFlag: async () => false }))

import { shouldAutoStart, stepsFor, TOUR_STEPS, markSeenLocally, clearSeenLocally } from './tour'

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

  it('every step that waits for an action can be passed over', () => {
    // A walkthrough you cannot leave is a trap, and both actions depend on a
    // browser permission or another person.
    for (const s of TOUR_STEPS.filter((x) => x.action)) expect(s.optional).toBe(true)
  })

  it('gives a phone and a desktop the same walk', () => {
    // The anchors differ; the copy deliberately does not.
    expect(stepsFor(true).map((s) => s.key)).toEqual(stepsFor(false).map((s) => s.key))
  })

  it('starts and ends on a card that points at nothing', () => {
    expect(TOUR_STEPS[0].anchor).toBeNull()
    expect(TOUR_STEPS[TOUR_STEPS.length - 1].anchor).toBeNull()
  })
})
