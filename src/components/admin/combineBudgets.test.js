import { describe, expect, it } from 'vitest'
import { combineBudgets, prizeBudget } from './PrizeBreakdownFields'

// A split challenge (the Spanish community runs two groups) costs every group's prizes and every group's
// taking-part reward, added up. Ethan: "at the very bottom the total cost doesn't appear whenever you assign
// different prizes for the different groups."
describe('combineBudgets', () => {
  const groupA = prizeBudget({
    prizes: [{ place: '1st', prize: '€100', amount: 100, type: 'cash' }, { place: '2nd', prize: '€50 voucher', amount: 50, type: 'voucher' }],
    participation: { threshold: 20, prize: '€10 voucher', amount: 10, type: 'voucher', basis: 'points' },
    creators: 10,
  })
  const groupB = prizeBudget({
    prizes: [{ place: '1st', prize: '€60', amount: 60, type: 'cash' }],
    participation: { threshold: 3, prize: '€5 voucher', amount: 5, type: 'voucher' },
    creators: 8,
  })
  const all = combineBudgets([{ label: 'Group A', budget: groupA }, { label: 'Group B', budget: groupB }])

  it('adds the certain prizes of every group', () => {
    expect(all.min.total).toBe(210)
    expect(all.min.cash).toBe(160)
    expect(all.min.voucher).toBe(50)
  })

  it('adds the most each group could pay for taking part', () => {
    // A: 10 creators x €10, B: 8 x €5
    expect(all.max.total).toBe(210 + 100 + 40)
  })

  it('keeps a line per group, with how its reward is earned', () => {
    expect(all.groups.map((g) => g.label)).toEqual(['Group A', 'Group B'])
    expect(all.groups[0].part.basis).toBe('points')
    expect(all.groups[1].part.basis).toBe('entries')
  })

  it('has no ceiling when a group has no ceiling', () => {
    const open = prizeBudget({ prizes: [], participation: { threshold: 2, prize: '€5', amount: 5, type: 'voucher' }, creators: null })
    expect(combineBudgets([{ label: 'A', budget: groupA }, { label: 'B', budget: open }]).max.total).toBeNull()
  })
})
