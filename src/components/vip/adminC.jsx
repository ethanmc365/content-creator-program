import { Suspense, useState } from 'react'
import { lazyRoute } from '../../lib/lazyRoute'
import { Link } from 'react-router-dom'
import { Avatar, Modal, Skeleton } from '../ui'
import Icon from '../Icon'
import { formatDate, formatViews } from '../../lib/utils'
import { ATTENTION, EVENT_ICON, describeEvent, perK, useOptionalRpc } from '../../lib/vip'
import { useT } from '../../lib/i18n'

// THE TEAM'S SIDE OF THE VIP PROGRAMME, PART THREE (30 Sep 2026, migration 298): the things that turn the tools from
// a set of tables into something you can read at a glance - a trend, who needs a nudge, who looks ready to be a VIP,
// what has happened, and what you have told your VIPs. Every block asks the database politely (useOptionalRpc): if it
// does not have the function yet the block draws nothing rather than an error.

// The chart is loaded on demand (see TrendCard.jsx for why it lives apart from this file).
const TrendCardChart = lazyRoute(() => import('./TrendCard'))
export function TrendCard(props) {
  return <Suspense fallback={<Skeleton className="h-72 w-full rounded-card" />}><TrendCardChart {...props} /></Suspense>
}

/** Who needs a nudge, and why. Draws nothing when everybody is fine. */
export function AttentionCard({ programme }) {
  const tr = useT()
  const { data, missing } = useOptionalRpc('vip_attention', { p_programme: programme.id }, programme.id)
  const r = perK(programme.cpm, programme.currency || 'EUR')
  if (missing || !data || data.length === 0) return null
  // IN THE PLATFORM'S OWN COLOURS (3 Oct 2026). Ethan: "I don't like that color of that card. It's like a weird yellow."
  return (
    <section className="relative overflow-hidden rounded-card border border-gray-100 bg-white p-4 shadow-card animate-rise sm:p-5">
      <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-brand to-brand-light" />
      <h2 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-ink"><Icon name="bell" className="h-5 w-5 text-brand" />{tr('Needs a nudge')} <span className="rounded-full bg-brand-tint px-2 py-0.5 text-xs font-bold text-brand">{data.length}</span></h2>
      <ul className="divide-y divide-gray-50">
        {data.map((r, i) => (
          <li key={r.profile_id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 animate-rise" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
            <Link to={`/profile/${r.profile_id}`} className="flex min-w-0 items-center gap-2.5 hover:text-brand">
              <Avatar src={r.photo} name={r.name} size="xs" />
              <span className="truncate text-sm font-semibold">{r.name}</span>
            </Link>
            <span className="flex flex-wrap gap-1.5">
              {(r.reasons || []).map((k) => <span key={k} className="rounded-full bg-cloud px-2.5 py-0.5 text-[11px] font-semibold text-ink/80">{tr(ATTENTION[k] || k)}</span>)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t border-gray-100 pt-3 text-xs leading-relaxed text-smoke">
        {tr('Views are always counted at the agreed rate ({r} per 1,000), nudge or no nudge. A nudge is only about what they still have to do: add payment details so the invoice can be paid, or accept the', { r })} <Link to="/vip?mode=tools&tab=settings" className="font-semibold text-brand hover:underline">{tr('VIP terms')}</Link>.
      </p>
    </section>
  )
}

/** Community creators whose entries have earned the most views and who are not VIPs yet: one press to move them. */
export function SuggestionsCard({ programme, onPick }) {
  const tr = useT()
  const { data, missing } = useOptionalRpc('vip_suggestions', { p_programme: programme.id }, programme.id)
  if (missing || !data || data.length === 0) return null
  return (
    <section className="rounded-card border border-gray-100 bg-white p-4 shadow-card animate-rise sm:p-5">
      <h2 className="text-[15px] font-bold text-ink">{tr('Ready to be VIPs?')}</h2>
      <p className="mb-3 mt-0.5 text-xs text-smoke">{tr('Community creators with the most views on their challenge entries. Moving them keeps everything they have.')}</p>
      <ul className="divide-y divide-gray-50">
        {data.slice(0, 6).map((r, i) => (
          <li key={r.profile_id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 animate-rise" style={{ animationDelay: `${i * 45}ms` }}>
            <Link to={`/profile/${r.profile_id}`} className="flex min-w-0 flex-1 items-center gap-2.5 hover:text-brand">
              <Avatar src={r.photo} name={r.name} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{r.name}</span>
                <span className="block text-xs text-smoke">{tr('{n} videos', { n: r.videos })} · {tr('{n} on average', { n: formatViews(r.avg_views) })}</span>
              </span>
            </Link>
            <span className="text-right text-sm font-bold tabular-nums text-ink">{formatViews(r.views)}<span className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400">{tr('views')}</span></span>
            <button type="button" onClick={() => onPick({ id: r.profile_id, name: r.name, photo_url: r.photo })} className="btn-secondary !py-1.5 !px-3 text-xs"><Icon name="star" className="h-3.5 w-3.5" />{tr('Make a VIP')}</button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** What has happened: moves, rate changes, targets. One creator, or the whole programme. */
export function ActivityFeed({ programme, profileId = null, limit = 12, title, bare = false }) {
  const tr = useT()
  // SHOW MORE, A PAGE AT A TIME (9 Oct 2026). Ethan: "for the recent activity at the bottom of VIP tools, try to improve it." It was
  // the last dozen entries and no way to see anything older, one flat list with a dot each. Now it is grouped by day, shows who it
  // was about, and a button asks for older ones (each ask is one more small read, only when somebody presses it).
  const [more, setMore] = useState(0)
  const n = limit + more * 20
  const { data, missing } = useOptionalRpc('vip_timeline', { p_programme: programme.id, p_profile: profileId, p_limit: n }, `${programme.id}:${profileId}:${n}`)
  if (missing) return null
  const days = []
  for (const e of data || []) {
    const d = new Date(e.at)
    const key = Number.isNaN(d.getTime()) ? String(e.at).slice(0, 10) : d.toDateString()
    const last = days[days.length - 1]
    if (last && last.key === key) last.rows.push(e); else days.push({ key, at: e.at, rows: [e] })
  }
  const dayLabel = (at) => {
    const d = new Date(at)
    const diff = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000)
    return diff === 0 ? tr('Today') : diff === 1 ? tr('Yesterday') : formatDate(at)
  }
  const body = data === undefined ? <Skeleton className="h-24 w-full rounded-xl" /> : data.length === 0
    ? <p className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-smoke">{tr('Nothing has happened yet.')}</p>
    : (
      <div className="space-y-4">
        {days.map((g, gi) => (
          <div key={g.key}>
            <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.12em] text-gray-400">{dayLabel(g.at)}</p>
            <ol className="relative space-y-3 border-l border-gray-100 pl-5">
              {g.rows.map((e, i) => (
                <li key={e.id} className="relative animate-rise" style={{ animationDelay: `${Math.min(gi * 3 + i, 10) * 35}ms` }}>
                  <span className="absolute -left-[1.72rem] top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-tint text-brand ring-4 ring-white"><Icon name={EVENT_ICON[e.kind] || 'clock'} className="h-3 w-3" /></span>
                  <div className="flex items-start gap-2.5">
                    {!profileId && e.name && (e.profile_id
                      ? <Link to={`/profile/${e.profile_id}`} className="shrink-0"><Avatar src={e.photo} name={e.name} size="xs" /></Link>
                      : <Avatar src={e.photo} name={e.name} size="xs" />)}
                    <div className="min-w-0">
                      <p className="text-sm text-ink">{!profileId && e.name && <span className="font-semibold">{e.name} · </span>}{describeEvent(e, tr, programme.currency)}</p>
                      <p className="text-xs text-smoke">{new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{e.actor ? ` · ${tr('by {n}', { n: e.actor })}` : ''}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ))}
        {data.length >= n && (
          <button type="button" onClick={() => setMore((m) => m + 1)} className="btn-secondary w-full justify-center !py-2 text-xs"><Icon name="clock" className="h-3.5 w-3.5" />{tr('Show older')}</button>
        )}
      </div>
    )
  if (bare) return body
  return (
    <section className="rounded-card border border-gray-100 bg-white p-4 shadow-card animate-rise sm:p-5">
      <h2 className="mb-4 text-[15px] font-bold text-ink">{title || tr('Recent activity')}</h2>
      {body}
    </section>
  )
}

/** One creator's story: their timeline, and the door to move them. */
export function MemberStoryModal({ m, programme, onClose, onEdit, onMoveBack }) {
  const tr = useT()
  return (
    <Modal open onClose={onClose} title={m.name}>
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onEdit} className="btn-secondary !py-2 text-xs"><Icon name="pencil" className="h-3.5 w-3.5" />{tr('Edit rate, cap and targets')}</button>
          {m.status !== 'left' && <button type="button" onClick={onMoveBack} className="btn-secondary !py-2 text-xs"><Icon name="users" className="h-3.5 w-3.5" />{tr('Move back to the community')}</button>}
          <Link to={`/profile/${m.profile_id}`} className="btn-secondary !py-2 text-xs" onClick={onClose}><Icon name="eye" className="h-3.5 w-3.5" />{tr('View profile')}</Link>
        </div>
        {m.notes && <p className="rounded-xl bg-cloud px-3.5 py-3 text-sm text-smoke"><span className="mb-0.5 block text-[10.5px] font-bold uppercase tracking-wide text-gray-400">{tr('Notes')}</span>{m.notes}</p>}
        <div>
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gray-400">{tr('History')}</p>
          <ActivityFeed programme={programme} profileId={m.profile_id} limit={40} bare />
        </div>
      </div>
    </Modal>
  )
}
