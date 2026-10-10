import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Select, Skeleton, Spinner } from '../ui'
import Icon from '../Icon'
import Segmented from '../network/Segmented'
import FlagStack from '../network/FlagStack'
import { AnnouncementCard } from './mine'
import PhoneFrame from '../admin/PhoneFrame'
import { confirm, notice } from '../../lib/confirm'
import { toastSuccess } from '../../lib/toast'
import { cx, formatDate } from '../../lib/utils'
import { flagFromIso } from '../../lib/flags'
import { monthLabel, vipRpc, useKindT } from '../../lib/vip'

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

// 4 Oct 2026, Ethan: "whenever I say 'tell your VIP something' I don't want it to go to the actual announcements on the room. It should
// just appear on the VIP page and as a notification." So there are two places now, not three, there is no pin (a note is always at the top
// of the page while it lasts), and the audience list shows a flag - the globe for the Worldwide VIP market and a star for EVERY VIP market,
// which are different things: one market, or all of them.
const isWorldwide = (p) => !p?.community?.country_codes?.length
const programmeIcon = (p) => (isWorldwide(p) ? '🌍' : (p.community.country_codes || []).slice(0, 2).map(flagFromIso).join(''))

const DAYS = [
  { value: '0', label: 'Until I remove it' },
  { value: '3', label: '3 days' },
  { value: '7', label: '7 days' },
  { value: '10', label: '10 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
]

export function AnnouncementsTab({ programme, programmes = [], isOwner = false }) {
  const tr = useKindT()
  const [list, setList] = useState(null)
  const [missing, setMissing] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [days, setDays] = useState('10')
  const [audience, setAudience] = useState(programme.id)
  const [view, setView] = useState('page')
  const [busy, setBusy] = useState(false)

  // the market switch above the tools is the first answer; the person can still widen it here
  useEffect(() => { setAudience(programme.id) }, [programme.id])
  const choices = useMemo(() => {
    const mine = programmes.filter((p) => p.can_manage || p.id === programme.id)
    return [
      ...mine.map((p) => (isWorldwide(p)
        ? { value: p.id, icon: programmeIcon(p), label: tr('{n} only', { n: p.name }), hint: tr('Not in another VIP market') }
        : { value: p.id, icon: programmeIcon(p), label: p.name })),
      // The owner, and whoever leads VIP Worldwide, can reach every VIP creator at once.
      ...((isOwner || programmes.some((p) => p.can_manage && isWorldwide(p))) && programmes.length > 1 ? [{ value: '__all', icon: '⭐', label: tr('Every VIP creator'), hint: tr('All VIP markets') }] : []),
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
        p_programme: everywhere ? programme.id : audience, p_title: title.trim() || null, p_body: body, p_pinned: true,
        p_days: Number(days) || null, p_everywhere: everywhere,
      })
      toastSuccess(everywhere ? tr('Posted to every VIP creator.') : tr('Posted. Every VIP in {p} has been told.', { p: target.name }))
      setTitle(''); setBody('')
      await load()
    } catch (e) { notice(e.message) } finally { setBusy(false) }
  }
  async function remove(a) {
    if (!await confirm(tr('Delete this announcement? It disappears from the VIP page. Notifications already sent stay.'), { confirmLabel: tr('Delete'), danger: true })) return
    try { await vipRpc('vip_set_announcement', { p_id: a.id, p_delete: true }); load() } catch (e) { notice(e.message) }
  }

  if (missing) return <p className="rounded-card border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-smoke">{tr('Announcements are being switched on. Try again in a minute.')}</p>
  const draft = { title: title.trim(), body: body.trim(), pinned: true }
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
              <label className="block"><span className="label whitespace-nowrap">{tr('Stays on the VIP page')}</span>
                <Select variant="field" portal value={days} onChange={setDays} ariaLabel={tr('How long it stays on the VIP page')} options={DAYS.map((d) => ({ value: d.value, label: tr(d.label) }))} search={false} />
              </label>
            </div>
            <button type="button" onClick={post} disabled={busy || !body.trim()} className="btn-primary w-full justify-center !py-2.5 text-sm">{busy ? <Spinner className="h-4 w-4" /> : <Icon name="megaphone" className="h-4 w-4" />}{everywhere ? tr('Send to every market') : tr('Send to every VIP')}</button>
            <p className="text-[11px] leading-relaxed text-smoke">{tr('It shows at the top of the VIP page and arrives as a notification. It is not posted in the announcements room.')} {Number(days) > 0 ? tr('It leaves the VIP page by itself after {n} days. The notification stays.', { n: days }) : tr('It stays on the VIP page until you delete it.')}</p>
          </div>
        </section>

        <section className="lg:sticky lg:top-24">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400"><Icon name="eye" className="h-3.5 w-3.5 text-brand" />{tr('Where they will see it')}</p>
            <Segmented size="sm" value={view} onChange={setView} label={tr('Preview')} options={[
              { value: 'page', label: tr('VIP page') }, { value: 'push', label: tr('Notification') },
            ]} />
          </div>
          <div key={view} className="animate-tab-in rounded-card border border-gray-100 bg-cloud/60 p-3 sm:p-4">
            {view === 'page' && <PagePreview programme={target} everywhere={everywhere} draft={draft} existing={(list || []).filter((a) => !isEnded(a)).slice(0, 1)} />}
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
                          {a.everywhere && <span className="rounded-full bg-cloud px-2 py-0.5 text-[10px] font-bold uppercase text-smoke">{tr('Every market')}</span>}
                          <span className="rounded-full bg-cloud px-2 py-0.5 text-[10px] font-bold uppercase text-smoke">{ended ? tr('Ended') : a.expires_at ? tr('Ends {d}', { d: formatDate(a.expires_at) }) : tr('No end date')}</span>
                        </p>
                        <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-smoke">{a.body}</p>
                        <p className="mt-2 text-xs text-gray-400">{formatDate(a.created_at)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
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

/** A VIP's This-month page on a real iPhone, with the note where it really sits: full width, first under the month card. */
function PagePreview({ programme, everywhere, draft, existing }) {
  const tr = useKindT()
  const now = new Date()
  const worldwide = isWorldwide(programme)
  const codes = programme.community?.country_codes
  return (
    <div>
      <PhoneFrame maxH={640}>
        <div aria-hidden className="space-y-3.5">
          <div className="flex items-center justify-between px-0.5 pt-1">
            <span className="text-2xl font-bold tracking-tight text-ink">{tr('VIP')}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-ink shadow-card">
              {everywhere ? <span className="text-[15px] leading-none">⭐</span> : worldwide ? <span className="text-[15px] leading-none">🌍</span> : <FlagStack codes={codes} className="text-[15px]" />}
              {everywhere ? tr('Every VIP market') : programme.name}
            </span>
          </div>
          <div className="brand-drift rounded-card p-4 text-white shadow-card">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/85">{tr('{m} so far', { m: monthLabel(now.getFullYear(), now.getMonth() + 1) })}</p>
            <div className="mt-2.5 h-7 w-32 rounded-lg bg-white/30" />
            <div className="mt-2.5 h-2.5 w-48 rounded bg-white/20" />
            <div className="mt-4 grid grid-cols-3 gap-2">{[0, 1, 2].map((k) => <div key={k} className="h-12 rounded-xl bg-white/15" />)}</div>
          </div>
          <div className="relative">
            <span className="absolute -top-2.5 left-4 z-10 rounded-full bg-ink px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">{tr('Your note')}</span>
            <AnnouncementCard a={draft} preview />
          </div>
          {existing.map((a) => <div key={a.id} className="opacity-50"><AnnouncementCard a={a} /></div>)}
          <div className="flex items-center gap-3 rounded-card bg-white p-4 shadow-card">
            <span className="h-10 w-10 rounded-xl bg-gradient-to-br from-brand to-brand-light" />
            <div className="space-y-1.5"><div className="h-2.5 w-28 rounded bg-gray-200" /><div className="h-2 w-44 rounded bg-gray-100" /></div>
          </div>
        </div>
      </PhoneFrame>
      <p className="mx-auto mt-3 max-w-xs text-center text-[11.5px] leading-relaxed text-smoke">{tr('It is a full-width card at the top of This month, right under the month card and above the video box.')}</p>
    </div>
  )
}

/** The notification as it lands on a locked iPhone: a plain white lock screen, the clock, and the banner iOS draws for it. */
function PushPreview({ draft }) {
  const tr = useKindT()
  const head = draft.title || tr('A note from the team')
  const text = draft.body || tr('Your message appears here.')
  const day = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
  return (
    <div>
      <PhoneFrame bare maxH={640}>
        <div aria-hidden className="relative h-full w-full select-none overflow-hidden bg-white">
          <div className="relative pt-16 text-center text-ink">
            <p className="text-[19px] font-medium text-ink/70">{day}</p>
            <p className="text-[96px] font-semibold leading-none tracking-tight">9:41</p>
          </div>
          <div className="absolute inset-x-3 top-[290px]">
            <div className="rounded-[26px] bg-gray-100/95 p-3.5 shadow-card ring-1 ring-black/5">
              <div className="flex items-start gap-3">
                {/* The app icon, the one on a creator's home screen (not the wide logo, which turns into tiny squares at this size). */}
                <img src="/apple-touch-icon-v4.png" alt="" className="h-10 w-10 shrink-0 rounded-[10px] shadow-sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-[15px] font-semibold text-ink">{head}</p>
                    <p className="shrink-0 text-[13px] text-gray-500">{tr('now')}</p>
                  </div>
                  <p className={cx('mt-0.5 line-clamp-4 text-[15px] leading-snug', draft.body ? 'text-ink/85' : 'text-gray-400')}>{text.slice(0, 140)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </PhoneFrame>
    </div>
  )
}
