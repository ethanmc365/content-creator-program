import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { allRows } from './fetchAll'

// POINTS PER ENTRY (26 Sep 2026).
//
// Ethan: "show clearly on each entry how many points I got if it's a points
// challenge ... so you can see clearly which posts actually brought points."
// Every award tied to a video carries its `submission_id` (milestones and the
// bonuses claimed on it); awards for the creator as a whole (posting every
// week, spreading across platforms) have none and stay off the entry, because
// they belong to no single video. `point_awards` is readable by everyone in the
// challenge's market, so creators see each other's totals exactly as they see
// each other's views.
export function useEntryPoints(challengeId, enabled = true, refreshKey = '') {
  const [points, setPoints] = useState(() => new Map())
  useEffect(() => {
    if (!challengeId || !enabled) return undefined
    let alive = true
    allRows(() => supabase.from('point_awards')
      .select('id, submission_id, points')
      .eq('challenge_id', challengeId)
      .not('submission_id', 'is', null))
      .then((rows) => {
        if (!alive) return
        const next = new Map()
        for (const r of rows || []) next.set(r.submission_id, (next.get(r.submission_id) || 0) + Number(r.points || 0))
        setPoints(next)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [challengeId, enabled, refreshKey])
  return points
}
