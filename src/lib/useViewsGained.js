import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { teamApi } from '../api/team'

// Overview and Weekly views share the same date boundaries, RPC and short-lived result.
// A view belongs to the day it was gained, even when its video was submitted earlier.
const cache = new Map()
const pending = new Map()
const TTL = 60_000
export function viewsReportDays(range) {
  return {
    from: range?.start ? format(range.start, 'yyyy-MM-dd') : null,
    to: range?.end ? format(new Date(range.end.getTime() - 1), 'yyyy-MM-dd') : null,
  }
}

export function useViewsGained(from, to, market = '', refresh = 0) {
  const key = `${from}|${to}|${market}`
  const [state, setState] = useState({ key: '', data: null, error: '' })
  useEffect(() => {
    if (!from || !to) return undefined
    let alive = true
    const hit = cache.get(key)
    if (!refresh && hit && Date.now() - hit.at < TTL) {
      setState({ key, data: hit.data, error: '' })
      return undefined
    }
    if (!pending.has(key)) {
      const request = Promise.resolve(teamApi.adminViewsGained({ p_from: from, p_to: to, p_market: market || null }))
        .then(({ data, error }) => {
          if (error) throw error
          if (!data) throw new Error('The views report was empty. Please try again.')
          cache.set(key, { data, at: Date.now() })
          return data
        }).finally(() => pending.delete(key))
      pending.set(key, request)
    }
    pending.get(key).then(
      (data) => { if (alive) setState({ key, data, error: '' }) },
      (error) => { if (alive) setState({ key, data: null, error: error.message || 'The views could not be loaded.' }) },
    )
    return () => { alive = false }
  }, [key, from, to, market, refresh])
  const current = state.key === key ? state : { data: null, error: '' }
  return { ...current, loading: !!from && !!to && !current.data && !current.error }
}

export function withViewsGained(headline, totals) {
  const views = totals ? Number(totals.community) || 0 : null
  const vipViews = totals ? Number(totals.vip) || 0 : null
  return {
    ...headline, views, vipViews, combinedViews: totals ? views + vipViews : null,
    cashCpm: views > 0 && headline.measuredCash > 0 ? headline.measuredCash / views * 1000 : null,
    totalCpm: views > 0 && headline.measuredCash + headline.measuredVouchers > 0 ? (headline.measuredCash + headline.measuredVouchers) / views * 1000 : null,
  }
}
