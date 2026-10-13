import { describe, it, expect } from 'vitest'
import { makeMoneyApi } from './money'
import { recordingClient } from './recorder.test-helper'

describe('money api', () => {
  it('every accessor names its own table or function', async () => {
    const { client, calls } = recordingClient()
    const api = makeMoneyApi(client)
    await api.creatorPrivate()
    await api.invoices()
    await api.rewards()
    await api.adminCombineVouchers({ x: 1 })
    await api.adminSetVoucherCode({ x: 1 })
    await api.adminSetVoucherUsed({ x: 1 })
    await api.adminSplitVouchers({ x: 1 })
    await api.decideInvoice({ x: 1 })
    await api.setRewardUsed({ x: 1 })
    await api.submitInvoice({ x: 1 })
    await api.voucherDayBoard({ x: 1 })
    await api.voucherDaysAward({ x: 1 })
    expect(calls).toEqual([
      ['from', 'creator_private'],
      ['from', 'invoices'],
      ['from', 'rewards'],
      ['rpc', 'admin_combine_vouchers', { x: 1 }],
      ['rpc', 'admin_set_voucher_code', { x: 1 }],
      ['rpc', 'admin_set_voucher_used', { x: 1 }],
      ['rpc', 'admin_split_vouchers', { x: 1 }],
      ['rpc', 'decide_invoice', { x: 1 }],
      ['rpc', 'set_reward_used', { x: 1 }],
      ['rpc', 'submit_invoice', { x: 1 }],
      ['rpc', 'voucher_day_board', { x: 1 }],
      ['rpc', 'voucher_days_award', { x: 1 }],
    ])
  })
})
