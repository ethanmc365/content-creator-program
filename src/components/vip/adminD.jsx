import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Avatar, Modal, Select, Skeleton, Spinner, Toggle } from '../ui'
import Icon from '../Icon'
import { MarketStandings } from './v3'
import Reorderable from '../network/Reorderable'
import { flagFromIso } from '../../lib/flags'
import { confirm, notice } from '../../lib/confirm'
import { copyToClipboard } from '../../lib/clipboard'
import { toastSuccess } from '../../lib/toast'
import { cx, formatDate } from '../../lib/utils'
import { BRIEF_METRICS, PERK_KINDS, PERK_METRICS, curSym, money, monthLabel, nf, unitLabel, useOptionalRpc, vipJoinLink, vipRpc, useKindT } from '../../lib/vip'

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
  const tr = useKindT()
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
  const tr = useKindT()
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

/** Monthly challenges, milestones/perks/trips, or guides. Each is a tab of its own under Content (4 Oct 2026): Ethan found "milestones"
 *  and "guides" hard to find folded under one "Briefs, perks, guides" tab. */
export function VipContentTab({ programme, isOwner, part }) {
  const p = PARTS.includes(part) ? part : 'briefs'
  const canManage = !!programme.can_manage
  const tr = useKindT()
  return (
    <div className="space-y-5">
      {!canManage && <p className="rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{tr('You can see this market\'s content. Only its own lead, or the owner, can change it.')}</p>}
      <div key={`${programme.id}:${p}`} className="space-y-5">
        {p === 'briefs' && <BriefsEditor programme={programme} isOwner={isOwner} canManage={canManage} />}
        {p === 'perks' && <PerksEditor programme={programme} isOwner={isOwner} canManage={canManage} />}
        {p === 'guides' && <GuidesEditor programme={programme} isOwner={isOwner} canManage={canManage} />}
      </div>
    </div>
  )
}

/** A short "how this works" strip: icon and sentence, no numbers or circles that look like buttons. Open until dismissed. */
export function HowItWorks({ id, title, lines, openByDefault = false }) {
  const tr = useKindT()
  const key = `tryp_vip_how_${id}`
  const [open, setOpen] = useState(() => { try { const v = localStorage.getItem(key); return v == null ? openByDefault : v === '1' } catch { return openByDefault } })
  const toggle = () => { setOpen((o) => { const n = !o; try { localStorage.setItem(key, n ? '1' : '0') } catch { /* private mode */ } return n }) }
  return (
    <section className="overflow-hidden rounded-card border border-brand/15 bg-brand-tint/30">
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-center gap-2.5 px-4 py-3 text-left">
        <Icon name="bulb" className="h-4 w-4 shrink-0 text-brand" />
        <span className="min-w-0 flex-1 text-sm font-semibold text-ink">{title}</span>
        <Icon name="chevronDown" className={cx('h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200', open && 'rotate-180')} />
      </button>
      {open && (
        <ul className="animate-tab-in space-y-2 border-t border-brand/10 px-4 py-3.5">
          {lines.map(([icon, text]) => (
            <li key={text} className="flex items-start gap-2.5 text-[13px] leading-snug text-ink/85"><Icon name={icon} className="mt-0.5 h-4 w-4 shrink-0 text-brand" /><span>{tr(text)}</span></li>
          ))}
        </ul>
      )}
    </section>
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

// WHICH MARKET IT IS FOR (4 Oct 2026). Ethan: "I don't have the option to select a specific market. It just shows [one market]." The owner
// can now pick any VIP market, or every market, when making content AND when editing it later (the content is moved by
// `vip_move_content`, migration 323); a market lead sees their own market.
function ScopeField({ value, onChange, programme, isOwner, disabled }) {
  const tr = useKindT()
  const [all, setAll] = useState([])
  // WHO LEADS VIP WORLDWIDE MAY ALSO POST TO EVERY VIP CREATOR (6 Oct 2026, migration 341). Ethan: "when setting rewards, prizes and
  // challenges for the VIP Worldwide there should always be the option on everything to decide if this is for every VIP creator or only
  // the Worldwide creators that are not in another VIP market." Worldwide's own VIPs are, by construction, the ones in no other market,
  // so "Worldwide only" and "every VIP creator" are the two answers, and the second is what reaches Spain, Romania and the rest too.
  const canEvery = isOwner || !!programme.is_default
  useEffect(() => {
    if (!isOwner) return undefined
    let alive = true
    supabase.from('vip_programmes').select('id, name, is_default, community:community_id(country_codes)').eq('active', true).order('name').then(({ data }) => { if (alive) setAll(data || []) })
    return () => { alive = false }
  }, [isOwner])
  const markets = isOwner && all.length ? all : [{ id: programme.id, name: programme.name, is_default: programme.is_default, community: programme.community }]
  // A flag for a market, the GLOBE for the Worldwide VIP market and a STAR for every VIP creator: those are different things (one
  // market, or all of them), and the list says so before the words do (4 Oct 2026).
  const iconOf = (p) => (p.community?.country_codes?.length ? p.community.country_codes.slice(0, 2).map(flagFromIso).join('') : '🌍')
  return (
    <label className="block">
      <span className="label">{tr('Who it is for')}</span>
      <Select variant="field" portal value={value} disabled={disabled} onChange={onChange} ariaLabel={tr('Who it is for')}
        options={[
          ...markets.map((p) => (p.is_default
            ? { value: p.id, icon: iconOf(p), label: tr('{n} only', { n: p.name }), hint: tr('Not in another VIP market') }
            : { value: p.id, icon: iconOf(p), label: p.name })),
          ...((canEvery || value === '') ? [{ value: '', icon: '⭐', label: tr('Every VIP creator'), hint: tr('All VIP markets') }] : []),
        ]} />
    </label>
  )
}

const scopeId = (v) => (v === '' ? null : v)
const ownerLocked = (row, isOwner, canManage) => (row.programme_id == null ? !isOwner : !canManage)

function ScopeTag({ row }) {
  const tr = useKindT()
  return <span className={cx('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase', row.programme_id == null ? 'bg-brand-tint text-brand' : 'bg-cloud text-smoke')}>{row.programme_id == null ? tr('Every VIP creator') : tr('This VIP market')}</span>
}

// ---- monthly challenges
function BriefsEditor({ programme, isOwner, canManage }) {
  const tr = useKindT()
  const [rows, load] = useScoped('vip_briefs', programme, [['year', false], ['month', false]])
  const [edit, setEdit] = useState(null)
  async function remove(b) {
    if (!await confirm(tr('Delete this challenge?'), { confirmLabel: tr('Delete'), danger: true })) return
    try { await vipRpc('vip_delete_brief', { p_id: b.id }); load() } catch (e) { notice(e.message) }
  }
  return (
    <div className="space-y-4">
      <HowItWorks id="challenges" openByDefault={(rows || []).length === 0} title={tr('How a monthly challenge runs')} lines={[
        ['pencil', 'Write the brief: a theme, what to film and a few hook ideas. Pick the month and who it is for.'],
        ['trophy', 'Set the prizes by place. They are saved with the challenge, so there is nothing to set up in Bonuses.'],
        ['bell', 'When you post it, every VIP it is for gets a notification, and it sits at the top of their VIP page with live standings.'],
        ['calendar', 'When the month closes, the places are worked out and the prizes go into the winners\' balances by themselves.'],
      ]} />
      <div className="flex flex-wrap items-center justify-end gap-3">
        {canManage && <button type="button" onClick={() => setEdit({})} className="btn-primary !py-2 text-xs"><Icon name="plus" className="h-3.5 w-3.5" strokeWidth={2.4} />{tr('New challenge')}</button>}
      </div>
      {rows === null ? <Skeleton className="h-32 w-full rounded-card" /> : rows.length === 0 ? empty(tr('No monthly challenges yet.')) : (
        <ul className="space-y-3">
          {rows.map((b, i) => (
            <li key={b.id} className="rounded-card border border-gray-100 bg-white p-4 shadow-card animate-rise" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
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
  const tr = useKindT()
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
  // THE PRIZES ARE SET HERE (3 Oct 2026). Ethan: "I seem to be unable to actually create the prizes. Have to change them
  // in bonuses and it seems quite complicated. I want it to be really straightforward." The places and amounts are typed
  // on the challenge itself and saved as that month's "most views" bonus (migration 318 plans it by calendar month), so
  // the close pays them and every VIP sees them, with nothing to set up anywhere else.
  const [prizeRule, setPrizeRule] = useState(undefined)
  const [places, setPlaces] = useState(['', '', ''])
  const [prizeKind, setPrizeKind] = useState('cash')
  const [yy, mm] = ym.split('-').map(Number)
  // THE PRIZES LIVE WHERE THE CHALLENGE REACHES (6 Oct 2026). A challenge for every VIP creator keeps its prizes on VIP Worldwide, marked
  // for everyone (so a VIP in Spain is ranked and paid with the rest); a challenge for one market keeps them on that market.
  const [defaultId, setDefaultId] = useState(programme.is_default ? programme.id : null)
  useEffect(() => {
    if (defaultId) return undefined
    let alive = true
    supabase.from('vip_programmes').select('id').eq('is_default', true).maybeSingle().then(({ data }) => { if (alive && data) setDefaultId(data.id) })
    return () => { alive = false }
  }, [defaultId])
  const everyone = scope === ''
  const ruleProgramme = everyone ? (defaultId || programme.id) : scope
  useEffect(() => {
    let alive = true
    setPrizeRule(undefined)
    supabase.from('vip_bonus_rules').select('*').eq('programme_id', ruleProgramme).eq('kind', 'top_n').eq('note', 'brief').eq('for_year', yy).eq('for_month', mm).eq('audience', everyone ? 'all' : 'market').maybeSingle()
      .then(({ data }) => {
        if (!alive) return
        setPrizeRule(data || null)
        if (data) { setPlaces((data.places || []).map((p) => String(p.amount))); setPrizeKind(data.reward || 'cash') }
      })
    return () => { alive = false }
  }, [ruleProgramme, everyone, yy, mm])
  const sym = curSym(programme.currency)
  async function savePrizes(label) {
    const list = places.map((a, i) => ({ place: i + 1, amount: Number(a) || 0, reward: prizeKind })).filter((p) => p.amount > 0)
    if (prizeRule && list.length === 0) { await supabase.from('vip_bonus_rules').delete().eq('id', prizeRule.id); return }
    if (list.length === 0) return
    const row = { programme_id: ruleProgramme, audience: everyone ? 'all' : 'market', kind: 'top_n', label, scope: everyone ? 'global' : 'market', reward: prizeKind, amount: 0, places: list, conditions: {}, for_year: yy, for_month: mm, note: 'brief', active: true }
    const { error } = prizeRule ? await supabase.from('vip_bonus_rules').update(row).eq('id', prizeRule.id) : await supabase.from('vip_bonus_rules').insert(row)
    if (error) throw error
  }
  async function save() {
    setBusy(true)
    try {
      const was = brief.id ? (brief.programme_id || '') : scope
      await vipRpc('vip_save_brief', {
        p_id: brief.id || null, p_programme: scopeId(was), p_year: yy, p_month: mm, p_title: title, p_theme: theme || null, p_body: body,
        p_hooks: hooks.split('\n').map((h) => h.trim()).filter(Boolean), p_metric: metric,
        p_target: target ? Number(String(target).replace(/[^\d]/g, '')) : null, p_prize: prize || null,
      })
      if (brief.id && scope !== was) {
        await vipRpc('vip_move_content', { p_table: 'vip_briefs', p_id: brief.id, p_programme: scopeId(scope) })
        // The prizes follow the challenge: the old ones (kept where it used to reach) go, and savePrizes writes them where it reaches now.
        const oldProgramme = was === '' ? defaultId : was
        if (oldProgramme) await supabase.from('vip_bonus_rules').delete().eq('programme_id', oldProgramme).eq('kind', 'top_n').eq('note', 'brief').eq('for_year', yy).eq('for_month', mm).eq('audience', was === '' ? 'all' : 'market')
      }
      await savePrizes(tr('Prizes: {t}', { t: title.trim() || monthLabel(yy, mm) }))
      toastSuccess(brief.id ? tr('Saved') : tr('Posted. Every VIP in scope has been notified.'))
      onSaved()
    } catch (e) { notice(e.message) } finally { setBusy(false) }
  }
  return (
    <Modal open onClose={onClose} title={brief.id ? tr('Edit challenge') : tr('New monthly challenge')} wide>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <ScopeField value={scope} onChange={setScope} programme={programme} isOwner={isOwner} />
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
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="label !mb-0">{tr('Prizes by place')}</p>
            <div className="flex gap-1.5">
              {[['cash', tr('Cash')], ['voucher', tr('Voucher')]].map(([k, l]) => <button key={k} type="button" onClick={() => setPrizeKind(k)} aria-pressed={prizeKind === k} className={cx('rounded-full px-3 py-1 text-xs font-semibold transition-colors', prizeKind === k ? 'bg-brand text-white' : 'bg-white text-smoke')}>{l}</button>)}
            </div>
          </div>
          {prizeRule === undefined ? <Skeleton className="h-11 w-full rounded-xl" /> : (
            <div className="grid gap-2 sm:grid-cols-3">
              {places.map((a, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold', i === 0 ? 'bg-gradient-to-br from-brand to-brand-light text-white' : 'bg-white text-smoke')}>{i + 1}</span>
                  <span className="relative block flex-1"><span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-400">{sym}</span><input className="input !pl-8" inputMode="decimal" value={a} onChange={(e) => setPlaces(places.map((x, j) => (j === i ? e.target.value.replace(/[^\d.]/g, '') : x)))} placeholder={['100', '50', '25'][i] || '10'} aria-label={tr('Amount for place {n}', { n: i + 1 })} /></span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-2 flex items-center justify-between gap-3">
            {places.length < 10 ? <button type="button" onClick={() => setPlaces([...places, ''])} className="text-xs font-semibold text-brand hover:underline">+ {tr('Add a place')}</button> : <span />}
            <p className="text-[11px] text-smoke">{tr('Paid automatically when {m} closes. Leave empty for no prizes.', { m: monthLabel(yy, mm) })}</p>
          </div>
        </div>
        <label className="block"><span className="label">{tr('An extra note about the prize (optional)')}</span><input className="input" maxLength={300} value={prize} onChange={(e) => setPrize(e.target.value)} placeholder={tr('For example: the winner also gets a feature on our page')} /></label>
        <div className="flex justify-end gap-2.5"><button type="button" onClick={onClose} className="btn-secondary !py-2.5 text-sm">{tr('Cancel')}</button><button type="button" onClick={save} disabled={busy || !title.trim()} className="btn-primary !py-2.5 text-sm">{busy ? <Spinner className="h-4 w-4" /> : <Icon name="check" className="h-4 w-4" />}{tr('Save')}</button></div>
      </div>
    </Modal>
  )
}

// ---- perks and trips
function PerksEditor({ programme, isOwner, canManage }) {
  const tr = useKindT()
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
      <HowItWorks id="perks" openByDefault={(rows || []).length === 0} title={tr('How milestones, perks and trips work')} lines={[
        ['flag', 'A milestone, perk or trip unlocks by itself when a VIP reaches a number: total views, total videos, months as a VIP, months posting in a row or views on one video.'],
        ['cash', 'Give it a reward and it is paid automatically: cash goes into their balance, a voucher is raised for you to send. Pick "Nothing to pay" for a trip or a perk you arrange yourself, then mark it delivered below.'],
        ['eye', 'VIPs see all of them under Perks and trips on their VIP page, with how close they are.'],
        ['sparkles', 'Monthly bonuses (the podium, best video, a target) are on the other side of the switch above. Use this side for goals VIPs unlock once and see on their page.'],
      ]} />
      <div className="flex flex-wrap items-center justify-end gap-3">
        {canManage && <button type="button" onClick={() => setEdit({})} className="btn-primary !py-2 text-xs"><Icon name="plus" className="h-3.5 w-3.5" strokeWidth={2.4} />{tr('New perk or trip')}</button>}
      </div>
      {rows === null ? <Skeleton className="h-32 w-full rounded-card" /> : rows.length === 0 ? empty(tr('Nothing here yet.')) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {rows.map((p, i) => {
            const kind = PERK_KINDS.find((k) => k.key === p.kind) || PERK_KINDS[0]
            const metric = PERK_METRICS.find((m) => m.key === p.metric)
            const locked = ownerLocked(p, isOwner, canManage)
            return (
              <li key={p.id} className={cx('rounded-card border bg-white p-4 shadow-card animate-rise', p.active ? 'border-gray-100' : 'border-dashed border-gray-300 bg-gray-50/60')} style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                <div className="flex items-start gap-3">
                  <Icon name={kind.icon} className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-gray-400">{tr(kind.label)}<ScopeTag row={p} />{p.reward_kind && p.reward_kind !== 'none' && <span className={cx('rounded-full px-2 py-0.5', p.reward_kind === 'voucher' ? 'bg-brand-tint text-brand' : 'bg-cloud text-ink')}>{p.reward_kind === 'voucher' ? tr('{a} voucher', { a: money(p.reward_amount, programme.currency, { cents: false }) }) : tr('{a} cash', { a: money(p.reward_amount, programme.currency, { cents: false }) })}</span>}{!p.active && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">{tr('Draft')}</span>}</p>
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
  const tr = useKindT()
  const sym = curSym(programme.currency)
  const [scope, setScope] = useState(perk.id ? (perk.programme_id || '') : programme.id)
  const [kind, setKind] = useState(perk.kind || 'milestone')
  const [title, setTitle] = useState(perk.title || '')
  const [description, setDescription] = useState(perk.description || '')
  const [metric, setMetric] = useState(perk.metric || 'lifetime_views')
  const [threshold, setThreshold] = useState(perk.threshold != null ? String(perk.threshold) : '')
  const [reward, setReward] = useState(perk.reward_kind || 'cash')
  const [amount, setAmount] = useState(perk.reward_amount != null ? String(perk.reward_amount) : '')
  const [active, setActive] = useState(perk.id ? perk.active : true)
  const [busy, setBusy] = useState(false)
  // A PERK THAT PAYS ITSELF (3 Oct 2026, migration 318). Ethan: "we want everything to be automated ... we can offer
  // prizes that will then be automatically given out, like cash prizes or kind of like the milestone setups." No
  // picture link ("we don't have picture links"): the reward is the picture.
  async function save() {
    if (reward !== 'none' && !(Number(amount) > 0)) { notice(tr('Say how much the reward is worth.')); return }
    setBusy(true)
    try {
      const was = perk.id ? (perk.programme_id || '') : scope
      const id = await vipRpc('vip_save_perk', { p_id: perk.id || null, p_programme: scopeId(was), p_kind: kind, p_title: title, p_description: description || null, p_image: perk.image_url || null, p_metric: metric, p_threshold: metric === 'manual' ? 0 : Number(String(threshold).replace(/[^\d]/g, '')) || 0, p_sort: perk.sort ?? 0, p_active: active })
      const perkId = perk.id || (typeof id === 'string' ? id : id?.id)
      if (perk.id && scope !== was) await vipRpc('vip_move_content', { p_table: 'vip_perks', p_id: perk.id, p_programme: scopeId(scope) })
      if (perkId) await vipRpc('vip_set_perk_reward', { p_id: perkId, p_kind: reward, p_amount: reward === 'none' ? null : Number(amount) })
      toastSuccess(tr('Saved')); onSaved()
    } catch (e) { notice(e.message) } finally { setBusy(false) }
  }
  const pill = (on, onClick, children) => <button type="button" onClick={onClick} aria-pressed={on} className={cx('rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200', on ? 'bg-brand text-white shadow-card' : 'bg-cloud text-smoke hoverable:hover:text-ink')}>{children}</button>
  return (
    <Modal open onClose={onClose} title={perk.id ? tr('Edit perk or trip') : tr('New perk or trip')} wide>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <ScopeField value={scope} onChange={setScope} programme={programme} isOwner={isOwner} />
        </div>
        <div>
          <p className="label">{tr('What kind of reward is it?')}</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {PERK_KINDS.map((k) => (
              <button key={k.key} type="button" aria-pressed={kind === k.key} onClick={() => setKind(k.key)}
                className={cx('flex items-start gap-2.5 rounded-xl border p-3 text-left transition-all duration-200', kind === k.key ? 'border-brand bg-brand-tint/50 shadow-card' : 'border-gray-100 bg-white hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand/30')}>
                <Icon name={k.icon} className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
                <span className="min-w-0"><span className="block text-[13px] font-semibold text-ink">{tr(k.label)}</span><span className="block text-[11px] leading-snug text-smoke">{tr(k.hint)}</span></span>
              </button>
            ))}
          </div>
        </div>
        <label className="block"><span className="label">{tr('Name')}</span><input className="input" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tr('For example: 1 million views')} /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block"><span className="label">{tr('Unlocked by')}</span><Select variant="field" portal value={metric} onChange={setMetric} ariaLabel={tr('Unlocked by')} options={PERK_METRICS.map((m) => ({ value: m.key, label: tr(m.label) }))} /></label>
          {metric !== 'manual' && <label className="block"><span className="label">{tr('Amount needed')}</span><input className="input" inputMode="numeric" value={threshold} onChange={(e) => setThreshold(e.target.value.replace(/[^\d]/g, ''))} placeholder="1000000" /></label>}
        </div>
        <div className="rounded-xl border border-gray-100 bg-cloud/40 p-3.5">
          <p className="label">{tr('The reward, given automatically')}</p>
          <div className="grid grid-cols-3 gap-2">
            {pill(reward === 'cash', () => setReward('cash'), <><Icon name="cash" className="mr-1 inline h-4 w-4" />{tr('Cash')}</>)}
            {pill(reward === 'voucher', () => setReward('voucher'), <><Icon name="ticket" className="mr-1 inline h-4 w-4" />{tr('Voucher')}</>)}
            {pill(reward === 'none', () => setReward('none'), tr('Nothing to pay'))}
          </div>
          {reward !== 'none' ? (
            <label className="mt-3 block"><span className="label">{reward === 'voucher' ? tr('Voucher worth') : tr('Amount added to their balance')}</span>
              <span className="relative block sm:w-48"><span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-400">{sym}</span><input className="input !pl-8" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="50" /></span>
            </label>
          ) : <p className="mt-2 text-[11px] text-smoke">{tr('For a trip or a perk the team arranges: you mark it delivered once it is sorted.')}</p>}
        </div>
        <label className="block"><span className="label">{tr('What they get, in a line (optional)')}</span><textarea className="input min-h-[4rem] resize-y" maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        <label className="flex items-center gap-2.5 text-sm text-ink"><Toggle on={active} onChange={setActive} label={tr('Show it to VIPs')} />{tr('Show it to VIPs')}</label>
        <div className="flex justify-end gap-2.5"><button type="button" onClick={onClose} className="btn-secondary !py-2.5 text-sm">{tr('Cancel')}</button><button type="button" onClick={save} disabled={busy || !title.trim()} className="btn-primary !py-2.5 text-sm">{busy ? <Spinner className="h-4 w-4" /> : <Icon name="check" className="h-4 w-4" />}{tr('Save')}</button></div>
      </div>
    </Modal>
  )
}

// ---- guides
// DRAG TO ORDER, SWITCH ON AND OFF (4 Oct 2026). Ethan: "Show it to the VIPs" is obvious - a guide you write is for the VIPs - so the tick is
// gone; what he wants is one switch beside Edit to turn a guide off and on. And "Order: lowest first" was a number to type; the guides are
// now dragged into the order he wants by the grip, saved as he lets go.
function GuidesEditor({ programme, isOwner, canManage }) {
  const tr = useKindT()
  const [rows, load] = useScoped('vip_guides', programme, [['sort', true], ['category', true]])
  const [edit, setEdit] = useState(null)
  const [order, setOrder] = useState(null) // the list as dragged, until the server agrees
  const list = order || rows
  const cats = useMemo(() => [...new Set((rows || []).map((g) => g.category))], [rows])
  useEffect(() => { setOrder(null) }, [rows])
  async function remove(g) {
    if (!await confirm(tr('Delete "{t}"?', { t: g.title }), { confirmLabel: tr('Delete'), danger: true })) return
    try { await vipRpc('vip_delete_guide', { p_id: g.id }); load() } catch (e) { notice(e.message) }
  }
  async function flip(g) {
    setOrder((list || []).map((x) => (x.id === g.id ? { ...x, active: !x.active } : x)))
    try {
      await vipRpc('vip_save_guide', { p_id: g.id, p_programme: g.programme_id, p_category: g.category, p_title: g.title, p_body: g.body, p_sort: g.sort, p_active: !g.active })
      load()
    } catch (e) { setOrder(null); notice(e.message) }
  }
  async function reorder(next) {
    setOrder(next)
    try { await vipRpc('vip_reorder_guides', { p_ids: next.map((g) => g.id) }); load() } catch (e) { setOrder(null); notice(e.message) }
  }
  return (
    <div className="space-y-4">
      <HowItWorks id="guides" openByDefault={(rows || []).length === 0} title={tr('How the guides work')} lines={[
        ['book', 'A guide is a short article VIPs read in the Library on their VIP page: how to film a trip, how to open a video, how to plan a month.'],
        ['tag', 'Give each guide a topic and the Library groups them under it.'],
        ['grip', 'Drag a guide by the dots to put it where you want it. VIPs read them in that order.'],
        ['eye', 'A guide is shown the moment you save it. Use the switch beside Edit to hide one without deleting it.'],
      ]} />
      <div className="flex flex-wrap items-center justify-end gap-3">
        {canManage && <button type="button" onClick={() => setEdit({})} className="btn-primary !py-2 text-xs"><Icon name="plus" className="h-3.5 w-3.5" strokeWidth={2.4} />{tr('New guide')}</button>}
      </div>
      {list === null ? <Skeleton className="h-32 w-full rounded-card" /> : list.length === 0 ? empty(tr('No guides yet.')) : (
        <Reorderable
          items={list}
          onReorder={reorder}
          handleLabel={tr('Drag to reorder')}
          className="flex flex-col gap-2"
          renderItem={(g, { handleProps, dragging }) => {
            const locked = ownerLocked(g, isOwner, canManage)
            return (
              <div className={cx('group flex flex-wrap items-center gap-3 rounded-card border bg-white px-3 py-3 transition-shadow duration-200 sm:px-4', dragging ? 'border-brand/30 shadow-lift' : 'border-gray-100 shadow-card', !g.active && 'opacity-70')}>
                <span {...handleProps} title={tr('Drag to reorder')} className="flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-gray-300 transition-colors hover:text-smoke active:cursor-grabbing">
                  <Icon name="grip" className="h-4 w-4" />
                </span>
                <Icon name="book" className="h-5 w-5 shrink-0 text-brand" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-gray-400">{g.category}<ScopeTag row={g} />{!g.active && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">{tr('Hidden')}</span>}</span>
                  <span className="block truncate text-sm font-semibold text-ink">{g.title}</span>
                </span>
                {!locked && (
                  <span className="flex items-center gap-2">
                    <Toggle on={!!g.active} onChange={() => flip(g)} label={g.active ? tr('Shown to VIPs. Switch off to hide') : tr('Hidden. Switch on to show')} />
                    <button type="button" onClick={() => setEdit(g)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-smoke hoverable:hover:bg-cloud hoverable:hover:text-ink">{tr('Edit')}</button>
                    <button type="button" onClick={() => remove(g)} aria-label={tr('Delete')} className="flex h-8 w-8 items-center justify-center rounded-full text-smoke hoverable:hover:bg-red-50 hoverable:hover:text-red-500"><Icon name="trash" className="h-4 w-4" /></button>
                  </span>
                )}
              </div>
            )
          }}
        />
      )}
      {edit && <GuideForm programme={programme} isOwner={isOwner} guide={edit} cats={cats} nextSort={((rows || []).reduce((m, g) => Math.max(m, Number(g.sort) || 0), 0)) + 10} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />}
    </div>
  )
}

function GuideForm({ programme, isOwner, guide, cats, nextSort = 10, onClose, onSaved }) {
  const tr = useKindT()
  const [scope, setScope] = useState(guide.id ? (guide.programme_id || '') : programme.id)
  const [category, setCategory] = useState(guide.category || 'Filming')
  const [title, setTitle] = useState(guide.title || '')
  const [body, setBody] = useState(guide.body || '')
  // A NEW GUIDE GOES AT THE END; an existing one keeps its place. The order is changed by dragging, not by typing a number.
  const sort = guide.id ? guide.sort : nextSort
  const active = guide.id ? guide.active : true
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true)
    try {
      const was = guide.id ? (guide.programme_id || '') : scope
      await vipRpc('vip_save_guide', { p_id: guide.id || null, p_programme: scopeId(was), p_category: category, p_title: title, p_body: body, p_sort: Number(sort) || 0, p_active: active })
      if (guide.id && scope !== was) await vipRpc('vip_move_content', { p_table: 'vip_guides', p_id: guide.id, p_programme: scopeId(scope) })
      toastSuccess(tr('Saved')); onSaved()
    } catch (e) { notice(e.message) } finally { setBusy(false) }
  }
  return (
    <Modal open onClose={onClose} title={guide.id ? tr('Edit guide') : tr('New guide')} wide>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <ScopeField value={scope} onChange={setScope} programme={programme} isOwner={isOwner} />
          <label className="block"><span className="label">{tr('Topic')}</span><input className="input" list="vip-guide-cats" maxLength={40} value={category} onChange={(e) => setCategory(e.target.value)} /><datalist id="vip-guide-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist></label>
        </div>
        <label className="block"><span className="label">{tr('Title')}</span><input className="input" maxLength={140} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="block"><span className="label">{tr('The guide')}</span><textarea className="input min-h-[14rem] resize-y" maxLength={12000} value={body} onChange={(e) => setBody(e.target.value)} placeholder={tr('Use - for lists, 1. for steps, **bold** for emphasis and a blank line between paragraphs.')} /></label>
        <div className="flex justify-end gap-2.5"><button type="button" onClick={onClose} className="btn-secondary !py-2.5 text-sm">{tr('Cancel')}</button><button type="button" onClick={save} disabled={busy || !title.trim()} className="btn-primary !py-2.5 text-sm">{busy ? <Spinner className="h-4 w-4" /> : <Icon name="check" className="h-4 w-4" />}{tr('Save')}</button></div>
      </div>
    </Modal>
  )
}
