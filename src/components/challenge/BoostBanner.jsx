import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Icon from '../Icon'
import { useT } from '../../lib/i18n'
import { cx } from '../../lib/utils'

// A POINT BOOST, WHILE IT IS ON (4 Oct 2026, migration 334).
//
// Ethan: "Whenever there is an editing challenge, I could add in double points for a specific day and time frame, like 3 hours or whatever,
// or triple points ... to really get people actually posting videos." A boost is a window with a multiplier: every video entered inside it
// earns that many times its points. This is what a creator sees: the multiplier, and how long is left, counting down. A boost that has not
// started yet shows when it opens, so people can plan the video; one that has ended is gone.
const fmtLeft = (ms) => {
  const m = Math.max(0, Math.ceil(ms / 60000))
  if (m >= 1440) return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`
  if (m >= 60) return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
  return `${m}m`
}
const mult = (n) => `x${String(Number(n)).replace(/\.0+$/, '')}`

export default function BoostBanner({ challengeId, className }) {
  const tr = useT()
  const [boosts, setBoosts] = useState([])
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    let alive = true
    supabase.from('challenge_boosts').select('*').eq('challenge_id', challengeId).eq('is_active', true).gt('ends_at', new Date().toISOString()).order('starts_at')
      .then(({ data }) => { if (alive) setBoosts(data || []) })
    return () => { alive = false }
  }, [challengeId])
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20000)
    return () => clearInterval(t)
  }, [])

  const live = boosts.find((b) => Date.parse(b.starts_at) <= now && Date.parse(b.ends_at) > now)
  const next = !live ? boosts.find((b) => Date.parse(b.starts_at) > now) : null
  const b = live || next
  if (!b) return null
  const when = (iso) => new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <div className={cx('relative mb-3 flex items-center gap-3 overflow-hidden rounded-2xl px-4 py-3 text-white shadow-card', live ? 'bg-gradient-to-r from-ink via-[#2b160c] to-[#5a2308]' : 'bg-ink/90', className)} role="status">
      {live && <span aria-hidden className="challenge-sheen pointer-events-none absolute inset-y-0" />}
      <span className={cx('relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-extrabold tabular-nums', live ? 'bg-brand' : 'bg-white/15')}>{mult(b.multiplier)}</span>
      <span className="relative min-w-0 flex-1">
        <span className="block text-[10px] font-bold uppercase tracking-wider text-brand-light">{live ? tr('Boost on now') : tr('Boost coming up')}</span>
        <span className="block truncate text-sm font-semibold">
          {live
            ? tr('{n} points on every video you post. {t} left.', { n: mult(b.multiplier), t: fmtLeft(Date.parse(b.ends_at) - now) })
            : tr('{n} points on videos posted from {a} until {z}.', { n: mult(b.multiplier), a: when(b.starts_at), z: when(b.ends_at) })}
        </span>
        {b.max_extra_points ? <span className="block text-[11px] text-white/70">{tr('Up to {n} extra points each.', { n: b.max_extra_points })}</span> : null}
      </span>
      <Icon name="fire" className="relative h-5 w-5 shrink-0 text-brand-light" />
    </div>
  )
}
