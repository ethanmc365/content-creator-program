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

// ---------------------------------------------------------------------------
// `min_views`: the gate that holds a claimed bonus back until the entry earns
// it (migration 181). Tested here for the same reason every other column is:
// this file exists because a new column was once silently nulled on the way to
// the database, and the rule looked right on screen and scored nothing.
describe('normalisePointRule: the bonus view gate', () => {
  const claimable = {
    kind: 'bonus',
    label: 'Filmed in Spain',
    points: 3,
    prompt: 'Is this filmed at a Spanish destination?',
    min_views: 1000,
  }

  it('keeps the gate on a bonus the creator claims', () => {
    expect(normalisePointRule(claimable).min_views).toBe(1000)
  })

  it('drops it from a bonus an admin awards by hand', () => {
    // No question means a human decides, and a human's judgement cannot be
    // gated on a view count without simply stopping them deciding.
    expect(normalisePointRule({ ...claimable, prompt: '   ' }).min_views).toBeNull()
    expect(normalisePointRule({ ...claimable, prompt: undefined }).min_views).toBeNull()
  })

  it('drops it from every other kind of rule', () => {
    for (const kind of ['per_post', 'views_threshold', 'total_views_threshold', 'platform_spread']) {
      expect(normalisePointRule({ ...claimable, kind }).min_views).toBeNull()
    }
  })

  it('treats a blank or zero gate as no gate', () => {
    expect(normalisePointRule({ ...claimable, min_views: null }).min_views).toBeNull()
    expect(normalisePointRule({ ...claimable, min_views: 0 }).min_views).toBeNull()
    expect(normalisePointRule({ ...claimable, min_views: '' }).min_views).toBeNull()
  })

  it('takes the number even when the editor hands it over as text', () => {
    expect(normalisePointRule({ ...claimable, min_views: '500' }).min_views).toBe(500)
  })
})
