import { describe, it, expect } from 'vitest'
import { walletTickets, awaitingCode, isWalletVoucher } from './wallet'

const voucher = (over = {}) => ({
  id: Math.random().toString(36).slice(2),
  reward_type: 'voucher',
  status: 'distributed',
  voucher_code: 'TRYP-10',
  used_at: null,
  distributed_at: '2026-09-01T00:00:00Z',
  ...over,
})

describe('the voucher wallet', () => {
  it('keeps an awarded voucher that has no code yet', () => {
    // The bug this file exists for: six of these were invisible in production.
    const { toSpend } = walletTickets([voucher({ voucher_code: null })])
    expect(toSpend).toHaveLength(1)
  })

  it('counts a blank-but-present code as no code', () => {
    expect(awaitingCode(voucher({ voucher_code: '   ' }))).toBe(true)
    expect(awaitingCode(voucher())).toBe(false)
  })

  it('leaves cash prizes and undistributed vouchers out', () => {
    const rows = [
      voucher({ reward_type: 'cash' }),
      voucher({ status: 'pending' }),
      voucher(),
    ]
    const { toSpend, spent } = walletTickets(rows)
    expect(toSpend).toHaveLength(1)
    expect(spent).toHaveLength(0)
  })

  it('separates spent from spendable', () => {
    const { toSpend, spent } = walletTickets([
      voucher({ used_at: '2026-09-20T00:00:00Z' }),
      voucher(),
    ])
    expect(toSpend).toHaveLength(1)
    expect(spent).toHaveLength(1)
  })

  it('puts the newest first in each half', () => {
    const { toSpend } = walletTickets([
      voucher({ id: 'old', distributed_at: '2026-01-01T00:00:00Z' }),
      voucher({ id: 'new', distributed_at: '2026-09-28T00:00:00Z' }),
    ])
    expect(toSpend.map((r) => r.id)).toEqual(['new', 'old'])
  })

  it('survives a missing list', () => {
    expect(walletTickets(undefined)).toEqual({ toSpend: [], spent: [] })
    expect(isWalletVoucher(null)).toBe(false)
  })
})
