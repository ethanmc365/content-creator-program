import { describe, it, expect } from 'vitest'
import { normalisePointRule, RULE_USES_THRESHOLD, RULE_USES_MAX } from './scoring'

// The bug this pins: the challenge form used to null `threshold` for anything
// that was not `views_threshold`, so a `total_views_threshold` rule reached the
// database with no threshold - it looked right on screen and scored nothing.
describe('saving a point rule keeps only the fields its kind means', () => {
  const full = { kind: '', label: 'x', points: 3, threshold: 25000, max_points: 8 }

  it('keeps the threshold on both milestone kinds', () => {
    for (const kind of ['views_threshold', 'total_views_threshold']) {
      expect(normalisePointRule({ ...full, kind }).threshold).toBe(25000)
    }
  })

  it('keeps the cap on both counted kinds', () => {
    for (const kind of ['per_post', 'platform_spread']) {
      expect(normalisePointRule({ ...full, kind }).max_points).toBe(8)
    }
  })

  it('drops the cap from a milestone and the threshold from a counted rule', () => {
    expect(normalisePointRule({ ...full, kind: 'views_threshold' }).max_points).toBeNull()
    expect(normalisePointRule({ ...full, kind: 'per_post' }).threshold).toBeNull()
  })

  it('gives a bonus neither', () => {
    const r = normalisePointRule({ ...full, kind: 'bonus' })
    expect(r.threshold).toBeNull()
    expect(r.max_points).toBeNull()
  })

  it('never lets one kind claim both fields', () => {
    for (const kind of [...RULE_USES_THRESHOLD]) expect(RULE_USES_MAX.has(kind)).toBe(false)
  })

  it('carries the parts every rule has', () => {
    const r = normalisePointRule({ ...full, kind: 'per_post' })
    expect(r).toMatchObject({ kind: 'per_post', label: 'x', points: 3 })
  })
})
