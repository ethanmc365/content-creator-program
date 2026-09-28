import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { allRows } from './fetchAll'

// POINTS PER ENTRY (26 Sep 2026), AND WHAT THEY ARE FOR (28 Sep 2026).
//
// Ethan: "show clearly on each entry how many points I got if it's a points
// challenge ... so you can see clearly which posts actually brought points."
// Then: "it shows +1 and some of them +6 ... I think this should show +1 for
// views and +5 for bonus, etc."
//
// Every award tied to a video carries its `submission_id` (view milestones and
// the bonuses claimed on it); awards for the creator as a whole (posting every
// week, spreading across platforms) have none and stay off the entry, because
// they belong to no single video. `point_awards` is readable by everyone in the
// challenge's market, so creators see each other's totals exactly as they see
// each other's views.

const VIEW_KINDS = new Set(['views_threshold', 'total_views_threshold', 'views_per'])
const BONUS_KINDS = new Set(['bonus', 'claim'])

/** Which bucket an award's rule belongs to: 'views', 'bonus' or 'other'. */
export function pointBucket(kind) {
  if (VIEW_KINDS.has(kind)) return 'views'
  if (BONUS_KINDS.has(kind) || !kind) return 'bonus'
  return 'other'
}

/** Rows of { submission_id, points, point_rules: { kind } } -> Map(id -> parts). */
export function entryPointParts(rows) {
  const out = new Map()
  for (const r of rows || []) {
    if (!r.submission_id) continue
    const cur = out.get(r.submission_id) || { total: 0, views: 0, bonus: 0, other: 0 }
    const n = Number(r.points || 0)
    cur.total += n
    cur[pointBucket(r.point_rules?.kind)] += n
    out.set(r.submission_id, cur)
  }
  return out
}

/** "+1 views · +5 bonus", in the order a reader expects. Empty when nothing landed. */
export function describePointParts(p) {
  if (!p) return []
  return [
    p.views ? { key: 'views', label: 'views', points: p.views } : null,
    p.bonus ? { key: 'bonus', label: 'bonus', points: p.bonus } : null,
    p.other ? { key: 'other', label: 'other', points: p.other } : null,
  ].filter(Boolean)
}

// Map(submission_id -> { total, views, bonus, other }).
export function useEntryPoints(challengeId, enabled = true, refreshKey = '') {
  const [points, setPoints] = useState(() => new Map())
  useEffect(() => {
    if (!challengeId || !enabled) return undefined
    let alive = true
    allRows(() => supabase.from('point_awards')
      .select('id, submission_id, points, point_rules(kind)')
      .eq('challenge_id', challengeId)
      .not('submission_id', 'is', null))
      .then((rows) => { if (alive) setPoints(entryPointParts(rows)) })
      .catch(() => {})
    return () => { alive = false }
  }, [challengeId, enabled, refreshKey])
  return points
}
