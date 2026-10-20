import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Select, Skeleton, Toggle } from '../../../components/ui'
import Icon from '../../../components/Icon'
import { CountUp } from '../../../components/network/Motion'
import { CHART, FILL, axisTick, stackShape, tooltipStyle } from '../../../components/charts/chartTheme'
import { teamApi } from '../../../api/team'
import { cx, downloadCsv, formatViews } from '../../../lib/utils'
import {
  CSV_COLUMNS, SEGMENTS, addMonths, buildMonths, combineSegments, csvRows, defaultRange, monthKey, monthLabel, monthRange,
  monthStart, neededGrowth, planOf, summarise,
} from '../../../lib/cccTargets'
import { Card, MonthRangePicker, ProgressBar, Segmented, StatusChip, Term, eur, pct, signedPct, toneText, views } from './targets/parts'
import TargetsSheet from './targets/TargetsSheet'
import MonthDetail from './targets/MonthDetail'
import PlanEditor from './targets/PlanEditor'

// TARGETS & PROFIT (20 Oct 2026; rebuilt the same evening after the team's first look). The "CCC Targets" sheet, live:
// every month's view target against what the community (and the VIPs) actually did, what those views earn Tryp.com at
// the EPM, what they really cost, and the margin.
//
// NOTHING IS TYPED IN AFTER THE FACT. The targets come from a growth plan (ccc_plans: one anchor month and a monthly
// growth, migration 446), so every month, including ones that have not arrived yet, has a target without anybody
// adding it. Everything measured is `admin_ccc_actuals`, read when the tab opens or Refresh is pressed (no timer): views
// gained inside each month, challenges that ran off the platform, prize pots and vouchers, other rewards, VIP pay.

const COSTS = [
  { key: 'real', label: 'Real costs', hint: 'Prize pots, vouchers and VIP pay the platform recorded, plus other costs' },
  { key: 'target', label: 'At target CPM', hint: 'Achieved views x the target CPM, the way the old sheet worked' },
]
const METRICS = [
  { key: 'views', label: 'Views' },
  { key: 'earnings', label: 'Earnings' },
  { key: 'costs', label: 'Costs' },
  { key: 'margin', label: 'Margin' },
]
const COUNT = 700 // the page's numbers count up quickly (the default 1.6s felt slow here)
const isMonth = (s) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s || '')
const cache = new Map()

function agoText(at, now) {
  if (!at) return ''
  const m = Math.floor((now - at) / 60000)
  return m < 1 ? 'Updated just now' : m < 60 ? `Updated ${m} min ago` : `Updated ${Math.floor(m / 60)} h ago`
}

export default function Targets() {
  const [params, setParams] = useSearchParams()
  const setParam = useCallback((patch) => {
    const q = { ...Object.fromEntries(params) }
    for (const [k, v] of Object.entries(patch)) { if (v == null || v === '') delete q[k]; else q[k] = v }
    setParams(q, { replace: true })
  }, [params, setParams])

  const seg = ['community', 'vip', 'all'].includes(params.get('seg')) ? params.get('seg') : 'community'
  const costMode = params.get('costs') === 'target' ? 'target' : 'real'
  const [metric, setMetric] = useState('views')
  const [cumulative, setCumulative] = useState(false)
  const [includePlanned, setIncludePlanned] = useState(false)
  const [openMonth, setOpenMonth] = useState(null)
  const [editing, setEditing] = useState(null) // null | { segment, focus }
  const [tick, setTick] = useState(0)
  const [clock, setClock] = useState(() => Date.now())
  useEffect(() => { const id = setInterval(() => setClock(Date.now()), 30_000); return () => clearInterval(id) }, [])

  // THE PLAN: two growth plans and the months set by hand. Small, read whole. Kept on screen while it re-reads, so a
  // save never blanks the page (the "flash" the team saw was the page dropping to a skeleton and back).
  const [plan, setPlan] = useState({ plans: null, targets: null, error: '' })
  useEffect(() => {
    let alive = true
    Promise.all([
      teamApi.cccPlans().select('*'),
      teamApi.cccTargets().select('*').order('year').order('month'),
    ]).then(([p, t]) => {
      if (!alive) return
      const error = p.error?.message || t.error?.message || ''
      setPlan((old) => (error ? { ...old, error } : { plans: p.data || [], targets: t.data || [], error: '' }))
    })
    return () => { alive = false }
  }, [tick])
  const { plans, targets } = plan

  // THE MONTHS SHOWN. The URL wins; otherwise the plan's first month to nine months from now, so new months join the
  // page on their own as the calendar moves.
  const nowMonth = useMemo(() => { const d = new Date(clock); return monthKey(d.getUTCFullYear(), d.getUTCMonth() + 1) }, [clock])
  const range = useMemo(() => defaultRange(plans || [], nowMonth), [plans, nowMonth])
  const from = isMonth(params.get('from')) ? params.get('from') : range.from
  const toRaw = isMonth(params.get('to')) ? params.get('to') : range.to
  const to = toRaw < from ? from : toRaw
  const months = useMemo(() => monthRange(from, to), [from, to])

  // WHAT HAPPENED. Only the months that have started are worth asking about.
  const askTo = to < nowMonth ? to : nowMonth
  const actualKey = `${from}|${askTo}|${tick}`
  const [actuals, setActuals] = useState({ key: null, data: null, error: '', at: 0 })
  useEffect(() => {
    let alive = true
    const empty = { months: [], challenges: [], imported: [], other_rewards: [], vip_pay: [] }
    if (from > nowMonth) { setActuals({ key: actualKey, data: empty, error: '', at: Date.now() }); return undefined }
    const hit = cache.get(actualKey)
    if (hit) { setActuals({ key: actualKey, ...hit, error: '' }); return undefined }
    const end = new Date(monthStart(addMonths(askTo, 1)) - 86_400_000).toISOString().slice(0, 10)
    Promise.resolve(teamApi.adminCccActuals({ p_from: `${from}-01`, p_to: end })).then(({ data, error }) => {
      if (!alive) return
      if (error) setActuals((old) => ({ ...old, key: actualKey, error: error.message || 'The actual figures could not be loaded.' }))
      else { const v = { data, at: Date.now() }; cache.set(actualKey, v); setActuals({ key: actualKey, ...v, error: '' }) }
    })
    return () => { alive = false }
  }, [actualKey, from, askTo, nowMonth])
  const loadingActuals = actuals.key !== actualKey
  const data = actuals.data
  const vipHidden = data && data.vip_visible === false

  // "Now" is when the figures were read, so a month's pace and the views it is measured on are the same moment.
  const now = actuals.at
  const segRows = useMemo(() => {
    if (!targets || !plans || !data) return null
    const opts = { months, plans, targets, actuals: data, now, costMode, includePlanned }
    const community = buildMonths({ ...opts, segment: 'community' })
    const vip = buildMonths({ ...opts, segment: 'vip' })
    return { community, vip, all: combineSegments(community, vip) }
  }, [targets, plans, data, months, now, costMode, includePlanned])
  const rows = segRows?.[seg] || null
  const summary = useMemo(() => (rows ? summarise(rows) : null), [rows])

  const refresh = () => { cache.clear(); setTick((n) => n + 1) }
  const segLabel = SEGMENTS.find((s) => s.key === seg)?.label

  function downloadData() {
    if (!segRows) return
    const sets = seg === 'all' ? [['Community', segRows.community], ['VIP', segRows.vip], ['Combined', segRows.all]] : [[segLabel, rows]]
    downloadCsv(`tryp-com-targets-${seg}-${from}-to-${to}.csv`, sets.flatMap(([label, list]) => csvRows(list, label)), CSV_COLUMNS)
  }

  const error = plan.error || actuals.error
  return (
    <div className="space-y-6">
      {/* ---- THE CONTROLS: whose numbers, which months, how costs are counted; then the actions. ---- */}
      <Card className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center" delay={0}>
        <Segmented full value={seg} options={SEGMENTS} onChange={(k) => setParam({ seg: k === 'community' ? null : k })} className="lg:w-auto" />
        <div className="flex flex-wrap items-center gap-2">
          <MonthRangePicker from={from} to={to} nowKey={nowMonth} planFrom={range.from} planTo={range.to}
            onChange={(a, b) => setParam(a === range.from && b === range.to ? { from: null, to: null } : { from: a, to: b })} />
          <Segmented size="sm" value={costMode} options={COSTS} onChange={(k) => setParam({ costs: k === 'real' ? null : k })} />
        </div>
        <div className="flex items-center gap-2 lg:ml-auto">
          <button type="button" onClick={refresh} disabled={loadingActuals} title={`Read the figures again (${agoText(actuals.at, clock).toLowerCase()})`}
            className="group inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium text-smoke transition-colors hoverable:hover:bg-cloud hoverable:hover:text-ink disabled:opacity-60">
            <Icon name="refresh" className={cx('h-4 w-4 text-brand transition-transform duration-500 group-hover:rotate-180', loadingActuals && 'animate-spin')} />
            <span className="whitespace-nowrap max-sm:hidden lg:hidden 2xl:inline">{loadingActuals ? 'Updating…' : agoText(actuals.at, clock)}</span>
          </button>
          <span className="ml-auto flex items-center gap-2">
            <button type="button" disabled={!rows} onClick={downloadData} title="Download these months as a spreadsheet (CSV)"
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3.5 text-[13px] font-semibold text-ink shadow-sm transition-all hoverable:hover:-translate-y-0.5 disabled:opacity-40">
              <Icon name="download" className="h-4 w-4 text-brand" />CSV
            </button>
            <button type="button" disabled={!targets} onClick={() => setEditing({ segment: seg === 'all' ? 'community' : seg })}
              className="btn-primary !h-9 whitespace-nowrap !py-0 text-[13px] disabled:opacity-40">
              <Icon name="sliders" className="h-4 w-4" />Edit plan
            </button>
          </span>
        </div>
      </Card>

      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
      {vipHidden && seg !== 'community' && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">VIP figures need VIP access, so only the plan shows here.</p>
      )}

      {!rows && !error && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3"><Skeleton className="h-72 rounded-card lg:col-span-2" /><Skeleton className="h-72 rounded-card" /></div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-card" />)}</div>
          <Skeleton className="h-80 w-full rounded-card" />
        </div>
      )}

      {rows && summary && (
        <div key={seg} className={cx('animate-tab-in space-y-6 transition-opacity duration-300', loadingActuals && 'opacity-70')}>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <MonthHero row={summary.live || summary.lastDone} onOpen={(k) => setOpenMonth(k)} segLabel={segLabel} />
            <GoalCard rows={rows} summary={summary} plan={seg === 'all' ? null : planOf(plans, seg)} />
          </div>

          <Totals summary={summary} rows={rows} costMode={costMode} />

          <TrendChart rows={rows} metric={metric} setMetric={setMetric} cumulative={cumulative} setCumulative={setCumulative} onOpen={setOpenMonth} />

          <TargetsSheet rows={rows} seg={seg} onOpen={setOpenMonth} onEdit={(focus) => setEditing({ segment: seg === 'all' ? 'community' : seg, focus })} />

          <CostsCard rows={rows} seg={seg} includePlanned={includePlanned} setIncludePlanned={setIncludePlanned} costMode={costMode} onOpen={setOpenMonth} />

          <HowItWorks plans={plans} />
        </div>
      )}

      {openMonth && segRows && (
        <MonthDetail
          monthKey={openMonth}
          seg={seg}
          segRows={segRows}
          costMode={costMode}
          onClose={() => setOpenMonth(null)}
          onEdit={(segment) => { setOpenMonth(null); setEditing({ segment, focus: openMonth }) }}
        />
      )}
      {editing && targets && plans && (
        <PlanEditor
          segment={editing.segment}
          focus={editing.focus}
          plans={plans}
          targets={targets}
          from={from}
          to={to}
          nowKey={nowMonth}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setTick((n) => n + 1) }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------------------
// THIS MONTH. Views so far against the target, where the month should be by today (the tick), where the pace lands
// (the lighter run), and what it needs a day from here. A finished month shows its final result in the same card.
function MonthHero({ row, onOpen, segLabel }) {
  if (!row) {
    return (
      <Card className="flex flex-col justify-center p-6 lg:col-span-2">
        <p className="text-sm text-smoke">No month in this range has started yet. Pick earlier months above to see results.</p>
      </Card>
    )
  }
  const live = row.state === 'live'
  const expected = live && row.target ? row.target * row.share : null
  const vsExpected = expected ? row.achieved / expected - 1 : null
  return (
    <Card className="relative overflow-hidden !border-0 bg-gradient-to-br from-brand to-brand-light p-5 text-white shadow-lift sm:p-7 lg:col-span-2" delay={40}>
      <span aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/15 blur-3xl" />
      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white/90">{segLabel} · {row.longLabel}</p>
          <p className="mt-0.5 text-[13px] text-white/75">{live ? `Day ${Math.floor(row.elapsed) + 1} of ${row.days}` : 'Month complete'}</p>
        </div>
        <StatusChip status={row.status} live={live} className="!bg-white !ring-0" />
      </div>

      <div className="relative mt-5 flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <p className="text-[13px] font-medium text-white/80">{live ? 'Views so far' : 'Views achieved'}</p>
          <p className="text-4xl font-extrabold tracking-tight tabular-nums sm:text-5xl"><CountUp value={row.achieved || 0} format={views} duration={COUNT} /></p>
        </div>
        <div className="pb-1">
          <p className="text-[13px] font-medium text-white/80">of the target</p>
          <p className="text-xl font-bold tabular-nums sm:text-2xl">{row.target != null ? views(row.target) : 'Not set'}</p>
        </div>
      </div>

      <ProgressBar className="relative mt-5" dark value={row.achieved} projected={live ? row.projected : null} target={row.target} expected={expected} />
      {live && expected != null && (
        <p className="relative mt-2 text-[13px] text-white/85">
          By today it should be at <span className="font-semibold text-white">{formatViews(expected)}</span>
          {vsExpected != null && <> · <span className="font-semibold text-white">{vsExpected >= 0 ? `${pct(vsExpected)} ahead` : `${pct(Math.abs(vsExpected))} behind`}</span></>}
        </p>
      )}

      <div className="relative mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {live ? (
          <>
            <HeroStat label={<Term k="pace" light>On pace for</Term>} value={views(row.projected)} sub={row.projectedPct != null ? `${pct(row.projectedPct)} of target` : null} />
            <HeroStat label="Needed a day" value={row.neededPerDay != null ? formatViews(row.neededPerDay) : '-'} sub={`Doing ${formatViews(row.perDay)} a day now`} />
            <HeroStat label={<Term k="margin" light>Margin so far</Term>} value={eur(row.actualMargin)} sub={`Heading for ${eur(row.projectedMargin)}`} />
          </>
        ) : (
          <>
            <HeroStat label="Earnings" value={eur(row.actualEarnings)} sub={`Plan ${eur(row.estEarnings)}`} />
            <HeroStat label="Costs" value={eur(row.actualCost)} sub={`Plan ${eur(row.estCost)}`} />
            <HeroStat label={<Term k="margin" light>Margin</Term>} value={eur(row.actualMargin)} sub={`Plan ${eur(row.estMargin)}`} />
          </>
        )}
      </div>
      <button type="button" onClick={() => onOpen(row.key)} className="relative mt-5 inline-flex items-center gap-1 rounded-full bg-white/15 px-3.5 py-1.5 text-[13px] font-semibold text-white transition-all hoverable:hover:-translate-y-0.5 hoverable:hover:bg-white/25">
        Open {row.longLabel.split(' ')[0]} in full <Icon name="chevronRight" className="h-3.5 w-3.5" />
      </button>
    </Card>
  )
}

function HeroStat({ label, value, sub }) {
  return (
    <div className="rounded-2xl bg-white/15 px-4 py-3">
      <p className="text-[13px] font-medium text-white/85">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums leading-tight">{value}</p>
      {sub && <p className="mt-0.5 text-[13px] text-white/75">{sub}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------------------
// THE GOAL: a future month's target, how far the current pace is from it, and the monthly growth that closes the gap.
function GoalCard({ rows, summary, plan }) {
  const planned = rows.filter((r) => r.target != null && r.state !== 'done')
  // The anchor month when it is still ahead (January for the community); otherwise three months out.
  const future = planned.filter((r) => r.state === 'future')
  const anchorRow = plan && future.find((r) => r.key === plan.anchor)
  const defaultGoal = (anchorRow || future[2] || future[future.length - 1] || planned[planned.length - 1])?.key
  const [picked, setGoalKey] = useState(null)
  const goal = rows.find((r) => r.key === (picked || defaultGoal))
  const base = summary.live || summary.lastDone
  if (!goal || goal.target == null) {
    return <Card className="p-6" delay={80}><p className="text-sm text-smoke">Add a growth plan to track a goal.</p></Card>
  }
  const now = base ? base.projected : null
  const steps = base ? monthRange(base.key, goal.key).length - 1 : null
  const need = steps > 0 ? neededGrowth(now, goal.target, steps) : null
  const share = now && goal.target ? Math.min(1, now / goal.target) : 0
  const reached = now != null && now >= goal.target
  const R = 52
  const C = 2 * Math.PI * R
  return (
    <Card className="flex flex-col p-5 sm:p-6" delay={80}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[15px] font-bold text-ink"><Icon name="flag" className="h-5 w-5 text-brand" />Goal</h3>
        <Select variant="pill" value={goal.key} onChange={setGoalKey} ariaLabel="Goal month" search={false}
          options={planned.map((r) => ({ value: r.key, label: r.longLabel }))} />
      </div>
      <div className="mt-5 flex items-center gap-5">
        <svg viewBox="0 0 120 120" className="h-28 w-28 shrink-0 -rotate-90">
          <defs>
            <linearGradient id="tg-goal" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stopColor="#d94407" /><stop offset="100%" stopColor="#f5853f" /></linearGradient>
          </defs>
          <circle cx="60" cy="60" r={R} fill="none" stroke={CHART.rest} strokeWidth="11" />
          <circle cx="60" cy="60" r={R} fill="none" stroke="url(#tg-goal)" strokeWidth="11" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - share)} className="transition-[stroke-dashoffset] duration-700 ease-out" />
          <text x="60" y="60" transform="rotate(90 60 60)" textAnchor="middle" dominantBaseline="central" className="fill-ink text-[22px] font-extrabold">{pct(share)}</text>
        </svg>
        <div className="min-w-0">
          <p className="text-2xl font-extrabold tabular-nums text-ink">{formatViews(goal.target)}</p>
          <p className="text-[13px] text-smoke">views in {goal.longLabel}</p>
          {base && <p className="mt-2 text-[13px] text-smoke">Today: <span className="font-semibold text-ink">{formatViews(now)}</span> {base.state === 'live' ? 'on pace' : 'last month'}</p>}
        </div>
      </div>
      <div className="mt-auto pt-5">
        {reached ? (
          <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">Already at the goal pace.</p>
        ) : (
          <p className="rounded-xl bg-cloud px-3.5 py-2.5 text-sm text-smoke">
            Needs <span className="font-bold text-brand">{need != null ? signedPct(need) : '-'}</span> a month for {steps} month{steps === 1 ? '' : 's'}
            {plan ? <> · the plan grows <span className="font-semibold text-ink">{pct(plan.growth)}</span></> : null}
          </p>
        )}
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------------------------------------------------
// THE TOTALS for the months picked that have started (the month in progress counts up to today).
function Totals({ summary, rows, costMode }) {
  const measured = rows.filter((r) => r.state !== 'future' && r.achieved != null)
  if (!measured.length) return null
  const span = measured.length === 1 ? measured[0].longLabel : `${monthLabel(measured[0].key, 'pick')} – ${monthLabel(measured[measured.length - 1].key, 'pick')}`
  const tiles = [
    { label: <Term k="achieved">Views</Term>, value: summary.achieved, format: views, sub: summary.targetToDate ? `${pct(summary.pctToDate)} of ${formatViews(summary.targetToDate)} due` : null, tone: summary.pctToDate >= 1 ? 'good' : summary.pctToDate >= 0.9 ? 'warn' : 'bad' },
    { label: <Term k="epm">Earnings</Term>, value: summary.earnings, format: (n) => eur(n), sub: `Plan ${eur(summary.estEarnings)}` },
    { label: <Term k="costs">{costMode === 'target' ? 'Costs at target CPM' : 'Costs'}</Term>, value: summary.cost, format: (n) => eur(n), sub: summary.cpm != null ? `${eur(summary.cpm, true)} per 1,000 views` : null },
    { label: <Term k="margin">Margin</Term>, value: summary.margin, format: (n) => eur(n), sub: summary.marginPct != null ? `${pct(summary.marginPct)} of earnings` : null, tone: summary.margin >= summary.estMargin ? 'good' : 'warn' },
  ]
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-1">
        <h3 className="text-[15px] font-bold text-ink">Totals · {span}</h3>
        {summary.live && <p className="text-[13px] text-smoke">{summary.live.longLabel.split(' ')[0]} counts up to today</p>}
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((t, i) => (
          <Card key={i} className="p-4 sm:p-5" delay={100 + i * 40}>
            <p className="text-[13px] font-semibold text-smoke">{t.label}</p>
            <p className={cx('mt-1.5 text-xl font-extrabold tabular-nums sm:text-2xl', i === 3 && summary.margin < 0 ? 'text-red-600' : 'text-ink')}>
              <CountUp value={t.value || 0} format={t.format} duration={COUNT} />
            </p>
            {t.sub && <p className={cx('mt-1 text-[13px] leading-snug', t.tone ? toneText[t.tone] : 'text-smoke')}>{t.sub}</p>}
          </Card>
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------------------------------------------------
// THE CHART. Bars are what happened (this month's so-far solid, the rest of its pace lighter on top); the dashed line
// is the plan. Switching the measure or the total re-draws the bars from the axis, so the change is visible.
function TrendChart({ rows, metric, setMetric, cumulative, setCumulative, onOpen }) {
  const series = useMemo(() => {
    const pick = {
      views: (r) => [r.achieved, r.projected, r.target],
      earnings: (r) => [r.actualEarnings, r.projectedEarnings, r.estEarnings],
      costs: (r) => [r.actualCost, r.projectedCost, r.estCost],
      margin: (r) => [r.actualMargin, r.projectedMargin, r.estMargin],
    }[metric]
    const out = []
    let runA = 0
    let runT = 0
    for (const r of rows) {
      const [a, p, t] = pick(r)
      const live = r.state === 'live'
      const pace = live && p != null && a != null ? Math.max(0, p - a) : null
      if (t != null) runT += t
      if (a != null) runA += a
      out.push({
        key: r.key, label: r.label, state: r.state, status: r.status, pace,
        plan: t == null ? null : cumulative ? runT : t,
        actual: a == null ? null : cumulative ? runA : a,
      })
    }
    return out
  }, [rows, metric, cumulative])
  const isMoney = metric !== 'views'
  const fmt = (v) => (isMoney ? eur(v) : views(v))
  const tick = (v) => (isMoney ? `€${formatViews(v)}` : formatViews(v))
  const negative = series.some((s) => (s.actual || 0) < 0 || (s.plan || 0) < 0)
  const name = METRICS.find((m) => m.key === metric).label
  return (
    <Card className="p-5 sm:p-6" delay={160}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-bold text-ink">{name} against the plan</h3>
          <p className="text-[13px] text-smoke">{cumulative ? 'Added up month after month.' : 'Each month on its own.'} Click a month for the detail.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented size="sm" value={metric} options={METRICS} onChange={setMetric} />
          <Segmented size="sm" value={cumulative ? 'run' : 'month'} options={[{ key: 'month', label: 'Monthly' }, { key: 'run', label: 'Running total' }]} onChange={(k) => setCumulative(k === 'run')} />
        </div>
      </div>
      <div key={`${metric}-${cumulative}`} className="h-64 w-full animate-tab-in sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={series} margin={{ top: 8, right: 6, left: -4, bottom: 0 }} onClick={(e) => e?.activePayload?.[0] && onOpen(e.activePayload[0].payload.key)}>
            <defs>
              <linearGradient id="tg-bar" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#f5853f" /><stop offset="100%" stopColor="#d94407" /></linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={CHART.grid} strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: CHART.grid }} tickMargin={8} interval="preserveStartEnd" />
            <YAxis tick={axisTick} tickLine={false} axisLine={false} width={56} tickFormatter={tick} />
            {negative && <ReferenceLine y={0} stroke={CHART.muted} />}
            <Tooltip cursor={{ fill: 'rgba(217,68,7,0.06)' }} contentStyle={tooltipStyle}
              formatter={(v, n) => [fmt(v), n === 'actual' ? 'Achieved' : n === 'pace' ? 'Rest of the pace' : 'Plan']}
              labelFormatter={(l, p) => {
                const s = p?.[0]?.payload
                return s ? `${l}${s.state === 'live' ? ' · in progress' : s.state === 'future' ? ' · upcoming' : ''}` : l
              }} />
            <Bar dataKey="actual" stackId="a" fill="url(#tg-bar)" shape={stackShape(['actual', 'pace'], 'actual')} maxBarSize={44} animationDuration={600} animationEasing="ease-out" cursor="pointer">
              {series.map((s) => <Cell key={s.key} fill={s.state === 'done' && s.status === 'hit' && metric === 'views' ? FILL.green : 'url(#tg-bar)'} />)}
            </Bar>
            <Bar dataKey="pace" stackId="a" fill={FILL.pale} shape={stackShape(['actual', 'pace'], 'pace')} maxBarSize={44} animationDuration={600} animationEasing="ease-out" cursor="pointer" />
            <Line dataKey="plan" type="monotone" stroke={CHART.ink} strokeWidth={2} strokeDasharray="6 5" dot={{ r: 3, fill: CHART.ink, strokeWidth: 0 }} activeDot={{ r: 5 }} animationDuration={700} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-smoke">
        <Legend swatch="bg-gradient-to-t from-brand to-brand-light" label="Achieved" />
        {metric === 'views' && <Legend swatch="bg-gradient-to-t from-emerald-500 to-emerald-300" label="Target hit" />}
        <Legend swatch="bg-brand/25" label="Rest of this month's pace" />
        <span className="inline-flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-ink" />Plan</span>
      </p>
    </Card>
  )
}
function Legend({ swatch, label }) {
  return <span className="inline-flex items-center gap-1.5"><span className={cx('h-2.5 w-2.5 rounded-sm', swatch)} />{label}</span>
}

// ---------------------------------------------------------------------------------------------------------------------
// WHERE THE MONEY WENT, month by month.
function CostsCard({ rows, seg, includePlanned, setIncludePlanned, costMode, onOpen }) {
  const keys = seg === 'community' ? ['challenges', 'rewards', 'other'] : seg === 'vip' ? ['vip', 'official', 'other'] : ['community', 'vip']
  const names = { challenges: 'Challenge prizes and vouchers', rewards: 'Other rewards', other: 'Other costs', vip: seg === 'all' ? 'VIP and official' : 'VIP pay', official: 'Official creators pay', community: 'Community' }
  const fills = [FILL.brand, FILL.amber, FILL.gray]
  const swatches = ['bg-gradient-to-t from-brand to-brand-light', 'bg-gradient-to-t from-amber-500 to-amber-300', 'bg-gray-300']
  const data = rows.filter((r) => r.state !== 'future').map((r) => ({ key: r.key, label: r.label, state: r.state, ...Object.fromEntries(keys.map((k) => [k, r.costs?.[k] || 0])) }))
  return (
    <Card className="p-5 sm:p-6" delay={220}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-bold text-ink">Where the money went</h3>
          <p className="text-[13px] text-smoke">
            {costMode === 'target' ? 'The real spend, for comparison (the figures above use the target CPM).' : 'The real spend behind the cost figures, read from the platform.'}
          </p>
        </div>
        {seg === 'community' && (
          <label className="inline-flex cursor-pointer items-center gap-2.5 rounded-full border border-gray-200 bg-white py-1.5 pl-3.5 pr-2 text-[13px] font-semibold text-ink shadow-sm">
            Include draft challenges
            <Toggle size="sm" on={includePlanned} onChange={setIncludePlanned} label="Include draft challenges" />
          </label>
        )}
      </div>
      {data.length === 0 ? (
        <p className="rounded-xl bg-cloud/60 px-4 py-10 text-center text-sm text-smoke">No month in this range has started yet.</p>
      ) : (
        <div className="h-56 w-full sm:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 6, right: 4, left: -6, bottom: 0 }} onClick={(e) => e?.activePayload?.[0] && onOpen(e.activePayload[0].payload.key)}>
              <CartesianGrid vertical={false} stroke={CHART.grid} strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: CHART.grid }} tickMargin={8} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} width={52} tickFormatter={(v) => `€${formatViews(v)}`} />
              <Tooltip cursor={{ fill: 'rgba(217,68,7,0.06)' }} contentStyle={tooltipStyle} formatter={(v, n) => [eur(v), names[n]]} />
              {keys.map((k, i) => (
                <Bar key={k} dataKey={k} stackId="c" fill={fills[i]} shape={stackShape(keys, k)} maxBarSize={44} animationDuration={600} cursor="pointer" />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-smoke">
        {keys.map((k, i) => <Legend key={k} swatch={swatches[i]} label={names[k]} />)}
      </p>
    </Card>
  )
}

// ---------------------------------------------------------------------------------------------------------------------
// HOW IT WORKS: what is automatic and where every number comes from, folded away until somebody asks.
function HowItWorks({ plans }) {
  const [open, setOpen] = useState(false)
  const c = planOf(plans, 'community')
  const v = planOf(plans, 'vip')
  const line = (p) => `${monthLabel(p.anchor, 'long')} = ${formatViews(p.anchorViews)}, ${p.growth >= 0 ? '+' : ''}${(p.growth * 100).toFixed(1).replace(/\.0$/, '')}% a month`
  const items = [
    ['Targets', `Set by a growth plan, not typed in month by month. Community: ${line(c)}. VIP: ${line(v)}. Every other month follows from that, so new months appear with a target on their own. Edit plan changes the anchor, the growth, or a single month.`],
    ['Views achieved', 'Views gained inside each month on every challenge entry, read from the platform, plus challenges that ran off the platform (spread by the days they ran). VIP months before October 2026 come from the VIP sheet.'],
    ['Earnings', 'Views achieved ÷ 1,000 × the EPM.'],
    ['Costs', 'Every challenge prize pot (or what was paid, if more) and its vouchers, spread over the days it ran; other rewards; VIP and official creator pay (closed months from statements, this month live); plus any other costs added to the plan.'],
    ['This month', 'Shows its figures so far and the pace they set, and updates as views come in. When it ends, the same numbers become its final result.'],
  ]
  return (
    <Card className="overflow-hidden" delay={260}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left sm:px-6">
        <span className="flex items-center gap-2 text-[15px] font-bold text-ink"><Icon name="sparkles" className="h-5 w-5 text-brand" />How these numbers are worked out</span>
        <Icon name="chevronDown" className={cx('h-5 w-5 text-smoke transition-transform duration-300', open && 'rotate-180')} />
      </button>
      <div className={cx('grid transition-[grid-template-rows] duration-300 ease-out', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className="overflow-hidden">
          <dl className="grid gap-4 border-t border-gray-100 px-5 py-5 sm:grid-cols-2 sm:px-6">
            {items.map(([k, d]) => (
              <div key={k}>
                <dt className="text-sm font-semibold text-ink">{k}</dt>
                <dd className="mt-0.5 text-[13px] leading-relaxed text-smoke">{d}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </Card>
  )
}
