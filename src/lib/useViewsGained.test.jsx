import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { periodHeadline } from './analyticsPeriod'
import { useViewsGained, viewsReportDays, withViewsGained } from './useViewsGained'

const api = vi.hoisted(() => ({ adminViewsGained: vi.fn() }))
vi.mock('../api/team', () => ({ teamApi: api }))

describe('consistent analytics views', () => {
  it('uses inclusive report days for the same half-open custom date range', () => {
    expect(viewsReportDays({ start: new Date(2026, 9, 1), end: new Date(2026, 9, 11) })).toEqual({ from: '2026-10-01', to: '2026-10-10' })
  })
  it('uses gained views rather than lifetime views on newly submitted videos, and explains the VIP split', () => {
    const period = periodHeadline({ profiles: [], submissions: [{ creator_id: 'a', logged_views: 1756000, submitted_at: '2026-10-10' }], rewards: [{ status: 'distributed', amount: 260, reward_type: 'cash', created_at: '2026-10-10' }] }, null, (n) => n)
    const corrected = withViewsGained(period, { community: 2600000, vip: 2200000 })
    expect(corrected.views).toBe(2600000)
    expect(corrected.vipViews).toBe(2200000)
    expect(corrected.combinedViews).toBe(4800000)
    expect(corrected.cashCpm).toBeCloseTo(0.1)
  })
  it('does not display the old misleading views while the gained report is loading', () => {
    expect(withViewsGained({ views: 1756000, measuredCash: 100, measuredVouchers: 0 }, null).views).toBeNull()
  })
  it('shares one in-flight read and result between overview and weekly views', async () => {
    let resolve
    api.adminViewsGained.mockImplementationOnce(() => new Promise((r) => { resolve = r }))
    const first = renderHook(() => useViewsGained('2026-01-01', '2026-01-07'))
    const second = renderHook(() => useViewsGained('2026-01-01', '2026-01-07'))
    const payload = { totals: { community: 2600000, vip: 2200000 } }
    await act(async () => resolve({ data: payload }))
    await waitFor(() => expect(first.result.current.data).toEqual(payload))
    expect(second.result.current.data).toEqual(payload)
    expect(api.adminViewsGained).toHaveBeenCalledTimes(1)
    first.unmount(); second.unmount()
  })
})
