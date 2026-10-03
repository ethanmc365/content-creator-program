import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import Icon from '../Icon'
import { Spinner } from '../ui'
import { notice } from '../../lib/confirm'
import { toastSuccess } from '../../lib/toast'
import { cx } from '../../lib/utils'
import { viewerZone } from '../../lib/eventTime'
import { useT } from '../../lib/i18n'

// A VIP'S MONTH, PLANNED ON THE CALENDAR (3 Oct 2026).
//
// Ethan: "the calendars are currently blank for them ... Maybe they could have a suggested content plan to reach the
// goal of posting 5 videos and getting the views, where they could add to their calendar ... post one video here, post
// one video here, just something simple." The stay-in rule is N videos a month (5 by default, `req_videos`), so the
// card spreads the videos still to post evenly over the days left - never on the last day, which is the day a reading
// can still be missing - and one press puts them on the calendar as the creator's own events at 6pm, when most of them
// post. Each suggested day says whether it is already there, so pressing twice adds nothing twice.
export const PLAN_TITLE = 'Post a VIP video'

export function planDays({ now, endsAt, done, target }) {
  const left = Math.max(0, target - done)
  if (!left) return []
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const end = new Date(endsAt)
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 2)
  const span = Math.max(0, Math.round((last - start) / 86400000))
  const out = []
  for (let i = 0; i < left; i++) {
    const offset = left === 1 ? Math.floor(span / 2) : Math.round((span * i) / (left - 1))
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset, 18, 0, 0)
    if (!out.some((x) => x.toDateString() === d.toDateString())) out.push(d)
  }
  return out
}

const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString()

export default function VipPlanCard({ overview, items, now, onAdded }) {
  const tr = useT()
  const { user } = useAuth()
  const [busy, setBusy] = useState(false)
  const target = Number(overview?.programme?.req_videos) || 5
  const done = Number(overview?.stats?.videos) || 0
  const endsAt = overview?.month?.ends_at
  const days = useMemo(() => (endsAt ? planDays({ now, endsAt, done, target }) : []), [now, endsAt, done, target])
  const planned = (items || []).filter((i) => i.kind === 'personal' && i.title === tr(PLAN_TITLE))
  const isPlanned = (d) => planned.some((p) => sameDay(p.date, d))
  const missing = days.filter((d) => !isPlanned(d))
  if (!overview || !endsAt) return null

  async function add(list) {
    if (!user || !list.length) return
    setBusy(true)
    const rows = list.map((d) => ({
      title: tr(PLAN_TITLE),
      description: tr('One of your {n} VIP videos this month. Post it on your own account, then add the link on your VIP page so its views start counting.', { n: target }),
      date: d.toISOString(),
      ends_at: new Date(d.getTime() + 30 * 60_000).toISOString(),
      type: 'personal', timezone: viewerZone(), owner_id: user.id, created_by: user.id,
      community_ids: [], rsvp_enabled: false,
    }))
    const { error } = await supabase.from('events').insert(rows)
    setBusy(false)
    if (error) { notice(error.message); return }
    toastSuccess(list.length === 1 ? tr('Added to your calendar') : tr('{n} posting days added to your calendar', { n: list.length }))
    onAdded?.()
  }

  const pct = Math.min(100, Math.round((done / target) * 100))
  const fmt = (d) => d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  return (
    <section className="relative mb-6 overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light p-5 text-white shadow-card sm:p-6">
      <span aria-hidden className="pointer-events-none absolute -right-12 -top-16 h-52 w-52 rounded-full bg-white/15 blur-2xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white/85"><Icon name="star" className="h-3.5 w-3.5" />{tr('Your VIP posting plan')}</p>
          <p className="mt-1 text-xl font-bold">
            {done >= target ? tr('{n} of {n} videos this month. You are in.', { n: target }) : tr('{a} of {b} videos this month', { a: done, b: target })}
          </p>
          <p className="mt-0.5 text-sm text-white/90">
            {done >= target
              ? tr('Every extra video still earns on its views.')
              : tr('Post {n} more before the month closes to stay in the VIP programme. Here is a simple plan.', { n: target - done })}
          </p>
        </div>
        <Link to="/vip" className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-bold text-brand transition-transform duration-200 hoverable:hover:scale-105">{tr('VIP page')}<Icon name="chevronRight" className="h-3.5 w-3.5" /></Link>
      </div>
      <div className="relative mt-4 h-2 overflow-hidden rounded-full bg-white/25">
        <div className="h-full rounded-full bg-white transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }} />
      </div>
      {days.length > 0 && (
        <>
          <ul className="relative mt-4 flex flex-wrap gap-2">
            {days.map((d, i) => {
              const on = isPlanned(d)
              return (
                <li key={d.toISOString()} className="animate-rise" style={{ animationDelay: `${i * 50}ms` }}>
                  <button
                    type="button"
                    disabled={on || busy}
                    onClick={() => add([d])}
                    className={cx('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200', on ? 'bg-white text-brand' : 'bg-white/20 text-white ring-1 ring-white/40 hoverable:hover:-translate-y-px hoverable:hover:bg-white/30')}
                  >
                    <Icon name={on ? 'check' : 'plus'} className="h-3.5 w-3.5" />
                    {tr('Video {n}', { n: done + i + 1 })} · {fmt(d)}
                  </button>
                </li>
              )
            })}
          </ul>
          {missing.length > 1 && (
            <button type="button" onClick={() => add(missing)} disabled={busy} className="relative mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-brand shadow-card transition-transform duration-200 hoverable:hover:scale-105 disabled:opacity-70">
              {busy ? <Spinner className="h-4 w-4" /> : <Icon name="calendar" className="h-4 w-4" />}{tr('Add all {n} to my calendar', { n: missing.length })}
            </button>
          )}
        </>
      )}
    </section>
  )
}
