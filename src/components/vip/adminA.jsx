import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Avatar, Modal, Skeleton, Spinner } from '../ui'
import Icon from '../Icon'
import { confirm, notice } from '../../lib/confirm'
import { toastSuccess } from '../../lib/toast'
import { copyToClipboard } from '../../lib/clipboard'
import { cx, formatDate, formatViews } from '../../lib/utils'
import { money, monthLabel, nf, rate, vipJoinUrl, vipRpc } from '../../lib/vip'
import { TargetBar } from './parts'
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

      <section>
        <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gray-400">{tr('The board, live')}</h2>
        {members.length === 0 ? (
          <p className="rounded-card border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-smoke">{tr('Nobody is a VIP in this programme yet. Add one from Members, or send a sign-up link.')}</p>
        ) : (
          <div className="overflow-x-auto rounded-card border border-gray-100 bg-white shadow-card">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-[10.5px] font-bold uppercase tracking-wide text-gray-400">
                  <th className="px-4 py-2.5">#</th><th className="px-2 py-2.5">{tr('Creator')}</th>
                  <th className="px-2 py-2.5 text-right">{tr('Videos')}</th><th className="px-2 py-2.5 text-right">{tr('Views')}</th>
                  <th className="px-2 py-2.5 text-right">{tr('Earned')}</th><th className="px-2 py-2.5 text-right">{tr('On pace')}</th>
                  <th className="px-4 py-2.5">{tr('Target')}</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m, i) => (
                  <tr key={m.profile_id} className={cx('border-b border-gray-50 last:border-0', m.status !== 'active' && 'opacity-60')}>
                    <td className="px-4 py-3 text-xs font-bold tabular-nums text-smoke">{i + 1}</td>
                    <td className="px-2 py-3">
                      <Link to={`/profile/${m.profile_id}`} className="flex items-center gap-2.5 hover:text-brand">
                        <Avatar src={m.photo} name={m.name} size="xs" />
                        <span className="font-semibold">{m.name}</span>
                        {m.status !== 'active' && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase text-smoke">{m.status === 'paused' ? tr('Paused') : tr('Left')}</span>}
                        {!m.payment_ready && <span title={tr('No payment details yet')} className="text-amber-600"><Icon name="wallet" className="h-3.5 w-3.5" /></span>}
                      </Link>
                    </td>
                    <td className="px-2 py-3 text-right tabular-nums">{m.videos}</td>
                    <td className="px-2 py-3 text-right font-semibold tabular-nums">{formatViews(m.views)}</td>
                    <td className="px-2 py-3 text-right tabular-nums">{money(m.base, cur, { cents: false })}</td>
                    <td className="px-2 py-3 text-right tabular-nums text-smoke">{m.projected_base != null ? money(m.projected_base, cur, { cents: false }) : '-'}</td>
                    <td className="px-4 py-3">
                      {m.target_videos || m.target_views ? (
                        <span className="text-xs tabular-nums text-smoke">
                          {m.target_videos ? `${m.videos}/${m.target_videos} ${tr('videos')}` : ''}{m.target_videos && m.target_views ? ' · ' : ''}{m.target_views ? `${formatViews(m.views)}/${formatViews(m.target_views)}` : ''}
                        </span>
                      ) : <span className="text-xs text-gray-300">-</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gray-400">{tr('Videos')}</h2>
        {videos === null ? <Skeleton className="h-40 w-full rounded-card" /> : videos.length === 0 ? (
          <p className="rounded-card border border-dashed border-gray-200 px-6 py-8 text-center text-sm text-smoke">{tr('No videos yet.')}</p>
        ) : (
          <ul className="divide-y divide-gray-50 overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
            {videos.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{v.name} <span className="font-normal text-smoke">· {v.platform}</span></p>
                  <a href={v.url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-brand hover:underline">{v.url}</a>
                  {v.status === 'disqualified' && <p className="text-xs text-red-600">{tr('Not counting')}{v.reason ? `: ${v.reason}` : ''}</p>}
                  {v.error && v.status === 'tracking' && <p className="text-xs text-amber-700">{tr('Could not be read: {e}', { e: v.error })}</p>}
                </div>
                <p className="text-right text-xs tabular-nums text-smoke"><span className="text-sm font-bold text-ink">{formatViews(v.views_counted)}</span> {tr('this month')} · {formatViews(v.views_total)} {tr('in all')}</p>
                <button type="button" onClick={() => (v.status === 'tracking' ? (setReason(''), setDq(v)) : setStatus(v, 'tracking'))} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-smoke transition-colors hoverable:hover:bg-cloud hoverable:hover:text-ink">
                  {v.status === 'tracking' ? tr('Stop counting') : tr('Count it again')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

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

  useEffect(() => { setPick(profile || null) }, [profile, open])
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
          <button type="button" onClick={add} disabled={busy} className="btn-primary w-full justify-center">{busy ? <Spinner className="h-4 w-4" /> : tr('Make them a VIP')}</button>
        </div>
      )}
    </Modal>
  )
}

function EditMemberModal({ m, programme, onClose, onSaved }) {
  const tr = useT()
  const [cpm, setCpm] = useState(m.cpm ?? '')
  const [cap, setCap] = useState(m.cap ?? '')
  const [tv, setTv] = useState(m.target_videos ?? '')
  const [tw, setTw] = useState(m.target_views ?? '')
  const [status, setStatus] = useState(m.status)
  const [notes, setNotes] = useState(m.notes || '')
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
        <label className="block"><span className="label">{tr('Notes (only the team sees these)')}</span><textarea className="input min-h-[4rem] resize-none" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <button type="button" onClick={save} disabled={busy} className="btn-primary w-full justify-center">{busy ? <Spinner className="h-4 w-4" /> : tr('Save')}</button>
      </div>
    </Modal>
  )
}

/** Who is in, the sign-up links, and the one-press transfer from the community. */
export function VipMembersTab({ programme }) {
  const tr = useT()
  const [data, setData] = useState(null)
  const [invites, setInvites] = useState(null)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(null)
  const [label, setLabel] = useState('')
  const [maxUses, setMaxUses] = useState('')
  const [making, setMaking] = useState(false)
  const cur = programme.currency

  const load = useCallback(async () => {
    const [o, inv] = await Promise.all([
      vipRpc('vip_admin_overview', { p_programme: programme.id }).catch(() => null),
      supabase.from('vip_invites').select('*').eq('programme_id', programme.id).order('created_at', { ascending: false }),
    ])
    setData(o); setInvites(inv.data || [])
  }, [programme.id])
  useEffect(() => { setData(null); load() }, [load])

  async function makeLink() {
    setMaking(true)
    try {
      const token = await vipRpc('vip_create_invite', { p_programme: programme.id, p_label: label || null, p_max_uses: maxUses ? Number(maxUses) : null, p_days: null })
      await copyToClipboard(vipJoinUrl(token))
      toastSuccess(tr('Link made and copied. Send it to the creator.'))
      setLabel(''); setMaxUses('')
      load()
    } catch (e) { notice(e.message) } finally { setMaking(false) }
  }
  async function revoke(i) {
    if (!await confirm(tr('Stop this link working? People who already joined through it stay VIPs.'), { confirmLabel: tr('Stop it'), danger: true })) return
    await vipRpc('vip_revoke_invite', { p_id: i.id }); load()
  }
  async function removeMember(m) {
    if (!await confirm(tr('Take {n} out of the VIP programme? Their past statements stay.', { n: m.name }), { confirmLabel: tr('Take out'), danger: true })) return
    await vipRpc('vip_update_member', { p_profile: m.profile_id, p_status: 'left' }); load()
  }

  const members = data?.members || []
  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{tr('VIP creators ({n})', { n: members.length })}</h2>
          <button type="button" onClick={() => setAdding(true)} className="btn-primary !py-2 text-xs"><Icon name="plus" className="h-3.5 w-3.5" strokeWidth={2.4} />{tr('Add a VIP')}</button>
        </div>
        {data === null ? <Skeleton className="h-40 w-full rounded-card" /> : members.length === 0 ? (
          <p className="rounded-card border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-smoke">{tr('No VIPs yet. Add a creator who is already in the community, or send a sign-up link to somebody new.')}</p>
        ) : (
          <ul className="divide-y divide-gray-50 overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
            {members.map((m) => (
              <li key={m.profile_id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
                <Link to={`/profile/${m.profile_id}`} className="flex min-w-0 flex-1 items-center gap-3 hover:text-brand">
                  <Avatar src={m.photo} name={m.name} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">{m.name}</span>
                    <span className="block text-xs text-smoke">{tr('Joined {d}', { d: formatDate(m.joined_on) })} · {m.source === 'invite' ? tr('by link') : m.source === 'transfer' ? tr('moved from the community') : tr('added by the team')}</span>
                  </span>
                </Link>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                  {m.status !== 'active' && <span className="rounded-full bg-gray-100 px-2.5 py-1 uppercase text-smoke">{m.status === 'paused' ? tr('Paused') : tr('Left')}</span>}
                  <span className="rounded-full bg-cloud px-2.5 py-1 text-smoke">{m.cpm ? `${cur} ${rate(m.cpm)}` : tr('Standard rate')}</span>
                  {m.cap ? <span className="rounded-full bg-cloud px-2.5 py-1 text-smoke">{tr('cap {a}', { a: money(m.cap, cur, { cents: false }) })}</span> : null}
                  {(m.target_videos || m.target_views) ? <span className="rounded-full bg-brand-tint px-2.5 py-1 text-brand">{tr('has a target')}</span> : null}
                  {!m.terms_ok && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">{tr('terms not accepted')}</span>}
                  {!m.payment_ready && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">{tr('no payment details')}</span>}
                </div>
                <div className="text-right text-xs tabular-nums text-smoke"><span className="block text-sm font-bold text-ink">{nf(m.lifetime_views)}</span>{tr('views in all')}</div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => setEditing(m)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-smoke transition-colors hoverable:hover:bg-cloud hoverable:hover:text-ink">{tr('Edit')}</button>
                  <button type="button" onClick={() => removeMember(m)} aria-label={tr('Take out')} title={tr('Take out')} className="flex h-8 w-8 items-center justify-center rounded-full text-smoke transition-colors hoverable:hover:bg-red-50 hoverable:hover:text-red-500"><Icon name="trash" className="h-4 w-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">{tr('Sign-up links')}</h2>
        <p className="mb-3 text-sm text-smoke">{tr('A link for recruiting a creator straight into the VIP programme. It opens the usual sign-up, says they are joining the VIP creators, and makes them a VIP as they finish.')}</p>
        <div className="rounded-card border border-gray-100 bg-white p-4 shadow-card">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block min-w-[12rem] flex-1"><span className="label">{tr('Who is it for? (a note to yourself)')}</span><input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={tr('For example: Lucia, from the WhatsApp group')} /></label>
            <label className="block w-28"><span className="label">{tr('Uses')}</span><input className="input" inputMode="numeric" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder={tr('Any')} /></label>
            <button type="button" onClick={makeLink} disabled={making} className="btn-primary !py-2.5 text-sm">{making ? <Spinner className="h-4 w-4" /> : <Icon name="link" className="h-4 w-4" />}{tr('Make a link')}</button>
          </div>
          {invites && invites.length > 0 && (
            <ul className="mt-4 divide-y divide-gray-50 border-t border-gray-100">
              {invites.map((i) => {
                const dead = i.revoked_at || (i.max_uses && i.uses >= i.max_uses) || (i.expires_at && new Date(i.expires_at) < new Date())
                return (
                  <li key={i.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{i.label || tr('VIP link')}</p>
                      <p className="text-xs text-smoke">{tr('Made {d}', { d: formatDate(i.created_at) })} · {tr('{n} joined', { n: i.uses })}{i.max_uses ? ` / ${i.max_uses}` : ''}{dead ? ` · ${tr('not working')}` : ''}</p>
                    </div>
                    {!dead && (
                      <>
                        <button type="button" onClick={async () => { await copyToClipboard(vipJoinUrl(i.token)); toastSuccess(tr('Copied')) }} className="btn-secondary !px-3 !py-1.5 text-xs"><Icon name="copy" className="h-3.5 w-3.5" />{tr('Copy link')}</button>
                        <button type="button" onClick={() => revoke(i)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-smoke transition-colors hoverable:hover:bg-red-50 hoverable:hover:text-red-500">{tr('Stop it')}</button>
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

      <AddVipModal open={adding} onClose={() => setAdding(false)} programme={programme} onAdded={load} />
      {editing && <EditMemberModal m={editing} programme={programme} onClose={() => setEditing(null)} onSaved={load} />}
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

/** On a creator's own page, for the team: one press to make them a VIP (or a line saying they are). */
export function MakeVipButton({ creator }) {
  const tr = useT()
  const [programmes, setProgrammes] = useState(null)
  const [pick, setPick] = useState(null)
  const [done, setDone] = useState(false)
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data } = await supabase.from('vip_programmes').select('*').eq('active', true).order('name')
      const mine = []
      for (const p of data || []) {
        const { data: ok } = await supabase.rpc('vip_can_manage', { p_programme: p.id })
        if (ok) mine.push(p)
      }
      if (alive) setProgrammes(mine)
    })()
    return () => { alive = false }
  }, [])
  if (!programmes?.length || creator.is_vip || done) {
    return creator.is_vip || done ? null : null
  }
  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2">
        {programmes.map((p) => (
          <button key={p.id} type="button" onClick={() => setPick(p)} className="btn-secondary !py-2 text-xs">
            <Icon name="star" className="h-3.5 w-3.5" />{programmes.length > 1 ? tr('Make a VIP in {p}', { p: p.name.replace(/^VIP /, '') }) : tr('Make a VIP')}
          </button>
        ))}
      </div>
      {pick && <AddVipModal open onClose={() => setPick(null)} programme={pick} profile={{ id: creator.id, name: creator.name, photo_url: creator.photo_url }} onAdded={() => setDone(true)} />}
    </>
  )
}
