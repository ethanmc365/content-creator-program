import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// A challenge's voucher days and who has won them (migration 383), fetched once and shared: the kickers card, the bonus
// points card and the offer slot beside the tabs all read the same rows, so one request serves the three.
const cache = new Map()
function load(challengeId) {
  if (!cache.has(challengeId)) {
    cache.set(challengeId, Promise.all([
      supabase.from('challenge_voucher_days').select('*').eq('challenge_id', challengeId).eq('is_active', true).order('day'),
      supabase.rpc('voucher_day_board', { p_challenge: challengeId }),
    ]).then(([{ data: d }, { data: b }]) => ({ days: d || [], board: b || [] })).catch(() => {
      cache.delete(challengeId)
      return { days: [], board: [] }
    }))
    // Stale after a minute: a day's winners change while it runs.
    setTimeout(() => cache.delete(challengeId), 60_000)
  }
  return cache.get(challengeId)
}

export function useVoucherDays(challengeId) {
  const [state, setState] = useState({ days: [], board: [] })
  useEffect(() => {
    if (!challengeId) return undefined
    let alive = true
    load(challengeId).then((v) => { if (alive) setState(v) })
    return () => { alive = false }
  }, [challengeId])
  return state
}

/** 'today' while the day's window is open, 'soon' before it, 'done' after. */
export const voucherDayState = (d, now) => (Date.parse(d.ends_at) <= now ? 'done' : Date.parse(d.starts_at) <= now ? 'today' : 'soon')
