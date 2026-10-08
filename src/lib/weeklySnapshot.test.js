import { describe, expect, it } from 'vitest'
import { compact, foldWeeks, pctChange, snapshotSvg, snapshotText, viewsFor } from './weeklySnapshot'

const report = {
  from: '2026-10-01', to: '2026-10-07', days: 7, vip_visible: true,
  daily: Array.from({ length: 7 }, (_, i) => ({ d: `2026-10-0${i + 1}`, community: 1000 * (i + 1), vip: 500 })),
  totals: { community: 28000, vip: 3500, videos: 40, vip_videos: 5, new_members: 7, active_creators: 12 },
  prev: { community: 20000, vip: 2500, videos: 30, vip_videos: 4, new_members: 5 },
  markets: [{ id: 'a', name: 'Spain', community: 20000, vip: 3500, combined: 23500, prev_combined: 15000, videos: 30, new_members: 5, active_creators: 9 },
    { id: 'b', name: 'Nordics', community: 0, vip: 0, combined: 0, prev_combined: 0, videos: 0, new_members: 0, active_creators: 0 }],
  top_videos: [],
}

describe('weekly snapshot', () => {
  it('shortens numbers the way the platform does', () => {
    expect([compact(999), compact(1500), compact(120000), compact(2600000), compact(12000000)]).toEqual(['999', '1.5k', '120k', '2.6M', '12M'])
  })
  it('works out the change on the days before, and says nothing when there is nothing to compare', () => {
    expect(pctChange(120, 100)).toBe(20)
    expect(pctChange(80, 100)).toBe(-20)
    expect(pctChange(5, 0)).toBeNull()
  })
  it('counts one half or both', () => {
    expect(viewsFor(report.totals, 'community')).toBe(28000)
    expect(viewsFor(report.totals, 'vip')).toBe(3500)
    expect(viewsFor(report.totals, 'both')).toBe(31500)
  })
  it('writes the paragraph, leaving out markets with nothing in them', () => {
    const t = snapshotText(report, 'both')
    expect(t).toContain('Views gained (community + VIP): 31.5k')
    expect(t).toContain('+40%')
    expect(t).toContain('- Spain:')
    expect(t).not.toContain('Nordics')
  })
  it('draws a self-contained SVG with the market and the headline in it', () => {
    const svg = snapshotSvg(report, 'both', 'Weekly snapshot')
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('Spain')
    expect(svg).toContain('31.5k')
    expect(svg).not.toContain('<image')
    expect(svg).not.toContain('NaN')
  })
  it('folds many days into Monday weeks', () => {
    const w = foldWeeks(Array.from({ length: 14 }, (_, i) => ({ d: `2026-09-${String(28 + i > 30 ? 28 + i - 30 : 28 + i).padStart(2, '0')}`, community: 1, vip: 1 })).slice(0, 3))
    expect(w[0].d).toBe('2026-09-28')
  })
})
