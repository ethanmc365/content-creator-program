import { describe, expect, it } from 'vitest'
import { referralProgress, referralStage, referralTerms } from './referrals'

describe('referral stages', () => {
  it('counts only an accepted creator who has posted', () => {
    expect(referralStage({ status: 'active' }, true).key).toBe('counted')
    expect(referralStage({ status: 'pending', onboarded: true }, true).key).toBe('in_review')
    expect(referralStage({ status: 'active' }, false).key).toBe('joined')
    expect(referralStage({ status: 'declined' }, true).key).toBe('declined')
  })
})

describe('referral progress', () => {
  it('earns one voucher per three', () => {
    expect(referralProgress(0, 3)).toEqual({ earned: 0, towardsNext: 0, per: 3 })
    expect(referralProgress(1, 3)).toEqual({ earned: 0, towardsNext: 1, per: 3 })
    expect(referralProgress(3, 3)).toEqual({ earned: 1, towardsNext: 0, per: 3 })
    expect(referralProgress(7, 3)).toEqual({ earned: 2, towardsNext: 1, per: 3 })
  })
  it('falls back to the published terms', () => {
    expect(referralTerms(null)).toMatchObject({ amount: 20, currency: 'EUR', per: 3 })
    expect(referralTerms({ amount: 15, per: 0 })).toMatchObject({ amount: 15, per: 3 })
  })
})
