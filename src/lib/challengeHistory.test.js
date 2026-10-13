import { describe, it, expect } from 'vitest'
import { historyMetrics } from './challengeHistory'

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
