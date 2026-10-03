import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Avatar, Modal, Select, Skeleton, Spinner } from '../ui'
import Icon from '../Icon'
import { CHART, FILL, axisTick, tooltipStyle } from '../charts/chartTheme'
import { confirm, notice } from '../../lib/confirm'
import { toastSuccess } from '../../lib/toast'
import { cx, downloadCsv, formatViews } from '../../lib/utils'
import {
  BONUS_KINDS, DEFAULT_TERMS, FLAGS, MILESTONE_METRICS, SCOPES, describeRule, money, monthLabel, nf, rate, vipRpc,
} from '../../lib/vip'
import { Stat, useMonths } from './adminA'
import { useT } from '../../lib/i18n'

// THE TEAM'S SIDE OF THE VIP PROGRAMME, PART TWO: the rules, the close, the goals, the numbers (2 Oct 2026).

// ------------------------------------------------------------------------------------ bonuses
const blankRule = (kind = 'target') => ({
  kind, label: '', reward: 'cash', scope: kind === 'target' || kind === 'streak' || kind === 'milestone' ? 'creator' : 'market',
  amount: '', multiplier: '', places: [{ place: 1, amount: '', reward: 'cash' }], month_id: null, active: true,
  conditions: kind === 'target' ? { own: true } : kind === 'streak' ? { months: 3, min_videos: 4, pct: 10 } : kind === 'milestone' ? { metric: 'lifetime_views', threshold: '' } : {},
})

function RuleModal({ rule, programme, month, onClose, onSaved }) {
  const tr = useT()
  const { profile } = useAuth()
  const [r, setR] = useState(() => ({ ...blankRule(rule?.kind), ...rule, amount: rule?.amount ?? '', multiplier: rule?.multiplier ?? '', places: rule?.places?.length ? rule.places : blankRule().places }))
  const [busy, setBusy] = useState(false)
  const kind = BONUS_KINDS.find((k) => k.key === r.kind)
  const set = (patch) => setR((x) => ({ ...x, ...patch }))
  const setCond = (patch) => setR((x) => ({ ...x, conditions: { ...x.conditions, ...patch } }))
  const editing = !!rule?.id

  async function save() {
    if (!r.label.trim()) { notice(tr('Give the bonus a name creators will recognise.')); return }
    const row = {
      programme_id: programme.id, month_id: r.month_id || null, label: r.label.trim(), kind: r.kind, scope: r.scope, reward: r.reward,
      amount: Number(r.amount) || 0, multiplier: r.kind === 'target' && r.multiplier ? Number(r.multiplier) : null,
      places: r.kind === 'top_n' ? r.places.filter((p) => Number(p.amount) > 0).map((p) => ({ place: Number(p.place), amount: Number(p.amount), reward: p.reward || r.reward })) : [],
      conditions: r.kind === 'streak' ? { months: Number(r.conditions.months) || 3, min_videos: Number(r.conditions.min_videos) || 1, pct: Number(r.conditions.pct) || 0 }
        : r.kind === 'milestone' ? { metric: r.conditions.metric, threshold: Number(r.conditions.threshold) || 0 }
          : r.kind === 'target' ? { own: r.conditions.own !== false, videos: r.conditions.videos ? Number(r.conditions.videos) : undefined, views: r.conditions.views ? Number(r.conditions.views) : undefined } : {},
      active: r.active,
    }
    if (r.kind === 'top_n' && row.places.length === 0) { notice(tr('Add at least one place with an amount.')); return }
    if (r.kind !== 'top_n' && !(row.amount > 0) && !(row.multiplier > 1) && !(r.kind === 'streak' && row.conditions.pct > 0)) { notice(tr('Say how much it pays.')); return }
    if (r.kind === 'milestone' && !(row.conditions.threshold > 0)) { notice(tr('Say what total earns it.')); return }
    setBusy(true)
    const { error } = editing
      ? await supabase.from('vip_bonus_rules').update(row).eq('id', rule.id)
      : await supabase.from('vip_bonus_rules').insert({ ...row, created_by: profile?.id })
    setBusy(false)
    if (error) { notice(error.message); return }
    toastSuccess(tr('Saved'))
    onSaved(); onClose()
  }

  return (
    <Modal open onClose={onClose} title={editing ? tr('Edit this bonus') : tr('Add a bonus')} wide>
      <div className="space-y-5">
        {!editing && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {BONUS_KINDS.map((k) => (
              <button key={k.key} type="button" onClick={() => setR({ ...blankRule(k.key), label: r.label })} aria-pressed={r.kind === k.key}
                className={cx('flex flex-col items-start gap-1 rounded-xl p-3 text-left transition-all duration-200', r.kind === k.key ? 'bg-brand text-white shadow-card' : 'bg-cloud/70 text-ink hoverable:hover:-translate-y-0.5')}>
                <Icon name={k.icon} className={cx('h-4 w-4', r.kind === k.key ? 'text-white' : 'text-brand')} />
                <span className="text-[13px] font-semibold leading-tight">{tr(k.label)}</span>
                <span className={cx('text-[11px] leading-snug', r.kind === k.key ? 'text-white/80' : 'text-smoke')}>{tr(k.hint)}</span>
              </button>
            ))}
          </div>
        )}
        <label className="block"><span className="label">{tr('Name')}</span><input className="input" value={r.label} onChange={(e) => set({ label: e.target.value })} placeholder={tr(kind.label)} maxLength={80} /></label>

        <div>
          <p className="label">{tr('Paid as')}</p>
          <div className="flex gap-2">
            {[['cash', tr('Cash, on the invoice')], ['voucher', tr('A Tryp.com voucher')]].map(([k, label]) => (
              <button key={k} type="button" onClick={() => set({ reward: k })} aria-pressed={r.reward === k} className={cx('flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200', r.reward === k ? 'bg-brand text-white shadow-card' : 'bg-cloud text-smoke hoverable:hover:text-ink')}>{label}</button>
            ))}
          </div>
          {r.reward === 'voucher' && <p className="mt-1.5 text-xs text-smoke">{tr('A voucher reward is created when the statement is approved. You issue the code from Rewards, as with any voucher.')}</p>}
        </div>

        {(r.kind === 'top_n' || r.kind === 'best_video') && (
          <div>
            <p className="label">{tr('Who is ranked')}</p>
            <div className="flex gap-2">
              {SCOPES.map((s) => (
                <button key={s.key} type="button" onClick={() => set({ scope: s.key })} aria-pressed={r.scope === s.key} className={cx('flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200', r.scope === s.key ? 'bg-brand text-white shadow-card' : 'bg-cloud text-smoke hoverable:hover:text-ink')}>{tr(s.label)}</button>
              ))}
            </div>
          </div>
        )}

        {r.kind === 'top_n' && (
          <div>
            <p className="label">{tr('Prizes by place')}</p>
            <div className="space-y-2">
              {r.places.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="flex h-9 w-12 shrink-0 items-center justify-center rounded-lg bg-cloud text-sm font-bold text-smoke">#{i + 1}</span>
                  <input className="input" inputMode="decimal" value={p.amount} onChange={(e) => set({ places: r.places.map((x, j) => (j === i ? { ...x, place: i + 1, amount: e.target.value } : x)) })} placeholder={tr('Amount')} aria-label={tr('Amount for place {n}', { n: i + 1 })} />
                  <button type="button" onClick={() => set({ places: r.places.filter((_, j) => j !== i) })} disabled={r.places.length <= 1} aria-label={tr('Remove place')} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-smoke transition-colors hoverable:hover:bg-red-50 hoverable:hover:text-red-500 disabled:opacity-30"><Icon name="close" className="h-4 w-4" /></button>
                </div>
              ))}
              {r.places.length < 10 && <button type="button" onClick={() => set({ places: [...r.places, { place: r.places.length + 1, amount: '', reward: r.reward }] })} className="text-xs font-semibold text-brand hover:underline">+ {tr('Add a place')}</button>}
            </div>
          </div>
        )}

        {r.kind !== 'top_n' && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="label">{r.kind === 'streak' ? tr('Extra amount (optional)') : tr('Amount')}</span><input className="input" inputMode="decimal" value={r.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="50" /></label>
            {r.kind === 'target' && <label className="block"><span className="label">{tr('Or raise the views rate (optional)')}</span><input className="input" inputMode="decimal" value={r.multiplier} onChange={(e) => set({ multiplier: e.target.value })} placeholder="1.2" /><span className="mt-1 block text-[11px] text-smoke">{tr('1.2 pays 20% more on that month\'s views.')}</span></label>}
          </div>
        )}

        {r.kind === 'target' && (
          <div className="space-y-3 rounded-xl bg-cloud/60 p-3.5">
            <label className="flex items-start gap-2.5 text-sm text-ink">
              <input type="checkbox" checked={r.conditions.own !== false} onChange={(e) => setCond({ own: e.target.checked })} className="mt-0.5 h-4 w-4 accent-brand" />
              <span>{tr('Use each creator\'s own target (set on their page). Creators with no target do not get it.')}</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="label">{tr('Otherwise: videos')}</span><input className="input" inputMode="numeric" value={r.conditions.videos ?? ''} onChange={(e) => setCond({ videos: e.target.value })} /></label>
              <label className="block"><span className="label">{tr('Otherwise: views')}</span><input className="input" inputMode="numeric" value={r.conditions.views ?? ''} onChange={(e) => setCond({ views: e.target.value })} /></label>
            </div>
          </div>
        )}

        {r.kind === 'streak' && (
          <div className="grid grid-cols-3 gap-3 rounded-xl bg-cloud/60 p-3.5">
            <label className="block"><span className="label">{tr('Months in a row')}</span><input className="input" inputMode="numeric" value={r.conditions.months ?? ''} onChange={(e) => setCond({ months: e.target.value })} /></label>
            <label className="block"><span className="label">{tr('Videos each month')}</span><input className="input" inputMode="numeric" value={r.conditions.min_videos ?? ''} onChange={(e) => setCond({ min_videos: e.target.value })} /></label>
            <label className="block"><span className="label">{tr('Extra on views pay (%)')}</span><input className="input" inputMode="decimal" value={r.conditions.pct ?? ''} onChange={(e) => setCond({ pct: e.target.value })} /></label>
          </div>
        )}

        {r.kind === 'milestone' && (
          <div className="grid grid-cols-2 gap-3 rounded-xl bg-cloud/60 p-3.5">
            <label className="block"><span className="label">{tr('What counts')}</span>
              <Select variant="field" portal value={r.conditions.metric} onChange={(v) => setCond({ metric: v })} ariaLabel={tr('What counts')}
                options={MILESTONE_METRICS.map((m) => ({ value: m.key, label: tr(m.label) }))} />
            </label>
            <label className="block"><span className="label">{tr('Reached at')}</span><input className="input" inputMode="numeric" value={r.conditions.threshold ?? ''} onChange={(e) => setCond({ threshold: e.target.value })} placeholder="1000000" /></label>
            <p className="col-span-2 text-xs text-smoke">{tr('Paid once per creator, the month they reach it.')}</p>
          </div>
        )}

        <div>
          <p className="label">{tr('When it runs')}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => set({ month_id: null })} aria-pressed={!r.month_id} className={cx('flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200', !r.month_id ? 'bg-brand text-white shadow-card' : 'bg-cloud text-smoke hoverable:hover:text-ink')}>{tr('Every month')}</button>
            <button type="button" onClick={() => month && set({ month_id: month.id })} disabled={!month} aria-pressed={!!r.month_id} className={cx('flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200 disabled:opacity-40', r.month_id ? 'bg-brand text-white shadow-card' : 'bg-cloud text-smoke hoverable:hover:text-ink')}>{month ? tr('Only {m}', { m: monthLabel(month.year, month.month) }) : tr('This month only')}</button>
          </div>
        </div>

        <button type="button" onClick={save} disabled={busy} className="btn-primary w-full justify-center">{busy ? <Spinner className="h-4 w-4" /> : tr('Save the bonus')}</button>
      </div>
    </Modal>
  )
}

// What a rule would cost if the month ended now, from the live numbers. Only the kinds that can be
// answered from them; a streak or a milestone depends on history and says so.
function costNow(rule, members) {
  const live = members.filter((m) => m.status === 'active')
  const withViews = live.filter((m) => m.views > 0)
  if (rule.kind === 'target') {
    const c = rule.conditions || {}
    const hit = live.filter((m) => {
      const own = c.own !== false
      const tv = (own ? m.target_videos : null) ?? (c.videos ? Number(c.videos) : null)
      const tw = (own ? m.target_views : null) ?? (c.views ? Number(c.views) : null)
      if (tv == null && tw == null) return false
      return (tv == null || m.videos >= tv) && (tw == null || m.views >= tw)
    })
    const extra = rule.multiplier ? hit.reduce((a, m) => a + m.base * (rule.multiplier - 1), 0) : 0
    return { n: hit.length, amount: hit.length * Number(rule.amount) + extra }
  }
  if (rule.kind === 'top_n') {
    const paid = (rule.places || []).slice(0, withViews.length)
    return { n: paid.length, amount: paid.reduce((a, p) => a + Number(p.amount), 0) }
  }
  if (rule.kind === 'best_video') return { n: withViews.length ? 1 : 0, amount: withViews.length ? Number(rule.amount) : 0 }
  return null
}

// A SET OF PERSONAL MILESTONES IN ONE GO (1 Oct 2026). Ethan: "Personal milestones: ensure you can set them up easily."
// One row per milestone (what total, what it pays), saved as one rule each; the close works each out once per creator.
function MilestoneLadder({ programme, onClose, onSaved }) {
  const tr = useT()
  const { profile } = useAuth()
  const [metric, setMetric] = useState('lifetime_views')
  const [reward, setReward] = useState('cash')
  const [rows, setRows] = useState([{ at: '100000', amount: '10' }, { at: '500000', amount: '25' }, { at: '1000000', amount: '50' }, { at: '5000000', amount: '150' }])
  const [busy, setBusy] = useState(false)
  const set = (i, patch) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  async function save() {
    const good = rows.map((r) => ({ at: Number(String(r.at).replace(/[^\d.]/g, '')), amount: Number(r.amount) })).filter((r) => r.at > 0 && r.amount > 0)
    if (!good.length) { notice(tr('Add at least one milestone with an amount.')); return }
    setBusy(true)
    const label = (n) => (metric === 'lifetime_views' ? tr('{n} views in total', { n: nf(n) }) : metric === 'lifetime_videos' ? tr('{n} videos in total', { n: nf(n) }) : tr('{n} earned in one month', { n: nf(n) }))
    const { error } = await supabase.from('vip_bonus_rules').insert(good.map((g) => ({
      programme_id: programme.id, label: label(g.at), kind: 'milestone', scope: 'creator', reward, amount: g.amount, places: [],
      conditions: { metric, threshold: g.at }, active: true, created_by: profile?.id,
    })))
    setBusy(false)
    if (error) { notice(error.message); return }
    toastSuccess(tr('Saved'))
    onSaved(); onClose()
  }
  return (
    <Modal open onClose={onClose} title={tr('Personal milestones')} wide>
      <div className="space-y-4">
        <p className="text-sm text-smoke">{tr('A milestone pays a VIP once, the month they reach it. Fill in as many rows as you like; each becomes its own bonus you can change later.')}</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="label">{tr('What counts')}</span>
            <Select variant="field" portal value={metric} onChange={setMetric} ariaLabel={tr('What counts')} options={MILESTONE_METRICS.map((m) => ({ value: m.key, label: tr(m.label) }))} />
          </label>
          <div><span className="label">{tr('Paid as')}</span>
            <div className="flex gap-2">{[['cash', tr('Cash')], ['voucher', tr('Voucher')]].map(([k, label]) => <button key={k} type="button" onClick={() => setReward(k)} aria-pressed={reward === k} className={cx('flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200', reward === k ? 'bg-brand text-white shadow-card' : 'bg-cloud text-smoke hoverable:hover:text-ink')}>{label}</button>)}</div>
          </div>
        </div>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className="input" inputMode="numeric" value={r.at} onChange={(e) => set(i, { at: e.target.value })} placeholder={tr('Reached at')} aria-label={tr('Reached at')} />
              <input className="input !w-32" inputMode="decimal" value={r.amount} onChange={(e) => set(i, { amount: e.target.value })} placeholder={tr('Amount')} aria-label={tr('Amount')} />
              <button type="button" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} aria-label={tr('Remove')} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-smoke transition-colors hoverable:hover:bg-red-50 hoverable:hover:text-red-500"><Icon name="close" className="h-4 w-4" /></button>
            </div>
          ))}
          <button type="button" onClick={() => setRows((x) => [...x, { at: '', amount: '' }])} className="text-xs font-semibold text-brand hover:underline">+ {tr('Add a milestone')}</button>
        </div>
        <button type="button" onClick={save} disabled={busy} className="btn-primary w-full justify-center">{busy ? <Spinner className="h-4 w-4" /> : tr('Save the milestones')}</button>
      </div>
    </Modal>
  )
}

const PRESETS = [
  { key: 'podium', icon: 'trophy', label: 'Monthly podium', hint: 'Prizes for the top three on views', rule: { kind: 'top_n', label: 'Most views of the month', scope: 'market', reward: 'cash', places: [{ place: 1, amount: '100', reward: 'cash' }, { place: 2, amount: '50', reward: 'cash' }, { place: 3, amount: '25', reward: 'cash' }] } },
  { key: 'target', icon: 'flag', label: 'Hit your target', hint: 'A bonus for reaching their own monthly target', rule: { kind: 'target', label: 'Monthly target hit', scope: 'creator', reward: 'cash', amount: '25', conditions: { own: true } } },
  { key: 'best', icon: 'star', label: 'Best video', hint: 'The most-viewed video of the month', rule: { kind: 'best_video', label: 'Video of the month', scope: 'market', reward: 'cash', amount: '50' } },
]

export function VipBonusesTab({ programme }) {
  const tr = useT()
  const [rules, setRules] = useState(null)
  const [members, setMembers] = useState([])
  const [month, setMonth] = useState(null)
  const [edit, setEdit] = useState(null)
  const [ladder, setLadder] = useState(false)
  const cur = programme.currency

  const load = useCallback(async () => {
    const [r, o] = await Promise.all([
      supabase.from('vip_bonus_rules').select('*').eq('programme_id', programme.id).order('created_at'),
      vipRpc('vip_admin_overview', { p_programme: programme.id }).catch(() => null),
    ])
    setRules(r.data || []); setMembers(o?.members || []); setMonth(o?.month || null)
  }, [programme.id])
  useEffect(() => { setRules(null); load() }, [load])

  async function toggle(rule) { await supabase.from('vip_bonus_rules').update({ active: !rule.active }).eq('id', rule.id); load() }
  async function remove(rule) {
    if (!await confirm(tr('Delete "{n}"? Statements already made are not changed.', { n: rule.label }), { confirmLabel: tr('Delete'), danger: true })) return
    await supabase.from('vip_bonus_rules').delete().eq('id', rule.id); load()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-smoke">{tr('Bonuses are rules, not hand payments. The month-end close works each one out for every VIP, and you check the result before anything is approved. You can set bonuses for each creator, for the ranking in this market, or for the ranking across every VIP.')}</p>
        <button type="button" onClick={() => setEdit({})} className="btn-primary !py-2 text-xs"><Icon name="plus" className="h-3.5 w-3.5" strokeWidth={2.4} />{tr('Add a bonus')}</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        {PRESETS.map((p) => (
          <button key={p.key} type="button" onClick={() => setEdit({ preset: true, ...p.rule, label: tr(p.rule.label) })} className="group flex flex-col items-start gap-1 rounded-card border border-gray-100 bg-white p-3.5 text-left shadow-card transition-all duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand/40 hoverable:hover:shadow-lift">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-tint text-brand"><Icon name={p.icon} className="h-4 w-4" /></span>
            <span className="text-[13px] font-bold text-ink">{tr(p.label)}</span>
            <span className="text-[11px] leading-snug text-smoke">{tr(p.hint)}</span>
          </button>
        ))}
        <button type="button" onClick={() => setLadder(true)} className="group flex flex-col items-start gap-1 rounded-card border border-gray-100 bg-white p-3.5 text-left shadow-card transition-all duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand/40 hoverable:hover:shadow-lift">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-tint text-brand"><Icon name="chart" className="h-4 w-4" /></span>
          <span className="text-[13px] font-bold text-ink">{tr('Personal milestones')}</span>
          <span className="text-[11px] leading-snug text-smoke">{tr('A ladder: 100k, 500k, 1M views and so on')}</span>
        </button>
      </div>
      {rules === null ? <Skeleton className="h-40 w-full rounded-card" /> : rules.length === 0 ? (
        <p className="rounded-card border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-smoke">{tr('No bonuses yet. Start with a bonus for hitting the monthly target, and prizes for the top three of the month.')}</p>
      ) : (
        <ul className="space-y-3">
          {rules.map((rule) => {
            const k = BONUS_KINDS.find((x) => x.key === rule.kind)
            const cost = costNow(rule, members)
            return (
              <li key={rule.id} className={cx('rounded-card border bg-white p-4 shadow-card', rule.active ? 'border-gray-100' : 'border-dashed border-gray-200 opacity-70')}>
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand"><Icon name={k?.icon || 'trophy'} className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-[14px] font-bold text-ink">
                      {rule.label}
                      <span className="rounded-full bg-cloud px-2 py-0.5 text-[10px] font-bold uppercase text-smoke">{rule.reward === 'voucher' ? tr('Voucher') : tr('Cash')}</span>
                      {rule.scope === 'global' && <span className="rounded-full bg-cloud px-2 py-0.5 text-[10px] font-bold uppercase text-smoke">{tr('All markets')}</span>}
                      <span className="rounded-full bg-cloud px-2 py-0.5 text-[10px] font-bold uppercase text-smoke">{rule.month_id ? tr('One month') : tr('Every month')}</span>
                    </p>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-smoke">{describeRule(rule, tr, cur)}</p>
                    {cost && <p className="mt-1.5 text-xs font-semibold text-brand">{tr('If the month ended now: {n} would earn it, {a} in all.', { n: cost.n, a: money(cost.amount, cur, { cents: false }) })}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" role="switch" aria-checked={rule.active} onClick={() => toggle(rule)} aria-label={tr('Running')} className="p-1.5">
                      <span className={cx('relative block h-5 w-9 rounded-full transition-colors duration-200', rule.active ? 'bg-brand' : 'bg-gray-200')}>
                        <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all duration-200', rule.active ? 'left-[18px]' : 'left-0.5')} />
                      </span>
                    </button>
                    <button type="button" onClick={() => setEdit(rule)} aria-label={tr('Edit')} className="flex h-8 w-8 items-center justify-center rounded-full text-smoke transition-colors hoverable:hover:bg-cloud hoverable:hover:text-ink"><Icon name="pencil" className="h-4 w-4" /></button>
                    <button type="button" onClick={() => remove(rule)} aria-label={tr('Delete')} className="flex h-8 w-8 items-center justify-center rounded-full text-smoke transition-colors hoverable:hover:bg-red-50 hoverable:hover:text-red-500"><Icon name="trash" className="h-4 w-4" /></button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {edit && <RuleModal rule={edit.id || edit.preset ? edit : null} programme={programme} month={month} onClose={() => setEdit(null)} onSaved={load} />}
      {ladder && <MilestoneLadder programme={programme} onClose={() => setLadder(false)} onSaved={load} />}
    </div>
  )
}

// ---------------------------------------------------------------------------------------- close
function StatementRow({ s, cur, editable, onChanged }) {
  const tr = useT()
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const draft = s.status === 'draft'

  async function approve() {
    setBusy(true)
    try { await vipRpc('vip_approve_statement', { p_id: s.id }); onChanged() } catch (e) { notice(e.message) } finally { setBusy(false) }
  }
  async function adjust() {
    if (!label.trim() || !Number(amount)) return
    setBusy(true)
    try { await vipRpc('vip_add_adjustment', { p_statement: s.id, p_label: label, p_amount: Number(amount), p_reason: null }); setLabel(''); setAmount(''); onChanged() } catch (e) { notice(e.message) } finally { setBusy(false) }
  }
  async function unadjust(i) {
    setBusy(true)
    try { await vipRpc('vip_remove_adjustment', { p_statement: s.id, p_index: i }); onChanged() } catch (e) { notice(e.message) } finally { setBusy(false) }
  }
  const stage = s.paid_at ? 'paid' : s.invoice_stage

  return (
    <li className="border-b border-gray-50 last:border-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <Icon name="chevronRight" className={cx('h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200', open && 'rotate-90')} />
          <Avatar src={s.photo} name={s.name} size="xs" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-ink">{s.name}</span>
            <span className="block text-[11px] text-smoke">{tr('{n} views', { n: nf(s.views) })} · {s.videos === 1 ? tr('1 video') : tr('{n} videos', { n: s.videos })}</span>
          </span>
        </button>
        <div className="flex flex-wrap items-center gap-1.5">
          {(s.flags || []).map((f) => <span key={f} className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">{tr(FLAGS[f] || f)}</span>)}
        </div>
        <span className="w-24 text-right text-sm font-bold tabular-nums text-ink">{money(s.total, cur)}</span>
        <span className="w-32 text-right">
          {draft ? (
            editable ? <button type="button" onClick={approve} disabled={busy} className="btn-primary !px-3 !py-1.5 text-xs">{busy ? <Spinner className="h-3 w-3" /> : tr('Approve')}</button>
              : <span className="text-[11px] font-bold uppercase text-smoke">{tr('Draft')}</span>
          ) : <span className={cx('text-[11px] font-bold uppercase tracking-wide', stage === 'paid' ? 'text-emerald-600' : 'text-brand')}>{stage === 'paid' ? tr('Paid') : stage === 'sent' ? tr('Invoice sent') : s.invoice_id ? tr('Invoice approved') : Number(s.total) > 0 ? tr('Waiting for bank details') : tr('Carried over')}</span>}
        </span>
      </div>
      {open && (
        <div className="animate-rise space-y-2 bg-cloud/40 px-4 py-4 pl-12 text-sm">
          <LedgerLine label={tr('{n} views at {r} per 1,000', { n: nf(s.views), r: `${cur} ${rate(s.cpm)}` })} value={money(s.base, cur)} />
          {s.cap_applied && <p className="text-xs text-smoke">{tr('The cap of {a} applied.', { a: money(s.cap, cur, { cents: false }) })}</p>}
          {Number(s.rollover_in) > 0 && <LedgerLine label={tr('Carried over from last month')} value={money(s.rollover_in, cur)} />}
          {(s.bonuses || []).map((b, i) => <Line key={i} label={`${b.label}${b.reward === 'voucher' ? ` (${tr('voucher, not on the invoice')})` : ''}`} value={`+ ${money(b.amount, cur)}`} good />)}
          {(s.adjustments || []).map((a, i) => (
            <div key={i} className="flex items-baseline justify-between gap-3">
              <span className="text-smoke">{a.label}{a.reason ? ` (${a.reason})` : ''}</span>
              <span className="flex items-center gap-2 font-semibold tabular-nums">{Number(a.amount) >= 0 ? '+' : '-'} {money(Math.abs(a.amount), cur)}
                {draft && editable && <button type="button" onClick={() => unadjust(i)} disabled={busy} aria-label={tr('Remove')} className="text-gray-400 hover:text-red-500"><Icon name="close" className="h-3.5 w-3.5" /></button>}
              </span>
            </div>
          ))}
          {Number(s.rollover_out) > 0 && <p className="text-xs text-smoke">{tr('Below the minimum payout, so {a} carries to next month.', { a: money(s.rollover_out, cur) })}</p>}
          {draft && editable && (
            <div className="flex flex-wrap items-end gap-2 border-t border-gray-200 pt-3">
              <label className="block min-w-[10rem] flex-1"><span className="mb-1 block text-[11px] font-semibold text-smoke">{tr('Adjust (a correction or a goodwill amount)')}</span><input className="input !py-2 text-[13px]" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={tr('What for?')} /></label>
              <label className="block w-28"><span className="mb-1 block text-[11px] font-semibold text-smoke">{tr('Amount (- to take off)')}</span><input className="input !py-2 text-[13px]" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="10" /></label>
              <button type="button" onClick={adjust} disabled={busy || !label.trim() || !Number(amount)} className="btn-secondary !py-2 text-xs disabled:opacity-50">{tr('Add')}</button>
            </div>
          )}
        </div>
      )}
    </li>
  )
}

function LedgerLine({ label, value, good }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-smoke">{label}</span>
      <span className={cx('shrink-0 font-semibold tabular-nums', good ? 'text-emerald-700' : 'text-ink')}>{value}</span>
    </div>
  )
}

export function VipCloseTab({ programme }) {
  const tr = useT()
  const months = useMonths(programme.id)
  const [monthId, setMonthId] = useState(null)
  const [review, setReview] = useState(null)
  const [busy, setBusy] = useState(false)
  const cur = programme.currency

  const month = months?.find((m) => m.id === monthId) || null
  useEffect(() => {
    if (!months || monthId) return
    const closed = months.find((m) => m.status === 'closed')
    setMonthId((closed || months[0])?.id || null)
  }, [months, monthId])

  const load = useCallback(async () => {
    if (!monthId) return
    try { setReview(await vipRpc('vip_month_review', { p_month: monthId })) } catch (e) { notice(e.message) }
  }, [monthId])
  useEffect(() => { setReview(null); load() }, [load])

  const rows = review?.statements || []
  const drafts = rows.filter((s) => s.status === 'draft')
  const total = rows.reduce((a, s) => a + Number(s.total || 0), 0)
  const open = month && month.status !== 'closed'

  async function draftNow() {
    setBusy(true)
    try { await vipRpc('vip_compute_statements', { p_month: monthId }); await load() } catch (e) { notice(e.message) } finally { setBusy(false) }
  }
  async function approveAll() {
    if (!await confirm(tr('Approve all {n} drafts? Each one is added to the creator\'s balance, and their payout window opens.', { n: drafts.length }), { confirmLabel: tr('Approve all') })) return
    setBusy(true)
    try { const n = await vipRpc('vip_approve_month', { p_month: monthId }); toastSuccess(tr('{n} statements approved.', { n })); await load() } catch (e) { notice(e.message) } finally { setBusy(false) }
  }
  function exportCsv() {
    downloadCsv(`vip-${programme.name.toLowerCase().replace(/[^\w]+/g, '-')}-${month.year}-${String(month.month).padStart(2, '0')}.csv`, rows.map((s) => ({
      Creator: s.name, Views: s.views, Videos: s.videos, Rate_per_1000: s.cpm, Views_pay: s.base,
      Cash_bonuses: (s.bonuses || []).filter((b) => b.reward !== 'voucher').reduce((a, b) => a + Number(b.amount), 0),
      Voucher_bonuses: (s.bonuses || []).filter((b) => b.reward === 'voucher').reduce((a, b) => a + Number(b.amount), 0),
      Adjustments: (s.adjustments || []).reduce((a, b) => a + Number(b.amount), 0), Carried_in: s.rollover_in, Carried_out: s.rollover_out,
      Total: s.total, Currency: s.currency, Status: s.status, Flags: (s.flags || []).join('; '), Invoice: s.invoice_number ? `Tryp.com ${String(s.invoice_number).padStart(3, '0')}` : '',
    })))
  }

  if (months === null) return <Skeleton className="h-64 w-full rounded-card" />
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        {/* THE HOUSE DROPDOWN, NOT THE OS ONE (2 Oct 2026). Ethan: under Month end "the arrow is outside the button,
            also for that dropdown it's an Apple UI not a custom UI." */}
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Icon name="calendar" className="h-4 w-4 text-brand" />
          <Select
            variant="chip"
            className="w-56"
            ariaLabel={tr('Month')}
            value={monthId || ''}
            onChange={setMonthId}
            search={false}
            options={months.map((m) => ({
              value: m.id,
              label: `${monthLabel(m.year, m.month)}${m.status !== 'closed' ? ` (${m.status === 'open' ? tr('open') : tr('closing')})` : ''}`,
            }))}
          />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" onClick={draftNow} disabled={busy || !monthId} className="btn-secondary !py-2 text-xs"><Icon name="refresh" className="h-3.5 w-3.5" />{open ? tr('Preview the statements') : tr('Work them out again')}</button>
          {rows.length > 0 && <button type="button" onClick={exportCsv} className="btn-secondary !py-2 text-xs"><Icon name="download" className="h-3.5 w-3.5" />{tr('Export CSV')}</button>}
          {drafts.length > 0 && !open && <button type="button" onClick={approveAll} disabled={busy} className="btn-primary !py-2 text-xs">{busy ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="check" className="h-3.5 w-3.5" strokeWidth={2.4} />}{tr('Approve all {n}', { n: drafts.length })}</button>}
        </div>
      </div>

      {open && (
        <p className="rounded-card border border-gray-100 bg-cloud/60 px-4 py-3 text-sm text-smoke">
          {tr('{m} has not closed yet. It closes itself at midnight in the market\'s time: a last reading of every video is taken just before, and the statements are drafted just after. What you see here is a preview.', { m: monthLabel(month.year, month.month) })}
        </p>
      )}

      {review === null ? <Skeleton className="h-48 w-full rounded-card" /> : rows.length === 0 ? (
        <p className="rounded-card border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-smoke">{tr('No statements for this month yet.')}</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label={tr('Statements')} value={String(rows.length)} hint={tr('{n} still to approve', { n: drafts.length })} />
            <Stat label={tr('Added to balances')} value={money(total, cur, { cents: false })} />
            <Stat label={tr('Flagged')} value={String(rows.filter((s) => (s.flags || []).some((f) => f !== 'no_views')).length)} hint={tr('worth a look')} tone={rows.some((s) => (s.flags || []).includes('no_payment_details')) ? 'warn' : undefined} />
          </div>
          <ul className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
            {rows.map((s) => <StatementRow key={s.id} s={s} cur={cur} editable={!open} onChanged={load} />)}
          </ul>
          <p className="text-xs text-smoke">{tr('Approving a statement adds it to the creator\'s balance and opens their payout window: cash once the balance reaches the threshold, or a Tryp.com voucher for any amount. Their invoice is raised when they ask for cash. Late corrections go on next month\'s statement or as a balance correction in Balances.')}</p>
        </>
      )}
    </div>
  )
}

// ------------------------------------------------------------------------------------- analytics
export function VipAnalyticsTab({ programme, isAdmin }) {
  const tr = useT()
  const [all, setAll] = useState(false)
  const [data, setData] = useState(null)
  const cur = programme.currency
  useEffect(() => {
    setData(null)
    vipRpc('vip_analytics', { p_programme: all ? null : programme.id }).then(setData).catch((e) => notice(e.message))
  }, [programme.id, all])

  const series = useMemo(() => (data?.months || []).map((m) => ({
    label: monthLabel(m.year, m.month, { short: true }), views: Number(m.views), cost: Number(m.cost), cpm: m.cpm == null ? null : Number(m.cpm), members: m.members, videos: Number(m.videos),
  })), [data])

  return (
    <div className="space-y-6">
      {isAdmin && (
        <div className="inline-flex gap-1 rounded-xl bg-cloud p-1 text-[13px] font-semibold">
          {[[false, programme.name], [true, tr('Every programme')]].map(([k, label]) => (
            <button key={String(k)} type="button" onClick={() => setAll(k)} className={cx('rounded-lg px-3.5 py-1.5 transition-all duration-200', all === k ? 'bg-white text-ink shadow-card' : 'text-smoke hoverable:hover:text-ink')}>{label}</button>
          ))}
        </div>
      )}
      {data === null ? <Skeleton className="h-72 w-full rounded-card" /> : series.length === 0 ? (
        <p className="rounded-card border border-dashed border-gray-200 px-6 py-12 text-center text-sm text-smoke">{tr('Nothing to chart yet. The first month appears once it has been drafted.')}</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label={tr('Active VIPs')} value={String(data.members)} />
            <Stat label={tr('Views, all months')} value={formatViews(series.reduce((a, m) => a + m.views, 0))} />
            <Stat label={tr('Spent, all months')} value={money(series.reduce((a, m) => a + m.cost, 0), cur, { cents: false })} />
            <Stat label={tr('Average cost per 1,000')} value={(() => { const v = series.reduce((a, m) => a + m.views, 0); const c = series.reduce((a, m) => a + m.cost, 0); return v ? money(c / (v / 1000), cur) : '-' })()} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title={tr('Views counted, month by month')}>
              <ComposedChart data={series} margin={{ top: 8, right: 6, left: -10, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={CHART.grid} />
                <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} width={52} tickFormatter={(v) => formatViews(v)} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => [nf(v), tr('Views')]} cursor={{ fill: 'rgba(26,26,26,0.03)' }} />
                <Bar dataKey="views" fill={FILL.brand} radius={[6, 6, 0, 0]} maxBarSize={38} animationDuration={700} />
              </ComposedChart>
            </ChartCard>
            <ChartCard title={tr('What it cost, and the cost per 1,000 views')}>
              <ComposedChart data={series} margin={{ top: 8, right: 6, left: -10, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={CHART.grid} />
                <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis yAxisId="l" tick={axisTick} axisLine={false} tickLine={false} width={52} tickFormatter={(v) => money(v, cur, { cents: false })} />
                <YAxis yAxisId="r" orientation="right" tick={axisTick} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => Number(v).toFixed(2)} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v, k) => [k === 'cost' ? money(v, cur) : Number(v).toFixed(3), k === 'cost' ? tr('Cost') : tr('Per 1,000 views')]} cursor={{ fill: 'rgba(26,26,26,0.03)' }} />
                <Bar yAxisId="l" dataKey="cost" fill={FILL.light} radius={[6, 6, 0, 0]} maxBarSize={38} animationDuration={700} />
                <Line yAxisId="r" type="monotone" dataKey="cpm" stroke={CHART.brand} strokeWidth={2.5} dot={{ r: 3, fill: CHART.brand }} animationDuration={700} connectNulls />
              </ComposedChart>
            </ChartCard>
          </div>
          <section>
            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gray-400">{tr('Top creators, all months')}</h2>
            <ul className="divide-y divide-gray-50 overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
              {(data.top || []).map((t, i) => (
                <li key={t.profile_id} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-5 text-right text-xs font-bold tabular-nums text-smoke">{i + 1}</span>
                  <Avatar src={t.photo} name={t.name} size="xs" />
                  <Link to={`/profile/${t.profile_id}`} className="min-w-0 flex-1 truncate text-sm font-semibold hover:text-brand">{t.name}</Link>
                  <span className="text-xs text-smoke">{tr('{n} months', { n: t.months })}</span>
                  <span className="w-20 text-right text-sm font-bold tabular-nums text-ink">{formatViews(t.views)}</span>
                  <span className="w-24 text-right text-sm tabular-nums text-smoke">{money(t.earned, cur, { cents: false })}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}

function ChartCard({ title, children }) {
  return (
    <div className="rounded-card border border-gray-100 bg-white p-4 shadow-card">
      <p className="mb-3 text-[13px] font-bold text-ink">{title}</p>
      <div className="h-60"><ResponsiveContainer>{children}</ResponsiveContainer></div>
    </div>
  )
}

// ------------------------------------------------------------------------------------- settings
/** How often every VIP video's views are read (app_settings `vip_sync`). A new video is read the moment it is added. */
function SyncEvery() {
  const tr = useT()
  const [hours, setHours] = useState('')
  const [saved, setSaved] = useState('')
  useEffect(() => {
    let alive = true
    supabase.from('app_settings').select('value').eq('key', 'vip_sync').maybeSingle()
      .then(({ data }) => { if (alive) { const h = String(data?.value?.interval_hours ?? 6); setHours(h); setSaved(h) } })
    return () => { alive = false }
  }, [])
  async function save() {
    const h = Math.min(48, Math.max(1, Math.round(Number(hours) || 6)))
    const { error } = await supabase.from('app_settings').upsert({ key: 'vip_sync', value: { interval_hours: h } })
    if (error) { notice(error.message); return }
    setHours(String(h)); setSaved(String(h))
    toastSuccess(tr('Views are now read every {n} hours.', { n: h }))
  }
  return (
    <label className="block">
      <span className="label">{tr('Read views every')}</span>
      <span className="flex items-center gap-2">
        <input className="input !w-24" inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} onBlur={() => hours !== saved && save()} />
        <span className="text-sm text-smoke">{tr('hours')}</span>
      </span>
      <span className="mt-1 block text-[11px] text-smoke">{tr('For every VIP market. A new video is read as soon as it is added.')}</span>
    </label>
  )
}

export function VipSettingsTab({ programme, onSaved }) {
  const tr = useT()
  const [f, setF] = useState(() => ({
    cpm: programme.cpm, min_payout: programme.min_payout, monthly_cap: programme.monthly_cap ?? '', budget_monthly: programme.budget_monthly ?? '',
    window_days: programme.window_days, terms: programme.terms || DEFAULT_TERMS.map((p) => p.replace('{days}', String(programme.window_days || 60))).join('\n\n'), tiers: programme.tiers || [], active: programme.active, reaccept: false,
    tagline: programme.tagline || '', welcome_message: programme.welcome_message || '',
  }))
  const [busy, setBusy] = useState(false)
  const set = (p) => setF((x) => ({ ...x, ...p }))

  async function save() {
    setBusy(true)
    const row = {
      cpm: Number(f.cpm) || 0, min_payout: Number(f.min_payout) || 0,
      monthly_cap: f.monthly_cap === '' ? null : Number(f.monthly_cap), budget_monthly: f.budget_monthly === '' ? null : Number(f.budget_monthly),
      window_days: Math.max(1, Number(f.window_days) || 60), terms: (f.terms.trim() === DEFAULT_TERMS.map((p) => p.replace('{days}', String(f.window_days || 60))).join('\n\n') ? '' : f.terms.trim()) || null,
      tiers: f.tiers.filter((t) => Number(t.from_views) > 0 && Number(t.cpm) >= 0).map((t) => ({ from_views: Number(t.from_views), cpm: Number(t.cpm) })).sort((a, b) => a.from_views - b.from_views),
      active: f.active, ...(f.reaccept ? { terms_version: programme.terms_version + 1 } : {}),
      tagline: f.tagline.trim() || null, welcome_message: f.welcome_message.trim() || null,
    }
    const { error } = await supabase.from('vip_programmes').update(row).eq('id', programme.id)
    setBusy(false)
    if (error) { notice(error.message); return }
    toastSuccess(tr('Saved. Changes apply from now on; months already closed are not touched.'))
    onSaved()
  }

  return (
    <div className="max-w-2xl space-y-6">
      <p className="text-sm text-smoke">{tr('The rates and rules for this programme. An individual VIP can have their own rate and cap from the Members tab.')}</p>
      <div className="grid grid-cols-2 gap-4">
        <label className="block"><span className="label">{tr('Rate per 1,000 views')} ({programme.currency})</span><input className="input" inputMode="decimal" value={f.cpm} onChange={(e) => set({ cpm: e.target.value })} /></label>
        <label className="block"><span className="label">{tr('Monthly cap on views pay')}</span><input className="input" inputMode="decimal" value={f.monthly_cap} onChange={(e) => set({ monthly_cap: e.target.value })} placeholder={tr('No cap')} /></label>
        <label className="block"><span className="label">{tr('Monthly budget')}</span><input className="input" inputMode="decimal" value={f.budget_monthly} onChange={(e) => set({ budget_monthly: e.target.value })} placeholder={tr('No budget')} /><span className="mt-1 block text-[11px] text-smoke">{tr('You are warned when the month is on pace to reach 80% of it.')}</span></label>
        {/* NO MINIMUM PAYOUT AND NO "DAYS" WINDOW ON SCREEN (1 Oct 2026). Ethan: a VIP is paid by the month for videos
            posted in that month, and "there is no minimum payout ... We can add that later". Both columns are still
            in the database (min_payout is 0). What the team does set is how often views are read. */}
        <SyncEvery />
      </div>

      <div>
        <p className="label">{tr('Higher rates at higher views (optional)')}</p>
        <div className="space-y-2">
          {f.tiers.map((t, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-sm text-smoke">{tr('From')}</span>
              <input className="input !w-36" inputMode="numeric" value={t.from_views} onChange={(e) => set({ tiers: f.tiers.map((x, j) => (j === i ? { ...x, from_views: e.target.value } : x)) })} placeholder="1000000" />
              <span className="text-sm text-smoke">{tr('views a month, pay')}</span>
              <input className="input !w-24" inputMode="decimal" value={t.cpm} onChange={(e) => set({ tiers: f.tiers.map((x, j) => (j === i ? { ...x, cpm: e.target.value } : x)) })} placeholder="0.30" />
              <button type="button" onClick={() => set({ tiers: f.tiers.filter((_, j) => j !== i) })} aria-label={tr('Remove')} className="flex h-9 w-9 items-center justify-center rounded-lg text-smoke transition-colors hoverable:hover:bg-red-50 hoverable:hover:text-red-500"><Icon name="close" className="h-4 w-4" /></button>
            </div>
          ))}
          <button type="button" onClick={() => set({ tiers: [...f.tiers, { from_views: '', cpm: '' }] })} className="text-xs font-semibold text-brand hover:underline">+ {tr('Add a tier')}</button>
        </div>
      </div>

      <section className="space-y-4 rounded-card border border-gray-100 bg-white p-4 shadow-card sm:p-5">
        <div>
          <h3 className="text-[15px] font-bold text-ink">{tr('What your VIPs read')}</h3>
          <p className="text-sm text-smoke">{tr('Two short texts on the VIP page of this market. Leave either empty and the standard wording is used.')}</p>
        </div>
        <label className="block"><span className="label">{tr('Line under the page title')}</span><input className="input" maxLength={120} value={f.tagline} onChange={(e) => set({ tagline: e.target.value })} placeholder={tr('For example: The Spanish VIP creators')} /></label>
        <label className="block"><span className="label">{tr('Welcome note, shown to every new VIP')}</span><textarea className="input min-h-[5rem] resize-y" maxLength={1000} value={f.welcome_message} onChange={(e) => set({ welcome_message: e.target.value })} placeholder={tr('Leave empty for the standard welcome.')} /></label>
      </section>

      <section className="space-y-3 rounded-card border border-gray-100 bg-white p-4 shadow-card sm:p-5">
        <div>
          <h3 className="text-[15px] font-bold text-ink">{tr('The terms VIPs accept')}</h3>
          <p className="text-sm text-smoke">{tr('This is exactly what a VIP reads and agrees to before they are paid. Change any point, add your own, then save. Separate the points with a blank line.')}</p>
        </div>
        <textarea className="input min-h-[16rem] resize-y text-[13px] leading-relaxed" value={f.terms} onChange={(e) => set({ terms: e.target.value })} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => set({ terms: DEFAULT_TERMS.map((p) => p.replace('{days}', String(f.window_days || 60))).join('\n\n') })} className="text-xs font-semibold text-smoke hover:text-ink">{tr('Put the standard terms back')}</button>
          <span className="text-xs text-smoke">{tr('Version {v}', { v: programme.terms_version })}</span>
        </div>
        <label className="flex items-start gap-2.5 text-sm text-ink">
          <input type="checkbox" checked={f.reaccept} onChange={(e) => set({ reaccept: e.target.checked })} className="mt-0.5 h-4 w-4 accent-brand" />
          <span>{tr('Ask every VIP to accept the terms again')}</span>
        </label>
      </section>
      <section className="rounded-card border border-gray-100 bg-white p-4 shadow-card sm:p-5">
        <h3 className="text-[15px] font-bold text-ink">{tr('Open or closed')}</h3>
        <label className="mt-2 flex items-start gap-2.5 text-sm text-ink">
          <input type="checkbox" checked={f.active} onChange={(e) => set({ active: e.target.checked })} className="mt-0.5 h-4 w-4 accent-brand" />
          <span>{tr('Open. Untick to close this programme: VIPs no longer see it and no new months are made. Nothing is deleted.')}</span>
        </label>
      </section>
      <button type="button" onClick={save} disabled={busy} className="btn-primary justify-center">{busy ? <Spinner className="h-4 w-4" /> : tr('Save the settings')}</button>
    </div>
  )
}
