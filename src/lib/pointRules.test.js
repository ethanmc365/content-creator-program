import { describe, it, expect } from 'vitest'
import { normalisePointRule, RULE_USES_THRESHOLD, RULE_USES_MAX, isSavedRuleId, consistencyWindows } from './scoring'

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

  it('gives a bonus a cap but no threshold (migration 233)', () => {
    const r = normalisePointRule({ ...full, kind: 'bonus' })
    expect(r.threshold).toBeNull()
    expect(r.max_points).toBe(8)
  })

  it('treats a blank cap as no cap', () => {
    expect(normalisePointRule({ ...full, kind: 'bonus', max_points: '' }).max_points).toBeNull()
    expect(normalisePointRule({ ...full, kind: 'bonus', max_points: null }).max_points).toBeNull()
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

  it('keeps it on a bonus an admin awards too (migration 233)', () => {
    // An admin's award is a claim made for the creator now, so the gate holds
    // whoever gave the bonus.
    expect(normalisePointRule({ ...claimable, prompt: '   ' }).min_views).toBe(1000)
    expect(normalisePointRule({ ...claimable, prompt: undefined }).min_views).toBe(1000)
  })

  it('drops it from every other kind of rule', () => {
    for (const kind of ['per_post', 'views_threshold', 'total_views_threshold', 'platform_spread', 'consistency']) {
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

// ---------------------------------------------------------------------------
// "invalid input syntax for type uuid: new-5" - the Global Challenge draft.
// The save sent the editor's temporary ids to Postgres as though they were
// rows. Only a uuid is a row.
describe('isSavedRuleId', () => {
  it('accepts a database id', () => {
    expect(isSavedRuleId('93c6a3c9-7c42-4f92-ad1f-cfcb60dae5a5')).toBe(true)
  })
  it('rejects every temporary id the editor makes', () => {
    for (const id of ['new-5', 'new-12-3', 'seed-0', '', null, undefined, 7]) {
      expect(isSavedRuleId(id)).toBe(false)
    }
  })
})

describe('the consistency bonus', () => {
  it('keeps its window and nothing else', () => {
    const r = normalisePointRule({ kind: 'consistency', label: 'Posted every week', points: 5, period_days: 7, threshold: 9, max_points: 3, min_views: 100 })
    expect(r).toMatchObject({ kind: 'consistency', points: 5, period_days: 7, threshold: null, max_points: null, min_views: null })
  })
  it('drops the window from every other kind', () => {
    expect(normalisePointRule({ kind: 'bonus', label: 'x', points: 1, period_days: 7 }).period_days).toBeNull()
  })
  it('cuts the Global Challenge into four weeks', () => {
    // Monday 21 Sep 00:00 to Sunday 18 Oct 23:59, London.
    expect(consistencyWindows('2026-09-20T23:00:00Z', '2026-10-18T22:59:00Z', 7)).toBe(4)
    expect(consistencyWindows('2026-09-20T23:00:00Z', '2026-10-18T22:59:00Z', 1)).toBe(28)
  })
  it('counts a short last window as a window', () => {
    expect(consistencyWindows('2026-09-01T00:00:00Z', '2026-09-10T00:00:00Z', 7)).toBe(2)
  })
  it('has no answer without real dates', () => {
    expect(consistencyWindows(null, '2026-09-10T00:00:00Z', 7)).toBeNull()
    expect(consistencyWindows('2026-09-10T00:00:00Z', '2026-09-01T00:00:00Z', 7)).toBeNull()
    expect(consistencyWindows('2026-09-01T00:00:00Z', '2026-09-10T00:00:00Z', 0)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Migration 256: a bonus can run for part of the challenge.
import { challengeWeeks, ruleOpenAt, ruleWindowState } from './scoring'

describe('bonus windows', () => {
  it('saves the window on a bonus and drops it from every other kind', () => {
    const w = { starts_at: '2026-09-21T00:00:00.000Z', ends_at: '2026-09-27T22:59:00.000Z' }
    expect(normalisePointRule({ kind: 'bonus', label: 'x', points: 1, ...w })).toMatchObject(w)
    const other = normalisePointRule({ kind: 'per_post', label: 'x', points: 1, ...w })
    expect(other.starts_at).toBeNull()
    expect(other.ends_at).toBeNull()
  })

  it('treats a missing or broken date as open at that end', () => {
    const r = normalisePointRule({ kind: 'bonus', label: 'x', points: 1, starts_at: '', ends_at: 'nope' })
    expect(r.starts_at).toBeNull()
    expect(r.ends_at).toBeNull()
  })

  it('knows when a window is open', () => {
    const r = { starts_at: '2026-09-21T00:00:00Z', ends_at: '2026-09-27T23:00:00Z' }
    expect(ruleOpenAt(r, Date.parse('2026-09-20T12:00:00Z'))).toBe(false)
    expect(ruleOpenAt(r, Date.parse('2026-09-24T12:00:00Z'))).toBe(true)
    expect(ruleOpenAt(r, Date.parse('2026-09-28T00:00:00Z'))).toBe(false)
    expect(ruleOpenAt({}, 0)).toBe(true)
    expect(ruleWindowState(r, Date.parse('2026-09-20T00:00:00Z'))).toBe('upcoming')
    expect(ruleWindowState(r, Date.parse('2026-09-24T00:00:00Z'))).toBe('live')
    expect(ruleWindowState(r, Date.parse('2026-09-29T00:00:00Z'))).toBe('ended')
    expect(ruleWindowState({}, 0)).toBe('always')
  })

  it('cuts a four-week challenge into four weeks, the last one stopping at the deadline', () => {
    const weeks = challengeWeeks('2026-09-20T23:00:00Z', '2026-10-18T22:59:00Z')
    expect(weeks).toHaveLength(4)
    expect(weeks[0].starts_at).toBe('2026-09-20T23:00:00.000Z')
    expect(weeks[1].starts_at).toBe('2026-09-27T23:00:00.000Z')
    expect(weeks[3].ends_at).toBe('2026-10-18T22:59:00.000Z')
    expect(challengeWeeks(null, null)).toEqual([])
  })
})
