import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Avatar, Modal, Skeleton, Spinner } from '../ui'
import VideoThumb from '../VideoThumb'
import Icon from '../Icon'
import { confirm, notice } from '../../lib/confirm'
import { toastSuccess } from '../../lib/toast'
import { cx, formatDate, formatViews } from '../../lib/utils'
import { money, monthLabel, nf, rate, vipRpc } from '../../lib/vip'
import { TargetBar } from './parts'
import { ActivityFeed, AttentionCard, MemberStoryModal, SuggestionsCard, TrendCard } from './adminC'
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
  const cur = programme.currency

  const load = useCallback(async () => {
    try {
      const [o, v] = await Promise.all([
        vipRpc('vip_admin_overview', { p_programme: programme.id }),
        vipRpc('vip_admin_videos', { p_programme: programme.id, p_limit: 60 }),
      ])
      setData(o); setVideos(v); setErr('')
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

      <TrendCard programmeId={programme.id} />

      <div className="grid gap-5 lg:grid-cols-2 [&:empty]:hidden">
        <AttentionCard programme={programme} />
        <SuggestionsCard programme={programme} onPick={setPickProfile} />
      </div>

      {/* THE BOARD, LIVE, AS A BOARD (1 Oct 2026). Ethan: "with the board live, I want you to improve the UI of that."
          It was a seven-column table. Now each VIP is a row with their place, their views as a bar against the
          leader's, what they have earned and are on pace for, their target, and a plain "no videos yet" when that is
          the story - so the people who need a nudge read as such at a glance. */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand/60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-brand" /></span>{tr('The board, live')}</h2>
          <span className="text-xs text-smoke">{tr('{n} VIPs', { n: members.length })}</span>
        </div>
        {members.length === 0 ? (
          <p className="rounded-card border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-smoke">{tr('Nobody is a VIP in this programme yet. Add one from Members, or send a sign-up link.')}</p>
        ) : (
          <ol className="space-y-2.5">
            {members.map((m, i) => {
              const top = Math.max(1, Number(members[0]?.views) || 0)
              const pct = Math.round((Number(m.views) / top) * 100)
              return (
                <li key={m.profile_id} className={cx('rounded-card border bg-white p-3.5 shadow-card animate-fade-up sm:p-4', i === 0 && Number(m.views) > 0 ? 'border-brand/30' : 'border-gray-100', m.status !== 'active' && 'opacity-60')} style={{ animationDelay: `${Math.min(i, 10) * 45}ms` }}>
                  <div className="flex items-center gap-3">
                    <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-extrabold tabular-nums', i === 0 && Number(m.views) > 0 ? 'bg-gradient-to-br from-brand to-brand-light text-white' : 'bg-cloud text-smoke')}>{i + 1}</span>
                    <Link to={`/profile/${m.profile_id}`} className="flex min-w-0 flex-1 items-center gap-2.5 hover:text-brand">
                      <Avatar src={m.photo} name={m.name} size="sm" />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 truncate text-sm font-bold">{m.name}
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
                  {v.error && v.status === 'tracking' && <p className="text-[11px] text-amber-700">{tr('Could not be read: {e}', { e: v.error })}</p>}
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

function EditMemberModal({ m, programme, onClose, onSaved, onMoveBack }) {
  const tr = useT()
  const [cpm, setCpm] = useState(m.cpm ?? '')
  const [cap, setCap] = useState(m.cap ?? '')
  const [tv, setTv] = useState(m.target_videos ?? '')
  const [tw, setTw] = useState(m.target_views ?? '')
  const [status, setStatus] = useState(m.status)
  const [notes, setNotes] = useState(m.notes || '')
  const [review, setReview] = useState(m.rate_review_on || '')
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true)
    try {
      await vipRpc('vip_update_member', {
        p_profile: m.profile_id, p_status: status,
        p_cpm: cpm === '' ? null : Number(cpm), p_clear_cpm: cpm === '',
        p_cap: cap === '' ? null : Number(cap), p_clear_cap: cap === '',
        p_target_videos: tv === '' ? null : Number(tv), p_target_views: tw === '' ? null : Number(tw),
        p_clear_targets: tv === '' && tw === '', p_notes: notes,
      })
      if ((review || '') !== (m.rate_review_on || '')) await vipRpc('vip_set_review_date', { p_profile: m.profile_id, p_date: review || null })
      toastSuccess(tr('Saved'))
      onSaved(); onClose()
    } catch (e) { notice(e.message) } finally { setBusy(false) }
  }
  return (
    <Modal open onClose={onClose} title={m.name}>
      <div className="space-y-4">
        <div>
          <p className="label">{tr('Status')}</p>
          <div className="flex gap-2">
            {[['active', tr('Active')], ['paused', tr('Paused')], ['left', tr('Left')]].map(([k, label]) => (
              <button key={k} type="button" onClick={() => setStatus(k)} aria-pressed={status === k} className={cx('flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200', status === k ? 'bg-brand text-white shadow-card' : 'bg-cloud text-smoke hoverable:hover:text-ink')}>{label}</button>
            ))}
          </div>
          {status !== 'active' && <p className="mt-2 text-xs text-smoke">{status === 'paused' ? tr('Paused: views stop counting and they lose the VIP rooms until you set them back to active.') : tr('Left: they are no longer a VIP. Statements already made stay as they are.')}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="label">{tr('Own rate per 1,000 views')}</span><input className="input" inputMode="decimal" value={cpm} onChange={(e) => setCpm(e.target.value)} placeholder={rate(programme.cpm)} /><span className="mt-1 block text-[11px] text-smoke">{tr('Empty uses the programme rate.')}</span></label>
          <label className="block"><span className="label">{tr('Monthly cap')}</span><input className="input" inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} placeholder={programme.monthly_cap ? String(programme.monthly_cap) : tr('None')} /></label>
          <label className="block"><span className="label">{tr('Target: videos a month')}</span><input className="input" inputMode="numeric" value={tv} onChange={(e) => setTv(e.target.value)} /></label>
          <label className="block"><span className="label">{tr('Target: views a month')}</span><input className="input" inputMode="numeric" value={tw} onChange={(e) => setTw(e.target.value)} /></label>
        </div>
        <label className="block"><span className="label">{tr('Look at this rate again on')}</span><input type="date" className="input" value={review} onChange={(e) => setReview(e.target.value)} /><span className="mt-1 block text-[11px] text-smoke">{tr('A reminder on the Members list when the date comes round. Optional.')}</span></label>
        <label className="block"><span className="label">{tr('Notes (only the team sees these)')}</span><textarea className="input min-h-[4rem] resize-none" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <button type="button" onClick={save} disabled={busy} className="btn-primary w-full justify-center">{busy ? <Spinner className="h-4 w-4" /> : tr('Save')}</button>
        {m.status !== 'left' && onMoveBack && (
          <button type="button" onClick={onMoveBack} className="w-full rounded-xl border border-red-100 px-4 py-2.5 text-sm font-semibold text-red-600 transition-colors hoverable:hover:bg-red-50">{tr('Move back to the community')}</button>
        )}
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
  const [story, setStory] = useState(null)
  const [query, setQuery] = useState('')
  const [show, setShow] = useState('active')
  const cur = programme.currency

  const [reviews, setReviews] = useState({}) // profile id -> the date their own rate is to be looked at again
  const load = useCallback(async () => {
    const [o, r] = await Promise.all([
      vipRpc('vip_admin_overview', { p_programme: programme.id }).catch(() => null),
      supabase.from('vip_members').select('profile_id, rate_review_on').eq('programme_id', programme.id),
    ])
    setData(o)
    setReviews(Object.fromEntries((r.data || []).map((x) => [x.profile_id, x.rate_review_on])))
  }, [programme.id])
  useEffect(() => { setData(null); load() }, [load])

  async function moveBack(m) {
    if (!await confirm(tr('Move {n} back to the community? They see the challenges, points and leaderboard again. Statements already made stay as they are, and they are told.', { n: m.name }), { confirmLabel: tr('Move back'), danger: true })) return
    try { await vipRpc('vip_update_member', { p_profile: m.profile_id, p_status: 'left' }); toastSuccess(tr('{n} is back with the community creators.', { n: m.name })); setStory(null); load() } catch (e) { notice(e.message) }
  }

  const everyone = data?.members || []
  const counts = { active: everyone.filter((m) => m.status === 'active').length, paused: everyone.filter((m) => m.status === 'paused').length, left: everyone.filter((m) => m.status === 'left').length }
  const members = everyone.filter((m) => (show === 'all' || m.status === show) && (!query.trim() || m.name.toLowerCase().includes(query.trim().toLowerCase())))
  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{tr('VIP creators ({n})', { n: everyone.length })}</h2>
          <button type="button" onClick={() => setAdding(true)} className="btn-primary !py-2 text-xs"><Icon name="plus" className="h-3.5 w-3.5" strokeWidth={2.4} />{tr('Add a VIP')}</button>
        </div>
        {everyone.length > 4 && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input className="input !w-56 !py-2 text-sm" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr('Search VIPs')} aria-label={tr('Search VIPs')} />
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
          <ul className="divide-y divide-gray-50 overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
            {members.map((m, i) => (
              <li key={m.profile_id} className="p-4 animate-fade-up" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
                <div className="flex items-center gap-3.5">
                  <Link to={`/profile/${m.profile_id}`} className="shrink-0"><Avatar src={m.photo} name={m.name} size="md" /></Link>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <Link to={`/profile/${m.profile_id}`} className="truncate text-[15px] font-bold text-ink hover:text-brand">{m.name}</Link>
                      {m.status !== 'active' && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase text-smoke">{m.status === 'paused' ? tr('Paused') : tr('Left')}</span>}
                    </p>
                    <p className="text-xs text-smoke">{tr('Joined {d}', { d: formatDate(m.joined_on) })} · {m.source === 'invite' ? tr('by link') : m.source === 'transfer' ? tr('moved from the community') : tr('added by the team')}</p>
                  </div>
                  <div className="shrink-0 text-right"><p className="text-lg font-bold tabular-nums leading-tight text-ink">{nf(m.lifetime_views)}</p><p className="text-[11px] text-smoke">{tr('views in all')}</p></div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                    <span className="rounded-full bg-cloud px-2.5 py-1 text-smoke">{m.cpm ? `${cur} ${rate(m.cpm)}` : tr('Standard rate')}</span>
                    {reviews[m.profile_id] && <span className={cx('rounded-full px-2.5 py-1', new Date(reviews[m.profile_id]) <= new Date() ? 'bg-amber-50 text-amber-700' : 'bg-cloud text-smoke')}>{new Date(reviews[m.profile_id]) <= new Date() ? tr('rate review due') : tr('rate review {d}', { d: formatDate(reviews[m.profile_id]) })}</span>}
                    {m.cap ? <span className="rounded-full bg-cloud px-2.5 py-1 text-smoke">{tr('cap {a}', { a: money(m.cap, cur, { cents: false }) })}</span> : null}
                    {(m.target_videos || m.target_views) ? <span className="rounded-full bg-brand-tint px-2.5 py-1 text-brand">{tr('has a target')}</span> : null}
                    {!m.terms_ok && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">{tr('terms not accepted')}</span>}
                    {!m.payment_ready && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">{tr('no payment details')}</span>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => setStory(m)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-ink transition-colors hoverable:hover:border-brand hoverable:hover:text-brand"><Icon name="clock" className="h-3.5 w-3.5" />{tr('Story')}</button>
                    <button type="button" onClick={() => setEditing(m)} className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white transition-opacity hoverable:hover:opacity-85"><Icon name="pencil" className="h-3.5 w-3.5" />{tr('Edit')}</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <VipLinkCard />

      <AddVipModal open={adding} onClose={() => setAdding(false)} programme={programme} onAdded={load} />
      {editing && <EditMemberModal m={{ ...editing, rate_review_on: reviews[editing.profile_id] || '' }} programme={programme} onClose={() => setEditing(null)} onSaved={load} onMoveBack={() => { const m = editing; setEditing(null); moveBack(m) }} />}
      {story && <MemberStoryModal m={story} programme={programme} onClose={() => setStory(null)} onEdit={() => { setEditing(story); setStory(null) }} onMoveBack={() => moveBack(story)} />}
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
  useEffect(() => {
    let alive = true
    setDone('')
    ;(async () => {
      const { data: prof } = await supabase.from('profiles').select('is_vip').eq('id', creator.id).maybeSingle()
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

  async function moveBack() {
    if (!await confirm(tr('Move {n} back to the community? They see the challenges, points and leaderboard again. Statements already made stay as they are, and they are told.', { n: creator.name }), { confirmLabel: tr('Move back'), danger: true })) return
    try { await vipRpc('vip_update_member', { p_profile: creator.id, p_status: 'left' }); setDone('back'); setIsVip(false); onChanged?.(); toastSuccess(tr('{n} is back with the community creators.', { n: creator.name })) } catch (e) { notice(e.message) }
  }

  if (programmes === null || (!programmes.length && !isVip)) return null
  const here = programmes.find((p) => p.id === member?.programme_id)
  return (
    <div>
      <p className="mb-2 text-[10.5px] font-bold uppercase tracking-wide text-gray-400">{tr('VIP community')}</p>
      {isVip && done !== 'back' ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/25 bg-brand-tint/50 px-3.5 py-3">
          <p className="text-sm font-semibold text-ink"><Icon name="star" className="mr-1.5 inline h-4 w-4 text-brand" />{tr('A VIP')}{here ? ` · ${here.name.replace(/^VIP /, '')}` : ''}</p>
          {member && <button type="button" onClick={moveBack} className="btn-secondary !py-2 text-xs"><Icon name="users" className="h-3.5 w-3.5" />{tr('Move back to the community')}</button>}
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
      {pick && <AddVipModal open onClose={() => setPick(null)} programme={pick} profile={{ id: creator.id, name: creator.name, photo_url: creator.photo_url }} onAdded={() => { setDone('vip'); setIsVip(true); onChanged?.() }} />}
    </div>
  )
}
