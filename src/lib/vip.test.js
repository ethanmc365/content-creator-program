import { describe, it, expect } from 'vitest'
import { daysLeft, describeRule, money, monthLabel, monthProgress, rate } from './vip'

const tr = (s, v = {}) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? `{${k}}`))

describe('vip helpers', () => {
  it('writes a rate without trailing zeros', () => {
    expect(rate(0.25)).toBe('0.25')
    expect(rate('0.3000')).toBe('0.3')
    expect(rate(1)).toBe('1')
  })
  it('names a month', () => {
    expect(monthLabel(2026, 9)).toMatch(/2026/)
  })
  it('counts whole days left and never below zero', () => {
    const now = Date.parse('2026-09-30T12:00:00Z')
    expect(daysLeft('2026-09-30T22:00:00Z', now)).toBe(1)
    expect(daysLeft('2026-09-01T00:00:00Z', now)).toBe(0)
  })
  it('measures month progress between 0 and 1', () => {
    const s = '2026-09-01T00:00:00Z'
    const e = '2026-10-01T00:00:00Z'
    expect(monthProgress(s, e, Date.parse('2026-09-16T00:00:00Z'))).toBeCloseTo(0.5, 1)
    expect(monthProgress(s, e, Date.parse('2027-01-01T00:00:00Z'))).toBe(1)
  })
  it('formats money with the currency', () => {
    expect(money(95, 'EUR')).toMatch(/95/)
  })
  it('says each kind of rule in a sentence', () => {
    expect(describeRule({ kind: 'target', amount: 25, reward: 'cash' }, tr)).toMatch(/monthly target/)
    const top = describeRule({ kind: 'top_n', scope: 'market', reward: 'cash', places: [{ place: 1, amount: 100 }, { place: 2, amount: 50, reward: 'voucher' }] }, tr)
    expect(top).toMatch(/#1/)
    expect(top).toMatch(/voucher/)
    expect(describeRule({ kind: 'milestone', amount: 15, reward: 'cash', conditions: { metric: 'lifetime_views', threshold: 250000 } }, tr)).toMatch(/once/)
  })
})

// ------------------------------------------------------------- second pass (migration 298)
import { ATTENTION, EVENT_ICON, describeEvent, shortDay } from './vip'

describe('describeEvent', () => {
  const tr = (s, v = {}) => s.replace(/\{(\w+)\}/g, (_, k) => v[k])
  it('says where a creator came from and where they went', () => {
    expect(describeEvent({ kind: 'joined', detail: { source: 'invite' } }, tr)).toBe('Joined with a VIP link')
    expect(describeEvent({ kind: 'joined', detail: { source: 'transfer' } }, tr)).toBe('Moved from the community to VIP')
    expect(describeEvent({ kind: 'joined', detail: {} }, tr)).toBe('Made a VIP')
    expect(describeEvent({ kind: 'left' }, tr)).toBe('Moved back to the community')
    expect(describeEvent({ kind: 'rejoined' }, tr)).toBe('Moved from the community back to VIP')
  })
  it('writes the numbers into rate and cap changes, and says so when they are cleared', () => {
    expect(describeEvent({ kind: 'rate_changed', detail: { to: 0.3 } }, tr, 'EUR')).toBe('Own rate set to EUR 0.3 per 1,000')
    expect(describeEvent({ kind: 'rate_changed', detail: { to: null } }, tr)).toBe('Back on the programme rate')
    expect(describeEvent({ kind: 'cap_changed', detail: { to: null } }, tr)).toBe('Monthly cap removed')
  })
  it('never throws on a kind it does not know', () => {
    expect(describeEvent({ kind: 'from_the_future' }, tr)).toBe('Changed')
    expect(describeEvent({ kind: 'left', detail: null }, tr)).toBe('Moved back to the community')
  })
  it('has an icon for every kind it can describe', () => {
    for (const k of ['joined', 'rejoined', 'left', 'paused', 'resumed', 'moved', 'rate_changed', 'cap_changed', 'target_changed']) expect(EVENT_ICON[k]).toBeTruthy()
  })
})

describe('the small helpers', () => {
  it('names every reason a creator can need a nudge', () => {
    expect(Object.keys(ATTENTION).sort()).toEqual(['no_payment', 'no_terms', 'quiet', 'sync_error'])
  })
  it('turns a plain date into a short day without a time zone shifting it', () => {
    expect(shortDay('2026-09-05')).toMatch(/5/)
    expect(shortDay('not a date')).toBeTruthy()
  })
})
