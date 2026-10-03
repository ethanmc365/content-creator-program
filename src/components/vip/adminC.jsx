import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Avatar, Modal, Skeleton, Spinner, Toggle } from '../ui'
import Icon from '../Icon'
import { confirm, notice } from '../../lib/confirm'
import { toastSuccess } from '../../lib/toast'
import { formatDate, formatViews } from '../../lib/utils'
import { ATTENTION, EVENT_ICON, describeEvent, money, perK, useOptionalRpc, vipRpc } from '../../lib/vip'
import { useT } from '../../lib/i18n'
import { AnnouncementCard } from './mine'

// THE TEAM'S SIDE OF THE VIP PROGRAMME, PART THREE (30 Sep 2026, migration 298): the things that turn the tools from
// a set of tables into something you can read at a glance - a trend, who needs a nudge, who looks ready to be a VIP,
// what has happened, and what you have told your VIPs. Every block asks the database politely (useOptionalRpc): if it
// does not have the function yet the block draws nothing rather than an error.

// The chart is loaded on demand (see TrendCard.jsx for why it lives apart from this file).
const TrendCardChart = lazy(() => import('./TrendCard'))
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
  const { data, missing } = useOptionalRpc('vip_timeline', { p_programme: programme.id, p_profile: profileId, p_limit: limit }, `${programme.id}:${profileId}:${limit}`)
  if (missing) return null
  const body = data === undefined ? <Skeleton className="h-24 w-full rounded-xl" /> : data.length === 0
    ? <p className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-smoke">{tr('Nothing has happened yet.')}</p>
    : (
      <ol className="relative space-y-3 border-l border-gray-100 pl-5">
        {data.map((e, i) => (
          <li key={e.id} className="relative animate-rise" style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}>
            <span className="absolute -left-[1.72rem] top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-tint text-brand ring-4 ring-white"><Icon name={EVENT_ICON[e.kind] || 'clock'} className="h-3 w-3" /></span>
            <p className="text-sm text-ink">
              {!profileId && e.name && <span className="font-semibold">{e.name} · </span>}{describeEvent(e, tr, programme.currency)}
            </p>
            <p className="text-xs text-smoke">{formatDate(e.at)}{e.actor ? ` · ${tr('by {n}', { n: e.actor })}` : ''}</p>
          </li>
        ))}
      </ol>
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

// ------------------------------------------------------------------------------------ announcements
/** What the team says to every VIP of a programme: a notification now, and a card on their VIP page. */
export function AnnouncementsTab({ programme }) {
  const tr = useT()
  const [list, setList] = useState(null)
  const [missing, setMissing] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [pinned, setPinned] = useState(true)
  const [busy, setBusy] = useState(false)
  // the list itself is a plain table read (RLS decides who may see it)
  const load = useCallback(async () => {
    const { data: rows, error } = await supabase.from('vip_announcements').select('*').eq('programme_id', programme.id)
      .order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(30)
    if (error) { setMissing(/does not exist|schema cache/i.test(error.message)); setList([]) } else setList(rows || [])
  }, [programme.id])
  useEffect(() => { setList(null); load() }, [load])

  async function post() {
    setBusy(true)
    try {
      // A TITLE IS OPTIONAL (3 Oct 2026): "they can just write a simple message that the creators will see." Without
      // one, the notification is headed by the first words of the message.
      const head = title.trim() || body.trim().split(/\n/)[0].slice(0, 80)
      await vipRpc('vip_announce', { p_programme: programme.id, p_title: head, p_body: body, p_pinned: pinned })
      toastSuccess(tr('Posted. Every VIP has been notified.'))
      setTitle(''); setBody('')
      await load()
    } catch (e) { notice(e.message) } finally { setBusy(false) }
  }
  async function pin(a) { try { await vipRpc('vip_set_announcement', { p_id: a.id, p_pinned: !a.pinned }); load() } catch (e) { notice(e.message) } }
  async function remove(a) {
    if (!await confirm(tr('Delete this announcement? It disappears from the VIP page. Notifications already sent stay.'), { confirmLabel: tr('Delete'), danger: true })) return
    try { await vipRpc('vip_set_announcement', { p_id: a.id, p_delete: true }); load() } catch (e) { notice(e.message) }
  }

  if (missing) return <p className="rounded-card border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-smoke">{tr('Announcements are being switched on. Try again in a minute.')}</p>
  return (
    <div className="space-y-6">
      {/* WHAT IT LOOKS LIKE, WHILE YOU TYPE (3 Oct 2026). Ethan: "I don't get why we have content because this should
          just be an announcement in the rooms ... show a preview of how that looks, and whenever I'm typing it in on top
          of the page, I can see how it actually works." One send does three things, and the copy now says so: a
          notification to every VIP, a post in the market's VIP announcements room, and this card at the top of their
          VIP page (pinned ones stay there; the newest three show). */}
      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <section className="rounded-card border border-gray-100 bg-white p-4 shadow-card animate-rise sm:p-5">
          <h2 className="text-[15px] font-bold text-ink">{tr('Tell your VIPs something')}</h2>
          <ul className="mb-4 mt-2 space-y-1.5 text-[13px] text-smoke">
            <li className="flex items-center gap-2"><Icon name="bell" className="h-3.5 w-3.5 shrink-0 text-brand" />{tr('Every VIP in {p} gets a notification', { p: programme.name })}</li>
            <li className="flex items-center gap-2"><Icon name="chat" className="h-3.5 w-3.5 shrink-0 text-brand" />{tr('It is posted in the VIP announcements room')}</li>
            <li className="flex items-center gap-2"><Icon name="star" className="h-3.5 w-3.5 shrink-0 text-brand" />{tr('It sits at the top of their VIP page, as previewed here')}</li>
          </ul>
          <div className="space-y-3">
            <label className="block"><span className="label">{tr('Message')}</span><textarea className="input min-h-[7rem] resize-y" maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} placeholder={tr('Write what every VIP should know.')} /></label>
            <label className="block"><span className="label">{tr('Title (optional)')}</span><input className="input" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tr('For example: New bonus for October')} /></label>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex cursor-pointer items-center gap-2.5 text-sm text-smoke"><Toggle on={pinned} onChange={setPinned} label={tr('Pin it to the top of the VIP page')} />{tr('Pin it to the top of the VIP page')}</label>
              <button type="button" onClick={post} disabled={busy || !body.trim()} className="btn-primary !py-2.5 text-sm">{busy ? <Spinner className="h-4 w-4" /> : <Icon name="megaphone" className="h-4 w-4" />}{tr('Send to every VIP')}</button>
            </div>
          </div>
        </section>
        <section className="animate-rise [animation-delay:80ms] lg:sticky lg:top-24">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400"><Icon name="eye" className="h-3.5 w-3.5 text-brand" />{tr('Live preview: the top of the VIP page')}</p>
          <div className="space-y-3 rounded-card border border-gray-100 bg-cloud/60 p-3 sm:p-4">
            <div aria-hidden className="rounded-card bg-gradient-to-br from-brand to-brand-light px-4 py-3 text-white shadow-card">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/80">{tr('This month so far')}</p>
              <p className="mt-0.5 text-2xl font-bold tabular-nums">{money(0, programme.currency)}</p>
            </div>
            <AnnouncementCard a={{ title: title.trim(), body: body.trim(), pinned }} preview />
            {(list || []).filter((a) => a.pinned).slice(0, pinned ? 1 : 2).map((a) => <div key={a.id} className="opacity-60"><AnnouncementCard a={a} /></div>)}
          </div>
        </section>
      </div>
      <section>
        <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gray-400">{tr('Sent so far')}</h2>
        {list === null ? <Skeleton className="h-24 w-full rounded-card" /> : list.length === 0
          ? <p className="rounded-card border border-dashed border-gray-200 px-6 py-8 text-center text-sm text-smoke">{tr('Nothing sent yet.')}</p>
          : (
            <ul className="space-y-3">
              {list.map((a, i) => (
                <li key={a.id} className="rounded-card border border-gray-100 bg-white p-4 shadow-card animate-rise" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm font-bold text-ink">{a.title}{a.pinned && <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[10px] font-bold uppercase text-brand">{tr('Pinned')}</span>}</p>
                      <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-smoke">{a.body}</p>
                      <p className="mt-2 text-xs text-gray-400">{formatDate(a.created_at)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button type="button" onClick={() => pin(a)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-smoke transition-colors hoverable:hover:bg-cloud hoverable:hover:text-ink">{a.pinned ? tr('Unpin') : tr('Pin')}</button>
                      <button type="button" onClick={() => remove(a)} aria-label={tr('Delete')} className="flex h-8 w-8 items-center justify-center rounded-full text-smoke transition-colors hoverable:hover:bg-red-50 hoverable:hover:text-red-500"><Icon name="trash" className="h-4 w-4" /></button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
      </section>
    </div>
  )
}
