import { describe, expect, it } from 'vitest'
import { splitGradient, statusGradient } from './barGradient'

describe('splitGradient (one bar, no gaps)', () => {
  it('is a plain colour for a single share and transparent for none', () => {
    expect(splitGradient([{ value: 3, color: '#abc' }])).toBe('#abc')
    expect(splitGradient([{ value: 0, color: '#abc' }])).toBe('transparent')
  })

  it('runs from 0% to 100% with a soft seam between shares', () => {
    const g = splitGradient([{ value: 1, color: '#111' }, { value: 1, color: '#222' }], { blend: 4 })
    expect(g).toBe('linear-gradient(90deg, #111 0.00%, #111 46.00%, #222 54.00%, #222 100.00%)')
  })

  it('skips statuses nobody is in', () => {
    const g = statusGradient({ met: 1, behind: 1, missed: 0 })
    expect(g).toContain('#34d399')
    expect(g).toContain('#fbbf24')
    expect(g).not.toContain('#f87171')
  })
})
