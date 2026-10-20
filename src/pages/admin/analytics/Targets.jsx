import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Select, Skeleton } from '../../../components/ui'
import Icon from '../../../components/Icon'
import { CountUp } from '../../../components/network/Motion'
import { CHART, FILL, axisTick, stackShape, tooltipStyle } from '../../../components/charts/chartTheme'
import { teamApi } from '../../../api/team'
import { cx, downloadCsv, formatViews } from '../../../lib/utils'
import {
  CSV_COLUMNS, SEGMENTS, addMonths, buildMonths, combineSegments, csvRows, monthKey, monthLabel, monthRange, monthStart,
  neededGrowth, summarise,
} from '../../../lib/cccTargets'
import { Card, ProgressBar, Segmented, StatusChip, eur, pct, signedPct, toneText, views } from './targets/parts'
import TargetsSheet from './targets/TargetsSheet'
import MonthDetail from './targets/MonthDetail'
import PlanEditor from './targets/PlanEditor'

// TARGETS & PROFIT (20 Oct 2026). The team's "CCC Targets" sheet, built into the platform: every month's view target
// against what the community (and the VIPs) actually did, what those views earn Tryp at the EPM, what they really
// cost, and the margin. Ethan: "it should update throughout the month and show progress, on track etc, but at the end,
// when the month is complete it should update with the final results."
//
// So nothing here is typed in after the fact. The plan (targets, EPM, CPM, other costs) is `ccc_targets`; everything
// measured is `admin_ccc_actuals`, read when the tab opens or Refresh is pressed (no timer). A month in progress shows
// its views so far and the pace they set; once it is over the same numbers are its final result.

const COSTS = [
  { key: 'real', label: 'Real costs', hint: 'Prize pots, vouchers and VIP pay the platform recorded, plus other costs' },
  { key: 'target', label: 'At target CPM', hint: 'Achieved views x the target CPM, the way the sheet worked' },
]
const METRICS = [
  { key: 'views', label: 'Views' },
  { key: 'earnings', label: 'Earnings' },
  { key: 'costs', label: 'Costs' },
  { key: 'margin', label: 'Margin' },
]
const PRESETS = [
  { key: 'season', label: 'Whole plan' },
  { key: 'around', label: 'Last 3, next 3' },
  { key: 'ytd', label: 'So far' },
]
const DEFAULT_FROM = '2026-09'
const DEFAULT_TO = '2027-07'
const DEFAULT_GOAL = '2027-01'
const isMonth = (s) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s || '')

const cache = new Map()

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

  // THE PLAN. Small (a row a month a segment), read whole.
  const [targets, setTargets] = useState(null)
  const [targetsError, setTargetsError] = useState('')
  useEffect(() => {
    let alive = true
    Promise.resolve(teamApi.cccTargets().select('*').order('year').order('month')).then(({ data, error }) => {
      if (!alive) return
      if (error) setTargetsError(error.message || 'The targets could not be loaded.')
      else { setTargets(data || []); setTargetsError('') }
    })
    return () => { alive = false }
  }, [tick])

  // THE MONTHS SHOWN. The URL wins; then the plan's own first and last month.
  const planKeys = useMemo(() => (targets || []).map((t) => monthKey(t.year, t.month)).sort(), [targets])
  const planFrom = planKeys[0] || DEFAULT_FROM
  const planTo = planKeys[planKeys.length - 1] || DEFAULT_TO
  const from = isMonth(params.get('from')) ? params.get('from') : planFrom
  const toRaw = isMonth(params.get('to')) ? params.get('to') : planTo
  const to = toRaw < from ? from : toRaw
  const months = useMemo(() => monthRange(from, to), [from, to])

  // WHAT HAPPENED. Only the months that have started are worth asking about.
  const nowMonth = useMemo(() => { const d = new Date(); return monthKey(d.getUTCFullYear(), d.getUTCMonth() + 1) }, [])
  const askTo = to < nowMonth ? to : nowMonth
  const actualKey = `${from}|${askTo}|${tick}`
  const [actuals, setActuals] = useState({ key: null, data: null, error: '' })
  useEffect(() => {
    let alive = true
    if (from > nowMonth) { setActuals({ key: actualKey, data: { months: [], challenges: [], other_rewards: [], vip_pay: [] }, error: '', at: Date.now() }); return undefined }
    const hit = cache.get(actualKey)
    if (hit) { setActuals({ key: actualKey, data: hit, error: '', at: Date.now() }); return undefined }
    const end = new Date(monthStart(addMonths(askTo, 1)) - 86_400_000).toISOString().slice(0, 10)
    Promise.resolve(teamApi.adminCccActuals({ p_from: `${from}-01`, p_to: end })).then(({ data, error }) => {
      if (!alive) return
      if (error) setActuals({ key: actualKey, data: null, error: error.message || 'The actual figures could not be loaded.' })
      else { cache.set(actualKey, data); setActuals({ key: actualKey, data, error: '', at: Date.now() }) }
    })
    return () => { alive = false }
  }, [actualKey, from, askTo, nowMonth])
  const loadingActuals = actuals.key !== actualKey
  const data = actuals.data
  const vipHidden = data && data.vip_visible === false

  // "Now" is when the figures were read, so a month's pace and the views it is measured on are the same moment.
  const now = actuals.at
  const segRows = useMemo(() => {
    if (!targets || !data) return null
    const opts = { months, targets, actuals: data, now, costMode, includePlanned }
    const community = buildMonths({ ...opts, segment: 'community' })
    const vip = buildMonths({ ...opts, segment: 'vip' })
    return { community, vip, all: combineSegments(community, vip) }
  }, [targets, data, months, now, costMode, includePlanned])
  const rows = segRows?.[seg] || null
  const summary = useMemo(() => (rows ? summarise(rows) : null), [rows])

  const refresh = () => { cache.clear(); setTick((n) => n + 1) }
  const segLabel = SEGMENTS.find((s) => s.key === seg)?.label
  const suggestedPlan = rows?.some((r) => r.suggested && r.state !== 'done')

  function setPreset(key) {
    if (key === 'season') setParam({ from: null, to: null })
    if (key === 'around') setParam({ from: addMonths(nowMonth, -3), to: addMonths(nowMonth, 3) })
    if (key === 'ytd') setParam({ from: planFrom, to: nowMonth })
  }
  const preset = !params.get('from') && !params.get('to') ? 'season'
    : from === addMonths(nowMonth, -3) && to === addMonths(nowMonth, 3) ? 'around'
      : from === planFrom && to === nowMonth ? 'ytd' : null
  const monthOptions = useMemo(() => monthRange(addMonths(planFrom, -12), addMonths(planTo, 12)).map((k) => ({ value: k, label: monthLabel(k, 'pick') })), [planFrom, planTo])

  function downloadData() {
    if (!segRows) return
    const sets = seg === 'all' ? [['Community', segRows.community], ['VIP', segRows.vip], ['Combined', segRows.all]] : [[segLabel, rows]]
    downloadCsv(`tryp-targets-${seg}-${from}-to-${to}.csv`, sets.flatMap(([label, list]) => csvRows(list, label)), CSV_COLUMNS)
  }

  const error = targetsError || actuals.error
  return (
    <div className="space-y-5">
      {/* ---- THE CONTROLS: who, which months, which costs. On a phone each is its own full-width row; from `lg` they
          share one line, actions to the right. ---- */}
      <Card className="flex flex-col gap-2.5 p-2 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-3" delay={0}>
        <Segmented full value={seg} options={SEGMENTS} onChange={(k) => setParam({ seg: k === 'community' ? null : k })} className="lg:w-auto" />
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center lg:border-l lg:border-gray-100 lg:pl-3">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:flex">
            <Select variant="pill" value={from} onChange={(v) => setParam({ from: v, to: v > to ? v : to })} options={monthOptions} ariaLabel="First month" search={false} />
            <span className="text-sm text-smoke">to</span>
            <Select variant="pill" value={to} onChange={(v) => setParam({ to: v, from: v < from ? v : from })} options={monthOptions} ariaLabel="Last month" search={false} />
          </div>
          <div className="scrollbar-none -mx-0.5 flex gap-1 overflow-x-auto px-0.5">
            {PRESETS.map((p) => (
              <button key={p.key} type="button" onClick={() => setPreset(p.key)} aria-pressed={preset === p.key}
                className={cx('shrink-0 rounded-full px-3 py-1 text-[13px] font-semibold transition-all duration-200', preset === p.key ? 'bg-brand text-white shadow-card' : 'bg-cloud text-smoke sm:bg-transparent hoverable:hover:bg-cloud hoverable:hover:text-ink')}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          <Segmented size="sm" value={costMode} options={COSTS} onChange={(k) => setParam({ costs: k === 'real' ? null : k })} />
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={refresh} disabled={loadingActuals} aria-label="Refresh" title="Read the figures again"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-smoke transition-all hoverable:hover:-translate-y-0.5 hoverable:hover:text-brand disabled:opacity-50">
              <Icon name="refresh" className={cx('h-4 w-4', loadingActuals && 'animate-spin')} />
            </button>
            <button type="button" disabled={!rows} onClick={downloadData} aria-label="Download CSV" className="btn-secondary !px-3 !py-1.5 text-[13px] disabled:opacity-40">
              <Icon name="download" className="h-3.5 w-3.5" /><span className="max-sm:hidden">CSV</span>
            </button>
            <button type="button" disabled={!targets} onClick={() => setEditing({ segment: seg === 'all' ? 'community' : seg })} className="btn-primary !py-1.5 text-[13px] disabled:opacity-40">
              <Icon name="pencil" className="h-3.5 w-3.5" />Edit plan
            </button>
          </div>
        </div>
      </Card>

      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
      {vipHidden && seg !== 'community' && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">VIP figures need VIP access, so only the plan shows here.</p>
      )}

      {!rows && !error && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3"><Skeleton className="h-64 rounded-card lg:col-span-2" /><Skeleton className="h-64 rounded-card" /></div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-card" />)}</div>
          <Skeleton className="h-80 w-full rounded-card" />
        </div>
      )}

      {rows && summary && (
        <div key={seg} className={cx('animate-tab-in space-y-5 transition-opacity duration-300', loadingActuals && 'opacity-60')}>
          {suggestedPlan && (
            <div className="flex flex-wrap items-center gap-3 rounded-card border border-brand/20 bg-brand-tint/50 px-4 py-3 animate-rise">
              <Icon name="sparkles" className="h-5 w-5 shrink-0 text-brand" />
              <p className="min-w-0 flex-1 text-sm text-ink">
                <span className="font-semibold">The VIP targets are a suggested starting plan.</span>{' '}
                They follow what VIP and official creators actually did in September and October, about 2M more a month to January, then 7% a month. Save your own to replace them.
              </p>
              <button type="button" onClick={() => setEditing({ segment: 'vip' })} className="btn-secondary !py-1.5 text-[13px]">Set VIP targets</button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <MonthHero row={summary.live || summary.lastDone} onOpen={(k) => setOpenMonth(k)} segLabel={segLabel} />
            <GoalCard rows={rows} summary={summary} />
          </div>

          <SeasonTiles summary={summary} costMode={costMode} />

          <TrendChart rows={rows} metric={metric} setMetric={setMetric} cumulative={cumulative} setCumulative={setCumulative} onOpen={setOpenMonth} />

          <TargetsSheet rows={rows} seg={seg} onOpen={setOpenMonth} onEdit={(focus) => setEditing({ segment: seg === 'all' ? 'community' : seg, focus })} />

          <CostsCard rows={rows} seg={seg} includePlanned={includePlanned} setIncludePlanned={setIncludePlanned} costMode={costMode} onOpen={setOpenMonth} />

          <p className="px-1 text-[13px] leading-relaxed text-smoke">
            <span className="font-semibold text-ink">How these are counted.</span>{' '}
            Achieved views are views gained inside the month (the same count as the Weekly views tab), not lifetime totals. VIP
            months before October 2026 come from the team&apos;s VIP sheet. Earnings are achieved views x the EPM. Real costs are
            each challenge&apos;s prize pot and vouchers, spread over the days it ran, other rewards, VIP and official pay, and any
            other costs added to the plan. A month in progress shows its figures so far and the pace they set; when the month ends
            the same figures become its final result.
          </p>
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
      {editing && targets && (
        <PlanEditor
          segment={editing.segment}
          focus={editing.focus}
          targets={targets}
          from={from}
          to={to}
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
    <Card className="relative overflow-hidden !border-0 bg-gradient-to-br from-brand to-brand-light p-5 text-white shadow-lift sm:p-6 lg:col-span-2" delay={40}>
      <span aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/15 blur-3xl" />
      <span aria-hidden className="pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white/85">{segLabel} · {row.longLabel}</p>
          <p className="mt-0.5 text-[13px] text-white/75">
            {live ? `Day ${Math.floor(row.elapsed) + 1} of ${row.days} · updating as views come in` : 'Month complete · final result'}
          </p>
        </div>
        <span className="flex items-center gap-2">
          {live && <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-0.5 text-[13px] font-semibold"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />Live</span>}
          <StatusChip status={row.status} live={live} className="!bg-white !ring-0" />
        </span>
      </div>

      <div className="relative mt-4 flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <p className="text-[13px] font-medium text-white/80">{live ? 'Views so far' : 'Views achieved'}</p>
          <p className="text-4xl font-extrabold tracking-tight tabular-nums sm:text-5xl"><CountUp value={row.achieved || 0} format={views} /></p>
        </div>
        <div className="pb-1">
          <p className="text-[13px] font-medium text-white/80">Target</p>
          <p className="text-xl font-bold tabular-nums sm:text-2xl">{row.target != null ? views(row.target) : 'Not set'}</p>
        </div>
        {row.pct != null && (
          <div className="pb-1">
            <p className="text-[13px] font-medium text-white/80">Of target</p>
            <p className="text-xl font-bold tabular-nums sm:text-2xl">{pct(row.pct, 1)}</p>
          </div>
        )}
      </div>

      <ProgressBar className="relative mt-4" dark value={row.achieved} projected={live ? row.projected : null} target={row.target} expected={expected} />
      {live && (
        <div className="relative mt-1.5 flex flex-wrap justify-between gap-x-4 text-[13px] text-white/80">
          <span>Tick: due by today, {views(expected)}</span>
          <span>{vsExpected != null && `${vsExpected >= 0 ? 'Ahead' : 'Behind'} by ${pct(Math.abs(vsExpected), 1)}`}</span>
        </div>
      )}

      <div className="relative mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {live ? (
          <>
            <HeroStat label="On pace for" value={views(row.projected)} sub={row.projectedPct != null ? `${pct(row.projectedPct)} of target` : null} />
            <HeroStat label="Needed a day" value={row.neededPerDay != null ? formatViews(row.neededPerDay) : '-'} sub={`Doing ${formatViews(row.perDay)} a day`} />
            <HeroStat label="Margin so far" value={eur(row.actualMargin)} sub={`On pace for ${eur(row.projectedMargin)}`} />
            <HeroStat label="Cost per 1,000" value={row.actualCpm != null ? eur(row.actualCpm, true) : '-'} sub={`Target ${eur(row.cpm, true)}`} />
          </>
        ) : (
          <>
            <HeroStat label="Earnings" value={eur(row.actualEarnings)} sub={`Plan ${eur(row.estEarnings)}`} />
            <HeroStat label="Costs" value={eur(row.actualCost)} sub={`Plan ${eur(row.estCost)}`} />
            <HeroStat label="Margin" value={eur(row.actualMargin)} sub={`Plan ${eur(row.estMargin)}`} />
            <HeroStat label="Cost per 1,000" value={row.actualCpm != null ? eur(row.actualCpm, true) : '-'} sub={`Target ${eur(row.cpm, true)}`} />
          </>
        )}
      </div>
      <button type="button" onClick={() => onOpen(row.key)} className="relative mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-white/90 transition-transform hoverable:hover:translate-x-0.5">
        See the month in full <Icon name="chevronRight" className="h-3.5 w-3.5" />
      </button>
    </Card>
  )
}

function HeroStat({ label, value, sub }) {
  return (
    <div className="rounded-xl bg-white/15 px-3 py-2.5 backdrop-blur-sm">
      <p className="text-[13px] font-medium text-white/80">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums leading-tight">{value}</p>
      {sub && <p className="mt-0.5 text-[13px] text-white/75">{sub}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------------------
// THE GOAL. "By January, we want to have 17 million views month over month": the goal month's target, how far the
// current pace is from it, and the monthly growth that closes the gap.
function GoalCard({ rows, summary }) {
  const planned = rows.filter((r) => r.target != null)
  const defaultGoal = planned.find((r) => r.key === DEFAULT_GOAL && r.state !== 'done') ? DEFAULT_GOAL
    : (planned.find((r) => r.state === 'future') || planned[planned.length - 1])?.key
  const [goalKey, setGoalKey] = useState(defaultGoal)
  const goal = rows.find((r) => r.key === goalKey) || rows.find((r) => r.key === defaultGoal)
  const base = summary.live || summary.lastDone
  if (!goal || goal.target == null) {
    return <Card className="p-5" delay={80}><p className="text-sm text-smoke">Add targets to the plan to track a goal.</p></Card>
  }
  const now = base ? base.projected : null
  const steps = base ? monthRange(base.key, goal.key).length - 1 : null
  const need = steps > 0 ? neededGrowth(now, goal.target, steps) : null
  const planPath = steps > 0 && base?.target ? neededGrowth(base.target, goal.target, steps) : null
  const share = now && goal.target ? Math.min(1, now / goal.target) : 0
  const reached = now != null && now >= goal.target
  const R = 52
  const C = 2 * Math.PI * R
  return (
    <Card className="flex flex-col p-5" delay={80}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon name="flag" className="h-5 w-5 text-brand" />
          <h3 className="text-[15px] font-bold text-ink">Goal</h3>
        </div>
        <Select variant="pill" value={goal.key} onChange={setGoalKey} ariaLabel="Goal month" search={false}
          options={planned.filter((r) => r.state !== 'done').map((r) => ({ value: r.key, label: r.longLabel }))} />
      </div>
      <div className="mt-3 flex items-center gap-4">
        <svg viewBox="0 0 120 120" className="h-28 w-28 shrink-0 -rotate-90">
          <circle cx="60" cy="60" r={R} fill="none" stroke={CHART.rest} strokeWidth="12" />
          <circle cx="60" cy="60" r={R} fill="none" stroke="url(#tg-brand-h)" strokeWidth="12" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - share)} className="transition-[stroke-dashoffset] duration-[1200ms] ease-out" />
          <text x="60" y="60" transform="rotate(90 60 60)" textAnchor="middle" dominantBaseline="central" className="fill-ink text-[22px] font-extrabold">{pct(share)}</text>
        </svg>
        <div className="min-w-0">
          <p className="text-2xl font-extrabold tabular-nums text-ink">{formatViews(goal.target)}</p>
          <p className="text-[13px] text-smoke">views in {goal.longLabel}</p>
          {base && <p className="mt-1 text-[13px] text-smoke">Now: <span className="font-semibold text-ink">{formatViews(now)}</span> {base.state === 'live' ? 'on pace' : 'last month'}</p>}
        </div>
      </div>
      <div className="mt-4 space-y-2 border-t border-gray-100 pt-3 text-sm">
        {reached ? (
          <p className="font-semibold text-emerald-600">Already at the goal pace.</p>
        ) : (
          <>
            <Line2 label="Growth needed a month" value={need != null ? signedPct(need) : '-'} strong />
            <Line2 label="The plan's own path" value={planPath != null ? signedPct(planPath) : '-'} />
            <Line2 label="Months to go" value={steps ?? '-'} />
          </>
        )}
      </div>
    </Card>
  )
}
function Line2({ label, value, strong }) {
  return (
    <p className="flex items-baseline justify-between gap-3">
      <span className="text-smoke">{label}</span>
      <span className={cx('tabular-nums', strong ? 'text-base font-bold text-brand' : 'font-semibold text-ink')}>{value}</span>
    </p>
  )
}

// ---------------------------------------------------------------------------------------------------------------------
function SeasonTiles({ summary, costMode }) {
  const tiles = [
    { label: 'Views achieved', value: summary.achieved, format: views, sub: `${pct(summary.pctToDate)} of ${formatViews(summary.targetToDate)} target`, tone: summary.pctToDate >= 1 ? 'good' : summary.pctToDate >= 0.9 ? 'warn' : 'bad' },
    { label: 'Earnings', value: summary.earnings, format: (n) => eur(n), sub: `Plan ${eur(summary.estEarnings)}` },
    { label: costMode === 'target' ? 'Costs at target CPM' : 'Real costs', value: summary.cost, format: (n) => eur(n), sub: `Plan ${eur(summary.estCost)} · ${summary.cpm != null ? eur(summary.cpm, true) : '-'} per 1,000` },
    { label: 'Margin', value: summary.margin, format: (n) => eur(n), sub: `${summary.marginPct != null ? pct(summary.marginPct) : '-'} of earnings · plan ${eur(summary.estMargin)}`, tone: summary.margin >= summary.estMargin ? 'good' : 'warn' },
  ]
  return (
    <div>
      <p className="mb-2 px-1 text-[13px] font-semibold text-smoke">
        Months so far in this range ({summary.measuredMonths}{summary.live ? ', this month as it stands' : ''}) · {summary.hits} of {summary.doneMonths} finished months hit target
      </p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t, i) => (
          <Card key={t.label} className="p-4" delay={100 + i * 40}>
            <p className="text-[13px] font-semibold text-smoke">{t.label}</p>
            <p className={cx('mt-1 text-xl font-extrabold tabular-nums sm:text-2xl', t.label === 'Margin' && summary.margin < 0 ? 'text-red-600' : 'text-ink')}>
              <CountUp value={t.value || 0} format={t.format} />
            </p>
            <p className={cx('mt-1 text-[13px] leading-snug', t.tone ? toneText[t.tone] : 'text-smoke')}>{t.sub}</p>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------------------
// THE CHART. Bars are what happened (a finished month solid, this month's views so far solid with the rest of its pace
// lighter on top); the line is the plan. Click a bar for the month.
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
  return (
    <Card className="p-4 sm:p-5" delay={160}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-[15px] font-bold text-ink">{METRICS.find((m) => m.key === metric).label} against the plan</h3>
          <p className="text-[13px] text-smoke">{cumulative ? 'Running total across the months shown.' : 'Month by month.'} Click a month for the detail.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented size="sm" value={metric} options={METRICS} onChange={setMetric} />
          <Segmented size="sm" value={cumulative ? 'run' : 'month'} options={[{ key: 'month', label: 'Monthly' }, { key: 'run', label: 'Running total' }]} onChange={(k) => setCumulative(k === 'run')} />
        </div>
      </div>
      <div className="h-64 w-full sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={series} margin={{ top: 8, right: 6, left: -4, bottom: 0 }} onClick={(e) => e?.activePayload?.[0] && onOpen(e.activePayload[0].payload.key)}>
            <CartesianGrid vertical={false} stroke={CHART.grid} strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: CHART.grid }} tickMargin={8} interval="preserveStartEnd" />
            <YAxis tick={axisTick} tickLine={false} axisLine={false} width={52} tickFormatter={tick} />
            {negative && <ReferenceLine y={0} stroke={CHART.muted} />}
            <Tooltip cursor={{ fill: 'rgba(217,68,7,0.06)' }} contentStyle={tooltipStyle}
              formatter={(v, n) => [fmt(v), n === 'actual' ? 'Achieved' : n === 'pace' ? 'Rest of the pace' : 'Plan']}
              labelFormatter={(l, p) => {
                const s = p?.[0]?.payload
                return s ? `${l}${s.state === 'live' ? ' · in progress' : s.state === 'future' ? ' · upcoming' : ''}` : l
              }} />
            <Bar dataKey="actual" stackId="a" fill={FILL.brand} shape={stackShape(['actual', 'pace'], 'actual')} maxBarSize={46} animationDuration={800} cursor="pointer">
              {series.map((s) => <Cell key={s.key} fill={s.state === 'done' && (s.status === 'hit') && metric === 'views' ? FILL.green : FILL.brand} />)}
            </Bar>
            <Bar dataKey="pace" stackId="a" fill={FILL.pale} shape={stackShape(['actual', 'pace'], 'pace')} maxBarSize={46} animationDuration={800} cursor="pointer" />
            <Line dataKey="plan" type="monotone" stroke={CHART.ink} strokeWidth={2} strokeDasharray="6 5" dot={{ r: 3, fill: CHART.ink, strokeWidth: 0 }} activeDot={{ r: 5 }} animationDuration={900} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-smoke">
        <Legend swatch="bg-gradient-to-t from-brand to-brand-light" label="Achieved" />
        {metric === 'views' && <Legend swatch="bg-gradient-to-t from-emerald-500 to-emerald-300" label="Target hit" />}
        <Legend swatch="bg-brand/25" label="This month, rest of the pace" />
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
  const live = rows.find((r) => r.state === 'live')
  const planned = seg === 'community' && live ? live.costs?.lines?.filter((l) => l.planned) : []
  return (
    <Card className="p-4 sm:p-5" delay={220}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-[15px] font-bold text-ink">Where the money went</h3>
          <p className="text-[13px] text-smoke">
            {costMode === 'target' ? 'The real spend, for comparison (the figures above use the target CPM).' : 'The real spend behind the cost figures.'}
            {' '}This month counts what is committed so far.
          </p>
        </div>
        {seg === 'community' && (
          <button type="button" onClick={() => setIncludePlanned(!includePlanned)} aria-pressed={includePlanned}
            className={cx('rounded-full px-3 py-1 text-[13px] font-semibold transition-all duration-200', includePlanned ? 'bg-brand text-white shadow-card' : 'bg-cloud text-smoke hoverable:hover:text-ink')}>
            Count draft challenges
          </button>
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
                <Bar key={k} dataKey={k} stackId="c" fill={fills[i]} shape={stackShape(keys, k)} maxBarSize={46} animationDuration={800} cursor="pointer" />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-smoke">
        {keys.map((k, i) => <Legend key={k} swatch={swatches[i]} label={names[k]} />)}
      </p>
      {seg === 'community' && !includePlanned && (rows.find((r) => r.state === 'future') || planned?.length) ? (
        <p className="mt-2 text-[13px] text-smoke">Draft challenges are left out until they go live. Switch on &quot;Count draft challenges&quot; to see what is planned.</p>
      ) : null}
    </Card>
  )
}

