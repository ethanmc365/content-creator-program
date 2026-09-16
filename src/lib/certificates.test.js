import { describe, it, expect } from 'vitest'
import { bodyProblem, fillTemplate, ordinal, ruleProblem, sampleFacts, sortCertificates, tierOf } from './certificates'

describe('fillTemplate', () => {
  const facts = { name: 'Roxanna', challenge: 'Hidden Gems', market: 'UK & Ireland', place: 1, views: 124500 }

  it('fills what it has', () => {
    expect(fillTemplate('awarded to {name} for winning {challenge}', facts))
      .toBe('awarded to Roxanna for winning Hidden Gems')
  })

  it('renders a place as an ordinal and views with separators', () => {
    expect(fillTemplate('{place}, {views} views', facts)).toBe('1st, 124,500 views')
  })

  // THE CASE THIS MODULE EXISTS FOR. A design written for challenges gets
  // reused for a milestone, and neither "{challenge}" nor "for winning  in "
  // is something anybody should receive with their name on it. The unit is the
  // LINE, so what comes out is always a sentence an admin actually wrote.
  it('leaves out a whole line whose detail is missing', () => {
    expect(fillTemplate('awarded to {name}\nfor winning {challenge} in {market}', { name: 'Sam' }))
      .toBe('awarded to Sam')
  })

  it('keeps the lines it can fill and drops only the ones it cannot', () => {
    expect(fillTemplate('{name}\nwinner of {challenge}\n{market}', { name: 'Sam', market: 'Spain' }))
      .toBe('Sam\nSpain')
  })

  it('returns nothing at all when no line survives, and lets the card decide', () => {
    expect(fillTemplate('for {challenge} in {market}', {})).toBe('')
  })

  it('never prints a placeholder it cannot fill', () => {
    expect(fillTemplate('for {challenge}', {})).not.toContain('{')
  })

  it('leaves a fully-filled sentence exactly alone', () => {
    const s = 'This certifies that Roxanna finished 1st.'
    expect(fillTemplate(s, facts)).toBe(s)
  })

  it('treats a zero view count as a real number, not as missing', () => {
    expect(fillTemplate('{views} views', { views: 0 })).toBe('0 views')
  })

  it('survives no text and no facts', () => {
    expect(fillTemplate('', {})).toBe('')
    expect(fillTemplate(null)).toBe('')
  })
})

describe('ordinal', () => {
  it('handles the three that are irregular and the rest', () => {
    expect([1, 2, 3, 4, 11].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th'])
  })
  it('is blank for a non-number', () => {
    expect(ordinal(undefined)).toBe('')
  })
})

describe('sortCertificates', () => {
  it('puts the rare tier first and the newest first inside it', () => {
    const rows = [
      { awarded_at: '2026-01-01', design: { tier: 'participation' }, serial: 'P1' },
      { awarded_at: '2026-01-01', design: { tier: 'achievement' }, serial: 'A-OLD' },
      { awarded_at: '2026-06-01', design: { tier: 'achievement' }, serial: 'A-NEW' },
      { awarded_at: '2026-03-01', design: { tier: 'milestone' }, serial: 'M1' },
    ]
    expect(sortCertificates(rows).map((r) => r.serial)).toEqual(['A-NEW', 'A-OLD', 'M1', 'P1'])
  })

  it('does not mutate what it was given', () => {
    const rows = [{ awarded_at: '2026-01-01', design: { tier: 'participation' } }]
    const copy = [...rows]
    sortCertificates(rows)
    expect(rows).toEqual(copy)
  })
})

describe('tierOf', () => {
  it('falls back to the rarest rather than to undefined', () => {
    expect(tierOf('nonsense').key).toBe('achievement')
  })
})

describe('sampleFacts', () => {
  it('previews a milestone design with a MILESTONE, not a challenge win', () => {
    // The bug this exists for: every design previewed against "finished 1st in
    // Hidden Gems", including one that can never print a challenge.
    const f = sampleFacts({ award_on: 'milestone' })
    expect(f.milestone).toBeTruthy()
    expect(f.challenge).toBeUndefined()
    expect(f.place).toBeUndefined()
  })

  it('previews a participation design with a challenge but no placing', () => {
    const f = sampleFacts({ award_on: 'challenge_entry' })
    expect(f.challenge).toBeTruthy()
    expect(f.place).toBeUndefined()
  })

  it('shows the best place the rule actually awards', () => {
    expect(sampleFacts({ award_on: 'challenge_rank', ranks: [2, 3] }).place).toBe(2)
    expect(sampleFacts({ award_on: 'challenge_rank', ranks: [1] }).place).toBe(1)
  })

  it('falls back to a win when no ranks are chosen yet', () => {
    expect(sampleFacts({ award_on: 'challenge_rank', ranks: [] }).place).toBe(1)
  })

  it('gives a hand-given certificate the leanest example', () => {
    const f = sampleFacts({ award_on: 'manual' })
    expect(f.name).toBeTruthy()
    expect(f.challenge).toBeUndefined()
    expect(f.milestone).toBeUndefined()
  })
})

describe('ruleProblem', () => {
  it('catches a podium rule with no places, which can never fire', () => {
    expect(ruleProblem({ award_on: 'challenge_rank', ranks: [], is_active: true }))
      .toMatch(/No places/)
  })

  it('catches a milestone rule with no milestone', () => {
    expect(ruleProblem({ award_on: 'milestone', milestone_id: null, is_active: true }))
      .toMatch(/No milestone/)
  })

  it('says a draft is a draft', () => {
    expect(ruleProblem({ award_on: 'manual', is_active: false })).toMatch(/draft/i)
  })

  it('is silent about a rule that works', () => {
    expect(ruleProblem({ award_on: 'challenge_rank', ranks: [1], is_active: true })).toBe(null)
    expect(ruleProblem({ award_on: 'manual', is_active: true })).toBe(null)
  })
})

describe('bodyProblem', () => {
  it('catches a challenge body left on a milestone award', () => {
    // The silent case: the preview correctly falls back to a default sentence
    // and says nothing about why the admin's own wording vanished.
    expect(bodyProblem({ award_on: 'milestone', body: 'for finishing {place} in {challenge}' }))
      .toMatch(/None of your wording can be filled in/)
  })

  it('is silent when at least one line survives', () => {
    expect(bodyProblem({ award_on: 'milestone', body: 'for reaching {milestone}' })).toBe(null)
    expect(bodyProblem({ award_on: 'challenge_rank', ranks: [1], body: 'for winning {challenge}' })).toBe(null)
  })

  it('is silent for a body with no placeholders at all', () => {
    expect(bodyProblem({ award_on: 'manual', body: 'is an official Tryp.com Content Creator' })).toBe(null)
  })

  it('is silent for an empty body, which the card handles itself', () => {
    expect(bodyProblem({ award_on: 'manual', body: '' })).toBe(null)
    expect(bodyProblem({})).toBe(null)
  })
})
