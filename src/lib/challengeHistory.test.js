import { describe, it, expect } from 'vitest'
import { historyMetrics, rollUp, historyOnly } from './challengeHistory'

// THE ARITHMETIC IS TESTED BECAUSE IT IS THE ARITHMETIC A BUDGET IS SET FROM.
//
// Every number on the Challenge performance tab now comes through these two
// functions, and the two ways they can be quietly wrong - counting a missing
// measurement as a zero, and counting one contest twice - are both invisible in
// the output. A CPM of 0.31 and a CPM of 0.47 look equally plausible on a card.

describe('historyMetrics', () => {
  it('computes the six ratios the source spreadsheet carried as columns', () => {
    // Row ES-03 from the import, whose figures the sheet also states.
    const m = historyMetrics({
      prize_total: 540, total_views: 2844995, creators: 27, posts: 787,
      starts_at: '2026-08-04', ends_at: '2026-08-30',
    })
    expect(m.cpm).toBeCloseTo(0.19, 2)          // sheet: EUR 0.19
    expect(m.costPerPost).toBeCloseTo(0.69, 2)  // sheet: EUR 0.69
    expect(m.costPerCreator).toBeCloseTo(20, 2) // sheet: EUR 20.00
    expect(m.postsPerCreator).toBeCloseTo(29.1, 1)
    expect(Math.round(m.viewsPerPost)).toBe(3615)
    expect(Math.round(m.viewsPerCreator)).toBe(105370)
    expect(m.days).toBe(26)
  })

  it('answers null rather than zero or Infinity for anything not measured', () => {
    // Fourteen imported rows look like this: a real prize, marked Done, and no
    // view count because nobody logged one. Zero would be a lie that averages.
    const m = historyMetrics({ prize_total: 200, total_views: null, creators: null, posts: null })
    expect(m.cpm).toBeNull()
    expect(m.costPerPost).toBeNull()
    expect(m.viewsPerCreator).toBeNull()
  })

  it('does not divide by zero when a challenge got no posts at all', () => {
    const m = historyMetrics({ prize_total: 100, total_views: 0, creators: 0, posts: 0 })
    expect(m.cpm).toBeNull()
    expect(m.costPerPost).toBeNull()
    expect(m.postsPerCreator).toBeNull()
  })
})

describe('rollUp', () => {
  const rows = [
    { prize_total: 540, total_views: 2844995, creators: 27, posts: 787, winners: 12 },
    { prize_total: 200, total_views: null, creators: null, posts: null, winners: 3 },
    { prize_total: 120, total_views: 34000, creators: 5, posts: 6, winners: 3 },
  ]

  it('counts the prize money of every challenge, measured or not', () => {
    // The money left the account whether or not anybody logged the views.
    expect(rollUp(rows).prize).toBe(860)
  })

  it('computes CPM only over the challenges whose views are known', () => {
    const r = rollUp(rows)
    // 660 of prize money bought 2,878,995 views. Including the unmeasured 200
    // would report a CPM a third lower than the truth - plausible, and wrong.
    expect(r.cpm).toBeCloseTo(660 / (2878995 / 1000), 4)
    expect(r.measured).toBe(2)
    expect(r.unmeasured).toBe(1)
  })

  it('reports nothing rather than zero when nothing was measured at all', () => {
    expect(rollUp([{ prize_total: 50, total_views: null }]).cpm).toBeNull()
  })
})

describe('historyOnly', () => {
  it('drops the rows that are the same contest as a live challenge', () => {
    // The UK challenge of 20 Jul - 20 Aug is in the spreadsheet AND on the
    // platform. Adding both is how a programme total quietly gains a challenge.
    const rows = [{ ref: 'UK-04', challenge_id: 'abc' }, { ref: 'ES-03', challenge_id: null }]
    expect(historyOnly(rows).map((r) => r.ref)).toEqual(['ES-03'])
  })
})
