import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Avatar, Modal, Skeleton, Spinner, Toggle } from '../ui'
import Segmented from '../network/Segmented'
import VideoThumb from '../VideoThumb'
import FlagStack from '../network/FlagStack'
import Icon from '../Icon'
import { notice, promptText } from '../../lib/confirm'
import { toastSuccess } from '../../lib/toast'
import { cx, formatDate, formatViews } from '../../lib/utils'
import { copyToClipboard, emailList } from '../../lib/clipboard'
import { curSym, money, monthLabel, nf, perK, rate, vipRpc } from '../../lib/vip'
import { TargetBar } from './parts'
import { ActivityFeed, AttentionCard, SuggestionsCard, TrendCard } from './adminC'
import { VipLinkCard } from './adminD'
import { useT } from '../../lib/i18n'

// THE TEAM'S SIDE OF THE VIP PROGRAMME, PART ONE: who is in, and how this month is going (2 Oct 2026).

/** Numbers across the top, in the platform's own card. */
export function Stat({ label, value, hint, tone }) {
  return (
    <div className="rounded-card border border-gray-100 bg-white px-4 py-3.5 shadow-card">
      <p className="text-[10.5px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={cx('mt-1 truncate text-2xl font-bold tabular-nums', tone === 'warn' ? 'text-amber-600' : 'text-brand')}>{value}</p>
      {hint && <p className="mt-0.5 truncate text-[11px] text-smoke">{hint}</p>}
    </div>
  )
}

/** What an unreadable video means, in words the team can act on. */
export function readErrorText(code, tr) {
  switch (code) {
    case 'blocked': return tr('The platform would not show our reader this video. It is tried again on every read. A Facebook video posted from a personal profile never states its views publicly, so type them if you need them counted.')
    case 'removed': return tr('The platform says this video was deleted or made private.')
    case 'not_a_video': return tr('That link is not a video (a photo or text post has no views).')
    case 'no_video_id': return tr('That link does not lead to a video.')
    case 'no_count_in_page': return tr('The post is there but states no view count.')
    default: return tr('Could not be read: {e}', { e: code })
  }
}

/** VIP creators / the Tryp.com team / everyone: the one switch the board and the members list share (9 Oct 2026). */
export function WhoSwitch({ value, onChange, counts }) {
  const tr = useT()
  return (
    <Segmented size="sm" value={value} onChange={onChange} label={tr('Who')} options={[
      { value: 'vip', label: `${tr('VIP creators')} ${counts.vip}` },
      { value: 'team', label: `${tr('Tryp.com team')} ${counts.team}` },
      { value: 'all', label: `${tr('Everyone')} ${counts.all}` },
    ]} />
  )
}

/** The whole month at a glance: who is ahead, what it is costing, and whether that fits the budget. */
export function VipOverviewTab({ programme }) {
  const tr = useT()
  const [data, setData] = useState(null)
  const [videos, setVideos] = useState(null)
  const [err, setErr] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [dq, setDq] = useState(null) // the video being taken out of the count, while its reason is typed
  const [reason, setReason] = useState('')
  const [pickProfile, setPickProfile] = useState(null) // a suggested creator being moved to VIP
  const [teamIds, setTeamIds] = useState(() => new Set()) // migration 365: Tryp.com team creators, counted apart
  const [who, setWho] = useState('vip') // 9 Oct 2026: one board, a switch for VIP creators / the Tryp.com team / everyone
  const cur = programme.currency

  const load = useCallback(async () => {
    try {
      const [o, v, t] = await Promise.all([
        vipRpc('vip_admin_overview', { p_programme: programme.id }),
        vipRpc('vip_admin_videos', { p_programme: programme.id, p_limit: 60 }),
        supabase.from('vip_members').select('profile_id').eq('programme_id', programme.id).eq('is_team', true),
      ])
      setData(o); setVideos(v); setTeamIds(new Set((t.data || []).map((x) => x.profile_id))); setErr('')
    } catch (e) { setErr(e.message) }
  }, [programme.id])
  useEffect(() => { setData(null); load(); const id = setInterval(load, 60000); return () => clearInterval(id) }, [load])

  async function readNow() {
    setSyncing(true)
    try {
      const r = await vipRpc('vip_sync_now', { p_programme: programme.id })
      toastSuccess(r?.fired ? tr('Reading every VIP video now. Numbers update in a minute or two.') : tr('Every video is up to date.'))
      setTimeout(load, 15000)
    } catch (e) { notice(e.message) } finally { setSyncing(false) }
  }

  // A video the platform will not state a count for (a Facebook post from a personal profile is the usual one) can be
  // typed by the team. A later automatic reading that succeeds still wins; a failure leaves the typed number alone.
  async function typeViews(v) {
    const raw = await promptText(tr('How many views does it have right now? Look at the video on {p}.', { p: v.platform || '' }), { title: tr('Type the views'), placeholder: '12000', confirmLabel: tr('Save') })
    if (raw === null) return
    const n = Number(String(raw).replace(/[\s.,]/g, ''))
    if (!Number.isFinite(n) || n < 0) { notice(tr('That is not a number.')); return }
    try { await vipRpc('vip_set_video_views', { p_video: v.id, p_views: n }); toastSuccess(tr('Views saved.')); load() } catch (e) { notice(e.message) }
  }

  async function setStatus(v, status, why = null) {
    try { await vipRpc('vip_set_video_status', { p_video: v.id, p_status: status, p_reason: why }); load() } catch (e) { notice(e.message) }
  }

  if (err) return <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{err}</p>
  if (!data) return <div className="space-y-4"><Skeleton className="h-24 w-full rounded-card" /><Skeleton className="h-64 w-full rounded-card" /></div>

  const { totals, members, month } = data
  const projected = totals.spend_projected
  const budget = totals.budget
  const ratio = budget && projected != null ? projected / budget : budget ? totals.spend_so_far / budget : null
  const active = members.filter((m) => m.status === 'active')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-smoke">{tr('{m}, live. The month closes itself at midnight in {c} time.', { m: monthLabel(month.year, month.month), c: programme.name.replace(/^VIP /, '') })}</p>
        <button type="button" onClick={readNow} disabled={syncing} className="btn-secondary !py-2 text-xs">
          {syncing ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="refresh" className="h-3.5 w-3.5" />}
          {tr('Read every video now')}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={tr('Views counted')} value={formatViews(totals.views)} hint={tr('this month')} />
        <Stat label={tr('Views pay so far')} value={money(totals.spend_so_far, cur, { cents: false })} />
        <Stat label={tr('On pace for')} value={projected != null ? money(projected, cur, { cents: false }) : '-'} hint={budget ? tr('budget {a}', { a: money(budget, cur, { cents: false }) }) : tr('no budget set')} tone={ratio != null && ratio >= 0.8 ? 'warn' : undefined} />
        <Stat label={tr('Active VIPs')} value={String(active.length)} hint={tr('{n} videos posted', { n: members.reduce((a, m) => a + (m.videos || 0), 0) })} />
      </div>

      {budget ? (
        <div className={cx('rounded-card border px-4 py-3.5', ratio >= 1 ? 'border-red-200 bg-red-50/60' : ratio >= 0.8 ? 'border-amber-200 bg-amber-50/70' : 'border-gray-100 bg-white shadow-card')}>
          <TargetBar
            label={tr('Projected spend against this month\'s budget')}
            value={Math.round(projected ?? totals.spend_so_far)}
            target={Number(budget)}
            format={(n) => money(n, cur, { cents: false })}
            done={tr('Over budget on current numbers')}
          />
          {ratio >= 0.8 && <p className="mt-2 text-xs font-semibold text-amber-800">{ratio >= 1 ? tr('On the current pace this month goes over budget.') : tr('On the current pace this month reaches {p}% of the budget.', { p: Math.round(ratio * 100) })}</p>}
        </div>
      ) : null}

      <TrendCard programmeId={programme.id} refreshKey={Number(totals.views) || 0} />

      <div className="grid gap-5 lg:grid-cols-2 [&:empty]:hidden">
        <AttentionCard programme={programme} />
        <SuggestionsCard programme={programme} onPick={setPickProfile} />
      </div>

      {/* ONE BOARD, A SWITCH (9 Oct 2026). Ethan: "I don't want it stacked ... a toggle for team, just general VIP creators,
          or everyone combined." It was two boards stacked (8 Oct, migration 365). Now it is one board and the switch picks
          who is on it; the people are ranked on the view they have chosen, and the numbers above stay the whole programme. */}
      {(() => {
        const vipList = members.filter((m) => !teamIds.has(m.profile_id))
        const teamList = members.filter((m) => teamIds.has(m.profile_id))
        const list = who === 'team' ? teamList : who === 'vip' ? vipList : members
        const title = who === 'team' ? tr('Tryp.com team creators') : who === 'all' ? tr('Everyone, live') : tr('The board, live')
        return (
        // THE BOARD, LIVE, AS A BOARD (1 Oct 2026). Ethan: "with the board live, I want you to improve the UI of that."
        // Each VIP is a row with their place, their views as a bar against the leader's, what they have earned and are on
        // pace for, their target, and a plain "no videos yet" when that is the story.
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand/60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-brand" /></span>{title}</h2>
            <div className="flex flex-wrap items-center gap-3">
              {teamList.length > 0 && <WhoSwitch value={who} onChange={setWho} counts={{ vip: vipList.length, team: teamList.length, all: members.length }} />}
              <span className="text-xs text-smoke">{who === 'vip' ? tr('{n} VIPs', { n: list.length }) : tr('{n} creators · {v} views', { n: list.length, v: formatViews(list.reduce((x, m) => x + (Number(m.views) || 0), 0)) })}</span>
            </div>
          </div>
          {list.length === 0 ? (
            <p className="rounded-card border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-smoke">{tr('Nobody is a VIP in this programme yet. Add one from Members, or send a sign-up link.')}</p>
          ) : (
            <ol className="space-y-2.5">
              {list.map((m, i) => {
                const top = Math.max(1, Number(list[0]?.views) || 0)
                const pct = Math.round((Number(m.views) / top) * 100)
                return (
                  <li key={m.profile_id} className={cx('rounded-card border bg-white p-3.5 shadow-card animate-rise sm:p-4', i === 0 && Number(m.views) > 0 ? 'border-brand/30' : 'border-gray-100', m.status !== 'active' && 'opacity-60')} style={{ animationDelay: `${Math.min(i, 10) * 45}ms` }}>
                    <div className="flex items-center gap-3">
                      <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-extrabold tabular-nums', i === 0 && Number(m.views) > 0 ? 'bg-gradient-to-br from-brand to-brand-light text-white' : 'bg-cloud text-smoke')}>{i + 1}</span>
                      <Link to={`/profile/${m.profile_id}`} className="flex min-w-0 flex-1 items-center gap-2.5 hover:text-brand">
                        <Avatar src={m.photo} name={m.name} size="sm" />
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5 truncate text-sm font-bold">{m.name}
                            {teamIds.has(m.profile_id) && who === 'all' && <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-bold uppercase text-white">{tr('Team')}</span>}
                            {m.status !== 'active' && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase text-smoke">{m.status === 'paused' ? tr('Paused') : tr('Left')}</span>}
                            {!m.payment_ready && <span title={tr('No payment details yet')} className="text-amber-600"><Icon name="wallet" className="h-3.5 w-3.5" /></span>}
                          </span>
                          <span className="block text-[11px] text-smoke">{m.videos > 0 ? (m.videos === 1 ? tr('1 video') : tr('{n} videos', { n: m.videos })) : tr('No videos yet this month')}</span>
                        </span>
                      </Link>
                      <div className="hidden shrink-0 grid-cols-3 gap-5 text-right sm:grid">
                        <div><p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{tr('Views')}</p><p className="text-sm font-bold tabular-nums text-ink">{formatViews(m.views)}</p></div>
                        <div><p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{tr('Earned')}</p><p className="text-sm font-bold tabular-nums text-ink">{money(m.base, cur, { cents: false })}</p></div>
                        <div><p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{tr('On pace')}</p><p className="text-sm font-semibold tabular-nums text-smoke">{m.projected_base != null ? money(m.projected_base, cur, { cents: false }) : '-'}</p></div>
                      </div>
                      <p className="shrink-0 text-sm font-bold tabular-nums text-ink sm:hidden">{formatViews(m.views)}</p>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-cloud"><div className="h-full origin-left rounded-full bg-gradient-to-r from-brand to-brand-light transition-[width] duration-700 ease-out" style={{ width: `${Number(m.views) > 0 ? Math.max(3, pct) : 0}%` }} /></div>
                      {(m.target_videos || m.target_views) ? (
                        <span className="shrink-0 rounded-full bg-cloud px-2.5 py-1 text-[10.5px] font-semibold tabular-nums text-smoke">
                          {m.target_videos ? `${m.videos}/${m.target_videos} ${tr('videos')}` : ''}{m.target_videos && m.target_views ? ' · ' : ''}{m.target_views ? `${formatViews(m.views)}/${formatViews(m.target_views)}` : ''}
                        </span>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </section>
        )
      })()}

      <section>
        <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gray-400">{tr('Videos')}</h2>
        {videos === null ? <Skeleton className="h-40 w-full rounded-card" /> : videos.length === 0 ? (
          <p className="rounded-card border border-dashed border-gray-200 px-6 py-8 text-center text-sm text-smoke">{tr('No videos yet.')}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
            {videos.map((v) => (
              <li key={v.id} className={cx('group flex flex-col overflow-hidden rounded-card border bg-white shadow-card transition-all duration-300 hoverable:hover:-translate-y-1 hoverable:hover:shadow-lift', v.status === 'disqualified' ? 'border-red-100 opacity-75' : 'border-gray-100')}>
                <a href={v.url} target="_blank" rel="noopener noreferrer" aria-label={tr('Open on the platform')} className="relative block">
                  <VideoThumb url={v.url} platform={v.platform} thumbnailUrl={v.thumb} />
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 to-transparent px-3 pb-2.5 pt-8 text-white">
                    <span className="block text-xl font-bold tabular-nums leading-none">{formatViews(v.views_counted)}</span>
                    <span className="block text-[10px] font-semibold uppercase tracking-wide text-white/80">{tr('views this month')}</span>
                  </span>
                  {v.status === 'disqualified' && <span className="absolute left-2 top-2 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">{tr('Not counted')}</span>}
                </a>
                <div className="flex flex-1 flex-col gap-1 p-3">
                  <p className="truncate text-sm font-bold text-ink">{v.name}</p>
                  <p className="text-[11px] text-smoke">{v.platform} · {formatViews(v.views_total)} {tr('in all')}{v.posted_at ? ` · ${formatDate(v.posted_at)}` : ''}</p>
                  {v.status === 'disqualified' && v.reason && <p className="text-[11px] text-red-600">{v.reason}</p>}
                  {v.error && v.status === 'tracking' && (
                    <div className="rounded-lg bg-amber-50 px-2.5 py-2">
                      <p className="text-[11px] leading-snug text-amber-800">{readErrorText(v.error, tr)}</p>
                      <button type="button" onClick={() => typeViews(v)} className="mt-1 text-[11px] font-bold text-brand hover:underline">{tr('Type the views myself')}</button>
                    </div>
                  )}
                  <button type="button" onClick={() => (v.status === 'tracking' ? (setReason(''), setDq(v)) : setStatus(v, 'tracking'))} className="mt-auto self-start rounded-lg px-2 py-1 text-[11px] font-semibold text-smoke transition-colors hoverable:hover:bg-cloud hoverable:hover:text-ink">
                    {v.status === 'tracking' ? tr('Stop counting') : tr('Count it again')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ActivityFeed programme={programme} limit={10} />

      {pickProfile && <AddVipModal open onClose={() => setPickProfile(null)} programme={programme} profile={pickProfile} onAdded={load} />}

      <Modal open={!!dq} onClose={() => setDq(null)} title={tr('Stop counting this video')}>
        <p className="text-sm text-smoke">{tr('Its views stop counting towards the month. The creator can see the reason, so say it kindly.')}</p>
        <textarea autoFocus className="input mt-3 min-h-[5rem] resize-none" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={tr('For example: posted before the month began, or not on their own account')} />
        <button type="button" onClick={() => { setStatus(dq, 'disqualified', reason.trim() || null); setDq(null) }} className="btn-primary mt-4 w-full justify-center">{tr('Stop counting it')}</button>
      </Modal>
    </div>
  )
}

/** Choose a creator and make them a VIP (from Members, or from their own page). */
export function AddVipModal({ open, onClose, programme, profile, onAdded }) {
  const tr = useT()
  const [q, setQ] = useState('')
  const [found, setFound] = useState([])
  const [pick, setPick] = useState(profile || null)
  const [cpm, setCpm] = useState('')
  const [cap, setCap] = useState('')
  const [tv, setTv] = useState('')
  const [tw, setTw] = useState('')
  const [busy, setBusy] = useState(false)
  const [review, setReview] = useState(false) // the second press: nobody is made a VIP by one accidental tap

  useEffect(() => { setPick(profile || null); setReview(false) }, [profile, open])
  useEffect(() => {
    if (!open || pick || q.trim().length < 2) { setFound([]); return undefined }
    let alive = true
    const id = setTimeout(async () => {
      const { data } = await supabase.from('profiles').select('id, name, photo_url, country, is_vip').eq('status', 'active').ilike('name', `%${q.trim()}%`).order('name').limit(8)
      if (alive) setFound(data || [])
    }, 200)
    return () => { alive = false; clearTimeout(id) }
  }, [q, pick, open])

  async function add() {
    setBusy(true)
    try {
      await vipRpc('vip_add_member', {
        p_profile: pick.id, p_programme: programme.id,
        p_cpm: cpm ? Number(cpm) : null, p_cap: cap ? Number(cap) : null,
        p_target_videos: tv ? Number(tv) : null, p_target_views: tw ? Number(tw) : null,
        p_source: profile ? 'transfer' : 'admin',
      })
      toastSuccess(tr('{n} is now a VIP.', { n: pick.name }))
      onAdded?.()
      onClose()
    } catch (e) { notice(e.message) } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title={tr('Make somebody a VIP')}>
      {!pick ? (
        <div>
          <input autoFocus className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Search creators by name')} aria-label={tr('Search creators by name')} />
          <ul className="mt-3 space-y-1">
            {found.map((p) => (
              <li key={p.id}>
                <button type="button" disabled={p.is_vip} onClick={() => setPick(p)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hoverable:hover:bg-cloud disabled:opacity-50">
                  <Avatar src={p.photo_url} name={p.name} size="sm" />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{p.name}</span><span className="block text-xs text-smoke">{p.country}</span></span>
                  {p.is_vip && <span className="text-[11px] font-bold uppercase text-brand">VIP</span>}
                </button>
              </li>
            ))}
            {q.trim().length >= 2 && found.length === 0 && <li className="px-3 py-4 text-center text-sm text-smoke">{tr('Nobody found.')}</li>}
          </ul>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl bg-cloud/70 px-3 py-2.5">
            <Avatar src={pick.photo_url} name={pick.name} size="sm" />
            <span className="min-w-0 flex-1 truncate text-sm font-bold">{pick.name}</span>
            {!profile && <button type="button" onClick={() => setPick(null)} className="text-xs font-semibold text-brand hover:underline">{tr('Change')}</button>}
          </div>
          <p className="text-xs leading-relaxed text-smoke">{tr('They keep everything they have in the community and move to the VIP programme: paid by views, with their own page and rooms, and no challenges. Everything below is optional and can be changed later.')}</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="label">{tr('Own rate per 1,000 views')}</span><input className="input" inputMode="decimal" value={cpm} onChange={(e) => setCpm(e.target.value)} placeholder={rate(programme.cpm)} /></label>
            <label className="block"><span className="label">{tr('Monthly cap')}</span><input className="input" inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} placeholder={programme.monthly_cap ? String(programme.monthly_cap) : tr('None')} /></label>
            <label className="block"><span className="label">{tr('Target: videos a month')}</span><input className="input" inputMode="numeric" value={tv} onChange={(e) => setTv(e.target.value)} placeholder="4" /></label>
            <label className="block"><span className="label">{tr('Target: views a month')}</span><input className="input" inputMode="numeric" value={tw} onChange={(e) => setTw(e.target.value)} placeholder="300000" /></label>
          </div>
          {!review ? (
            <button type="button" onClick={() => setReview(true)} className="btn-primary w-full justify-center">{tr('Continue')}</button>
          ) : (
            <div className="rounded-xl border border-brand/30 bg-brand-tint/60 p-4">
              <p className="text-sm font-bold text-ink">{tr('Make {n} a VIP in {p}?', { n: pick.name, p: programme.name.replace(/^VIP /, '') })}</p>
              <p className="mt-1 text-xs leading-relaxed text-smoke">{tr('They leave the challenges and the leaderboard, and are told. You can move them back at any time.')}</p>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => setReview(false)} disabled={busy} className="btn-secondary flex-1 justify-center !py-2.5 text-sm">{tr('Not yet')}</button>
                <button type="button" onClick={add} disabled={busy} className="btn-primary flex-1 justify-center !py-2.5 text-sm">{busy ? <Spinner className="h-4 w-4" /> : tr('Yes, approve')}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

// WHAT A VIEW COUNT PAYS, the same arithmetic as the database's vip_views_pay: a flat rate of their own wins; otherwise
// the steps (their own, or the market's) apply to the views above each step.
export function payFor(views, baseCpm, tiers, flat) {
  const v = Number(views) || 0
  if (v <= 0) return 0
  if ((flat != null && flat !== '') || !Array.isArray(tiers) || tiers.length === 0) return Math.round((v / 1000) * Number(flat ?? baseCpm) * 100) / 100
  const steps = [{ from: 0, cpm: Number(baseCpm) }, ...tiers.filter((t) => Number(t.from_views) > 0).map((t) => ({ from: Number(t.from_views), cpm: Number(t.cpm) }))]
    .sort((x, y) => x.from - y.from)
  let pay = 0
  steps.forEach((st, i) => {
    const to = steps[i + 1]?.from ?? v
    if (v > st.from) pay += ((Math.min(v, to) - st.from) / 1000) * st.cpm
  })
  return Math.round(pay * 100) / 100
}

// EVERYTHING ABOUT ONE VIP, IN ONE SHEET (2 Oct 2026, migration 311). Ethan: "ensure the function is set up so they can
// set CPM rates per creator etc and a lot of settings to customise for each VIP creator." Grouped the way the team
// thinks about a deal: their place, their pay (own rate, own rate steps, a monthly fee, a cap, whether the market's
// bonuses apply), what they are aiming at, how they appear, and the team's own notes. A live line shows what the
// deal pays at three view counts, so a change is checked before it is saved. One call writes the lot.
function EditMemberModal({ m, programme, onClose, onSaved, onMoveBack }) {
  const tr = useT()
  const cur = programme.currency
  const [f, setF] = useState(() => ({
    status: m.status,
    cpm: m.cpm ?? '',
    tiers: Array.isArray(m.tiers) ? m.tiers.map((t) => ({ from_views: String(t.from_views), cpm: String(t.cpm) })) : [],
    fee: m.monthly_fee ?? '',
    feeMin: m.fee_min_videos ?? '',
    cap: m.cap ?? '',
    bonuses: m.bonuses_on !== false,
    tv: m.target_videos ?? '',
    tw: m.target_views ?? '',
    headline: m.headline || '',
    onMap: m.show_on_map !== false,
    review: m.rate_review_on || '',
    notes: m.notes || '',
  }))
  const set = (patch) => setF((x) => ({ ...x, ...patch }))
  const [busy, setBusy] = useState(false)
  const num = (v) => (v === '' || v == null ? null : Number(String(v).replace(/[^\d.]/g, '')))
  const tiers = f.tiers.filter((t) => num(t.from_views) > 0 && num(t.cpm) != null).map((t) => ({ from_views: num(t.from_views), cpm: num(t.cpm) }))
  const flat = f.cpm !== '' && !tiers.length ? num(f.cpm) : null
  const base = num(f.cpm) ?? programme.cpm
  const ladder = tiers.length ? tiers : (f.cpm === '' ? programme.tiers || [] : [])
  const example = [50000, 250000, 1000000].map((v) => {
    let pay = payFor(v, base, ladder, flat)
    const cap = num(f.cap) ?? programme.monthly_cap
    if (cap != null && pay > cap) pay = cap
    return { v, pay: pay + (num(f.fee) || 0) }
  })

  async function save() {
    setBusy(true)
    try {
      await vipRpc('vip_member_settings', {
        p_profile: m.profile_id,
        p_settings: {
          status: f.status,
          cpm: num(f.cpm),
          tiers,
          monthly_fee: num(f.fee),
          fee_min_videos: num(f.feeMin),
          monthly_cap: num(f.cap),
          bonuses_on: f.bonuses,
          target_videos: num(f.tv),
          target_views: num(f.tw),
          headline: f.headline,
          show_on_map: f.onMap,
          rate_review_on: f.review || null,
          notes: f.notes,
        },
      })
      toastSuccess(tr('Saved'))
      onSaved(); onClose()
    } catch (e) { notice(e.message) } finally { setBusy(false) }
  }

  const section = (icon, title, children, i) => (
    <section className="animate-rise rounded-2xl border border-gray-100 p-4" style={{ animationDelay: `${i * 50}ms` }}>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-brand-light text-white"><Icon name={icon} className="h-4 w-4" /></span>
        {title}
      </h3>
      {children}
    </section>
  )
  const field = (label, value, onChange, opts = {}) => (
    <label className="block">
      <span className="label">{label}</span>
      <input className="input" inputMode={opts.mode || 'decimal'} value={value} onChange={(e) => onChange(e.target.value)} placeholder={opts.placeholder} />
      {opts.hint && <span className="mt-1 block text-[11px] text-smoke">{opts.hint}</span>}
    </label>
  )
  // THE HOUSE SWITCH (3 Oct 2026). Ethan: the toggle "is really weird and it's incorrect". It was a switch built inside
  // this component, so it was a new component on every keystroke and never animated; it is the shared Toggle now.
  const switchRow = (on, onChange, label, hint) => (
    <div className="flex items-center gap-3 rounded-xl bg-cloud/50 px-3.5 py-3">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{label}</span>
        {hint && <span className="block text-[11px] text-smoke">{hint}</span>}
      </span>
      <Toggle on={on} onChange={onChange} label={label} />
    </div>
  )
  const sym = curSym(cur)

  return (
    <Modal open onClose={onClose} title={m.name} wide>
      <div className="space-y-4">
        {section('users', tr('Their place'), (
          <>
            <div className="flex gap-2">
              {[['active', tr('Active')], ['paused', tr('Paused')], ['left', tr('Left')]].map(([k, label]) => (
                <button key={k} type="button" onClick={() => set({ status: k })} aria-pressed={f.status === k} className={cx('flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200', f.status === k ? 'bg-brand text-white shadow-card' : 'bg-cloud text-smoke hoverable:hover:text-ink')}>{label}</button>
              ))}
            </div>
            {f.status !== 'active' && <p className="mt-2 text-xs text-smoke">{f.status === 'paused' ? tr('Paused: views stop counting and they lose the VIP rooms until you set them back to active.') : tr('Left: they are no longer a VIP. Statements already made stay as they are.')}</p>}
          </>
        ), 0)}

        {section('money', tr('Their pay'), (
          <div className="space-y-4">
            {/* EVERY AMOUNT SAYS ITS CURRENCY (3 Oct 2026). Ethan: "Monthly cap is in euros, I assume, right? It should
                maybe make that more clear." And the "monthly fee" is what it is: a bonus paid every month the conditions
                are met. */}
            <div className="grid grid-cols-2 gap-3">
              {field(tr('Own rate per 1,000 views ({c})', { c: sym }), f.cpm, (v) => set({ cpm: v }), { placeholder: rate(programme.cpm), hint: tr('Empty uses the market rate.') })}
              {field(tr('Monthly cap ({c})', { c: sym }), f.cap, (v) => set({ cap: v }), { placeholder: programme.monthly_cap ? String(programme.monthly_cap) : tr('No cap'), hint: tr('The most their views can earn in a month.') })}
              {field(tr('Monthly bonus ({c})', { c: sym }), f.fee, (v) => set({ fee: v }), { placeholder: tr('None'), hint: tr('Paid on top of views, every month they qualify.') })}
              {field(tr('Videos needed for the bonus'), f.feeMin, (v) => set({ feeMin: v }), { mode: 'numeric', placeholder: '0', hint: tr('0 means every month.') })}
            </div>
            <div className="rounded-xl border border-gray-100 p-3.5">
              <div className="mb-1 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-ink">{tr('A higher rate past a number of views')}</span>
                <button type="button" onClick={() => set({ tiers: [...f.tiers, { from_views: '', cpm: '' }] })} className="shrink-0 rounded-full bg-brand-tint px-2.5 py-1 text-xs font-semibold text-brand transition-transform duration-200 hover:scale-105"><Icon name="plus" className="mr-0.5 inline h-3.5 w-3.5" />{tr('Add a step')}</button>
              </div>
              <p className="text-[11px] leading-relaxed text-smoke">{tr('Optional. For example: from 1,000,000 views in a month, pay {r} per 1,000 on the views above that number. The views below it keep the normal rate.', { r: `${sym}0.35` })}</p>
              {f.tiers.length === 0
                ? <p className="mt-2 text-[11px] font-semibold text-ink/70">{programme.tiers?.length ? tr('None of their own: the market\'s steps apply.') : tr('No steps: one rate for every view.')}</p>
                : (
                  <ul className="mt-3 space-y-2">
                    {f.tiers.map((t, i) => (
                      <li key={i} className="flex animate-rise flex-wrap items-center gap-2 rounded-xl bg-cloud/50 px-3 py-2 text-xs text-smoke">
                        <span>{tr('From')}</span>
                        <input className="input !w-32 !py-1.5 text-sm" inputMode="numeric" value={t.from_views} placeholder="1000000" onChange={(e) => set({ tiers: f.tiers.map((x, j) => (j === i ? { ...x, from_views: e.target.value } : x)) })} aria-label={tr('Views in the month')} />
                        <span>{tr('views a month, pay')}</span>
                        <span className="relative"><span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">{sym}</span><input className="input !w-24 !py-1.5 !pl-6 text-sm" inputMode="decimal" value={t.cpm} placeholder="0.35" onChange={(e) => set({ tiers: f.tiers.map((x, j) => (j === i ? { ...x, cpm: e.target.value } : x)) })} aria-label={tr('Rate per 1,000 views')} /></span>
                        <span>{tr('per 1,000')}</span>
                        <button type="button" aria-label={tr('Remove')} onClick={() => set({ tiers: f.tiers.filter((_, j) => j !== i) })} className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-smoke transition-colors hoverable:hover:bg-white hoverable:hover:text-ink"><Icon name="close" className="h-4 w-4" /></button>
                      </li>
                    ))}
                  </ul>
                )}
            </div>
            {switchRow(f.bonuses, (v) => set({ bonuses: v }), tr('Market bonuses apply to them'), tr('Off for a deal that is views pay (and their monthly bonus) only.'))}
            <div className="rounded-xl bg-gradient-to-br from-brand-tint/70 to-white px-3.5 py-3 ring-1 ring-brand/10">
              <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-brand">{tr('What this deal pays in a month')}</p>
              <div className="grid grid-cols-3 gap-2">
                {example.map((x) => (
                  <div key={x.v}><p className="text-[11px] text-smoke">{tr('{n} views', { n: nf(x.v) })}</p><p className="text-sm font-bold tabular-nums text-ink">{money(x.pay, cur)}</p></div>
                ))}
              </div>
            </div>
          </div>
        ), 1)}

        {section('trophy', tr('What they aim at'), (
          <div className="grid grid-cols-2 gap-3">
            {field(tr('Target: videos a month'), f.tv, (v) => set({ tv: v }), { mode: 'numeric' })}
            {field(tr('Target: views a month'), f.tw, (v) => set({ tw: v }), { mode: 'numeric' })}
          </div>
        ), 2)}

        {/* NO HEADLINE TO SET FOR THEM (3 Oct 2026): "I don't get why we would be setting the headline for them." A VIP
            writes their own on their Stats page. */}
        {section('globe', tr('On the VIP map'), switchRow(f.onMap, (v) => set({ onMap: v }), tr('Show them on the VIP map'), tr('Only once they have a town on their profile.')), 3)}

        {section('pencil', tr('For the team'), (
          <div className="space-y-3">
            <label className="block"><span className="label">{tr('Look at this rate again on')}</span><input type="date" className="input" value={f.review} onChange={(e) => set({ review: e.target.value })} /><span className="mt-1 block text-[11px] text-smoke">{tr('Optional. On that day you and the other managers of this market are reminded, and the Members list marks it.')}</span></label>
            <label className="block"><span className="label">{tr('Notes (only the team sees these)')}</span><textarea className="input min-h-[4rem] resize-none" value={f.notes} onChange={(e) => set({ notes: e.target.value })} /></label>
          </div>
        ), 4)}

        <button type="button" onClick={save} disabled={busy} className="btn-primary w-full justify-center">{busy ? <Spinner className="h-4 w-4" /> : tr('Save')}</button>
        {m.status !== 'left' && onMoveBack && (
          <button type="button" onClick={onMoveBack} className="w-full rounded-xl border border-red-100 px-4 py-2.5 text-sm font-semibold text-red-600 transition-colors hoverable:hover:bg-red-50">{tr('Move back to the community')}</button>
        )}
      </div>
    </Modal>
  )
}

// BACK TO THE COMMUNITY, AND WHERE (3 Oct 2026). Ethan: "pressing that, it should show up which place to actually move
// them in like worldwide, Spain, etc. and show the suggested one." The suggestion is their home market if they have one,
// otherwise the market this VIP programme belongs to. Worldwide means no market of its own: they keep the ones they
// were already in.
export function MoveBackModal({ person, programme, onClose, onDone }) {
  const tr = useT()
  const [markets, setMarkets] = useState(null)
  const [suggested, setSuggested] = useState(null)
  const [pick, setPick] = useState(undefined)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let alive = true
    Promise.all([
      supabase.from('communities').select('id, name, country_codes, retired_at').eq('kind', 'chapter').order('name'),
      supabase.from('community_members').select('community_id, is_home').eq('profile_id', person.id),
    ]).then(([c, mine]) => {
      if (!alive) return
      const list = (c.data || []).filter((x) => !x.retired_at)
      const home = (mine.data || []).find((x) => x.is_home)?.community_id
      const sug = list.find((x) => x.id === home)?.id || list.find((x) => x.id === programme?.community_id)?.id || null
      setMarkets(list); setSuggested(sug); setPick(sug)
    })
    return () => { alive = false }
  }, [person.id, programme?.community_id])

  async function go() {
    setBusy(true)
    try {
      await vipRpc('vip_move_back', { p_profile: person.id, p_community: pick || null })
      const where = pick ? markets.find((x) => x.id === pick)?.name : tr('Worldwide')
      toastSuccess(tr('{n} is back with the community creators, in {m}.', { n: person.name, m: where }))
      onDone?.(); onClose()
    } catch (e) { notice(e.message) } finally { setBusy(false) }
  }

  const option = (id, label, flag) => {
    const on = pick === id
    return (
      <button key={id || 'world'} type="button" onClick={() => setPick(id)} aria-pressed={on}
        className={cx('flex w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-all duration-200', on ? 'border-brand bg-brand-tint/60 shadow-card' : 'border-gray-100 bg-white hoverable:hover:border-brand/40')}>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center text-lg">{flag}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{label}</span>
        {id === suggested && <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase text-white">{tr('Suggested')}</span>}
        <span className={cx('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors', on ? 'border-brand bg-brand text-white' : 'border-gray-300')}>{on && <Icon name="check" className="h-3 w-3" strokeWidth={3} />}</span>
      </button>
    )
  }
  return (
    <Modal open onClose={onClose} title={tr('Move {n} back to the community', { n: person.name })}>
      <p className="text-sm text-smoke">{tr('They see the challenges, points and leaderboard again, and are told. Their VIP balance and statements stay theirs. Which market should they join?')}</p>
      {markets === null ? <Skeleton className="mt-4 h-40 w-full rounded-xl" /> : (
        <div className="mt-4 max-h-[50vh] space-y-2 overflow-y-auto pr-1">
          {option(null, tr('Worldwide only'), <Icon name="globe" className="h-5 w-5 text-brand" />)}
          {[...markets].sort((a, b) => Number(b.id === suggested) - Number(a.id === suggested)).map((mk) => option(mk.id, mk.name, <FlagStack codes={mk.country_codes} className="text-lg" />))}
        </div>
      )}
      <div className="mt-5 flex gap-2">
        <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">{tr('Cancel')}</button>
        <button type="button" onClick={go} disabled={busy || pick === undefined} className="btn-primary flex-1 justify-center">{busy ? <Spinner className="h-4 w-4" /> : tr('Move back')}</button>
      </div>
    </Modal>
  )
}

/** Who is in, the sign-up links, and the one-press transfer from the community. */
export function VipMembersTab({ programme }) {
  const tr = useT()
  const [data, setData] = useState(null)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(null)
  const [query, setQuery] = useState('')
  const [show, setShow] = useState('active')
  const [who, setWho] = useState('all') // 9 Oct 2026: VIP creators / the Tryp.com team / everyone, the same switch the board has
  const cur = programme.currency

  const [reviews, setReviews] = useState({}) // profile id -> the date their own rate is to be looked at again
  const [staff, setStaff] = useState(null)
  const [teamBusy, setTeamBusy] = useState(null)
  // EMAILS, ON DEMAND (9 Oct 2026). Ethan: "all the functions that we now need for the VIPs, like under email, to easily
  // copy all the emails." Read only when somebody presses a copy button, so opening this tab costs nothing extra.
  const emailsRef = useRef(null)
  async function addressesFor(list) {
    if (!emailsRef.current) {
      const { data, error } = await supabase.rpc('admin_list_emails')
      if (error) { notice(error.message); return null }
      emailsRef.current = Object.fromEntries((data || []).map((r) => [r.id, r.email]))
    }
    return list.map((m) => emailsRef.current[m.profile_id]).filter(Boolean)
  }
  async function copyEmails(list, oneName) {
    const a = await addressesFor(list)
    if (!a) return
    if (!a.length) { notice(tr('No email addresses found.')); return }
    const ok = await copyToClipboard(emailList(a))
    if (ok) toastSuccess(oneName ? tr('Copied {n}\'s email.', { n: oneName }) : tr('Copied {n} email addresses.', { n: a.length }))
    else notice(tr('Could not copy. Try again.'))
  }
  async function toggleTeam(m) {
    const next = !reviews[m.profile_id]?.is_team
    setTeamBusy(m.profile_id)
    const { error } = await supabase.rpc('vip_set_team', { p_profile: m.profile_id, p_programme: programme.id, p_team: next })
    setTeamBusy(null)
    if (error) { notice(error.message); return }
    setReviews((r) => ({ ...r, [m.profile_id]: { ...(r[m.profile_id] || {}), is_team: next } }))
    toastSuccess(next ? tr('{n} is now a Tryp.com team creator.', { n: m.name }) : tr('{n} is back with the VIP creators.', { n: m.name }))
  }
  const load = useCallback(async () => {
    const [o, r] = await Promise.all([
      vipRpc('vip_admin_overview', { p_programme: programme.id }).catch(() => null),
      // Everything the settings sheet edits that the overview does not carry (migration 311 columns included).
      supabase.from('vip_members').select('profile_id, rate_review_on, tiers, monthly_fee, fee_min_videos, bonuses_on, headline, show_on_map, notes, is_team').eq('programme_id', programme.id),
    ])
    setData(o)
    setReviews(Object.fromEntries((r.data || []).map((x) => [x.profile_id, x])))
    // THE PEOPLE WHO RUN IT (8 Oct 2026, migration 365): "it's not showing correctly who's in the team ... I don't
    // even see Marta". vip_managers is owner-only to read; vip_team_people names them to anybody with VIP access.
    const { data: tp } = await supabase.rpc('vip_team_people')
    const ids = [...new Set((tp || []).filter((x) => x.kind === 'staff' && x.programme_id === programme.id).map((x) => x.profile_id))]
    const { data: pf } = ids.length ? await supabase.from('profiles').select('id, name, photo_url, role_title').in('id', ids) : { data: [] }
    setStaff((pf || []).sort((x, y) => (x.name || '').localeCompare(y.name || '')))
  }, [programme.id])
  useEffect(() => { setData(null); load() }, [load])

  const [moving, setMoving] = useState(null)
  const moveBack = (m) => setMoving(m)

  const everyone = data?.members || []
  const counts = { active: everyone.filter((m) => m.status === 'active').length, paused: everyone.filter((m) => m.status === 'paused').length, left: everyone.filter((m) => m.status === 'left').length }
  const isTeam = (m) => !!reviews[m.profile_id]?.is_team
  const teamCount = everyone.filter(isTeam).length
  const members = everyone.filter((m) => (show === 'all' || m.status === show) && (who === 'all' || (who === 'team') === isTeam(m)) && (!query.trim() || m.name.toLowerCase().includes(query.trim().toLowerCase())))
  return (
    <div className="space-y-8">
      {/* THE SIGN-UP LINK AND ITS NUMBERS COME FIRST (4 Oct 2026). Ethan: "the VIP sign-up link, when I click on Members, should
          always be at the top rather than at the bottom ... the metrics showing 0 signed up ... should also be at the top." */}
      <VipLinkCard />

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{tr('Members ({n})', { n: everyone.length })}</h2>
          <div className="flex items-center gap-2">
            {members.length > 0 && <button type="button" onClick={() => copyEmails(members)} className="btn-secondary !py-2 text-xs"><Icon name="envelope" className="h-3.5 w-3.5" />{tr('Copy emails ({n})', { n: members.length })}</button>}
            <button type="button" onClick={() => setAdding(true)} className="btn-primary !py-2 text-xs"><Icon name="plus" className="h-3.5 w-3.5" strokeWidth={2.4} />{tr('Add a VIP')}</button>
          </div>
        </div>
        {(everyone.length > 4 || teamCount > 0) && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input className="input !w-56 !py-2 text-sm" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr('Search VIPs')} aria-label={tr('Search VIPs')} />
            {teamCount > 0 && <WhoSwitch value={who} onChange={setWho} counts={{ vip: everyone.length - teamCount, team: teamCount, all: everyone.length }} />}
            <div className="inline-flex gap-1 rounded-xl bg-cloud p-1 text-xs font-semibold" role="tablist" aria-label={tr('Show')}>
              {[['active', tr('Active')], ['paused', tr('Paused')], ['left', tr('Left')], ['all', tr('All')]].map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={show === k} onClick={() => setShow(k)} className={cx('rounded-lg px-3 py-1.5 transition-all duration-200', show === k ? 'bg-white text-ink shadow-card' : 'text-smoke hoverable:hover:text-ink')}>{label}{k !== 'all' ? ` ${counts[k]}` : ''}</button>
              ))}
            </div>
          </div>
        )}
        {data === null ? <Skeleton className="h-40 w-full rounded-card" /> : members.length === 0 ? (
          <p className="rounded-card border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-smoke">{everyone.length ? tr('Nobody matches.') : tr('No VIPs yet. Add a creator who is already in the community, or send a sign-up link to somebody new.')}</p>
        ) : (
          <div>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 px-1">
              <h3 className="text-[13px] font-bold text-ink">{who === 'team' ? tr('Tryp.com team creators') : who === 'vip' ? tr('VIP creators') : tr('Everyone')} <span className="font-semibold text-smoke">({members.length})</span></h3>
              <span className="text-xs font-semibold tabular-nums text-smoke">{tr('{v} views in all', { v: nf(members.reduce((n, m) => n + (Number(m.lifetime_views) || 0), 0)) })}</span>
              {who === 'team' && <p className="w-full text-xs text-smoke">{tr('Official Tryp.com creators. Their views are counted here, not with the VIP creators. No admin access.')}</p>}
            </div>
              <ul className="divide-y divide-gray-50 overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
                {members.map((m, i) => (
                  <li key={m.profile_id} className="p-4 animate-rise" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
                    <div className="flex items-center gap-3.5">
                      <Link to={`/profile/${m.profile_id}`} className="shrink-0 rounded-full transition-transform duration-200 hoverable:hover:scale-105" aria-label={tr('Open {n}\'s profile', { n: m.name })}><Avatar src={m.photo} name={m.name} size="md" /></Link>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <Link to={`/profile/${m.profile_id}`} className="truncate text-[15px] font-bold text-ink hover:text-brand">{m.name}</Link>
                          {isTeam(m) && <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-bold uppercase text-white">{tr('Tryp.com team')}</span>}
                          {m.status !== 'active' && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase text-smoke">{m.status === 'paused' ? tr('Paused') : tr('Left')}</span>}
                        </p>
                        <p className="text-xs text-smoke">{tr('Joined {d}', { d: formatDate(m.joined_on) })} · {m.source === 'invite' ? tr('by link') : m.source === 'transfer' ? tr('moved from the community') : tr('added by the team')}</p>
                      </div>
                      <div className="shrink-0 text-right"><p className="text-lg font-bold tabular-nums leading-tight text-ink">{nf(m.lifetime_views)}</p><p className="text-[11px] text-smoke">{tr('views in all')}</p></div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                        <span className="rounded-full bg-cloud px-2.5 py-1 text-smoke">{m.cpm ? tr('{r} per 1,000', { r: perK(m.cpm, cur) }) : tr('Standard rate')}</span>
                        {(reviews[m.profile_id]?.rate_review_on) && <span className={cx('rounded-full px-2.5 py-1', new Date((reviews[m.profile_id]?.rate_review_on)) <= new Date() ? 'bg-amber-50 text-amber-700' : 'bg-cloud text-smoke')}>{new Date((reviews[m.profile_id]?.rate_review_on)) <= new Date() ? tr('rate review due') : tr('rate review {d}', { d: formatDate((reviews[m.profile_id]?.rate_review_on)) })}</span>}
                        {m.cap ? <span className="rounded-full bg-cloud px-2.5 py-1 text-smoke">{tr('cap {a}', { a: money(m.cap, cur, { cents: false }) })}</span> : null}
                        {(m.target_videos || m.target_views) ? <span className="rounded-full bg-brand-tint px-2.5 py-1 text-brand">{tr('has a target')}</span> : null}
                        {!m.terms_ok && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">{tr('terms not accepted')}</span>}
                        {!m.payment_ready && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">{tr('no payment details')}</span>}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button type="button" onClick={() => copyEmails([m], m.name)} title={tr('Copy their email')} aria-label={tr('Copy their email')} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-smoke transition-all hoverable:hover:-translate-y-px hoverable:hover:text-ink"><Icon name="envelope" className="h-3.5 w-3.5" /></button>
                        <Link to={`/profile/${m.profile_id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-smoke transition-all hoverable:hover:-translate-y-px hoverable:hover:text-ink"><Icon name="user" className="h-3.5 w-3.5" />{tr('Profile')}</Link>
                        <Link to={`/vip?mode=as&who=${m.profile_id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-smoke transition-all hoverable:hover:-translate-y-px hoverable:hover:text-ink"><Icon name="star" className="h-3.5 w-3.5" />{tr('VIP page')}</Link>
                        <button type="button" onClick={() => toggleTeam(m)} disabled={teamBusy === m.profile_id} aria-pressed={!!reviews[m.profile_id]?.is_team}
                          title={reviews[m.profile_id]?.is_team ? tr('Move back to the VIP creators') : tr('An official Tryp.com creator. No admin access.')}
                          className={cx('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all hoverable:hover:-translate-y-px disabled:opacity-50', reviews[m.profile_id]?.is_team ? 'bg-ink text-white' : 'border border-gray-200 text-smoke hoverable:hover:text-ink')}>
                          <Icon name={reviews[m.profile_id]?.is_team ? 'check' : 'users'} className="h-3.5 w-3.5" />{reviews[m.profile_id]?.is_team ? tr('Tryp.com team') : tr('Mark as Tryp.com team')}
                        </button>
                        <button type="button" onClick={() => setEditing(m)} className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-brand to-brand-light px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hoverable:hover:-translate-y-px hoverable:hover:shadow-card"><Icon name="pencil" className="h-3.5 w-3.5" />{tr('Edit')}</button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
          </div>
        )}
      </section>

      {/* THE TEAM WITH ACCESS: who runs this VIP community. Added and removed on Setup > Access (owner). */}
      <section>
        <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gray-400">{tr('Tryp.com team with access ({n})', { n: staff?.length ?? 0 })}</h2>
        {staff === null ? <Skeleton className="h-16 w-full rounded-card" /> : staff.length === 0 ? (
          <p className="rounded-card border border-dashed border-gray-200 px-6 py-6 text-center text-sm text-smoke">{tr('Only the owner runs this VIP community for now.')}</p>
        ) : (
          <ul className="flex flex-wrap gap-2.5">
            {staff.map((p, i) => (
              <li key={p.id} className="animate-rise" style={{ animationDelay: `${i * 40}ms` }}>
                <Link to={`/profile/${p.id}`} className="flex items-center gap-2.5 rounded-full border border-gray-100 bg-white py-1.5 pl-1.5 pr-4 shadow-card transition-all duration-200 hoverable:hover:scale-[1.03] hoverable:hover:shadow-lift">
                  <Avatar src={p.photo_url} name={p.name} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-bold text-ink">{p.name}</span>
                    <span className="block truncate text-[11px] text-smoke">{p.role_title || tr('VIP team')}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AddVipModal open={adding} onClose={() => setAdding(false)} programme={programme} onAdded={load} />
      {editing && <EditMemberModal m={{ ...editing, ...(reviews[editing.profile_id] || {}), notes: reviews[editing.profile_id]?.notes ?? editing.notes }} programme={programme} onClose={() => setEditing(null)} onSaved={load} onMoveBack={() => { const m = editing; setEditing(null); moveBack(m) }} />}
      {moving && <MoveBackModal person={{ id: moving.profile_id, name: moving.name }} programme={programme} onClose={() => setMoving(null)} onDone={load} />}
    </div>
  )
}

/** The month picker shared by Close and KPIs. */
export function useMonths(programmeId) {
  const [months, setMonths] = useState(null)
  useEffect(() => {
    let alive = true
    supabase.from('vip_months').select('*').eq('programme_id', programmeId).order('starts_at', { ascending: false }).limit(24)
      .then(({ data }) => { if (alive) setMonths(data || []) })
    return () => { alive = false }
  }, [programmeId])
  return useMemo(() => months, [months])
}

/** In the admin popup (a creator's name, or the Creators list): which VIP community they are in, and the move to or from it. */
export function VipMoveBlock({ creator, onChanged }) {
  const tr = useT()
  const [programmes, setProgrammes] = useState(null)
  const [member, setMember] = useState(null)
  const [pick, setPick] = useState(null)
  const [done, setDone] = useState('')
  const [isVip, setIsVip] = useState(!!creator.is_vip)
  // AN ADMIN IS NOT A VIP CREATOR (2 Oct 2026). Ethan: "whenever I view an admin's profile and click to see the admin
  // tools popup, it shows that I can promote them to join the VIP community as a creator which is obviously wrong." For
  // somebody on the team this block is about VIP TEAM access instead (see VipTeamAccess below).
  const [staff, setStaff] = useState(null)
  useEffect(() => {
    let alive = true
    setDone('')
    ;(async () => {
      const { data: prof } = await supabase.from('profiles').select('is_vip, is_admin, platform_role').eq('id', creator.id).maybeSingle()
      if (prof?.is_admin || prof?.platform_role === 'owner' || prof?.platform_role === 'global_admin') {
        if (alive) setStaff(prof)
        return
      }
      const { data } = await supabase.from('vip_programmes').select('*').eq('active', true).order('name')
      const mine = []
      for (const p of data || []) {
        const { data: ok } = await supabase.rpc('vip_can_manage', { p_programme: p.id })
        if (ok) mine.push(p)
      }
      const { data: row } = prof?.is_vip ? await supabase.from('vip_members').select('programme_id, status').eq('profile_id', creator.id).maybeSingle() : { data: null }
      if (alive) { setIsVip(!!prof?.is_vip); setProgrammes(mine); setMember(row || null) }
    })()
    return () => { alive = false }
  }, [creator.id])

  const [moving, setMoving] = useState(false)

  if (staff) return <VipTeamAccess person={creator} owner={staff.platform_role === 'owner'} />
  if (programmes === null || (!programmes.length && !isVip)) return null
  const here = programmes.find((p) => p.id === member?.programme_id)
  return (
    <div>
      <p className="mb-2 text-[10.5px] font-bold uppercase tracking-wide text-gray-400">{tr('VIP community')}</p>
      {isVip && done !== 'back' ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/25 bg-brand-tint/50 px-3.5 py-3">
          <p className="text-sm font-semibold text-ink"><Icon name="star" className="mr-1.5 inline h-4 w-4 text-brand" />{tr('A VIP')}{here ? ` · ${here.name.replace(/^VIP /, '')}` : ''}</p>
          {member && <button type="button" onClick={() => setMoving(true)} className="btn-secondary !py-2 text-xs"><Icon name="users" className="h-3.5 w-3.5" />{tr('Move back to the community')}</button>}
        </div>
      ) : done === 'vip' ? (
        <p className="rounded-xl bg-green-50 px-3.5 py-3 text-sm font-semibold text-green-700">{tr('Done. They are a VIP now.')}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {programmes.map((p) => (
            <button key={p.id} type="button" onClick={() => setPick(p)} className="btn-secondary !py-2 text-xs">
              <Icon name="star" className="h-3.5 w-3.5" />{programmes.length > 1 ? tr('Move to VIP {p}', { p: p.name.replace(/^VIP /, '') }) : tr('Move to the VIP community')}
            </button>
          ))}
        </div>
      )}
      {moving && <MoveBackModal person={{ id: creator.id, name: creator.name }} programme={here || programmes[0]} onClose={() => setMoving(false)} onDone={() => { setDone('back'); setIsVip(false); onChanged?.() }} />}
      {pick && <AddVipModal open onClose={() => setPick(null)} programme={pick} profile={{ id: creator.id, name: creator.name, photo_url: creator.photo_url }} onAdded={() => { setDone('vip'); setIsVip(true); onChanged?.() }} />}
    </div>
  )
}

// The team-member version of the block: which VIP markets this admin can see and run, and (for the owner, who alone
// decides it) a switch per market. The same write as the Tryp.com team page's "VIP access".
function VipTeamAccess({ person, owner }) {
  const tr = useT()
  const [rows, setRows] = useState(null)
  const [grants, setGrants] = useState([])
  const [canEdit, setCanEdit] = useState(false)
  const [busy, setBusy] = useState('')
  const load = useCallback(async () => {
    const [{ data: progs }, list] = await Promise.all([
      supabase.from('vip_programmes').select('id, name, active').order('name'),
      supabase.rpc('vip_managers_list'),
    ])
    setRows(progs || [])
    setCanEdit(!list.error)
    setGrants((list.data || []).filter((g) => g.profile_id === person.id).map((g) => g.programme_id))
  }, [person.id])
  useEffect(() => { load() }, [load])
  if (rows === null || (!canEdit && !owner)) return null
  async function flip(p) {
    const on = grants.includes(p.id)
    setBusy(p.id)
    const { error } = await supabase.rpc(on ? 'vip_remove_manager' : 'vip_add_manager', { p_profile: person.id, p_programme: p.id })
    setBusy('')
    if (error) { notice(error.message); return }
    toastSuccess(on ? tr('{n} no longer has {p}.', { n: person.name, p: p.name }) : tr('{n} can now see and run {p}.', { n: person.name, p: p.name }))
    load()
  }
  return (
    <div>
      <p className="mb-2 text-[10.5px] font-bold uppercase tracking-wide text-gray-400">{tr('VIP community, as the team')}</p>
      {owner ? (
        <p className="rounded-xl border border-gray-100 bg-cloud/50 px-3.5 py-3 text-sm text-ink"><Icon name="star" className="mr-1.5 inline h-4 w-4 text-brand" />{tr('The programme lead sees every VIP market.')}</p>
      ) : (
        <div className="rounded-xl border border-gray-100 bg-white">
          <p className="px-3.5 pt-3 text-xs text-smoke">{tr('An admin is not a VIP creator. Give them access to a VIP market to see its page, its rooms and its tools.')}</p>
          <ul className="mt-1 divide-y divide-gray-50">
            {rows.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-3.5 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{p.name}</span>
                {busy === p.id ? <Spinner className="h-4 w-4" /> : <Toggle on={grants.includes(p.id)} onChange={() => flip(p)} label={tr('Access to {p}', { p: p.name })} disabled={!canEdit || !!busy} />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
