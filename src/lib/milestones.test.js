import { describe, it, expect } from 'vitest'
import {
  UNIT_FACTOR, criterionFraction, criterionLabel, criterionNeed,
  fromDays, humanDays, milestoneFraction, routeState, toDays,
} from './milestones'

describe('time units', () => {
  // The whole reason the unit is stored alongside the threshold is so that what
  // the admin typed is what they see when they open the form again. If this
  // round trip is lossy, "6 months" becomes "5.91 months" on the second edit
  // and then 5 on the third.
  it('round-trips whatever a person would actually type', () => {
    for (const unit of ['days', 'months', 'years']) {
      for (const n of [1, 2, 3, 6, 12, 18, 30, 90]) {
        expect(fromDays(toDays(n, unit), unit)).toBe(n)
      }
    }
  })

  it('never stores less than a day', () => {
    expect(toDays(0, 'days')).toBe(1)
    expect(toDays(-5, 'months')).toBe(1)
  })

  it('puts six months where a person would expect it', () => {
    expect(toDays(6, 'months')).toBe(183)
    expect(toDays(1, 'years')).toBe(365)
  })
})

describe('humanDays', () => {
  it('counts in days, then months, then years', () => {
    expect(humanDays(1)).toBe('1 day')
    expect(humanDays(47)).toBe('47 days')
    expect(humanDays(90)).toBe('3 months')
    expect(humanDays(365)).toBe('1 year')
    expect(humanDays(550)).toBe('1.5 years')
  })
})

describe('saying what a requirement asks for', () => {
  it('formats big view counts rather than printing them', () => {
    expect(criterionNeed({ metric: 'views', threshold: 1000000 })).toMatch(/views$/)
    expect(criterionNeed({ metric: 'videos', threshold: 10 })).toBe('10 videos')
    expect(criterionNeed({ metric: 'referrals', threshold: 3 })).toBe('3 referred')
  })

  it('says time in the unit it was set in', () => {
    expect(criterionNeed({ metric: 'days', threshold: 183, unit: 'months' })).toBe('6 months')
    expect(criterionNeed({ metric: 'days', threshold: 1, unit: 'days' })).toBe('1 day')
  })

  it('puts the creator\'s own number in front when there is one', () => {
    expect(criterionLabel({ metric: 'videos', threshold: 10, value: 3 })).toBe('3 of 10 videos')
  })

  it('survives a metric it has never heard of', () => {
    // A column added to the check constraint before this file knows about it
    // must not take the whole route down with it.
    expect(criterionNeed({ metric: 'nonsense', threshold: 5 })).toBe('')
    expect(criterionLabel({ metric: 'nonsense', threshold: 5, value: 1 })).toBe('')
  })
})

describe('how far through a stop', () => {
  it('clamps a single requirement to 0..1', () => {
    expect(criterionFraction({ threshold: 10, value: 25 })).toBe(1)
    expect(criterionFraction({ threshold: 10, value: -5 })).toBe(0)
    expect(criterionFraction({ threshold: 0, value: 5 })).toBe(0)
  })

  // THE POINT OF THE MEAN. A stop wanting 500k views, 50 videos and 3
  // referrals, from somebody who has all the views and nothing else, is a third
  // of the way there - not finished, and not nowhere.
  it('averages the requirements rather than taking the best one', () => {
    const m = {
      criteria: [
        { threshold: 500000, value: 500000 },
        { threshold: 50, value: 0 },
        { threshold: 3, value: 0 },
      ],
    }
    expect(milestoneFraction(m)).toBeCloseTo(1 / 3, 5)
  })

  it('is zero for a stop that asks for nothing', () => {
    expect(milestoneFraction({ criteria: [] })).toBe(0)
    expect(milestoneFraction(null)).toBe(0)
  })
})

describe('reading a whole ladder', () => {
  const ladder = [
    { id: 'a', title: 'One', reached: true, blocked: false },
    { id: 'b', title: 'Two', reached: false, blocked: false },
    { id: 'c', title: 'Three', reached: false, blocked: true },
    { id: 'd', title: 'Four', reached: false, blocked: true },
  ]

  it('finds where somebody is', () => {
    const s = routeState(ladder)
    expect(s.reached).toBe(1)
    expect(s.total).toBe(4)
    expect(s.last.title).toBe('One')
    expect(s.next.title).toBe('Two')
  })

  // Ethan's case: past 100,000 views, has never referred anybody, so the stops
  // beyond the referral gate are earned and unavailable. They have to be
  // countable or the page cannot explain itself.
  it('separates earned-but-gated from not-yet-done', () => {
    expect(routeState(ladder).blocked.map((b) => b.title)).toEqual(['Three', 'Four'])
  })

  it('handles an empty ladder without throwing', () => {
    const s = routeState([])
    expect(s.reached).toBe(0)
    expect(s.next).toBe(null)
    expect(s.last).toBe(null)
  })

  it('handles a finished ladder', () => {
    const done = ladder.map((m) => ({ ...m, reached: true, blocked: false }))
    expect(routeState(done).next).toBe(null)
    expect(routeState(done).reached).toBe(4)
  })
})

describe('unit factors', () => {
  it('uses mean lengths so the conversion is reversible', () => {
    expect(UNIT_FACTOR.days).toBe(1)
    expect(UNIT_FACTOR.years).toBeCloseTo(UNIT_FACTOR.months * 12, 1)
  })
})

describe('pluralising the noun', () => {
  it('says one video, not one videos', () => {
    expect(criterionNeed({ metric: 'videos', threshold: 1 })).toBe('1 video')
    expect(criterionNeed({ metric: 'videos', threshold: 2 })).toBe('2 videos')
    expect(criterionNeed({ metric: 'challenges', threshold: 1 })).toBe('1 challenge')
  })

  it('leaves the metrics that read fine either way alone', () => {
    expect(criterionNeed({ metric: 'referrals', threshold: 1 })).toBe('1 referred')
  })
})
