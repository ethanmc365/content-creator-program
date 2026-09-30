import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { mergeKpiRows, periodKey, rowsForPeriod } from './kpiTracker'

// EVERY GOAL OF SEVERAL SCOPES OVER SEVERAL PERIODS, IN TWO REQUESTS (30 Sep 2026).
//
// Used by the Total (every market added up) and by the rolling overview under any scope. One read of
// the targets for the years involved, then ONE `kpi_actuals_batch` call (migration 289) for every
// scope x period that actually has a goal. It used to be a request per period - twelve on the month
// view - which was much of the lag Ethan felt.
//
// Returns Map(periodKey -> [{ scope, rows }]) where rows are merged (goal + live number) and only
// scopes with at least one goal in that period appear. A result already seen paints at once and is
// refreshed behind.
const cache = new Map()
// Bumped whenever a goal is saved or deleted anywhere, so every mounted chart re-reads instead of
// holding on to a plan that no longer exists (1 Oct 2026).
let version = 0
const listeners = new Set()
const scopeKeyOf = (communityId, basis) => `${communityId}:${basis}`

export function useKpiPlan({ scopes, periods, enabled = true }) {
  const key = `${scopes.map((s) => s.key).join(',')}|${periods.map((p) => periodKey(p)).join(',')}`
  const [state, setState] = useState(() => ({ key, data: cache.get(key) || null, error: '' }))
  const [ver, setVer] = useState(version)
  useEffect(() => {
    const fn = () => setVer(version)
    listeners.add(fn)
    return () => { listeners.delete(fn) }
  }, [])
  const current = state.key === key ? state : { key, data: cache.get(key) || null, error: '' }

  useEffect(() => {
    if (!enabled || scopes.length === 0 || periods.length === 0) return undefined
    let alive = true
    ;(async () => {
      const ids = [...new Set(scopes.map((s) => s.id))]
      const years = [...new Set(periods.map((p) => p.year))]
      const { data: targets, error } = await supabase.from('kpi_targets')
        .select('*').in('community_id', ids).in('year', years)
      if (!alive) return
      if (error) { setState({ key, data: cache.get(key) || null, error: error.message }); return }
      const byScope = new Map()
      for (const t of targets || []) {
        const k = scopeKeyOf(t.community_id, t.basis)
        if (!byScope.has(k)) byScope.set(k, [])
        byScope.get(k).push(t)
      }
      const plan = []
      const items = []
      for (const p of periods) {
        for (const scope of scopes) {
          const mine = byScope.get(scopeKeyOf(scope.id, scope.basis)) || []
          const rows = mergeKpiRows(rowsForPeriod(mine, p), [])
          if (rows.length === 0) continue
          const k = `${scope.key}|${periodKey(p)}`
          plan.push({ k, p, scope, rows })
          items.push({ k, community_id: scope.id, basis: scope.basis, year: p.year, quarter: p.quarter, month: p.month ?? null })
        }
      }
      const actuals = new Map()
      for (let i = 0; i < items.length; i += 120) {
        const { data: a, error: aErr } = await supabase.rpc('kpi_actuals_batch', { p_items: items.slice(i, i + 120) })
        if (!alive) return
        if (aErr) { setState({ key, data: cache.get(key) || null, error: aErr.message }); return }
        for (const r of a || []) {
          if (!actuals.has(r.k)) actuals.set(r.k, [])
          actuals.get(r.k).push({ metric: r.metric, value: r.value })
        }
      }
      const out = new Map(periods.map((p) => [periodKey(p), []]))
      for (const { k, p, scope, rows } of plan) {
        out.get(periodKey(p)).push({ scope, rows: mergeKpiRows(rows, actuals.get(k) || []) })
      }
      cache.set(key, out)
      if (alive) setState({ key, data: out, error: '' })
    })()
    return () => { alive = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, ver])

  return current
}

/** Forget cached plans (after a goal is saved or deleted). */
export function clearKpiPlanCache() {
  cache.clear()
  version += 1
  for (const fn of listeners) fn()
}
