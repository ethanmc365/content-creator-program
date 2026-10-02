import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Avatar, Modal, Select, Skeleton, Spinner } from '../ui'
import Icon from '../Icon'
import Segmented from '../network/Segmented'
import { MarketStandings, VipMap } from './v3'
import { confirm, notice } from '../../lib/confirm'
import { copyToClipboard } from '../../lib/clipboard'
import { toastSuccess } from '../../lib/toast'
import { cx, formatDate } from '../../lib/utils'
import { BRIEF_METRICS, PERK_KINDS, PERK_METRICS, monthLabel, nf, prizesByPlace, unitLabel, useOptionalRpc, vipJoinLink, vipRpc } from '../../lib/vip'
import { useT } from '../../lib/i18n'

// THE TEAM'S SIDE OF THE VIP PROGRAMME, PART FOUR (30 Sep 2026, migration 299): every market side by side, the one
// sign-up link and what happens to the people who use it, monthly challenges, perks and trips, and the guides.
//
// Who may change what is the database's call (`vip_scope_ok`): a market lead changes their own market's content, only
// the owner changes what goes to every market. These screens hide the buttons a person could not use rather than
// letting them press one and be told no.

const empty = (text) => <p className="rounded-card border border-dashed border-gray-200 px-6 py-8 text-center text-sm text-smoke">{text}</p>

// ------------------------------------------------------------------------------------ the one link
/** The single sign-up link for every VIP, how many have used it, and where the people who did are in the process. */
export function VipLinkCard() {
  const tr = useT()
  const [link, setLink] = useState(undefined)
  const { data: funnel } = useOptionalRpc('vip_funnel', {}, 'funnel')
  const load = useCallback(async () => { try { setLink(await vipRpc('vip_global_link')) } catch { setLink(null) } }, [])
  useEffect(() => { load() }, [load])

  const url = link ? vipJoinLink(link.token) : ''
  return (
    <section className="space-y-4">
      <div className="brand-drift relative overflow-hidden rounded-card p-5 text-white shadow-card sm:p-6">
        <span aria-hidden className="survey-orb pointer-events-none absolute -right-10 -top-14 h-44 w-44 rounded-full bg-white/15 blur-2xl" />
        {/* No paragraph about the link (1 Oct 2026): "remove the copy that says 'One link for every VIP in every
            market, and it never expires.' No need to see all that." */}
        <h2 className="relative mb-4 text-[17px] font-bold">{tr('The VIP sign-up link')}</h2>
        {link === undefined ? <Skeleton className="h-11 w-full rounded-xl" /> : link === null ? (
          <p className="relative text-sm text-white/90">{tr('The link could not be made.')}</p>
        ) : (
          <div className="relative flex flex-wrap items-center gap-2.5">
            <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label={tr('The VIP sign-up link')} className="min-w-0 flex-1 rounded-xl border-0 bg-white/95 px-3.5 py-2.5 text-sm font-medium text-ink shadow-sm outline-none focus:ring-2 focus:ring-white/60" />
            <button type="button" onClick={async () => { await copyToClipboard(url); toastSuccess(tr('Copied')) }} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-brand shadow-sm transition-transform hoverable:hover:-translate-y-0.5"><Icon name="copy" className="h-4 w-4" />{tr('Copy')}</button>
            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-white/20 px-4 py-2.5 text-sm font-bold text-white ring-1 ring-white/40 transition-transform hoverable:hover:-translate-y-0.5"><Icon name="eye" className="h-4 w-4" />{tr('Open')}</a>
          </div>
        )}
      </div>
      {funnel && (
        <div className="rounded-card border border-gray-100 bg-white p-4 shadow-card sm:p-5">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[[tr('Signed up'), funnel.joined], [tr('Not finished'), funnel.unfinished], [tr('Waiting for you'), funnel.pending], [tr('Approved'), funnel.active]].map(([label, n]) => (
              <div key={label} className="rounded-xl bg-cloud px-3.5 py-3"><dd className="text-xl font-bold tabular-nums text-ink">{nf(n)}</dd><dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</dt></div>
            ))}
          </dl>
          {funnel.people?.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{tr('VIPs waiting to be approved')}</p>
                <Link to="/admin/applications" className="text-xs font-semibold text-brand hover:underline">{tr('Open the applications')}</Link>
              </div>
              <ul className="divide-y divide-gray-50 overflow-hidden rounded-xl border border-gray-100">
                {funnel.people.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-3.5 py-2.5">
                    <Avatar src={p.photo} name={p.name} size="sm" />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{p.name}</span><span className="block truncate text-xs text-smoke">{[p.city, p.country].filter(Boolean).join(', ') || tr('No location yet')} · {p.onboarded ? tr('applied {d}', { d: formatDate(p.applied_at) }) : tr('has not finished signing up')}</span></span>
                    <span className="shrink-0 rounded-full bg-brand-tint px-2.5 py-1 text-[10px] font-bold uppercase text-brand">{p.programme}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ------------------------------------------------------------------------------------ markets
/** How every market is doing, for everybody with access, and every VIP on one map. */
export function VipMarketsTab({ programme, isOwner, onChanged }) {
  const tr = useT()
  const [programmes, setProgrammes] = useState([])
  useEffect(() => {
    supabase.from('vip_programmes').select('id, name, is_default, active').eq('active', true).order('name').then(({ data }) => setProgrammes(data || []))
  }, [programme.id])
  async function makeDefault(id) {
    try { await vipRpc('vip_set_default_programme', { p_programme: id }); toastSuccess(tr('Saved')); onChanged?.() ; const { data } = await supabase.from('vip_programmes').select('id, name, is_default, active').eq('active', true).order('name'); setProgrammes(data || []) } catch (e) { notice(e.message) }
  }
  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">{tr('Market standings')}</h2>
        <p className="mb-3 text-sm text-smoke">{tr('Every VIP market this month. You can see all of them; you can only change your own.')}</p>
        <MarketStandings />
      </section>
      <section>
        <h2 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">{tr('Every VIP creator')}</h2>
        <p className="mb-3 text-sm text-smoke">{tr('Only creators who chose to be on the map.')}</p>
        <VipMap />
      </section>
      {isOwner && programmes.length > 1 && (
        <section>
          <h2 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">{tr('Where new VIPs start')}</h2>
          <p className="mb-3 text-sm text-smoke">{tr('A VIP who signs up with the link starts here, until they are approved into a market. Then they move to that market\'s programme on their own.')}</p>
          <div className="flex flex-wrap gap-1.5">
            {programmes.map((p) => <button key={p.id} type="button" aria-pressed={p.is_default} onClick={() => !p.is_default && makeDefault(p.id)} className={cx('rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors', p.is_default ? 'bg-brand text-white' : 'bg-cloud text-smoke hoverable:hover:text-ink')}>{p.name}{p.is_default ? ` · ${tr('default')}` : ''}</button>)}
          </div>
        </section>
      )}
    </div>
  )
}

// ------------------------------------------------------------------------------------ content
const PARTS = ['briefs', 'perks', 'guides']

/** Monthly challenges, perks and trips, and guides, in one place. */
export function VipContentTab({ programme, isOwner, part, onPart }) {
  const tr = useT()
  const p = PARTS.includes(part) ? part : 'briefs'
  const canManage = !!programme.can_manage
  return (
    <div className="space-y-5">
      <Segmented value={p} onChange={onPart} label={tr('Content')}
        options={[{ value: 'briefs', label: tr('Monthly challenges') }, { value: 'perks', label: tr('Perks and trips') }, { value: 'guides', label: tr('Guides') }]} />
      {!canManage && <p className="rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{tr('You can see this market\'s content. Only its own lead, or the owner, can change it.')}</p>}
      <div key={`${programme.id}:${p}`} className="animate-fade-up">
        {p === 'briefs' && <BriefsEditor programme={programme} isOwner={isOwner} canManage={canManage} />}
        {p === 'perks' && <PerksEditor programme={programme} isOwner={isOwner} canManage={canManage} />}
        {p === 'guides' && <GuidesEditor programme={programme} isOwner={isOwner} canManage={canManage} />}
      </div>
    </div>
  )
}

function useScoped(table, programme, order) {
  const [rows, setRows] = useState(null)
  const load = useCallback(async () => {
    let q = supabase.from(table).select('*').or(`programme_id.is.null,programme_id.eq.${programme.id}`)
    for (const [col, asc] of order) q = q.order(col, { ascending: asc })
    const { data } = await q
    setRows(data || [])
  }, [table, programme.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setRows(null); load() }, [load])
  return [rows, load]
}

function ScopeField({ value, onChange, programme, isOwner, disabled }) {
  const tr = useT()
  return (
    <label className="block">
      <span className="label">{tr('Who it is for')}</span>
      <Select variant="field" portal value={value} disabled={disabled} onChange={onChange} ariaLabel={tr('Who it is for')}
        options={[{ value: programme.id, label: tr('{p} only', { p: programme.name }) }, ...((isOwner || value === '') ? [{ value: '', label: tr('Every market') }] : [])]} />
    </label>
  )
}

const scopeId = (v) => (v === '' ? null : v)
const ownerLocked = (row, isOwner, canManage) => (row.programme_id == null ? !isOwner : !canManage)

function ScopeTag({ row }) {
  const tr = useT()
  return <span className={cx('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase', row.programme_id == null ? 'bg-brand-tint text-brand' : 'bg-cloud text-smoke')}>{row.programme_id == null ? tr('Every market') : tr('This market')}</span>
}

// ---- monthly challenges
function BriefsEditor({ programme, isOwner, canManage }) {
  const tr = useT()
  const [rows, load] = useScoped('vip_briefs', programme, [['year', false], ['month', false]])
  const [edit, setEdit] = useState(null)
  async function remove(b) {
    if (!await confirm(tr('Delete this challenge?'), { confirmLabel: tr('Delete'), danger: true })) return
    try { await vipRpc('vip_delete_brief', { p_id: b.id }); load() } catch (e) { notice(e.message) }
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-smoke">{tr('A theme, a brief, hook ideas and a goal for each month. Every VIP in scope is told, sees it at the top of their month, and gets live standings.')}</p>
        {canManage && <button type="button" onClick={() => setEdit({})} className="btn-primary !py-2 text-xs"><Icon name="plus" className="h-3.5 w-3.5" strokeWidth={2.4} />{tr('New challenge')}</button>}
      </div>
      {rows === null ? <Skeleton className="h-32 w-full rounded-card" /> : rows.length === 0 ? empty(tr('No monthly challenges yet.')) : (
        <ul className="space-y-3">
          {rows.map((b, i) => (
            <li key={b.id} className="rounded-card border border-gray-100 bg-white p-4 shadow-card animate-fade-up" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">{monthLabel(b.year, b.month)}<ScopeTag row={b} />{b.theme && <span className="rounded-full bg-cloud px-2 py-0.5 text-[10px] text-smoke">{b.theme}</span>}</p>
                  <h3 className="mt-1 text-[15px] font-bold text-ink">{b.title}</h3>
                  <p className="mt-1 text-xs text-smoke">{tr((BRIEF_METRICS.find((m) => m.key === b.metric) || BRIEF_METRICS[0]).label)}{b.target ? ` · ${tr('goal {n}', { n: nf(b.target) })}` : ''}{b.hooks?.length ? ` · ${tr('{n} hook ideas', { n: b.hooks.length })}` : ''}</p>
                </div>
                {!ownerLocked(b, isOwner, canManage) && (
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button type="button" onClick={() => setEdit(b)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-smoke hoverable:hover:bg-cloud hoverable:hover:text-ink">{tr('Edit')}</button>
                    <button type="button" onClick={() => remove(b)} aria-label={tr('Delete')} className="flex h-8 w-8 items-center justify-center rounded-full text-smoke hoverable:hover:bg-red-50 hoverable:hover:text-red-500"><Icon name="trash" className="h-4 w-4" /></button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {edit && <BriefForm programme={programme} isOwner={isOwner} brief={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />}
    </div>
  )
}

function BriefForm({ programme, isOwner, brief, onClose, onSaved }) {
  const tr = useT()
  const now = new Date()
  const [scope, setScope] = useState(brief.id ? (brief.programme_id || '') : programme.id)
  const [ym, setYm] = useState(brief.id ? `${brief.year}-${String(brief.month).padStart(2, '0')}` : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  const [title, setTitle] = useState(brief.title || '')
  const [theme, setTheme] = useState(brief.theme || '')
  const [body, setBody] = useState(brief.body || '')
  const [hooks, setHooks] = useState((brief.hooks || []).join('\n'))
  const [metric, setMetric] = useState(brief.metric || 'views')
  const [target, setTarget] = useState(brief.target ? String(brief.target) : '')
  const [prize, setPrize] = useState(brief.prize || '')
  const [busy, setBusy] = useState(false)
  const [rules, setRules] = useState([])
  const rulesFor = scope || programme.id
  useEffect(() => {
    let alive = true
    supabase.from('vip_bonus_rules').select('*').eq('programme_id', rulesFor).eq('active', true).then(({ data }) => { if (alive) setRules(data || []) })
    return () => { alive = false }
  }, [rulesFor])
  const autoPlaces = prizesByPlace(rules, tr, programme.currency)
  async function save() {
    const [y, m] = ym.split('-').map(Number)
    setBusy(true)
    try {
      await vipRpc('vip_save_brief', {
        p_id: brief.id || null, p_programme: scopeId(scope), p_year: y, p_month: m, p_title: title, p_theme: theme || null, p_body: body,
        p_hooks: hooks.split('\n').map((h) => h.trim()).filter(Boolean), p_metric: metric,
        p_target: target ? Number(String(target).replace(/[^\d]/g, '')) : null, p_prize: prize || null,
      })
      toastSuccess(brief.id ? tr('Saved') : tr('Posted. Every VIP in scope has been notified.'))
      onSaved()
    } catch (e) { notice(e.message) } finally { setBusy(false) }
  }
  return (
    <Modal open onClose={onClose} title={brief.id ? tr('Edit challenge') : tr('New monthly challenge')} wide>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <ScopeField value={scope} onChange={setScope} programme={programme} isOwner={isOwner} disabled={!!brief.id} />
          <label className="block"><span className="label">{tr('Month')}</span><input type="month" className="input" value={ym} onChange={(e) => setYm(e.target.value)} /></label>
        </div>
        <label className="block"><span className="label">{tr('Title')}</span><input className="input" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tr('For example: Hidden-gem city breaks')} /></label>
        <label className="block"><span className="label">{tr('Theme (a short tag)')}</span><input className="input" maxLength={60} value={theme} onChange={(e) => setTheme(e.target.value)} placeholder={tr('For example: Autumn')} /></label>
        <label className="block"><span className="label">{tr('The brief')}</span><textarea className="input min-h-[8rem] resize-y" maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} placeholder={tr('What to film, what to show, what to avoid. You can use - for lists and **bold**.')} /></label>
        <label className="block"><span className="label">{tr('Hook ideas (one per line)')}</span><textarea className="input min-h-[6rem] resize-y" value={hooks} onChange={(e) => setHooks(e.target.value)} /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block"><span className="label">{tr('What decides the standings')}</span><Select variant="field" portal value={metric} onChange={setMetric} ariaLabel={tr('What decides the standings')} options={BRIEF_METRICS.map((m) => ({ value: m.key, label: tr(m.label) }))} /></label>
          <label className="block"><span className="label">{tr('A goal everyone can aim for (optional)')}</span><input className="input" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="100000" /></label>
        </div>
        <div className="rounded-xl border border-gray-100 bg-cloud/50 p-3.5">
          <p className="label !mb-1.5">{tr('Prizes by place')}</p>
          {autoPlaces.length ? (
            <ul className="space-y-1 text-sm">
              {autoPlaces.map((p) => <li key={p.place} className="flex justify-between gap-3"><span className="font-bold text-smoke">#{p.place}</span><span className="font-semibold text-ink">{p.parts.join(' + ')}</span></li>)}
            </ul>
          ) : <p className="text-sm text-smoke">{tr('No prizes set up yet.')}</p>}
          <p className="mt-2 text-xs text-smoke">{tr('These come straight from the "most views" bonuses, so they are paid at month end and shown to VIPs automatically.')} <Link to={`/vip?mode=tools&tab=bonuses`} className="font-semibold text-brand hover:underline" onClick={onClose}>{tr('Change them in Bonuses')}</Link></p>
        </div>
        <label className="block"><span className="label">{tr('An extra note about the prize (optional)')}</span><input className="input" maxLength={300} value={prize} onChange={(e) => setPrize(e.target.value)} placeholder={tr('For example: the winner also gets a feature on our page')} /></label>
        <div className="flex justify-end gap-2.5"><button type="button" onClick={onClose} className="btn-secondary !py-2.5 text-sm">{tr('Cancel')}</button><button type="button" onClick={save} disabled={busy || !title.trim()} className="btn-primary !py-2.5 text-sm">{busy ? <Spinner className="h-4 w-4" /> : <Icon name="check" className="h-4 w-4" />}{tr('Save')}</button></div>
      </div>
    </Modal>
  )
}

// ---- perks and trips
function PerksEditor({ programme, isOwner, canManage }) {
  const tr = useT()
  const [rows, load] = useScoped('vip_perks', programme, [['sort', true], ['threshold', true]])
  const [edit, setEdit] = useState(null)
  const { data: board, reload: reloadBoard } = useOptionalRpc('vip_perk_board', { p_programme: programme.id }, programme.id)
  async function toggle(p) { try { await vipRpc('vip_save_perk', { p_id: p.id, p_programme: p.programme_id, p_kind: p.kind, p_title: p.title, p_description: p.description, p_image: p.image_url, p_metric: p.metric, p_threshold: p.threshold, p_sort: p.sort, p_active: !p.active }); load() } catch (e) { notice(e.message) } }
  async function remove(p) {
    if (!await confirm(tr('Delete "{t}"? Anyone who had unlocked it loses it.', { t: p.title }), { confirmLabel: tr('Delete'), danger: true })) return
    try { await vipRpc('vip_delete_perk', { p_id: p.id }); load(); reloadBoard() } catch (e) { notice(e.message) }
  }
  async function setStatus(a, status) {
    try { await vipRpc('vip_set_perk_award', { p_perk: a.perk_id, p_profile: a.profile_id, p_status: status }); reloadBoard() } catch (e) { notice(e.message) }
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-smoke">{tr('Perks, milestones and trips VIPs can unlock. They unlock on their own as views and videos add up; you mark each one delivered. Anything marked "draft" is not shown to VIPs until you switch it on.')}</p>
        {canManage && <button type="button" onClick={() => setEdit({})} className="btn-primary !py-2 text-xs"><Icon name="plus" className="h-3.5 w-3.5" strokeWidth={2.4} />{tr('New perk or trip')}</button>}
      </div>
      {rows === null ? <Skeleton className="h-32 w-full rounded-card" /> : rows.length === 0 ? empty(tr('Nothing here yet.')) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {rows.map((p, i) => {
            const kind = PERK_KINDS.find((k) => k.key === p.kind) || PERK_KINDS[0]
            const metric = PERK_METRICS.find((m) => m.key === p.metric)
            const locked = ownerLocked(p, isOwner, canManage)
            return (
              <li key={p.id} className={cx('rounded-card border bg-white p-4 shadow-card animate-fade-up', p.active ? 'border-gray-100' : 'border-dashed border-gray-300 bg-gray-50/60')} style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand"><Icon name={kind.icon} className="h-[18px] w-[18px]" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-gray-400">{tr(kind.label)}<ScopeTag row={p} />{!p.active && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">{tr('Draft')}</span>}</p>
                    <h3 className="text-[15px] font-bold leading-snug text-ink">{p.title}</h3>
                    <p className="mt-0.5 text-xs text-smoke">{p.metric === 'manual' ? tr('Given by the team') : unitLabel(p.metric, p.threshold, tr)} {p.metric !== 'manual' && metric ? '' : ''}</p>
                  </div>
                </div>
                {!locked && (
                  <div className="mt-3 flex items-center justify-end gap-0.5 border-t border-gray-50 pt-2">
                    <button type="button" onClick={() => toggle(p)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-smoke hoverable:hover:bg-cloud hoverable:hover:text-ink">{p.active ? tr('Switch off') : tr('Switch on')}</button>
                    <button type="button" onClick={() => setEdit(p)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-smoke hoverable:hover:bg-cloud hoverable:hover:text-ink">{tr('Edit')}</button>
                    <button type="button" onClick={() => remove(p)} aria-label={tr('Delete')} className="flex h-8 w-8 items-center justify-center rounded-full text-smoke hoverable:hover:bg-red-50 hoverable:hover:text-red-500"><Icon name="trash" className="h-4 w-4" /></button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <section>
        <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gray-400">{tr('Unlocked by {p} VIPs', { p: programme.name })}</h2>
        {board === undefined ? <Skeleton className="h-20 w-full rounded-card" /> : !board || board.length === 0 ? empty(tr('Nobody has unlocked anything yet.')) : (
          <ul className="divide-y divide-gray-50 overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
            {board.map((a) => (
              <li key={`${a.perk_id}:${a.profile_id}`} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Avatar src={a.photo} name={a.name} size="sm" />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{a.name}</span><span className="block truncate text-xs text-smoke">{a.title} · {tr('unlocked {d}', { d: formatDate(a.earned_at) })}</span></span>
                <span className={cx('rounded-full px-2.5 py-1 text-[10px] font-bold uppercase', a.status === 'delivered' ? 'bg-emerald-50 text-emerald-700' : a.status === 'claimed' ? 'bg-amber-50 text-amber-700' : 'bg-cloud text-smoke')}>{a.status === 'delivered' ? tr('Delivered') : a.status === 'claimed' ? tr('Claimed') : tr('Unlocked')}</span>
                {canManage && (
                  <span className="flex items-center gap-0.5">
                    {a.status !== 'delivered' && <button type="button" onClick={() => setStatus(a, 'delivered')} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand hoverable:hover:bg-brand-tint">{tr('Mark delivered')}</button>}
                    <button type="button" onClick={() => setStatus(a, 'none')} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-smoke hoverable:hover:bg-red-50 hoverable:hover:text-red-500">{tr('Take away')}</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      {edit && <PerkForm programme={programme} isOwner={isOwner} perk={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />}
    </div>
  )
}

function PerkForm({ programme, isOwner, perk, onClose, onSaved }) {
  const tr = useT()
  const [scope, setScope] = useState(perk.id ? (perk.programme_id || '') : programme.id)
  const [kind, setKind] = useState(perk.kind || 'perk')
  const [title, setTitle] = useState(perk.title || '')
  const [description, setDescription] = useState(perk.description || '')
  const [image, setImage] = useState(perk.image_url || '')
  const [metric, setMetric] = useState(perk.metric || 'lifetime_views')
  const [threshold, setThreshold] = useState(perk.threshold != null ? String(perk.threshold) : '')
  const [sort, setSort] = useState(perk.sort != null ? String(perk.sort) : '0')
  const [active, setActive] = useState(perk.id ? perk.active : true)
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true)
    try {
      await vipRpc('vip_save_perk', { p_id: perk.id || null, p_programme: scopeId(scope), p_kind: kind, p_title: title, p_description: description || null, p_image: image || null, p_metric: metric, p_threshold: metric === 'manual' ? 0 : Number(String(threshold).replace(/[^\d]/g, '')) || 0, p_sort: Number(sort) || 0, p_active: active })
      toastSuccess(tr('Saved')); onSaved()
    } catch (e) { notice(e.message) } finally { setBusy(false) }
  }
  return (
    <Modal open onClose={onClose} title={perk.id ? tr('Edit perk or trip') : tr('New perk or trip')} wide>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <ScopeField value={scope} onChange={setScope} programme={programme} isOwner={isOwner} disabled={!!perk.id} />
          <label className="block"><span className="label">{tr('Kind')}</span><Select variant="field" portal value={kind} onChange={setKind} ariaLabel={tr('Kind')} options={PERK_KINDS.map((k) => ({ value: k.key, label: tr(k.label) }))} /></label>
        </div>
        <label className="block"><span className="label">{tr('Name')}</span><input className="input" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tr('For example: A trip to Lisbon')} /></label>
        <label className="block"><span className="label">{tr('What they get')}</span><textarea className="input min-h-[5rem] resize-y" maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        <label className="block"><span className="label">{tr('Picture link (optional)')}</span><input className="input" value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://" /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block"><span className="label">{tr('Unlocked by')}</span><Select variant="field" portal value={metric} onChange={setMetric} ariaLabel={tr('Unlocked by')} options={PERK_METRICS.map((m) => ({ value: m.key, label: tr(m.label) }))} /></label>
          {metric !== 'manual' && <label className="block"><span className="label">{tr('Amount needed')}</span><input className="input" inputMode="numeric" value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="1000000" /></label>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block"><span className="label">{tr('Order (lowest first)')}</span><input className="input" inputMode="numeric" value={sort} onChange={(e) => setSort(e.target.value)} /></label>
          <label className="flex cursor-pointer items-end gap-2.5 pb-2.5 text-sm text-ink"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-[#d94407]" />{tr('Show it to VIPs')}</label>
        </div>
        <div className="flex justify-end gap-2.5"><button type="button" onClick={onClose} className="btn-secondary !py-2.5 text-sm">{tr('Cancel')}</button><button type="button" onClick={save} disabled={busy || !title.trim()} className="btn-primary !py-2.5 text-sm">{busy ? <Spinner className="h-4 w-4" /> : <Icon name="check" className="h-4 w-4" />}{tr('Save')}</button></div>
      </div>
    </Modal>
  )
}

// ---- guides
function GuidesEditor({ programme, isOwner, canManage }) {
  const tr = useT()
  const [rows, load] = useScoped('vip_guides', programme, [['category', true], ['sort', true]])
  const [edit, setEdit] = useState(null)
  const cats = useMemo(() => [...new Set((rows || []).map((g) => g.category))], [rows])
  async function remove(g) {
    if (!await confirm(tr('Delete "{t}"?', { t: g.title }), { confirmLabel: tr('Delete'), danger: true })) return
    try { await vipRpc('vip_delete_guide', { p_id: g.id }); load() } catch (e) { notice(e.message) }
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-smoke">{tr('The VIP library: how to film a trip, how to write a hook, how to plan a month. The hook generator sits above them on the VIP page.')}</p>
        {canManage && <button type="button" onClick={() => setEdit({})} className="btn-primary !py-2 text-xs"><Icon name="plus" className="h-3.5 w-3.5" strokeWidth={2.4} />{tr('New guide')}</button>}
      </div>
      {rows === null ? <Skeleton className="h-32 w-full rounded-card" /> : rows.length === 0 ? empty(tr('No guides yet.')) : (
        <ul className="divide-y divide-gray-50 overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
          {rows.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand"><Icon name="book" className="h-[18px] w-[18px]" /></span>
              <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-gray-400">{g.category}<ScopeTag row={g} />{!g.active && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">{tr('Hidden')}</span>}</span><span className="block truncate text-sm font-bold text-ink">{g.title}</span></span>
              {!ownerLocked(g, isOwner, canManage) && (
                <span className="flex items-center gap-0.5">
                  <button type="button" onClick={() => setEdit(g)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-smoke hoverable:hover:bg-cloud hoverable:hover:text-ink">{tr('Edit')}</button>
                  <button type="button" onClick={() => remove(g)} aria-label={tr('Delete')} className="flex h-8 w-8 items-center justify-center rounded-full text-smoke hoverable:hover:bg-red-50 hoverable:hover:text-red-500"><Icon name="trash" className="h-4 w-4" /></button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {edit && <GuideForm programme={programme} isOwner={isOwner} guide={edit} cats={cats} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />}
    </div>
  )
}

function GuideForm({ programme, isOwner, guide, cats, onClose, onSaved }) {
  const tr = useT()
  const [scope, setScope] = useState(guide.id ? (guide.programme_id || '') : programme.id)
  const [category, setCategory] = useState(guide.category || 'Filming')
  const [title, setTitle] = useState(guide.title || '')
  const [body, setBody] = useState(guide.body || '')
  const [sort, setSort] = useState(guide.sort != null ? String(guide.sort) : '0')
  const [active, setActive] = useState(guide.id ? guide.active : true)
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true)
    try {
      await vipRpc('vip_save_guide', { p_id: guide.id || null, p_programme: scopeId(scope), p_category: category, p_title: title, p_body: body, p_sort: Number(sort) || 0, p_active: active })
      toastSuccess(tr('Saved')); onSaved()
    } catch (e) { notice(e.message) } finally { setBusy(false) }
  }
  return (
    <Modal open onClose={onClose} title={guide.id ? tr('Edit guide') : tr('New guide')} wide>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <ScopeField value={scope} onChange={setScope} programme={programme} isOwner={isOwner} disabled={!!guide.id} />
          <label className="block"><span className="label">{tr('Topic')}</span><input className="input" list="vip-guide-cats" maxLength={40} value={category} onChange={(e) => setCategory(e.target.value)} /><datalist id="vip-guide-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist></label>
        </div>
        <label className="block"><span className="label">{tr('Title')}</span><input className="input" maxLength={140} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="block"><span className="label">{tr('The guide')}</span><textarea className="input min-h-[14rem] resize-y" maxLength={12000} value={body} onChange={(e) => setBody(e.target.value)} placeholder={tr('Use - for lists, 1. for steps, **bold** for emphasis and a blank line between paragraphs.')} /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block"><span className="label">{tr('Order (lowest first)')}</span><input className="input" inputMode="numeric" value={sort} onChange={(e) => setSort(e.target.value)} /></label>
          <label className="flex cursor-pointer items-end gap-2.5 pb-2.5 text-sm text-ink"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-[#d94407]" />{tr('Show it to VIPs')}</label>
        </div>
        <div className="flex justify-end gap-2.5"><button type="button" onClick={onClose} className="btn-secondary !py-2.5 text-sm">{tr('Cancel')}</button><button type="button" onClick={save} disabled={busy || !title.trim()} className="btn-primary !py-2.5 text-sm">{busy ? <Spinner className="h-4 w-4" /> : <Icon name="check" className="h-4 w-4" />}{tr('Save')}</button></div>
      </div>
    </Modal>
  )
}
