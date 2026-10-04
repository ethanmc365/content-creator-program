import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Avatar, Select, Skeleton, Spinner, Toggle } from '../ui'
import Icon from '../Icon'
import Segmented from '../network/Segmented'
import FlagStack from '../network/FlagStack'
import { AnnouncementCard } from './mine'
import { confirm, notice } from '../../lib/confirm'
import { toastSuccess } from '../../lib/toast'
import { cx, formatDate } from '../../lib/utils'
import { monthLabel, vipRpc } from '../../lib/vip'
import { useT } from '../../lib/i18n'

// WHAT THE TEAM SAYS TO ITS VIPS (rebuilt 4 Oct 2026).
//
// Ethan, on the Content page: "It says 'From the team' as a title, but they're not showing up under where exactly? It's not
// clear. It shows month 00, but I want it to actually show exactly where that is showing up, like show the actual interface ...
// the title should be first and then the message, rather than the other way around, but the title is optional. There should be
// the option for this to only last there for 10 days or something ... for every VIP, for all the markets, or just in Spain."
//
// So: the title comes first (and may be left out), the message second; it can end by itself after a number of days; it goes to one
// market or, for the owner, to every VIP market; and the preview shows the three places it will actually appear - the top of the
// VIP page, the VIP announcements room, and the notification - drawn as those places, with no invented numbers.

const DAYS = [
  { value: '0', label: 'Until I remove it' },
  { value: '3', label: '3 days' },
  { value: '7', label: '7 days' },
  { value: '10', label: '10 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
]

export function AnnouncementsTab({ programme, programmes = [], isOwner = false }) {
  const tr = useT()
  const { profile } = useAuth()
  const [list, setList] = useState(null)
  const [missing, setMissing] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [pinned, setPinned] = useState(true)
  const [days, setDays] = useState('10')
  const [audience, setAudience] = useState(programme.id)
  const [view, setView] = useState('page')
  const [busy, setBusy] = useState(false)

  // the market switch above the tools is the first answer; the person can still widen it here
  useEffect(() => { setAudience(programme.id) }, [programme.id])
  const choices = useMemo(() => {
    const mine = programmes.filter((p) => p.can_manage || p.id === programme.id)
    return [
      ...mine.map((p) => ({ value: p.id, label: tr('{p} only', { p: p.name }) })),
      ...(isOwner && programmes.length > 1 ? [{ value: '__all', label: tr('Every VIP market') }] : []),
    ]
  }, [programmes, programme.id, isOwner, tr])
  const everywhere = audience === '__all'
  const target = programmes.find((p) => p.id === audience) || programme

  const load = useCallback(async () => {
    const { data: rows, error } = await supabase.from('vip_announcements').select('*').eq('programme_id', programme.id)
      .order('created_at', { ascending: false }).limit(30)
    if (error) { setMissing(/does not exist|schema cache/i.test(error.message)); setList([]) } else setList(rows || [])
  }, [programme.id])
  useEffect(() => { setList(null); load() }, [load])

  async function post() {
    setBusy(true)
    try {
      await vipRpc('vip_announce', {
        p_programme: everywhere ? programme.id : audience, p_title: title.trim() || null, p_body: body, p_pinned: pinned,
        p_days: Number(days) || null, p_everywhere: everywhere,
      })
      toastSuccess(everywhere ? tr('Posted to every VIP market.') : tr('Posted. Every VIP in {p} has been told.', { p: target.name }))
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
  const draft = { title: title.trim(), body: body.trim(), pinned }
  const now = new Date()
  return (
    <div className="space-y-6">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <section className="rounded-card border border-gray-100 bg-white p-4 shadow-card sm:p-5">
          <h2 className="text-[15px] font-bold text-ink">{tr('Tell your VIPs something')}</h2>
          <div className="mt-4 space-y-4">
            <label className="block"><span className="label">{tr('Title (optional)')}</span><input className="input" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tr('For example: New bonus for October')} /></label>
            <label className="block"><span className="label">{tr('Message')}</span><textarea className="input min-h-[7rem] resize-y" maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} placeholder={tr('Write what every VIP should know.')} /></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block"><span className="label">{tr('Who gets it')}</span>
                <Select variant="field" portal value={audience} onChange={setAudience} ariaLabel={tr('Who gets it')} options={choices} search={false} />
              </label>
              <label className="block"><span className="label">{tr('How long it stays on the VIP page')}</span>
                <Select variant="field" portal value={days} onChange={setDays} ariaLabel={tr('How long it stays on the VIP page')} options={DAYS.map((d) => ({ value: d.value, label: tr(d.label) }))} search={false} />
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex cursor-pointer items-center gap-2.5 text-sm text-smoke"><Toggle on={pinned} onChange={setPinned} label={tr('Pin it to the top of the VIP page')} />{tr('Pin it to the top of the VIP page')}</label>
              <button type="button" onClick={post} disabled={busy || !body.trim()} className="btn-primary !py-2.5 text-sm">{busy ? <Spinner className="h-4 w-4" /> : <Icon name="megaphone" className="h-4 w-4" />}{everywhere ? tr('Send to every market') : tr('Send to every VIP')}</button>
            </div>
            <p className="text-[11px] leading-relaxed text-smoke">{Number(days) > 0 ? tr('After {n} days it leaves the VIP page by itself. The room message and the notification stay.', { n: days }) : tr('It stays on the VIP page until you delete it.')}</p>
          </div>
        </section>

        <section className="lg:sticky lg:top-24">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400"><Icon name="eye" className="h-3.5 w-3.5 text-brand" />{tr('Where they will see it')}</p>
            <Segmented size="sm" value={view} onChange={setView} label={tr('Preview')} options={[
              { value: 'page', label: tr('VIP page') }, { value: 'room', label: tr('Room') }, { value: 'push', label: tr('Notification') },
            ]} />
          </div>
          <div key={view} className="animate-tab-in rounded-card border border-gray-100 bg-cloud/60 p-3 sm:p-4">
            {view === 'page' && <PagePreview programme={target} everywhere={everywhere} draft={draft} existing={(list || []).filter((a) => a.pinned && !isEnded(a)).slice(0, pinned ? 1 : 2)} />}
            {view === 'room' && <RoomPreview profile={profile} draft={draft} programme={target} everywhere={everywhere} />}
            {view === 'push' && <PushPreview draft={draft} />}
          </div>
        </section>
      </div>

      <section>
        <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gray-400">{tr('Sent so far')}</h2>
        {list === null ? <Skeleton className="h-24 w-full rounded-card" /> : list.length === 0
          ? <p className="rounded-card border border-dashed border-gray-200 px-6 py-8 text-center text-sm text-smoke">{tr('Nothing sent yet.')}</p>
          : (
            <ul className="space-y-3">
              {list.map((a) => {
                const ended = isEnded(a, now)
                return (
                  <li key={a.id} className={cx('rounded-card border border-gray-100 bg-white p-4 shadow-card', ended && 'opacity-60')}>
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-ink">
                          {a.title || <span className="font-semibold text-gray-400">{tr('No title')}</span>}
                          {a.pinned && !ended && <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[10px] font-bold uppercase text-brand">{tr('Pinned')}</span>}
                          {a.everywhere && <span className="rounded-full bg-cloud px-2 py-0.5 text-[10px] font-bold uppercase text-smoke">{tr('Every market')}</span>}
                          <span className="rounded-full bg-cloud px-2 py-0.5 text-[10px] font-bold uppercase text-smoke">{ended ? tr('Ended') : a.expires_at ? tr('Ends {d}', { d: formatDate(a.expires_at) }) : tr('No end date')}</span>
                        </p>
                        <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-smoke">{a.body}</p>
                        <p className="mt-2 text-xs text-gray-400">{formatDate(a.created_at)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {!ended && <button type="button" onClick={() => pin(a)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-smoke transition-colors hoverable:hover:bg-cloud hoverable:hover:text-ink">{a.pinned ? tr('Unpin') : tr('Pin')}</button>}
                        <button type="button" onClick={() => remove(a)} aria-label={tr('Delete')} className="flex h-8 w-8 items-center justify-center rounded-full text-smoke transition-colors hoverable:hover:bg-red-50 hoverable:hover:text-red-500"><Icon name="trash" className="h-4 w-4" /></button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
      </section>
    </div>
  )
}

const isEnded = (a, now = new Date()) => !!a.expires_at && new Date(a.expires_at) <= now

/** The top of a VIP's page, drawn small: the header, the month card (no numbers, just its shape), the note, the submit box. */
function PagePreview({ programme, everywhere, draft, existing }) {
  const tr = useT()
  const now = new Date()
  const codes = programme.community?.country_codes
  return (
    <div aria-hidden className="space-y-2.5 rounded-2xl bg-white p-3 shadow-card ring-1 ring-gray-100">
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-bold text-ink">{tr('VIP')}</span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-2.5 py-1 text-[10.5px] font-bold text-ink">
          {everywhere ? <Icon name="globe" className="h-3 w-3" /> : <FlagStack codes={codes} className="text-[12px]" />}
          {everywhere ? tr('Every VIP market') : programme.name}
        </span>
      </div>
      <div className="brand-drift rounded-xl p-3 text-white">
        <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-white/85">{tr('{m} so far', { m: monthLabel(now.getFullYear(), now.getMonth() + 1) })}</p>
        <div className="mt-2 h-5 w-24 rounded-md bg-white/30" />
        <div className="mt-2 h-2 w-40 rounded bg-white/20" />
      </div>
      <div className="relative">
        <span className="absolute -top-2 left-3 z-10 rounded-full bg-ink px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">{tr('Your note appears here')}</span>
        <div className="space-y-2 pt-1.5">
          <AnnouncementCard a={draft} preview />
          {existing.map((a) => <div key={a.id} className="opacity-50"><AnnouncementCard a={a} /></div>)}
        </div>
      </div>
      <div className="flex items-center gap-2.5 rounded-xl border border-gray-100 p-2.5">
        <span className="h-7 w-7 rounded-lg bg-gradient-to-br from-brand to-brand-light" />
        <div className="space-y-1"><div className="h-2 w-20 rounded bg-gray-200" /><div className="h-1.5 w-32 rounded bg-gray-100" /></div>
      </div>
    </div>
  )
}

/** The VIP announcements room: the message arrives as a post, title in bold above the body. */
function RoomPreview({ profile, draft, programme, everywhere }) {
  const tr = useT()
  return (
    <div aria-hidden className="overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-gray-100">
      <div className="flex items-center gap-2.5 border-b border-gray-100 px-3.5 py-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-tint text-brand"><Icon name="megaphone" className="h-4 w-4" /></span>
        <div className="min-w-0"><p className="truncate text-[13px] font-bold text-ink">{tr('VIP announcements')}</p><p className="truncate text-[11px] text-smoke">{everywhere ? tr('Every VIP market') : tr('VIP {m}', { m: programme.name })}</p></div>
      </div>
      <div className="space-y-2 bg-cloud/40 px-3.5 py-4">
        <div className="flex items-start gap-2.5">
          <Avatar src={profile?.photo_url} name={profile?.name || 'Team'} size="xs" />
          <div className="min-w-0 max-w-[85%] rounded-2xl rounded-tl-md bg-white px-3.5 py-2.5 shadow-card">
            <p className="text-[11px] font-bold text-brand">{profile?.name?.split(' ')[0] || tr('Team')} <span className="font-medium text-gray-400">· {tr('just now')}</span></p>
            {draft.title && <p className="mt-0.5 break-words text-[13.5px] font-bold text-ink">{draft.title}</p>}
            <p className={cx('mt-0.5 whitespace-pre-line break-words text-[13.5px] leading-snug', draft.body ? 'text-ink' : 'text-gray-300')}>{draft.body || tr('Your message appears here.')}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

/** The phone notification. */
function PushPreview({ draft }) {
  const tr = useT()
  const head = draft.title || tr('A note from the team')
  const text = draft.body || tr('Your message appears here.')
  return (
    <div aria-hidden className="mx-auto max-w-sm rounded-[22px] bg-gradient-to-b from-gray-700 to-gray-900 p-4">
      <p className="mb-3 text-center text-[11px] font-semibold text-white/60">{tr('Lock screen')}</p>
      <div className="flex items-start gap-3 rounded-2xl bg-white/90 p-3 shadow-lift backdrop-blur">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br from-brand to-brand-light text-white"><Icon name="plane" className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2"><p className="truncate text-[13px] font-bold text-ink">{head}</p><p className="shrink-0 text-[11px] text-gray-500">{tr('now')}</p></div>
          <p className={cx('mt-0.5 line-clamp-3 text-[12.5px] leading-snug', draft.body ? 'text-ink/80' : 'text-gray-400')}>{text.slice(0, 140)}</p>
        </div>
      </div>
    </div>
  )
}
