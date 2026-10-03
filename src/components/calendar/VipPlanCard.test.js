import { describe, it, expect } from 'vitest'
import { planDays } from './VipPlanCard'

describe('the VIP posting plan', () => {
  const now = new Date(2026, 9, 3, 15, 0)            // 3 Oct, afternoon
  const endsAt = new Date(2026, 9, 31, 23, 59)        // the month closes on the 31st

  it('spreads the videos still to post from tomorrow to two days before the close', () => {
    const days = planDays({ now, endsAt, done: 0, target: 5 })
    expect(days).toHaveLength(5)
    expect(days[0].getDate()).toBe(4)
    expect(days[days.length - 1].getDate()).toBe(29)
    for (const d of days) expect(d.getHours()).toBe(18)
    const gaps = days.slice(1).map((d, i) => Math.round((d - days[i]) / 86400000))
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(1)
  })

  it('only plans what is left, and nothing once the target is met', () => {
    expect(planDays({ now, endsAt, done: 3, target: 5 })).toHaveLength(2)
    expect(planDays({ now, endsAt, done: 5, target: 5 })).toHaveLength(0)
  })

  it('never puts two videos on the same day near the end of a month', () => {
    const late = new Date(2026, 9, 28, 9, 0)
    const days = planDays({ now: late, endsAt, done: 0, target: 5 })
    expect(new Set(days.map((d) => d.toDateString())).size).toBe(days.length)
  })
})
