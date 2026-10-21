import { useEffect, useMemo, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Skeleton, Toggle } from '../../../components/ui'
import Icon from '../../../components/Icon'
import { CountUp } from '../../../components/network/Motion'
import { CHART, FILL, axisTick, stackShape, tooltipStyle } from '../../../components/charts/chartTheme'
import { teamApi } from '../../../api/team'
import { cx, downloadCsv, formatViews } from '../../../lib/utils'
import {
  CSV_COLUMNS, SEGMENTS, addMonths, buildMonths, combineSegments, csvRows, defaultRange, monthKey, monthLabel, monthRange,
  monthStart, neededGrowth, planOf, planTarget, summarise,
} from '../../../lib/cccTargets'
import { Card, MonthRangePicker, ProgressBar, Segmented, StatusChip, eur, pct, signedPct, toneText, views } from './targets/parts'
import MonthTable from './targets/TargetsSheet'
import MonthDetail from './targets/MonthDetail'
import PlanEditor from './targets/PlanEditor'

// TARGETS & PROFIT (20 Oct 2026, third pass the same evening). The "CCC Targets" sheet, live: every month's view target
// against what the community (and the VIPs) actually did, what those views earn Tryp.com at the EPM, what they really
// cost, and the margin.
//
// NOTHING IS TYPED IN AFTER THE FACT. Targets come from a growth plan (ccc_plans, migrations 446-447: an anchor month
// and a monthly growth), so every month, including ones that have not arrived, has a target without anybody adding it.
// Everything measured is `admin_ccc_actuals`, read when the tab opens or the header's refresh is pressed: views gained
// inside each month, challenges that ran off the platform, prize pots and vouchers, other rewards, VIP pay.
//
// COSTS ARE ALWAYS THE REAL ONES. The "Real costs / At target CPM" switch is gone (the team found it confusing): the
// target CPM is only used for the PLANNED cost of a month (target views x target CPM).
const METRICS = [
  { key: 'views', label: 'Views' },
  { key: 'earnings', label: 'Earnings' },
  { key: 'costs', label: 'Costs' },
  { key: 'margin', label: 'Margin' },
]
const COUNT = 700 // the page's numbers count up quickly
const isMonth = (s) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s || '')
const cache = new Map()

export default function Targets({ refreshKey = 0 }) {
  const [params, setParams] = useSearchParams()
  const setParam = useCallback((patch) => {
    const q = { ...Object.fromEntries(params) }
    for (const [k, v] of Object.entries(patch)) { if (v == null || v === '') delete q[k]; else q[k] = v }
    setParams(q, { replace: true })
  }, [params, setParams])

  const seg = ['community', 'vip', 'all'].includes(params.get('seg')) ? params.get('seg') : 'community'
  const [metric, setMetric] = useState('views')
  const [includePlanned, setIncludePlanned] = useState(false)
  const [openMonth, setOpenMonth] = useState(null)
  const [editing, setEditing] = useState(null) // null | { segment, focus }
  const [tick, setTick] = useState(0)
  const [clock] = useState(() => Date.now())

  // THE PLAN: two growth plans and any month set by hand. Small, read whole. Kept on screen while it re-reads, so a
  // save never drops the page to a skeleton (the flash the team saw).
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
  }, [tick, refreshKey])
  const { plans, targets } = plan

  // THE MONTHS SHOWN. The URL wins; otherwise the plan's first month to nine months from now, so new months join the
  // page on their own as the calendar moves.
  const nowMonth = useMemo(() => { const d = new Date(clock); return monthKey(d.getUTCFullYear(), d.getUTCMonth() + 1) }, [clock])
  const range = useMemo(() => defaultRange(plans || [], nowMonth), [plans, nowMonth])
  const from = isMonth(params.get('from')) ? params.get('from') : range.from
  const toRaw = isMonth(params.get('to')) ? params.get('to') : range.to
  const to = toRaw < from ? from : toRaw
  const months = useMemo(() => monthRange(from, to), [from, to])

  // WHAT HAPPENED. Only months that have started are worth asking about.
  const askTo = to < nowMonth ? to : nowMonth
  const actualKey = `${from}|${askTo}|${tick}|${refreshKey}`
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
    const opts = { months, plans, targets, actuals: data, now, includePlanned }
    const community = buildMonths({ ...opts, segment: 'community' })
    const vip = buildMonths({ ...opts, segment: 'vip' })
    return { community, vip, all: combineSegments(community, vip) }
  }, [targets, plans, data, months, now, includePlanned])
  const rows = segRows?.[seg] || null
  const summary = useMemo(() => (rows ? summarise(rows) : null), [rows])
  const segLabel = SEGMENTS.find((s) => s.key === seg)?.label

  function downloadData() {
    if (!segRows) return
    const sets = seg === 'all' ? [['Community', segRows.community], ['VIP', segRows.vip], ['Combined', segRows.all]] : [[segLabel, rows]]
    downloadCsv(`tryp-com-targets-${seg}-${from}-to-${to}.csv`, sets.flatMap(([label, list]) => csvRows(list, label)), CSV_COLUMNS)
  }

  const error = plan.error || actuals.error
  const heroRow = summary ? (summary.live || summary.lastDone) : null
  return (
    <div className="space-y-6">
      {/* ---- THE CONTROLS: whose numbers and which months, then the two actions. One row from `sm` up. ---- */}
      <Card className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center" delay={0}>
        <Segmented full value={seg} options={SEGMENTS} onChange={(k) => setParam({ seg: k === 'community' ? null : k })} className="sm:w-fit" />
        <MonthRangePicker from={from} to={to} nowKey={nowMonth}
          onChange={(a, b) => setParam({ from: a, to: b })} />
        <span className="flex items-center gap-2 sm:ml-auto">
          <button type="button" disabled={!rows} onClick={downloadData} title="Download these months as a spreadsheet (CSV)"
            className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border border-gray-200 bg-white px-3.5 text-[13px] font-semibold text-ink shadow-sm transition-all hoverable:hover:-translate-y-0.5 disabled:opacity-40">
            <Icon name="download" className="h-4 w-4 text-brand" />CSV
          </button>
          <button type="button" disabled={!targets} onClick={() => setEditing({ segment: seg === 'all' ? 'community' : seg })}
            className="btn-primary !h-9 whitespace-nowrap !py-0 text-[13px] disabled:opacity-40">
            <Icon name="sliders" className="h-4 w-4" />Edit plan
          </button>
        </span>
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
            {heroRow ? <MonthHero row={heroRow} onOpen={setOpenMonth} segLabel={segLabel} /> : <PlanAhead rows={rows} segLabel={segLabel} onOpen={setOpenMonth} />}
            <NextMonths plans={plans} seg={seg} nowMonth={nowMonth} baseMonth={from <= nowMonth && to >= nowMonth ? nowMonth : from} rows={rows} onOpen={setOpenMonth} />
          </div>

          <Totals summary={summary} rows={rows} />

          <TrendChart rows={rows} metric={metric} setMetric={setMetric} onOpen={setOpenMonth} />

          <MonthTable rows={rows} onOpen={setOpenMonth} />

          <CostsCard rows={rows} seg={seg} includePlanned={includePlanned} setIncludePlanned={setIncludePlanned} onOpen={setOpenMonth} />

          <HowItWorks plans={plans} />
        </div>
      )}

      {openMonth && segRows && (
        <MonthDetail
          monthKey={openMonth}
          seg={seg}
          segRows={segRows}
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
          onSaved={() => { setEditing(null); cache.clear(); setTick((n) => n + 1) }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------------------
// THIS MONTH: its target (the month's KPI), views so far against it, where the month should be by today (the tick), where
// the pace lands, and what it needs a day from here. A finished month shows its final result in the same card.
function MonthHero({ row, onOpen, segLabel }) {
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
          <p className="text-[13px] font-medium text-white/80">{row.longLabel.split(' ')[0]} target</p>
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
            <HeroStat label="On pace for" value={views(row.projected)} sub={row.projectedPct != null ? `${pct(row.projectedPct)} of the target` : null} />
            <HeroStat label="Needed a day" value={row.neededPerDay != null ? formatViews(row.neededPerDay) : '-'} sub={`Doing ${formatViews(row.perDay)} a day now`} />
            <HeroStat label="Margin so far" value={eur(row.actualMargin)} sub={`Heading for ${eur(row.projectedMargin)}`} />
          </>
        ) : (
          <>
            <HeroStat label="Earnings" value={eur(row.actualEarnings)} sub={`Plan ${eur(row.estEarnings)}`} />
            <HeroStat label="Costs" value={eur(row.actualCost)} sub={`Plan ${eur(row.estCost)}`} />
            <HeroStat label="Margin" value={eur(row.actualMargin)} sub={`Plan ${eur(row.estMargin)}`} />
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

// MONTHS STILL AHEAD (a range that has not started, e.g. November - December): what the plan asks of each month, a day,
// and what it would earn, instead of "nothing has started yet".
function PlanAhead({ rows, segLabel, onOpen }) {
  const planned = rows.filter((r) => r.target != null)
  const total = planned.reduce((n, r) => n + r.target, 0)
  const span = rows.length === 1 ? rows[0].longLabel : `${monthLabel(rows[0].key, 'pick')} – ${monthLabel(rows[rows.length - 1].key, 'pick')}`
  return (
    <Card className="relative overflow-hidden !border-0 bg-gradient-to-br from-ink to-[#3a1c0d] p-5 text-white shadow-lift sm:p-7 lg:col-span-2" delay={40}>
      <span aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-brand/30 blur-3xl" />
      <div className="relative flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-white/90">{segLabel} · coming up</p>
        <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[13px] font-semibold">{span}</span>
      </div>
      <p className="relative mt-5 text-[13px] font-medium text-white/75">The plan asks for</p>
      <p className="relative text-4xl font-extrabold tracking-tight tabular-nums sm:text-5xl"><CountUp value={total} format={views} duration={COUNT} /></p>
      <p className="relative mt-1 text-[13px] text-white/75">views over {planned.length} month{planned.length === 1 ? '' : 's'}</p>
      <ul className="relative mt-5 grid gap-2 sm:grid-cols-2">
        {planned.slice(0, 6).map((r) => (
          <li key={r.key}>
            <button type="button" onClick={() => onOpen(r.key)} className="flex w-full items-center justify-between gap-3 rounded-2xl bg-white/10 px-4 py-3 text-left transition-colors hoverable:hover:bg-white/15">
              <span>
                <span className="block text-sm font-semibold">{r.longLabel}</span>
                <span className="block text-[13px] text-white/70">{formatViews(r.target / r.days)} a day · margin {eur(r.estMargin)}</span>
              </span>
              <span className="text-lg font-bold tabular-nums">{formatViews(r.target)}</span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

// ---------------------------------------------------------------------------------------------------------------------
// THE NEXT THREE MONTHS, ALWAYS. This month and the three after it, straight from the growth plan (whatever months are
// picked above), each as a bar against its target with this month's views and pace drawn in, and the growth needed from
// today's pace to reach the last of them. No picker: the team found a goal dropdown with one month in it pointless.
function NextMonths({ plans, seg, nowMonth, baseMonth, rows, onOpen }) {
  const keys = monthRange(baseMonth, addMonths(baseMonth, 3))
  const liveRow = rows.find((r) => r.key === nowMonth && r.state === 'live') || null
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]))
  const target = (k) => {
    const sides = seg === 'all' ? ['community', 'vip'] : [seg]
    const vals = sides.map((s) => planTarget(planOf(plans, s), k)).filter((v) => v != null)
    return vals.length ? vals.reduce((n, v) => n + v, 0) : null
  }
  const steps = keys.map((k) => ({ key: k, target: target(k), live: byKey[k]?.state === 'live' ? byKey[k] : null, done: byKey[k]?.state === 'done' ? byKey[k] : null })).filter((r) => r.target != null)
  if (!steps.length) return <Card className="p-6" delay={80}><p className="text-sm text-smoke">The growth plan has no months ahead yet.</p></Card>
  const goal = steps[steps.length - 1]
  const max = Math.max(...steps.map((r) => Math.max(r.target, r.live?.projected || 0, r.done?.achieved || 0)))
  const pace = baseMonth === nowMonth ? (liveRow?.projected ?? null) : null
  const gap = monthRange(baseMonth, goal.key).length - 1
  const need = pace && gap > 0 ? neededGrowth(pace, goal.target, gap) : null
  const growth = seg === 'all' ? null : planOf(plans, seg).growth
  return (
    <Card className="flex h-full flex-col p-5 sm:p-6" delay={80}>
      <h3 className="flex items-center gap-2 text-[15px] font-bold text-ink"><Icon name="flag" className="h-5 w-5 text-brand" />{baseMonth !== nowMonth ? `Targets from ${monthLabel(baseMonth, 'long')}` : 'The next three months'}</h3>
      <p className="mt-3 text-3xl font-extrabold tabular-nums text-ink">{formatViews(goal.target)}</p>
      <p className="text-[13px] text-smoke">views is the target for {monthLabel(goal.key, 'long')}</p>
      <div className="mt-5 flex flex-1 items-end gap-2" style={{ minHeight: 140 }}>
        {steps.map((r) => {
          const h = (n) => `${Math.max(2, (n / max) * 100)}%`
          const live = !!r.live
          return (
            <button key={r.key} type="button" onClick={() => onOpen(r.key)} title={`${monthLabel(r.key, 'long')}: target ${views(r.target)}`}
              className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
              <span className="text-[13px] font-semibold tabular-nums text-ink">{formatViews(r.target)}</span>
              <span className="relative w-full flex-1 overflow-hidden rounded-lg">
                <span className={cx('absolute inset-x-0 bottom-0 rounded-lg transition-colors', r.key === goal.key ? 'bg-brand/25' : 'bg-brand/10 group-hover:bg-brand/20')} style={{ height: h(r.target) }} />
                {live && r.live.projected != null && <span className="absolute inset-x-0 bottom-0 rounded-lg bg-brand/30" style={{ height: h(Math.min(r.live.projected, max)) }} />}
                {live && <span className="absolute inset-x-0 bottom-0 rounded-lg bg-gradient-to-t from-brand to-brand-light" style={{ height: h(r.live.achieved || 0) }} />}
                {r.done && <span className="absolute inset-x-0 bottom-0 rounded-lg bg-gradient-to-t from-brand to-brand-light" style={{ height: h(r.done.achieved || 0) }} />}
              </span>
              <span className={cx('text-[13px]', r.key === nowMonth ? 'font-bold text-brand' : 'text-smoke')}>{monthLabel(r.key, 'month').slice(0, 3)}</span>
            </button>
          )
        })}
      </div>
      <p className="mt-4 rounded-xl bg-cloud px-3.5 py-2.5 text-[13px] leading-relaxed text-smoke">
        {pace != null && pace >= goal.target ? (
          <span className="font-semibold text-emerald-700">This month&apos;s pace already reaches {monthLabel(goal.key, 'month')}&apos;s target.</span>
        ) : need != null ? (
          <>From this month&apos;s pace ({formatViews(pace)}) it needs <span className="font-bold text-brand">{signedPct(need)}</span> a month{growth != null ? <>; the plan grows <span className="font-semibold text-ink">{pct(growth)}</span></> : null}.</>
        ) : (
          <>Each month&apos;s target from the growth plan{growth != null ? `, ${pct(growth)} a month` : ''}.</>
        )}
      </p>
    </Card>
  )
}

// ---------------------------------------------------------------------------------------------------------------------
// THE TOTALS for the months picked that have started (the month in progress counts up to today); for a range still
// ahead, the plan's totals.
function Totals({ summary, rows }) {
  const measured = rows.filter((r) => r.state !== 'future' && r.achieved != null)
  const ahead = !measured.length
  const list = ahead ? rows.filter((r) => r.target != null) : measured
  if (!list.length) return null
  const span = list.length === 1 ? list[0].longLabel : `${monthLabel(list[0].key, 'pick')} – ${monthLabel(list[list.length - 1].key, 'pick')}`
  const sum = (f) => list.reduce((n, r) => n + (Number(r[f]) || 0), 0)
  const tiles = ahead ? [
    { label: 'Target views', value: sum('target'), format: views },
    { label: 'Planned earnings', value: sum('estEarnings'), format: (n) => eur(n) },
    { label: 'Planned costs', value: sum('estCost'), format: (n) => eur(n) },
    { label: 'Planned margin (profit)', value: sum('estMargin'), format: (n) => eur(n) },
  ] : [
    { label: 'Views', value: summary.achieved, format: views, sub: summary.targetToDate ? `${pct(summary.pctToDate)} of the ${formatViews(summary.targetToDate)} plan so far` : null, tone: summary.pctToDate >= 1 ? 'good' : summary.pctToDate >= 0.9 ? 'warn' : 'bad' },
    { label: 'Earnings', value: summary.earnings, format: (n) => eur(n), sub: `Plan so far ${eur(summary.estEarnings)}`, tone: summary.earnings >= summary.estEarnings ? 'good' : 'bad' },
    { label: 'Costs', value: summary.cost, format: (n) => eur(n), sub: `Plan so far ${eur(summary.estCost)}${summary.cpm != null ? ` · ${eur(summary.cpm, true)} per 1,000` : ''}`, tone: summary.cost <= summary.estCost ? 'good' : 'bad' },
    { label: 'Margin (profit)', value: summary.margin, format: (n) => eur(n), sub: `Plan so far ${eur(summary.estMargin)}${summary.marginPct != null ? ` · ${pct(summary.marginPct)} kept` : ''}`, tone: summary.margin >= summary.estMargin ? 'good' : 'bad' },
  ]
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-1">
        <h3 className="text-[15px] font-bold text-ink">{ahead ? 'The plan' : 'Totals'} · {span}</h3>
        {summary.live && !ahead && <p className="text-[13px] text-smoke">&quot;Plan so far&quot; is where the plan should be by today ({summary.live.longLabel.split(' ')[0]} counts up to today)</p>}
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((t, i) => (
          <Card key={t.label} className="p-4 sm:p-5" delay={100 + i * 40}>
            <p className="text-[13px] font-semibold text-smoke">{t.label}</p>
            <p className={cx('mt-1.5 text-xl font-extrabold tabular-nums sm:text-2xl', i === 3 && t.value < 0 ? 'text-red-600' : 'text-ink')}>
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
// THE CHART. Bars are what happened (this month's so-far solid, the rest of its pace lighter on top); the dashed line is
// the plan. A bar that beats the plan is GREEN, the month in progress too once its pace beats it.
function TrendChart({ rows, metric, setMetric, onOpen }) {
  const series = useMemo(() => {
    const pick = {
      views: (r) => [r.achieved, r.projected, r.target],
      earnings: (r) => [r.actualEarnings, r.projectedEarnings, r.estEarnings],
      costs: (r) => [r.actualCost, r.projectedCost, r.estCost],
      margin: (r) => [r.actualMargin, r.projectedMargin, r.estMargin],
    }[metric]
    const out = []
    for (const r of rows) {
      const [shownA, shownP, shownT] = pick(r)
      const live = r.state === 'live'
      // Costs are better LOW, so "beating the plan" is being under it.
      const beats = (v) => v != null && shownT != null && (metric === 'costs' ? v <= shownT : v >= shownT)
      out.push({
        key: r.key, label: r.label, state: r.state,
        actual: shownA,
        pace: live && shownP != null && shownA != null ? Math.max(0, shownP - shownA) : null,
        plan: shownT,
        hit: r.state === 'done' ? beats(shownA) : live ? beats(shownP) : false,
      })
    }
    return out
  }, [rows, metric])
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
          <p className="text-[13px] text-smoke">Each month against its own plan. Click a month for the detail.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented size="sm" value={metric} options={METRICS} onChange={setMetric} />
        </div>
      </div>
      <div key={metric} className="h-64 w-full animate-tab-in sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={series} margin={{ top: 8, right: 6, left: -4, bottom: 0 }} onClick={(e) => e?.activePayload?.[0] && onOpen(e.activePayload[0].payload.key)}>
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
            <Bar dataKey="actual" stackId="a" fill={FILL.brand} shape={stackShape(['actual', 'pace'], 'actual')} maxBarSize={44} animationDuration={600} animationEasing="ease-out" cursor="pointer">
              {series.map((s) => <Cell key={s.key} fill={s.hit ? FILL.green : FILL.brand} />)}
            </Bar>
            <Bar dataKey="pace" stackId="a" fill={FILL.pale} shape={stackShape(['actual', 'pace'], 'pace')} maxBarSize={44} animationDuration={600} animationEasing="ease-out" cursor="pointer">
              {series.map((s) => <Cell key={s.key} fill={s.hit ? 'rgba(16,185,129,0.28)' : FILL.pale} />)}
            </Bar>
            <Line dataKey="plan" type="monotone" stroke={CHART.ink} strokeWidth={2} strokeDasharray="6 5" dot={{ r: 3, fill: CHART.ink, strokeWidth: 0 }} activeDot={{ r: 5 }} animationDuration={700} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-smoke">
        <Legend swatch="bg-gradient-to-t from-brand to-brand-light" label="Achieved" />
        <Legend swatch="bg-gradient-to-t from-emerald-500 to-emerald-300" label={metric === 'costs' ? 'Under the plan' : 'Beat the plan'} />
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
// WHERE THE MONEY WENT, month by month. "Include draft challenges" adds the prize money of challenges not yet published,
// spread over the months they will run, so next month's committed spend shows before it goes live.
function CostsCard({ rows, seg, includePlanned, setIncludePlanned, onOpen }) {
  const keys = seg === 'community' ? ['challenges', 'rewards', 'other'] : seg === 'vip' ? ['vip', 'other'] : ['community', 'vip']
  const names = { challenges: 'Challenge prizes and vouchers', rewards: 'Other rewards', other: 'Other costs', vip: 'VIP pay', community: 'Community' }
  const fills = [FILL.brand, FILL.amber, FILL.gray]
  const swatches = ['bg-gradient-to-t from-brand to-brand-light', 'bg-gradient-to-t from-amber-500 to-amber-300', 'bg-gray-300']
  const valueOf = (r, k) => Number(r.costs?.[k]) || 0
  const data = rows
    .filter((r) => r.state !== 'future' || (includePlanned && keys.some((k) => valueOf(r, k) > 0)))
    .map((r) => ({ key: r.key, label: r.label, state: r.state, ...Object.fromEntries(keys.map((k) => [k, valueOf(r, k)])) }))
  const drafts = [...new Map(rows.flatMap((r) => r.costs?.lines || []).filter((l) => l.planned).map((l) => [l.id, l])).values()]
  return (
    <Card className="p-5 sm:p-6" delay={220}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-bold text-ink">Where the money went</h3>
          <p className="text-[13px] text-smoke">The real spend, read from the platform. Click a month for every line.</p>
        </div>
        {seg !== 'vip' && (
          <label className="inline-flex cursor-pointer items-center gap-2.5 rounded-full border border-gray-200 bg-white py-1.5 pl-3.5 pr-2 text-[13px] font-semibold text-ink shadow-sm">
            Include draft challenges
            <Toggle size="sm" on={includePlanned} onChange={setIncludePlanned} label="Include draft challenges" />
          </label>
        )}
      </div>
      {includePlanned && seg !== 'vip' && (
        <p className="mb-3 animate-rise rounded-xl bg-amber-50 px-3.5 py-2 text-[13px] text-amber-800">
          {drafts.length ? `Counting ${drafts.length === 1 ? 'the draft' : `${drafts.length} drafts`}: ${drafts.map((d) => d.title).join(', ')}.` : 'No draft challenge falls in these months.'}
        </p>
      )}
      {data.length === 0 ? (
        <p className="rounded-xl bg-cloud/60 px-4 py-10 text-center text-sm text-smoke">Nothing has been spent in these months yet.</p>
      ) : (
        <div className="h-56 w-full sm:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 6, right: 4, left: -6, bottom: 0 }} onClick={(e) => e?.activePayload?.[0] && onOpen(e.activePayload[0].payload.key)}>
              <CartesianGrid vertical={false} stroke={CHART.grid} strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: CHART.grid }} tickMargin={8} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} width={52} tickFormatter={(v) => `€${formatViews(v)}`} />
              <Tooltip cursor={{ fill: 'rgba(217,68,7,0.06)' }} contentStyle={tooltipStyle} formatter={(v, n) => [eur(v), names[n]]} />
              {keys.map((k, i) => (
                <Bar key={`${k}-${includePlanned}`} dataKey={k} stackId="c" fill={fills[i]} shape={stackShape(keys, k)} maxBarSize={44} animationDuration={600} cursor="pointer" />
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
    ['Targets', `A growth plan, not typed in month by month. Community: ${line(c)}. VIP: ${line(v)}. Every other month follows, rounded to a clean figure, so new months appear with a target on their own. Edit plan changes the anchor, the growth or a single month.`],
    ['Views achieved', 'Views gained inside each month on every entry, read from the platform, plus challenges that ran off the platform (spread by the days they ran). VIP months before October 2026 come from the VIP sheet.'],
    ['Earnings', `Views achieved ÷ 1,000 × the EPM: what 1,000 views are worth to Tryp.com (community €${c.epm.toFixed(2)}, VIP €${v.epm.toFixed(2)}).`],
    ['VIP', 'VIP creators only: official creators (Tryp.com Official) are not counted in VIP views or VIP pay.'],
    ['Costs', 'Counted automatically: every challenge prize pot (or what was paid, if more) and its vouchers, spread over the days it ran; other rewards; VIP creator pay (closed months from statements, this month live).'],
    ['Planned costs', `The target views × the target CPM, what 1,000 views should cost (community €${c.cpm.toFixed(2)}, VIP €${v.cpm.toFixed(2)}).`],
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
