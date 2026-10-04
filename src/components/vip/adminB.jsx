import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Avatar, Modal, Select, Skeleton, Spinner, StatCard, Toggle } from '../ui'
import Segmented from '../network/Segmented'
import { MarketStandings } from './v3'
import Icon from '../Icon'
import { CHART, FILL, axisTick, tooltipStyle } from '../charts/chartTheme'
import { confirm, notice } from '../../lib/confirm'
import { toastSuccess } from '../../lib/toast'
import { cx, downloadCsv, formatDate, formatViews } from '../../lib/utils'
import {
  BONUS_KINDS, DEFAULT_TERMS, FLAGS, MILESTONE_METRICS, SCOPES, curSym, describeRule, money, monthLabel, nf, perK, vipRpc,
} from '../../lib/vip'
import { Stat, useMonths } from './adminA'
import { HowItWorks, VipContentTab } from './adminD'
import VipScopeSwitch from './scope'
import { useT } from '../../lib/i18n'

// THE TEAM'S SIDE OF THE VIP PROGRAMME, PART TWO: the rules, the close, the goals, the numbers (2 Oct 2026).

// ------------------------------------------------------------------------------------ bonuses
// SIMPLER BONUSES (3 Oct 2026). Ethan: "the bonuses ... I'd really want to improve the layout of all this ... make it
// super simple ... I don't get where it says raise the views rate ... I should have the option to click future months as
// well to actually prepare this." So: no rate multiplier and no "% on views pay" (a bonus is an amount, cash or a
// voucher), one dialog that keeps its size whichever kind is picked, and "When it runs" offers every month, this month
// or any of the next five, which the close matches by calendar month (migration 318).
const blankRule = (kind = 'target') => ({
  kind, label: '', reward: 'cash', scope: kind === 'target' || kind === 'streak' || kind === 'milestone' ? 'creator' : 'market',
  amount: '', places: [{ place: 1, amount: '', reward: 'cash' }, { place: 2, amount: '', reward: 'cash' }, { place: 3, amount: '', reward: 'cash' }], when: 'every', active: true,
  conditions: kind === 'target' ? { own: true } : kind === 'streak' ? { months: 3, min_videos: 4 } : kind === 'milestone' ? { metric: 'lifetime_views', threshold: '' } : {},
})

/** The months a rule can be planned for: this one and the next five, as { key: 'YYYY-MM', year, month }. */
function upcomingMonths(month) {
  if (!month) return []
  const out = []
  for (let i = 0; i < 6; i += 1) {
    const idx = month.year * 12 + (month.month - 1) + i
    const y = Math.floor(idx / 12); const m = (idx % 12) + 1
    out.push({ key: `${y}-${String(m).padStart(2, '0')}`, year: y, month: m })
  }
  return out
}
function whenOf(rule, month) {
  if (rule.for_year) return `${rule.for_year}-${String(rule.for_month).padStart(2, '0')}`
  if (rule.month_id && month && rule.month_id === month.id) return `${month.year}-${String(month.month).padStart(2, '0')}`
  if (rule.month_id) return 'old'
  return 'every'
}

function Choice({ on, onClick, children, className }) {
  return <button type="button" onClick={onClick} aria-pressed={on} className={cx('rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200', on ? 'bg-brand text-white shadow-card' : 'bg-cloud text-smoke hoverable:hover:text-ink', className)}>{children}</button>
}

function RuleModal({ rule, programme, month, onClose, onSaved, onLadder }) {
  const tr = useT()
  const { profile } = useAuth()
  const sym = curSym(programme.currency)
  const [r, setR] = useState(() => ({ ...blankRule(rule?.kind), ...rule, amount: rule?.amount ?? '', places: rule?.places?.length ? rule.places : blankRule().places, when: rule?.id ? whenOf(rule, month) : (rule?.when || 'every') }))
  const [busy, setBusy] = useState(false)
  const [tpl, setTpl] = useState(null)
  const kind = BONUS_KINDS.find((k) => k.key === r.kind)
  const set = (patch) => setR((x) => ({ ...x, ...patch }))
  const setCond = (patch) => setR((x) => ({ ...x, conditions: { ...x.conditions, ...patch } }))
  const editing = !!rule?.id
  const months = upcomingMonths(month)
  const digits = (v) => String(v).replace(',', '.').replace(/[^\d.]/g, '')

  async function save() {
    const label = r.label.trim() || tr(kind.label)
    const ym = months.find((m) => m.key === r.when)
    const row = {
      programme_id: programme.id, label, kind: r.kind, scope: r.scope, reward: r.reward,
      month_id: r.when === 'old' ? rule.month_id : null,
      for_year: ym ? ym.year : null, for_month: ym ? ym.month : null,
      amount: Number(r.amount) || 0, multiplier: null,
      places: r.kind === 'top_n' ? r.places.filter((p) => Number(p.amount) > 0).map((p, i) => ({ place: i + 1, amount: Number(p.amount), reward: r.reward })) : [],
      conditions: r.kind === 'streak' ? { months: Number(r.conditions.months) || 3, min_videos: Number(r.conditions.min_videos) || 1, pct: 0 }
        : r.kind === 'milestone' ? { metric: r.conditions.metric, threshold: Number(r.conditions.threshold) || 0 }
          : r.kind === 'target' ? { own: r.conditions.own !== false, videos: r.conditions.videos ? Number(r.conditions.videos) : undefined, views: r.conditions.views ? Number(r.conditions.views) : undefined } : {},
      active: r.active,
    }
    if (r.kind === 'top_n' && row.places.length === 0) { notice(tr('Add at least one place with an amount.')); return }
    if (r.kind !== 'top_n' && !(row.amount > 0)) { notice(tr('Say how much it pays.')); return }
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

  const amountBox = (value, onChange, aria) => (
    <span className="relative block">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-400">{sym}</span>
      <input className="input !pl-8" inputMode="decimal" value={value} onChange={(e) => onChange(digits(e.target.value))} placeholder="50" aria-label={aria} />
    </span>
  )

  return (
    <Modal open onClose={onClose} title={editing ? tr('Edit this bonus') : tr('Add a bonus')} wide>
      <div className="space-y-5">
        {!editing && (
          <div>
            <p className="label">{tr('Start from')}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {TEMPLATES.map((t) => {
                const on = !t.ladder && tpl === t.key
                return (
                  <button key={t.key} type="button" aria-pressed={on}
                    onClick={() => { if (t.ladder) { onLadder?.(); return } setTpl(t.key); setR({ ...blankRule(t.rule.kind), ...t.rule, label: tr(t.rule.label), places: t.rule.places || blankRule().places, when: r.when }) }}
                    className={cx('flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all duration-200', on ? 'border-brand bg-brand-tint/50 shadow-card' : 'border-gray-100 bg-white hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand/30')}>
                    <Icon name={t.icon} className="h-5 w-5 text-brand" />
                    <span className="text-[13px] font-semibold leading-tight text-ink">{tr(t.label)}</span>
                    <span className="text-[11px] leading-snug text-smoke">{tr(t.hint)}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
        {/* ONE HEIGHT FOR EVERY KIND (3 Oct 2026): "clicking from hit a target to top of the month changes the size of
            the card." The body below keeps a minimum height, so switching kinds does not make the dialog jump. */}
        <div key={r.kind} className="min-h-[27rem] space-y-5 animate-tab-in">
          <p className="rounded-xl bg-cloud/60 px-3.5 py-2.5 text-[13px] text-smoke"><Icon name={kind.icon} className="mr-1.5 inline h-4 w-4 text-brand" />{tr(kind.hint)}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block"><span className="label">{tr('Name creators see')}</span><input className="input" value={r.label} onChange={(e) => set({ label: e.target.value })} placeholder={tr(kind.label)} maxLength={80} /></label>
            <div>
              <p className="label">{tr('Paid as')}</p>
              <div className="grid grid-cols-2 gap-2">
                <Choice on={r.reward === 'cash'} onClick={() => set({ reward: 'cash' })}><Icon name="cash" className="mr-1 inline h-4 w-4" />{tr('Cash')}</Choice>
                <Choice on={r.reward === 'voucher'} onClick={() => set({ reward: 'voucher' })}><Icon name="ticket" className="mr-1 inline h-4 w-4" />{tr('Voucher')}</Choice>
              </div>
            </div>
          </div>

          {r.kind === 'top_n' ? (
            <div>
              <p className="label">{tr('Prizes by place')}</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {r.places.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold', i === 0 ? 'bg-gradient-to-br from-brand to-brand-light text-white' : 'bg-cloud text-smoke')}>{i + 1}</span>
                    {amountBox(p.amount, (v) => set({ places: r.places.map((x, j) => (j === i ? { ...x, amount: v } : x)) }), tr('Amount for place {n}', { n: i + 1 }))}
                    {r.places.length > 1 && i === r.places.length - 1 && <button type="button" onClick={() => set({ places: r.places.slice(0, -1) })} aria-label={tr('Remove place')} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-smoke hoverable:hover:bg-red-50 hoverable:hover:text-red-500"><Icon name="close" className="h-4 w-4" /></button>}
                  </div>
                ))}
              </div>
              {r.places.length < 10 && <button type="button" onClick={() => set({ places: [...r.places, { place: r.places.length + 1, amount: '', reward: r.reward }] })} className="mt-2 text-xs font-semibold text-brand hover:underline">+ {tr('Add a place')}</button>}
              <div className="mt-4">
                <p className="label">{tr('Ranked against')}</p>
                <div className="grid grid-cols-2 gap-2">{SCOPES.map((sc) => <Choice key={sc.key} on={r.scope === sc.key} onClick={() => set({ scope: sc.key })}>{tr(sc.label)}</Choice>)}</div>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block"><span className="label">{r.reward === 'voucher' ? tr('Voucher worth') : tr('Amount')}</span>{amountBox(r.amount, (v) => set({ amount: v }), tr('Amount'))}</label>
              {r.kind === 'best_video' && (
                <div><p className="label">{tr('Ranked against')}</p><div className="grid grid-cols-2 gap-2">{SCOPES.map((sc) => <Choice key={sc.key} on={r.scope === sc.key} onClick={() => set({ scope: sc.key })}>{tr(sc.label)}</Choice>)}</div></div>
              )}
              {r.kind === 'streak' && (
                <div className="grid grid-cols-2 gap-3">
                  <label className="block"><span className="label">{tr('Months in a row')}</span><input className="input" inputMode="numeric" value={r.conditions.months ?? ''} onChange={(e) => setCond({ months: e.target.value.replace(/[^\d]/g, '') })} /></label>
                  <label className="block"><span className="label">{tr('Videos each month')}</span><input className="input" inputMode="numeric" value={r.conditions.min_videos ?? ''} onChange={(e) => setCond({ min_videos: e.target.value.replace(/[^\d]/g, '') })} /></label>
                </div>
              )}
              {r.kind === 'milestone' && (
                <div className="grid grid-cols-2 gap-3">
                  <label className="block"><span className="label">{tr('What counts')}</span>
                    <Select variant="field" portal value={r.conditions.metric} onChange={(v) => setCond({ metric: v })} ariaLabel={tr('What counts')} options={MILESTONE_METRICS.map((m) => ({ value: m.key, label: tr(m.label) }))} />
                  </label>
                  <label className="block"><span className="label">{tr('Reached at')}</span><input className="input" inputMode="numeric" value={r.conditions.threshold ?? ''} onChange={(e) => setCond({ threshold: e.target.value.replace(/[^\d]/g, '') })} placeholder={String((MILESTONE_METRICS.find((m) => m.key === r.conditions.metric) || MILESTONE_METRICS[0]).example)} /></label>
                </div>
              )}
              {r.kind === 'target' && (
                <div className="space-y-2">
                  <p className="label">{tr('Whose target')}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Choice on={r.conditions.own !== false} onClick={() => setCond({ own: true })}>{tr('Their own')}</Choice>
                    <Choice on={r.conditions.own === false} onClick={() => setCond({ own: false })}>{tr('One for all')}</Choice>
                  </div>
                  {r.conditions.own === false ? (
                    <div className="grid grid-cols-2 gap-2 animate-tab-in">
                      <input className="input" inputMode="numeric" value={r.conditions.videos ?? ''} onChange={(e) => setCond({ videos: e.target.value.replace(/[^\d]/g, '') })} placeholder={tr('Videos')} aria-label={tr('Videos')} />
                      <input className="input" inputMode="numeric" value={r.conditions.views ?? ''} onChange={(e) => setCond({ views: e.target.value.replace(/[^\d]/g, '') })} placeholder={tr('Views')} aria-label={tr('Views')} />
                    </div>
                  ) : <p className="text-[11px] text-smoke">{tr('Set on each VIP in Members. A VIP with no target does not get this.')}</p>}
                </div>
              )}
            </div>
          )}

          <div>
            <p className="label">{tr('When it runs')}</p>
            <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              <Choice className="shrink-0" on={r.when === 'every'} onClick={() => set({ when: 'every' })}>{tr('Every month')}</Choice>
              {months.map((m, i) => <Choice key={m.key} className="shrink-0" on={r.when === m.key} onClick={() => set({ when: m.key })}>{i === 0 ? tr('{m} only', { m: monthLabel(m.year, m.month, { short: true }) }) : monthLabel(m.year, m.month, { short: true })}</Choice>)}
              {r.when === 'old' && <Choice className="shrink-0" on>{tr('A past month')}</Choice>}
            </div>
            {r.kind === 'milestone' && <p className="mt-1.5 text-[11px] text-smoke">{tr('A milestone pays each VIP once, the month they reach it.')}</p>}
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
    return { n: hit.length, amount: hit.length * Number(rule.amount) }
  }
  if (rule.kind === 'top_n') {
    const paid = (rule.places || []).slice(0, withViews.length)
    return { n: paid.length, amount: paid.reduce((a, p) => a + Number(p.amount), 0) }
  }
  if (rule.kind === 'best_video') return { n: withViews.length ? 1 : 0, amount: withViews.length ? Number(rule.amount) : 0 }
  return null
}

// A SET OF PERSONAL MILESTONES IN ONE GO (1 Oct 2026). One row per milestone (what total, what it pays), saved as one
// rule each; the close works each out once per creator.
function MilestoneLadder({ programme, onClose, onSaved }) {
  const tr = useT()
  const { profile } = useAuth()
  const sym = curSym(programme.currency)
  const [metric, setMetric] = useState('lifetime_views')
  const [reward, setReward] = useState('cash')
  const [rows, setRows] = useState([{ at: '100000', amount: '10' }, { at: '500000', amount: '25' }, { at: '1000000', amount: '50' }, { at: '5000000', amount: '150' }])
  const pickMetric = (m) => {
    setMetric(m)
    const base = (MILESTONE_METRICS.find((x) => x.key === m) || MILESTONE_METRICS[0]).example
    setRows([1, 2, 5, 10].map((k, i) => ({ at: String(Math.round(base * k / 2)), amount: String([10, 25, 50, 150][i]) })))
  }
  const [busy, setBusy] = useState(false)
  const set = (i, patch) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  async function save() {
    const good = rows.map((r) => ({ at: Number(String(r.at).replace(/[^\d.]/g, '')), amount: Number(r.amount) })).filter((r) => r.at > 0 && r.amount > 0)
    if (!good.length) { notice(tr('Add at least one milestone with an amount.')); return }
    setBusy(true)
    const meta = MILESTONE_METRICS.find((m) => m.key === metric) || MILESTONE_METRICS[0]
    const label = (n) => `${nf(n)} ${tr(meta.noun)}`
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
        <p className="text-sm text-smoke">{tr('Each milestone pays a VIP once, the month they reach it, and is added to their balance automatically.')}</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="label">{tr('What counts')}</span>
            <Select variant="field" portal value={metric} onChange={pickMetric} ariaLabel={tr('What counts')} options={MILESTONE_METRICS.map((m) => ({ value: m.key, label: tr(m.label) }))} />
          </label>
          <div><span className="label">{tr('Paid as')}</span>
            <div className="grid grid-cols-2 gap-2"><Choice on={reward === 'cash'} onClick={() => setReward('cash')}>{tr('Cash')}</Choice><Choice on={reward === 'voucher'} onClick={() => setReward('voucher')}>{tr('Voucher')}</Choice></div>
          </div>
        </div>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2 animate-rise" style={{ animationDelay: `${i * 40}ms` }}>
              <input className="input" inputMode="numeric" value={r.at} onChange={(e) => set(i, { at: e.target.value.replace(/[^\d]/g, '') })} placeholder={tr('Reached at')} aria-label={tr('Reached at')} />
              <span className="relative block w-36 shrink-0"><span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-400">{sym}</span><input className="input !pl-8" inputMode="decimal" value={r.amount} onChange={(e) => set(i, { amount: e.target.value.replace(/[^\d.]/g, '') })} placeholder={tr('Amount')} aria-label={tr('Amount')} /></span>
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

// WHERE A BONUS STARTS (4 Oct 2026). Ethan: the ready-made bonuses "should show up as options at the top because we have the 'Add a
// bonus' button anyway." They were a row of cards above the list; now they are the first thing in the Add dialog. Each one fills the
// form with sensible numbers to change, and everything here is worked out by itself when the month closes.
// "Consistency streak" and "Post a lot" are gone from the list (4 Oct 2026): posting steadily is what a VIP is expected to do (the stay-in
// rule asks for it), so it is not something to pay a bonus for. A streak rule that already exists still shows and still pays.
const TEMPLATES = [
  { key: 'podium', icon: 'trophy', label: 'Monthly podium', hint: 'Prizes for the top three on views', rule: { kind: 'top_n', label: 'Most views of the month', scope: 'market', reward: 'cash', places: [{ place: 1, amount: '100', reward: 'cash' }, { place: 2, amount: '50', reward: 'cash' }, { place: 3, amount: '25', reward: 'cash' }] } },
  { key: 'target', icon: 'flag', label: 'Hit your target', hint: 'Reach the monthly target you set for them', rule: { kind: 'target', label: 'Monthly target hit', scope: 'creator', reward: 'cash', amount: '25', conditions: { own: true } } },
  { key: 'best', icon: 'star', label: 'Best video', hint: 'The most-viewed video of the month', rule: { kind: 'best_video', label: 'Video of the month', scope: 'market', reward: 'cash', amount: '50' } },
  { key: 'big', icon: 'trendUp', label: 'A big month', hint: 'Everyone who reaches 100,000 views in a month', rule: { kind: 'target', label: '100,000 views in a month', scope: 'creator', reward: 'cash', amount: '40', conditions: { own: false, views: 100000 } } },
  { key: 'viral', icon: 'eye', label: 'A video that took off', hint: 'One video passing 1,000,000 views', rule: { kind: 'milestone', label: 'A million-view video', scope: 'creator', reward: 'cash', amount: '150', conditions: { metric: 'best_video_views', threshold: '1000000' } } },
  { key: 'loyal', icon: 'calendar', label: 'Loyalty', hint: 'Six months as a VIP', rule: { kind: 'milestone', label: 'Six months as a VIP', scope: 'creator', reward: 'voucher', amount: '50', conditions: { metric: 'months_active', threshold: '6' } } },
  { key: 'milestone', icon: 'flag', label: 'A milestone', hint: 'A one-off for reaching a total', rule: { kind: 'milestone', label: '', scope: 'creator', reward: 'cash', amount: '', conditions: { metric: 'lifetime_views', threshold: '' } } },
  { key: 'ladder', icon: 'chart', label: 'A ladder of milestones', hint: '100k, 500k, 1M views and so on, in one go', ladder: true },
]

// MILESTONES, PERKS AND TRIPS LIVE WITH THE BONUSES (4 Oct 2026). Ethan: they "seem very similar and overlapping ... combine this, milestone
// perks and trips, into the bonuses section under money, and remove it from content." Both are rewards a VIP earns, and both pay by
// themselves, so there is one place for them: a switch at the top of Bonuses between the monthly bonuses and the goals VIPs unlock.
export function VipBonusesTab({ programme, isOwner = false, initialPart = 'monthly' }) {
  const tr = useT()
  const [part, setPart] = useState(initialPart === 'perks' ? 'perks' : 'monthly')
  return (
    <div className="space-y-5">
      <Segmented
        id="vip-bonus-part"
        label={tr('Kind of reward')}
        value={part}
        onChange={setPart}
        options={[{ value: 'monthly', label: tr('Monthly bonuses') }, { value: 'perks', label: tr('Milestones, perks and trips') }]}
      />
      {part === 'perks'
        ? <VipContentTab programme={programme} isOwner={isOwner} part="perks" />
        : <MonthlyBonuses programme={programme} />}
    </div>
  )
}

function MonthlyBonuses({ programme }) {
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

  async function toggle(rule) { setRules((rs) => rs.map((x) => (x.id === rule.id ? { ...x, active: !x.active } : x))); await supabase.from('vip_bonus_rules').update({ active: !rule.active }).eq('id', rule.id); load() }
  async function remove(rule) {
    if (!await confirm(tr('Delete "{n}"? Statements already made are not changed.', { n: rule.label }), { confirmLabel: tr('Delete'), danger: true })) return
    await supabase.from('vip_bonus_rules').delete().eq('id', rule.id); load()
  }
  const runsLabel = (rule) => {
    const w = whenOf(rule, month)
    if (w === 'every') return tr('Every month')
    if (w === 'old') return tr('A past month')
    const [y, m] = w.split('-').map(Number)
    return monthLabel(y, m)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-smoke">{tr('Set a bonus once and it is worked out for every VIP when the month closes, then added to their balance.')}</p>
        <button type="button" onClick={() => setEdit({})} className="btn-primary !py-2 text-xs"><Icon name="plus" className="h-3.5 w-3.5" strokeWidth={2.4} />{tr('Add a bonus')}</button>
      </div>
      {rules === null ? <Skeleton className="h-40 w-full rounded-card" /> : rules.length === 0 ? (
        <p className="rounded-card border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-smoke">{tr('No bonuses yet. Start with a monthly podium, or a bonus for hitting the monthly target.')}</p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {rules.map((rule, i) => {
            const k = BONUS_KINDS.find((x) => x.key === rule.kind)
            const cost = rule.active ? costNow(rule, members) : null
            return (
              <li key={rule.id} className={cx('flex flex-col rounded-card border bg-white p-4 shadow-card transition-opacity duration-300 animate-rise', rule.active ? 'border-gray-100' : 'border-dashed border-gray-200 opacity-60')} style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}>
                <div className="flex items-start gap-3">
                  <Icon name={k?.icon || 'trophy'} className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-bold text-ink">{rule.label}</p>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-smoke">{describeRule(rule, tr, cur)}</p>
                  </div>
                  <Toggle on={!!rule.active} onChange={() => toggle(rule)} label={tr('Running')} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide">
                  <span className={cx('rounded-full px-2 py-0.5', rule.reward === 'voucher' ? 'bg-brand-tint text-brand' : 'bg-cloud text-ink')}>{rule.reward === 'voucher' ? tr('Voucher') : tr('Cash')}</span>
                  <span className="rounded-full bg-cloud px-2 py-0.5 text-smoke">{runsLabel(rule)}</span>
                  {rule.scope === 'global' && <span className="rounded-full bg-cloud px-2 py-0.5 text-smoke">{tr('Every VIP market')}</span>}
                </div>
                <div className="mt-auto flex items-center justify-between gap-2 border-t border-gray-50 pt-3 mt-3">
                  <p className="text-xs font-semibold text-brand">{cost ? tr('If the month ended now: {n} earn it, {a}', { n: cost.n, a: money(cost.amount, cur, { cents: false }) }) : ''}</p>
                  <span className="flex shrink-0 items-center gap-0.5">
                    <button type="button" onClick={() => setEdit(rule)} aria-label={tr('Edit')} className="flex h-8 w-8 items-center justify-center rounded-full text-smoke transition-colors hoverable:hover:bg-cloud hoverable:hover:text-ink"><Icon name="pencil" className="h-4 w-4" /></button>
                    <button type="button" onClick={() => remove(rule)} aria-label={tr('Delete')} className="flex h-8 w-8 items-center justify-center rounded-full text-smoke transition-colors hoverable:hover:bg-red-50 hoverable:hover:text-red-500"><Icon name="trash" className="h-4 w-4" /></button>
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {edit && <RuleModal rule={edit.id ? edit : null} programme={programme} month={month} onClose={() => setEdit(null)} onSaved={load} onLadder={() => { setEdit(null); setLadder(true) }} />}
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
          {(s.flags || []).filter((f) => f !== 'no_views').map((f) => <span key={f} className="rounded-full bg-brand-tint px-2 py-0.5 text-[10px] font-bold text-brand">{tr(FLAGS[f] || f)}</span>)}
        </div>
        <span className="w-24 text-right text-sm font-bold tabular-nums text-ink">{money(s.total, cur)}</span>
        <span className="w-32 text-right">
          {draft ? (
            editable ? <button type="button" onClick={approve} disabled={busy} className="btn-primary !px-3 !py-1.5 text-xs">{busy ? <Spinner className="h-3 w-3" /> : tr('Approve')}</button>
              : <span className="text-[11px] font-bold uppercase text-smoke">{tr('Draft')}</span>
          ) : <span className="text-[11px] font-bold uppercase tracking-wide text-smoke">{stage === 'paid' ? tr('Paid') : stage === 'sent' ? tr('Sent') : s.invoice_id ? tr('Invoice approved') : Number(s.total) > 0 ? tr('In their balance') : Number(s.rollover_out) > 0 ? tr('Carried over') : tr('No earnings')}</span>}
        </span>
      </div>
      {open && (
        <div className="animate-rise space-y-2 bg-cloud/40 px-4 py-4 pl-12 text-sm">
          <LedgerLine label={tr('{n} views at {r} per 1,000', { n: nf(s.views), r: perK(s.cpm, cur) })} value={money(s.base, cur)} />
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
              <label className="block min-w-[10rem] flex-1"><span className="mb-1 block text-[11px] font-semibold text-smoke">{tr('Correction or bonus')}</span><input className="input !py-2 text-[13px]" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={tr('What for?')} /></label>
              <label className="block w-28"><span className="mb-1 block text-[11px] font-semibold text-smoke">{tr('Amount (- takes off)')}</span><input className="input !py-2 text-[13px]" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="10" /></label>
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
      <span className={cx('shrink-0 font-semibold tabular-nums', good ? 'text-brand' : 'text-ink')}>{value}</span>
    </div>
  )
}

export function VipCloseTab({ programme }) {
  const tr = useT()
  const months = useMonths(programme.id)
  const [monthId, setMonthId] = useState(null)
  const [review, setReview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [programmeAuto, setProgrammeAuto] = useState(programme.auto_approve !== false)
  const cur = programme.currency

  async function setAuto(on) {
    setProgrammeAuto(on)
    try { await vipRpc('vip_set_auto_approve', { p_programme: programme.id, p_on: on }); toastSuccess(tr('Saved')) } catch (e) { setProgrammeAuto(!on); notice(e.message) }
  }

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
  const open = month && month.status !== 'closed'

  async function draftNow() {
    setBusy(true)
    try { await vipRpc('vip_compute_statements', { p_month: monthId }); await load() } catch (e) { notice(e.message) } finally { setBusy(false) }
  }
  async function approveAll() {
    if (!await confirm(tr('Approve all {n} that are waiting? Each one is added to the creator\'s balance.', { n: drafts.length }), { confirmLabel: tr('Approve all') })) return
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
  const waiting = drafts
  const added = rows.filter((s) => s.status !== 'draft')
  const addedTotal = added.reduce((a, s) => a + Number(s.total || 0), 0)
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
          <button type="button" onClick={draftNow} disabled={busy || !monthId} className="btn-secondary !py-2 text-xs"><Icon name="refresh" className="h-3.5 w-3.5" />{open ? tr('Preview this month') : tr('Recalculate')}</button>
          {rows.length > 0 && <button type="button" onClick={exportCsv} className="btn-secondary !py-2 text-xs"><Icon name="download" className="h-3.5 w-3.5" />{tr('Export CSV')}</button>}
        </div>
      </div>

      {/* ONE STATUS, NOT THREE NUMBERED STEPS (4 Oct 2026). Ethan: "I chose 1, 2, 3, because currently it doesn't make sense, and it looks
          like buttons, but they aren't even buttons ... I guess it should be added automatically, though, right? Only if they request
          something, it should show up." So: a month closes by itself, every statement with nothing flagged goes straight into the
          creator's balance, and this page only asks for a person where one is actually needed. One colour. */}
      {month && (
        <section className="rounded-card border border-gray-100 bg-white p-4 shadow-card sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-gray-400"><Icon name={open ? 'clock' : 'check'} className="h-3.5 w-3.5 text-brand" />{open ? tr('Still open') : tr('Closed')}</p>
              <p className="mt-1 text-[15px] font-bold text-ink">
                {open
                  ? tr('Closes by itself at midnight on {d}', { d: formatDate(month.ends_at) })
                  : waiting.length > 0
                    ? tr('{n} need a look before they are added', { n: waiting.length })
                    : rows.length ? tr('Everyone was added to their balance') : tr('Nothing to add this month')}
              </p>
              <p className="mt-0.5 text-sm text-smoke">
                {programmeAuto
                  ? tr('Clean statements go straight into balances. Only flagged ones wait here.')
                  : tr('Automatic adding is off. Approve each statement to add it to a balance.')}
              </p>
            </div>
            <label className="flex items-center gap-3 text-sm font-semibold text-ink">
              {tr('Add to balances automatically')}
              <Toggle on={programmeAuto} onChange={setAuto} label={tr('Add to balances automatically')} />
            </label>
          </div>
        </section>
      )}
      <HowItWorks
        id="month-end"
        title={tr('How month end works')}
        lines={[
          ['calendar', 'At midnight on the last day, the month closes by itself and every VIP\'s views are counted.'],
          ['money', 'Each creator gets one statement: views times their rate, plus any bonuses, minus any correction.'],
          ['check', 'A clean statement is added to their balance straight away. One that is flagged waits here for you.'],
          ['pencil', 'While a statement waits you can add a correction (a minus takes money off) or a bonus (a plus adds some).'],
          ['wallet', 'Creators ask for their cash from their balance; an invoice is raised then. Vouchers are handed over as codes.'],
        ]}
      />
      {open && <p className="text-xs text-smoke">{tr('What you see below is a preview of {m} so far. Recalculate re-reads the numbers; nothing is added until the month closes.', { m: monthLabel(month.year, month.month) })}</p>}

      {review === null ? <Skeleton className="h-48 w-full rounded-card" /> : rows.length === 0 ? (
        <p className="rounded-card border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-smoke">{tr('No statements for this month yet.')}</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label={tr('Statements')} value={String(rows.length)} />
            <Stat label={tr('In balances')} value={money(addedTotal, cur, { cents: false })} hint={tr('{n} added', { n: added.length })} />
            <Stat label={tr('Need a look')} value={String(waiting.length)} hint={waiting.length ? tr('flagged or waiting') : tr('all clear')} />
          </div>
          {waiting.length > 0 && (
            <section>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{open ? tr('So far') : tr('Waiting for a look')}</h3>
                {!open && <button type="button" onClick={approveAll} disabled={busy} className="btn-primary !py-2 text-xs">{busy ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="check" className="h-3.5 w-3.5" strokeWidth={2.4} />}{tr('Add all {n} to balances', { n: waiting.length })}</button>}
              </div>
              <ul className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
                {waiting.map((s) => <StatementRow key={s.id} s={s} cur={cur} editable={!open} onChanged={load} />)}
              </ul>
            </section>
          )}
          {added.length > 0 && (
            <section>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">{tr('Added to balances')}</h3>
              <ul className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
                {added.map((s) => <StatementRow key={s.id} s={s} cur={cur} editable={false} onChanged={load} />)}
              </ul>
            </section>
          )}
          <p className="text-xs text-smoke">{tr('Their invoice is raised when they ask for cash. A late correction goes in Balances.')}</p>
        </>
      )}
    </div>
  )
}

// ------------------------------------------------------------------------------------- analytics
// VIP ANALYTICS, IN TABS (3 Oct 2026). Ethan: "I want also easily be able to compare month over month ... instead of
// saying every programme, just say every VIP community ... I like the graph, just improve it ... take some information
// and formats from the main analytics page and build it into this VIP analytics one. Have different tabs." So: the
// month at a glance with how it moved against the month before (the main page's StatCard and DeltaPill), the trend
// charts, a month-against-month table for any two months, the creators, and every VIP market side by side.
const pctMove = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 100) : null)

export function VipAnalyticsTab({ programme, programmes = [], isAdmin }) {
  const tr = useT()
  // OVERALL FIRST, THEN ONE MARKET AT A TIME (4 Oct 2026). Everyone who may see all the markets opens on the combined numbers.
  const mine = programmes.length ? programmes : [programme]
  const canAll = !!isAdmin && mine.length > 1
  const [scope, setScope] = useState(canAll ? 'all' : programme.id)
  const all = canAll && scope === 'all'
  const shown = all ? null : (mine.find((p) => p.id === scope) || programme)
  const [data, setData] = useState(null)
  const [view, setView] = useState('overview')
  const cur = (shown || mine[0] || programme).currency
  useEffect(() => {
    let alive = true
    setData(null)
    vipRpc('vip_analytics', { p_programme: all ? null : shown.id }).then((d) => { if (alive) setData(d) }).catch((e) => notice(e.message))
    return () => { alive = false }
  }, [shown?.id, all])

  const series = useMemo(() => (data?.months || []).map((m) => ({
    key: `${m.year}-${m.month}`, year: m.year, month: m.month,
    label: monthLabel(m.year, m.month, { short: true }), views: Number(m.views) || 0, cost: Number(m.cost) || 0,
    cpm: m.cpm == null ? null : Number(m.cpm), members: Number(m.members) || 0, videos: Number(m.videos) || 0,
    base: Number(m.base) || 0, bonus: Number(m.bonus) || 0, fresh: Number(m.new_members) || 0, top: m.top || null,
  })), [data])
  const last = series[series.length - 1]
  const prev = series[series.length - 2]
  const prevLabel = prev ? monthLabel(prev.year, prev.month) : null

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="scrollbar-none -mx-1 max-w-full overflow-x-auto px-1">
          <Segmented size="sm" value={view} onChange={setView} label={tr('Analytics view')} options={[
            { value: 'overview', label: tr('Overview') },
            { value: 'compare', label: tr('Month vs month') },
            { value: 'creators', label: tr('Creators') },
            { value: 'markets', label: tr('Markets') },
          ]} />
        </div>
      </div>
      {mine.length > 1 && <VipScopeSwitch programmes={mine} value={all ? 'all' : shown.id} onChange={setScope} allowAll={canAll} />}

      {view === 'markets' ? <MarketStandings /> : data === null ? (
        <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-card" />)}</div><Skeleton className="h-72 w-full rounded-card" /></div>
      ) : series.length === 0 ? (
        <p className="rounded-card border border-dashed border-gray-200 px-6 py-12 text-center text-sm text-smoke">{tr('Nothing to chart yet. The first month appears once it has been drafted.')}</p>
      ) : (
        <div key={view} className="animate-tab-in">
          {view === 'overview' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label={tr('Views, {m}', { m: monthLabel(last.year, last.month, { short: true }) })} value={formatViews(last.views)} delta={prev ? { pct: pctMove(last.views, prev.views), vs: prevLabel } : null} accent />
                <StatCard label={tr('Paid, {m}', { m: monthLabel(last.year, last.month, { short: true }) })} value={money(last.cost, cur, { cents: false })} delta={prev ? { pct: pctMove(last.cost, prev.cost), vs: prevLabel, lowerIsBetter: true } : null} />
                <StatCard label={tr('Cost per 1,000 views')} value={last.cpm != null ? perK(last.cpm, cur) : '-'} delta={prev && last.cpm != null && prev.cpm ? { pct: pctMove(last.cpm, prev.cpm), vs: prevLabel, lowerIsBetter: true } : null} />
                <StatCard label={tr('Active VIPs')} value={nf(data.members)} hint={tr('{n} videos in {m}', { n: nf(last.videos), m: monthLabel(last.year, last.month, { short: true }) })} />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <ChartCard title={tr('Views counted, month by month')} total={tr('{n} in all', { n: formatViews(series.reduce((a, m) => a + m.views, 0)) })}>
                  <ComposedChart data={series} margin={{ top: 8, right: 6, left: -10, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={CHART.grid} />
                    <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
                    <YAxis tick={axisTick} axisLine={false} tickLine={false} width={52} tickFormatter={(v) => formatViews(v)} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => [nf(v), tr('Views')]} cursor={{ fill: 'rgba(217,68,7,0.05)' }} />
                    <Bar dataKey="views" fill={FILL.brand} radius={[8, 8, 0, 0]} maxBarSize={44} animationDuration={800} />
                  </ComposedChart>
                </ChartCard>
                <ChartCard title={tr('What it cost, and the cost per 1,000 views')} total={tr('{a} in all', { a: money(series.reduce((a, m) => a + m.cost, 0), cur, { cents: false }) })}>
                  <ComposedChart data={series} margin={{ top: 8, right: 6, left: -10, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={CHART.grid} />
                    <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="l" tick={axisTick} axisLine={false} tickLine={false} width={52} tickFormatter={(v) => money(v, cur, { cents: false })} />
                    <YAxis yAxisId="r" orientation="right" tick={axisTick} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => Number(v).toFixed(2)} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v, k) => [k === 'cost' ? money(v, cur) : perK(v, cur), k === 'cost' ? tr('Cost') : tr('Per 1,000 views')]} cursor={{ fill: 'rgba(217,68,7,0.05)' }} />
                    <Bar yAxisId="l" dataKey="cost" fill={FILL.light} radius={[8, 8, 0, 0]} maxBarSize={44} animationDuration={800} />
                    <Line yAxisId="r" type="monotone" dataKey="cpm" stroke={CHART.brand} strokeWidth={2.5} dot={{ r: 3.5, fill: '#fff', stroke: CHART.brand, strokeWidth: 2 }} activeDot={{ r: 5 }} animationDuration={800} connectNulls />
                  </ComposedChart>
                </ChartCard>
              </div>
              <ChartCard title={tr('VIPs and videos, month by month')}>
                <ComposedChart data={series} margin={{ top: 8, right: 6, left: -10, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={CHART.grid} />
                  <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
                  <YAxis tick={axisTick} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v, k) => [nf(v), k === 'videos' ? tr('Videos') : tr('VIPs')]} cursor={{ fill: 'rgba(217,68,7,0.05)' }} />
                  <Bar dataKey="videos" fill={FILL.pale} radius={[8, 8, 0, 0]} maxBarSize={44} animationDuration={800} />
                  <Line type="monotone" dataKey="members" stroke={CHART.ink} strokeWidth={2} dot={{ r: 3 }} animationDuration={800} />
                </ComposedChart>
              </ChartCard>
            </div>
          )}

          {view === 'compare' && <MonthCompare series={series} cur={cur} />}

          {view === 'creators' && <CreatorsCost data={data} cur={cur} />}
        </div>
      )}
    </div>
  )
}

// ANY TWO MONTHS, SIDE BY SIDE (redrawn 4 Oct 2026). Ethan: "I would improve the UI of this month-versus-month interface and show more
// details in it." Two month cards on top (what each cost and brought in, and who led), then every figure as a pair of bars you can
// compare by eye, with how it moved. More figures than before: the views pay and the bonuses apart, new VIPs, cost per VIP.
function MonthCompare({ series, cur }) {
  const tr = useT()
  const opts = series.map((m) => ({ value: m.key, label: monthLabel(m.year, m.month) })).reverse()
  const [a, setA] = useState(series[series.length - 1]?.key)
  const [b, setB] = useState(series[series.length - 2]?.key || series[series.length - 1]?.key)
  const A = series.find((m) => m.key === a)
  const B = series.find((m) => m.key === b)
  if (!A || !B) return null
  const per = (n, d) => (d ? n / d : 0)
  const rows = [
    { label: tr('Views counted'), a: A.views, b: B.views, f: nf },
    { label: tr('Total paid'), a: A.cost, b: B.cost, f: (n) => money(n, cur, { cents: false }), low: true },
    { label: tr('Views pay'), a: A.base, b: B.base, f: (n) => money(n, cur, { cents: false }), low: true },
    { label: tr('Bonuses'), a: A.bonus, b: B.bonus, f: (n) => money(n, cur, { cents: false }), low: true },
    { label: tr('Cost per 1,000 views'), a: A.cpm ?? 0, b: B.cpm ?? 0, f: (n) => perK(n, cur), low: true },
    { label: tr('Active VIPs'), a: A.members, b: B.members, f: nf },
    { label: tr('New VIPs'), a: A.fresh, b: B.fresh, f: nf },
    { label: tr('Videos'), a: A.videos, b: B.videos, f: nf },
    { label: tr('Views per VIP'), a: per(A.views, A.members), b: per(B.views, B.members), f: (n) => nf(Math.round(n)) },
    { label: tr('Views per video'), a: per(A.views, A.videos), b: per(B.views, B.videos), f: (n) => nf(Math.round(n)) },
    { label: tr('Cost per VIP'), a: per(A.cost, A.members), b: per(B.cost, B.members), f: (n) => money(n, cur, { cents: false }), low: true },
  ]
  const head = (M, first) => (
    <div className={cx('rounded-card p-4 shadow-card', first ? 'brand-drift text-white' : 'border border-gray-100 bg-white')}>
      <p className={cx('text-[11px] font-bold uppercase tracking-wide', first ? 'text-white/85' : 'text-gray-400')}>{monthLabel(M.year, M.month)}</p>
      <p className={cx('mt-1 text-3xl font-bold tabular-nums', first ? 'text-white' : 'text-ink')}>{formatViews(M.views)}<span className={cx('ml-1.5 text-sm font-semibold', first ? 'text-white/80' : 'text-smoke')}>{tr('views')}</span></p>
      <p className={cx('mt-0.5 text-sm', first ? 'text-white/90' : 'text-smoke')}>{tr('{a} paid', { a: money(M.cost, cur, { cents: false }) })}{M.cpm != null ? ` · ${perK(M.cpm, cur)}` : ''}</p>
      {M.top && Number(M.top.views) > 0 && <p className={cx('mt-2 flex items-center gap-1.5 text-xs font-semibold', first ? 'text-white' : 'text-ink')}><Icon name="trophy" className={cx('h-3.5 w-3.5', first ? 'text-white' : 'text-brand')} />{tr('Led by {n}, {v} views', { n: M.top.name, v: formatViews(M.top.views) })}</p>}
    </div>
  )
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select variant="chip" value={a} onChange={setA} options={opts} ariaLabel={tr('Month')} search={false} className="w-44" />
        <span className="text-xs font-bold uppercase tracking-wide text-gray-400">{tr('against')}</span>
        <Select variant="chip" value={b} onChange={setB} options={opts} ariaLabel={tr('Month to compare with')} search={false} className="w-44" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">{head(A, true)}{head(B, false)}</div>
      <section className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 bg-cloud/60 px-4 py-2.5 text-[10.5px] font-bold uppercase tracking-wide text-gray-400">
          <span>{tr('Figure')}</span>
          <span className="flex items-center gap-4">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand" />{monthLabel(A.year, A.month, { short: true })}</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-gray-300" />{monthLabel(B.year, B.month, { short: true })}</span>
          </span>
        </div>
        <ul className="divide-y divide-gray-50">
          {rows.map((r) => {
            const pct = pctMove(r.a, r.b)
            const top = Math.max(r.a, r.b, 1e-9)
            const good = pct == null || pct === 0 ? null : (pct > 0) !== !!r.low
            return (
              <li key={r.label} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-ink">{r.label}</span>
                  {pct == null ? <span className="text-xs text-gray-300">-</span> : <span className={cx('inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums', good == null ? 'bg-cloud text-smoke' : good ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600')}>{pct > 0 ? '+' : ''}{pct}%</span>}
                </div>
                <div className="mt-2 space-y-1.5">
                  {[[r.a, 'bg-gradient-to-r from-brand to-brand-light', 'text-ink font-bold'], [r.b, 'bg-gray-300', 'text-smoke']].map(([v, bar, text], i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-cloud"><div className={cx('h-full rounded-full transition-[width] duration-700 ease-out', bar)} style={{ width: `${v > 0 ? Math.max(2, (v / top) * 100) : 0}%` }} /></div>
                      <span className={cx('w-24 shrink-0 text-right text-sm tabular-nums', text)}>{r.f(v)}</span>
                    </div>
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

// WHAT EACH CREATOR COSTS (4 Oct 2026). Ethan: "It should show their CPM here as well, their average CPM, coming out of everything: how
// much we're giving them and how much it is actually costing us." Every VIP's views, what they were paid in all (views pay and
// bonuses), and the cost per 1,000 views that works out to, against the average for everyone. Dearer than average is flagged.
function CreatorsCost({ data, cur }) {
  const tr = useT()
  const rows = (data.top || []).map((t) => ({ ...t, v: Number(t.views) || 0, cost: Number(t.earned) || 0, bonus: Number(t.bonus) || 0 }))
    .map((t) => ({ ...t, cpm: t.v > 0 ? (t.cost / t.v) * 1000 : null }))
  const totals = data.totals || { views: 0, cost: 0, videos: 0 }
  const avg = Number(totals.views) > 0 ? (Number(totals.cost) / Number(totals.views)) * 1000 : null
  const priced = rows.filter((r) => r.cpm != null)
  const cheapest = priced.length ? priced.reduce((m, r) => (r.cpm < m.cpm ? r : m)) : null
  const lead = Math.max(1, rows[0]?.v || 0)
  const [sort, setSort] = useState('views')
  const list = [...rows].sort((a, b) => (sort === 'cost' ? b.cost - a.cost : sort === 'cpm' ? (b.cpm ?? -1) - (a.cpm ?? -1) : b.v - a.v))
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={tr('Paid in all')} value={money(totals.cost, cur, { cents: false })} hint={tr('views pay and bonuses')} />
        <Stat label={tr('Views in all')} value={formatViews(totals.views)} hint={tr('{n} videos', { n: nf(totals.videos) })} />
        <Stat label={tr('Average cost per 1,000')} value={avg != null ? perK(avg, cur) : '-'} hint={tr('across every VIP')} />
        <Stat label={tr('Best value')} value={cheapest ? perK(cheapest.cpm, cur) : '-'} hint={cheapest ? cheapest.name : ''} />
      </div>
      <section className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
          <p className="text-[13.5px] font-bold text-ink">{tr('Creators, and what each one costs')}</p>
          <Segmented size="sm" value={sort} onChange={setSort} label={tr('Sort by')} options={[
            { value: 'views', label: tr('Views') }, { value: 'cost', label: tr('Cost') }, { value: 'cpm', label: tr('Cost per 1,000') },
          ]} />
        </div>
        <div className="hidden grid-cols-[2rem_minmax(0,1fr)_4rem_5rem_5.5rem_6rem] gap-3 bg-cloud/60 px-4 py-2 text-[10.5px] font-bold uppercase tracking-wide text-gray-400 sm:grid">
          <span>#</span><span>{tr('Creator')}</span><span className="text-right">{tr('Videos')}</span><span className="text-right">{tr('Views')}</span><span className="text-right">{tr('Paid')}</span><span className="text-right">{tr('Per 1,000')}</span>
        </div>
        {list.length === 0 ? <p className="px-4 py-8 text-center text-sm text-smoke">{tr('Nobody has been paid yet.')}</p> : (
          <ul className="divide-y divide-gray-50">
            {list.map((t, i) => {
              const dear = avg != null && t.cpm != null && t.cpm > avg * 1.25
              return (
                <li key={t.profile_id} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 sm:grid-cols-[2rem_minmax(0,1fr)_4rem_5rem_5.5rem_6rem]">
                  <span className={cx('flex h-7 w-7 items-center justify-center rounded-full text-xs font-extrabold tabular-nums', i === 0 ? 'bg-gradient-to-br from-brand to-brand-light text-white' : 'bg-cloud text-smoke')}>{i + 1}</span>
                  <Link to={`/vip?mode=as&who=${t.profile_id}`} className="group flex min-w-0 items-center gap-2.5">
                    <Avatar src={t.photo} name={t.name} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink group-hover:text-brand">{t.name}</span>
                      <span className="mt-1 block h-1 max-w-[10rem] overflow-hidden rounded-full bg-gray-100"><span className="block h-full rounded-full bg-gradient-to-r from-brand to-brand-light" style={{ width: `${Math.max(3, Math.round((t.v / lead) * 100))}%` }} /></span>
                    </span>
                  </Link>
                  <span className="hidden text-right text-xs tabular-nums text-smoke sm:block">{nf(t.videos)}</span>
                  <span className="hidden text-right text-sm font-bold tabular-nums text-ink sm:block">{formatViews(t.v)}</span>
                  <span className="hidden text-right text-sm tabular-nums text-smoke sm:block">{money(t.cost, cur, { cents: false })}{t.bonus > 0 ? <span className="block text-[10px] text-gray-400">{tr('{a} bonus', { a: money(t.bonus, cur, { cents: false }) })}</span> : null}</span>
                  <span className="text-right">
                    <span className={cx('inline-flex rounded-full px-2 py-0.5 text-[12px] font-bold tabular-nums', t.cpm == null ? 'text-gray-300' : dear ? 'bg-brand-tint text-brand' : 'bg-cloud text-ink')}>{t.cpm == null ? '-' : perK(t.cpm, cur)}</span>
                    <span className="mt-0.5 block text-[10px] text-smoke sm:hidden">{formatViews(t.v)} · {money(t.cost, cur, { cents: false })}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
      <p className="text-xs text-smoke">{tr('Per 1,000 is everything paid to a creator (views pay and bonuses) divided by their views. A tinted figure costs over a quarter more than the average.')}</p>
    </div>
  )
}

function ChartCard({ title, total, children }) {
  return (
    <div className="rounded-card border border-gray-100 bg-white p-4 shadow-card animate-rise sm:p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3"><p className="text-[13.5px] font-bold text-ink">{title}</p>{total && <p className="text-xs font-semibold text-smoke">{total}</p>}</div>
      <div className="h-64"><ResponsiveContainer>{children}</ResponsiveContainer></div>
    </div>
  )
}

// ------------------------------------------------------------------------------------- settings
/** How often every VIP video's views are read (app_settings `vip_sync`). A new video is read the moment it is added.
 *  A card of its own in the right column of Setup (3 Oct 2026): "the reviews you can put to the right for the space and
 *  that should obviously be every six hours for now." */
export function SyncEvery() {
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
    <section className="rounded-card border border-gray-100 bg-white p-5 shadow-card animate-rise [animation-delay:80ms]">
      <h3 className="flex items-center gap-2 text-[15px] font-bold text-ink"><Icon name="refresh" className="h-5 w-5 text-brand" />{tr('Reading the views')}</h3>
      <label className="mt-4 block">
        <span className="label">{tr('Read every VIP video every')}</span>
        <span className="flex items-center gap-2">
          <input className="input !w-20 text-center" inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value.replace(/[^\d]/g, ''))} onBlur={() => hours !== saved && save()} />
          <span className="text-sm text-smoke">{tr('hours')}</span>
        </span>
        <span className="mt-1.5 block text-[11px] text-smoke">{tr('For every VIP market. A new video is read as soon as it is added.')}</span>
      </label>
    </section>
  )
}

// SETUP, IN TWO COLUMNS (3 Oct 2026). Ethan: "improve the UI of it ... there's like a lot of space on the right column".
// Left: what a VIP is paid and what they read. Right (in VipTools): payouts, the stay-in rule and how often views are
// read. The monthly budget is gone ("unnecessary because obviously it's just depending on the view rate"), and so is
// closing a programme ("we don't want that function"). Every number is typed; no spinner arrows.
export function VipSettingsTab({ programme, onSaved }) {
  const tr = useT()
  const sym = curSym(programme.currency)
  const [f, setF] = useState(() => ({
    cpm: programme.cpm, monthly_cap: programme.monthly_cap ?? '',
    terms: programme.terms || DEFAULT_TERMS.map((p) => p.replace('{days}', String(programme.window_days || 60))).join('\n\n'), tiers: programme.tiers || [], reaccept: false,
    tagline: programme.tagline || '', welcome_message: programme.welcome_message || '',
  }))
  const [busy, setBusy] = useState(false)
  const set = (p) => setF((x) => ({ ...x, ...p }))
  const dis = !programme.can_manage
  const num = (v) => String(v).replace(',', '.').replace(/[^\d.]/g, '')

  async function save() {
    setBusy(true)
    const row = {
      cpm: Number(f.cpm) || 0,
      monthly_cap: f.monthly_cap === '' ? null : Number(f.monthly_cap),
      terms: (f.terms.trim() === DEFAULT_TERMS.map((p) => p.replace('{days}', String(programme.window_days || 60))).join('\n\n') ? '' : f.terms.trim()) || null,
      tiers: f.tiers.filter((t) => Number(t.from_views) > 0 && Number(t.cpm) >= 0).map((t) => ({ from_views: Number(t.from_views), cpm: Number(t.cpm) })).sort((a, b) => a.from_views - b.from_views),
      ...(f.reaccept ? { terms_version: programme.terms_version + 1 } : {}),
      tagline: f.tagline.trim() || null, welcome_message: f.welcome_message.trim() || null,
    }
    const { error } = await supabase.from('vip_programmes').update(row).eq('id', programme.id)
    setBusy(false)
    if (error) { notice(error.message); return }
    toastSuccess(tr('Saved. Changes apply from now on; months already closed are not touched.'))
    onSaved()
  }

  const money$ = (value, onChange, placeholder) => (
    <span className="relative block">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-400">{sym}</span>
      <input className="input !pl-8" inputMode="decimal" value={value} disabled={dis} onChange={(e) => onChange(num(e.target.value))} placeholder={placeholder} />
    </span>
  )

  return (
    <div className="space-y-5">
      <section className="rounded-card border border-gray-100 bg-white p-5 shadow-card animate-rise">
        <h3 className="flex items-center gap-2 text-[15px] font-bold text-ink"><Icon name="money" className="h-5 w-5 text-brand" />{tr('What VIPs are paid')}</h3>
        <p className="mt-0.5 text-sm text-smoke">{tr('For every VIP in {p}. One VIP can have their own deal from Members.', { p: programme.name })}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block"><span className="label">{tr('Rate per 1,000 views')}</span>{money$(f.cpm, (v) => set({ cpm: v }), '0.25')}</label>
          <label className="block"><span className="label">{tr('Monthly cap per VIP (optional)')}</span>{money$(f.monthly_cap, (v) => set({ monthly_cap: v }), tr('No cap'))}<span className="mt-1 block text-[11px] text-smoke">{tr('The most one VIP\'s views can earn in a month.')}</span></label>
        </div>

        {/* "HIGHER RATES AT HIGHER VIEWS", SAID PLAINLY (3 Oct 2026). Ethan: "I don't really get this ... is this like, if
            they reach over a million views, it jumps to 0.35?" Yes - and now the screen says it in those words, with
            the step written out as a sentence beside the fields. */}
        <div className="mt-5 rounded-xl border border-gray-100 bg-cloud/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-ink">{tr('Pay more once a VIP passes a number of views (optional)')}</span>
            {!dis && <button type="button" onClick={() => set({ tiers: [...f.tiers, { from_views: '', cpm: '' }] })} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand shadow-sm transition-transform hover:scale-105"><Icon name="plus" className="mr-0.5 inline h-3.5 w-3.5" />{tr('Add a step')}</button>}
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-smoke">{tr('For example: from 1,000,000 views in a month, pay {r} per 1,000 on the views above that number. The views below it keep the normal rate.', { r: `${sym}0.35` })}</p>
          {f.tiers.length > 0 && (
            <ul className="mt-3 space-y-2">
              {f.tiers.map((t, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-sm text-smoke shadow-sm animate-rise">
                  <span>{tr('From')}</span>
                  <input className="input !w-32 !py-1.5" inputMode="numeric" value={t.from_views} disabled={dis} onChange={(e) => set({ tiers: f.tiers.map((x, j) => (j === i ? { ...x, from_views: e.target.value.replace(/[^\d]/g, '') } : x)) })} placeholder="1000000" aria-label={tr('Views in the month')} />
                  <span>{tr('views a month, pay')}</span>
                  <span className="w-28">{money$(t.cpm, (v) => set({ tiers: f.tiers.map((x, j) => (j === i ? { ...x, cpm: v } : x)) }), '0.35')}</span>
                  <span>{tr('per 1,000')}</span>
                  {!dis && <button type="button" onClick={() => set({ tiers: f.tiers.filter((_, j) => j !== i) })} aria-label={tr('Remove')} className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-smoke transition-colors hoverable:hover:bg-red-50 hoverable:hover:text-red-500"><Icon name="close" className="h-4 w-4" /></button>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="space-y-4 rounded-card border border-gray-100 bg-white p-5 shadow-card animate-rise [animation-delay:60ms]">
        <div>
          <h3 className="flex items-center gap-2 text-[15px] font-bold text-ink"><Icon name="star" className="h-5 w-5 text-brand" />{tr('What your VIPs read')}</h3>
          <p className="text-sm text-smoke">{tr('Two short texts on the VIP page of this market. Leave either empty and the standard wording is used.')}</p>
        </div>
        <label className="block"><span className="label">{tr('Line under the page title')}</span><input className="input" maxLength={120} value={f.tagline} disabled={dis} onChange={(e) => set({ tagline: e.target.value })} placeholder={tr('For example: The Spanish VIP creators')} /></label>
        <label className="block"><span className="label">{tr('Welcome note, shown to every new VIP')}</span><textarea className="input min-h-[5rem] resize-y" maxLength={1000} value={f.welcome_message} disabled={dis} onChange={(e) => set({ welcome_message: e.target.value })} placeholder={tr('Leave empty for the standard welcome.')} /></label>
      </section>

      <section className="space-y-3 rounded-card border border-gray-100 bg-white p-5 shadow-card animate-rise [animation-delay:120ms]">
        <div>
          <h3 className="flex items-center gap-2 text-[15px] font-bold text-ink"><Icon name="book" className="h-5 w-5 text-brand" />{tr('The terms VIPs accept')}</h3>
          <p className="text-sm text-smoke">{tr('This is exactly what a VIP reads and agrees to before they are paid. Separate the points with a blank line.')}</p>
        </div>
        <textarea className="input min-h-[14rem] resize-y text-[13px] leading-relaxed" value={f.terms} disabled={dis} onChange={(e) => set({ terms: e.target.value })} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2.5 text-sm text-ink"><Toggle on={f.reaccept} onChange={(v) => set({ reaccept: v })} label={tr('Ask every VIP to accept the terms again')} disabled={dis} />{tr('Ask every VIP to accept them again')}</label>
          <span className="flex items-center gap-3 text-xs text-smoke">
            {!dis && <button type="button" onClick={() => set({ terms: DEFAULT_TERMS.map((p) => p.replace('{days}', String(programme.window_days || 60))).join('\n\n') })} className="font-semibold hover:text-ink">{tr('Put the standard terms back')}</button>}
            {tr('Version {v}', { v: programme.terms_version })}
          </span>
        </div>
      </section>
      {!dis && (
        <div className="sticky bottom-4 z-10 flex justify-end">
          <button type="button" onClick={save} disabled={busy} className="btn-primary shadow-lift">{busy ? <Spinner className="h-4 w-4" /> : <Icon name="check" className="h-4 w-4" />}{tr('Save the settings')}</button>
        </div>
      )}
    </div>
  )
}
