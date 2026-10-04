import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Icon from '../Icon'
import { SLOT, SLOT_ICON } from './SwapIn'
import { useT } from '../../lib/i18n'
import { cx } from '../../lib/utils'

// A POINT BOOST, IN THE SAME PLACE AS A LIVE BONUS (4 Oct 2026, migration 334).
//
// Ethan: "the points boost ... should obviously show up at the top where you have the bonus points thing ... That pop-up card should show up
// with double points, etc., here if I actually have it running." So a boost is not its own banner any more: it takes the slot beside the tabs
// that a live bonus uses (and wins it while it is on), in the same dark card, with the multiplier as the disc, what is on, and a countdown.
// One that has not started yet shows when it opens, so creators can plan the video; one that has ended is gone.
const fmtLeft = (ms) => {
  const m = Math.max(0, Math.ceil(ms / 60000))
  if (m >= 1440) return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`
  if (m >= 60) return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
  return `${m}m`
}
export const boostMult = (n) => `x${String(Number(n)).replace(/\.0+$/, '')}`

/** The boost to show (running, else the next one), re-checked every 20 seconds, or null. */
export function useBoost(challengeId, enabled = true) {
  const [boosts, setBoosts] = useState([])
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return undefined
    let alive = true
    supabase.from('challenge_boosts').select('*').eq('challenge_id', challengeId).eq('is_active', true).gt('ends_at', new Date().toISOString()).order('starts_at')
      .then(({ data }) => { if (alive) setBoosts(data || []) })
    return () => { alive = false }
  }, [challengeId, enabled])
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20000)
    return () => clearInterval(t)
  }, [])
  const live = boosts.find((b) => Date.parse(b.starts_at) <= now && Date.parse(b.ends_at) > now)
  const next = !live ? boosts.find((b) => Date.parse(b.starts_at) > now) : null
  const b = live || next
  return b ? { ...b, live: !!live, left: Date.parse(b.ends_at) - now } : null
}

export default function BoostCallout({ boost }) {
  const tr = useT()
  const when = (iso) => new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })
  return (
    <div
      role="status"
      className={cx('board-status relative min-w-0 overflow-hidden text-left text-white shadow-card', 'bg-gradient-to-r from-ink via-[#2b160c] to-[#5a2308]', SLOT)}
    >
      {boost.live && <span aria-hidden className="challenge-sheen pointer-events-none absolute inset-y-0" />}
      <span className={cx('relative text-[15px] font-extrabold tabular-nums', SLOT_ICON, boost.live ? 'bg-brand' : 'bg-white/20')}>
        {boostMult(boost.multiplier)}
        {boost.live && <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-brand/40 [animation-duration:2.4s]" />}
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="block text-[10px] font-bold uppercase tracking-wider text-brand-light">
          {boost.live ? tr('{n} points on now', { n: boostMult(boost.multiplier) }) : tr('{n} points coming up', { n: boostMult(boost.multiplier) })}
        </span>
        <span className="block truncate text-[13px] font-semibold">
          {boost.live
            ? tr('Every video you post counts {n}. {t} left.', { n: boostMult(boost.multiplier), t: fmtLeft(boost.left) })
            : tr('Videos posted {a} to {z} count {n}.', { a: when(boost.starts_at), z: when(boost.ends_at), n: boostMult(boost.multiplier) })}
        </span>
      </span>
      <Icon name="fire" className="relative h-5 w-5 shrink-0 text-brand-light" />
    </div>
  )
}
