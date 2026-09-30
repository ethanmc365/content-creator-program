import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Link } from 'react-router-dom'
import { Avatar, PageHeader, Skeleton } from '../../components/ui'
import Icon from '../../components/Icon'
import KpiTargetSheet from '../../components/admin/KpiTargetSheet'
import KpiDetail from '../../components/admin/KpiDetail'
import KpiProgress from '../../components/admin/KpiProgress'
import { confirm } from '../../lib/confirm'
import { cx } from '../../lib/utils'
import KpiTotal from '../../components/admin/KpiTotal'
import { RollingOverview } from '../../components/admin/KpiOverview'
import { SCOPE_COLORS } from '../../components/charts/chartTheme'
import { clearKpiPlanCache } from '../../lib/useKpiPlan'
import { STATUS_HEX_ON_BRAND, statusGradient } from '../../lib/barGradient'
import { prefetchKpiDetail } from '../../components/admin/KpiDetail'
import {
  adjacentMonth, adjacentQuarter, currentMonth, currentQuarter, daysUntil, formatKpiValue, mergeKpiRows,
  metricDef, metricLabel, periodLabel, periodStarted, rollUpTargets, rowStatus, withDerivedTargets,
} from '../../lib/kpiTracker'
import Segmented from '../../components/network/Segmented'
import { usePlural, useT } from '../../lib/i18n'
import { flagEmoji } from '../../lib/countries'

// THE KPI TRACKER.
//
// Ethan: "I want a KPI tracker for the admins. This can be in reference to
// the number of challenges run, the number of creators recruited, the
// number of creators who participated, the number of views... I want a
// really clean UI so we can compare them at the end and see the progress.
// Are we on track? Are we off track?... I don't want this built into
// analytics, so maybe create a new page."
//
// WHY ITS OWN PAGE AND NOT A TAB ON ANALYTICS. Analytics answers "how did
// the programme do" in rows of numbers, read after the fact. A KPI is a
// PLAN made in advance and checked against as the quarter runs - the
// question is not "what happened" but "are we still going to hit it" - and
// bolting a plan onto a page built for a retrospective is how the two ideas
// end up looking like one one cluttered idea, which is the exact complaint
// this page exists to avoid repeating.
//
// EVERY NUMBER ON THIS PAGE IS EITHER A PLAN OR A FACT, NEVER BOTH AT ONCE.
// A target is what `kpi_targets` holds. An actual, for the four standard
// metrics, is never stored - it is read live from `kpi_actuals()` (migration
// 254) every time this page opens, the same discipline `results.final_views`
// already taught this codebase: a number that could drift out of sync with
// its own source of truth eventually will. Only a CUSTOM KPI - one nothing on
// the platform can count on its own - keeps a typed-in `current_value`.
//
// WHO CAN SEE WHAT. Every admin reads every scope's KPIs (Ethan: "all the
// admins should have access to all the market KPIs and see everything").
// Only a scope's own manager - or a global admin, who manages all of them -
// can set or change its targets. `my_managed_scopes()` (migration 074) is
// the existing, already-audited answer to "which markets do I lead"; this
// page asks it once rather than re-deriving the rule.
export default function AdminKpis() {
  const tr = useT()
  const plural = usePlural()
  const { profile } = useAuth()

  const [communities, setCommunities] = useState(null)
  const [managedIds, setManagedIds] = useState(null)
  // THE SCOPE PILLS (29 Sep 2026). Worldwide is TWO things and Ethan asked for
  // both: the TOTAL of everything the platform does, and the GLOBAL challenges
  // on their own. They share the Worldwide community row and differ by `basis`
  // (migration 281). Markets are one pill each, as before.
  const [scopeKey, setScopeKey] = useState('')
  //
  // THE TOTAL IS ADDED UP, NOT SET (30 Sep 2026). Ethan: "the total one shouldn't have targets set and
  // instead should be a combination of everything from all the KPIs that have been set for all the
  // markets". It is its own button, apart from the row (he: "Germany has it as a separate button on
  // the left, and then global challenges, Germany, Nordics, Portugal, etc., is scrollable"), and it
  // opens `KpiTotal`, which reads every other scope. Each scope carries a colour that follows it
  // everywhere the Total draws it.
  const scopes = useMemo(() => (communities || []).flatMap((c) => (c.kind === 'network'
    ? [{ key: `${c.id}:global`, id: c.id, basis: 'global', name: tr('Global challenges'), sub: tr('Global challenges only'), currency: c.currency, global: true }]
    : [{ key: c.id, id: c.id, basis: 'all', name: c.name, currency: c.currency, flag: marketFlag(c.country_codes) }]))
    .map((x, i) => ({ ...x, color: SCOPE_COLORS[i % SCOPE_COLORS.length] })), [communities, tr])
  const TOTAL = 'total'
  const isTotal = scopeKey === TOTAL
  const current = isTotal ? null : scopes.find((x) => x.key === scopeKey)
  const scope = current?.id || ''
  const basis = current?.basis || 'all'
  // A PERIOD IS A QUARTER OR A MONTH (24 Sep 2026). `month` null = the whole
  // quarter, as every target was before migration 258.
  const [period, setPeriod] = useState(() => ({ ...currentQuarter(), month: null }))

  // IS THERE ANYTHING TO SCROLL TO? The market row fades its right edge so a
  // clipped pill reads as "there is more" rather than as a bug, and that fade
  // must not appear on a row that already fits - it would dim the last market
  // for no reason. Measured rather than assumed, and re-measured when the box
  // or the list changes.
  const marketsRef = useRef(null)
  const [marketsOverflow, setMarketsOverflow] = useState(false)
  useEffect(() => {
    const el = marketsRef.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const measure = () => setMarketsOverflow(el.scrollWidth > el.clientWidth + 1)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    for (const child of el.children) ro.observe(child)
    return () => ro.disconnect()
  }, [communities, scopes])
  const { year, quarter, month } = period
  const byMonth = month != null
  const now = currentMonth()
  const isCurrent = byMonth
    ? year === now.year && month === now.month
    : year === now.year && quarter === now.quarter
  const step = (delta) => setPeriod(byMonth ? adjacentMonth(year, month, delta) : { ...adjacentQuarter(year, quarter, delta), month: null })
  const setMode = (m) => setPeriod(m === 'month'
    ? (year === now.year && quarter === now.quarter ? now : { year, quarter, month: (quarter - 1) * 3 + 1 })
    : { year, quarter, month: null })
  const [targets, setTargets] = useState(null)
  const [actuals, setActuals] = useState(null)
  const [err, setErr] = useState('')
  const [editing, setEditing] = useState(null) // a target row, or {} for a new one
  const [detail, setDetail] = useState(null) // the KPI opened for its story

  // COMMUNITIES AND MANAGED SCOPES LOAD ONCE. Worldwide first - it is the
  // scope every creator belongs to and the one Ethan named first ("KPIs for
  // the whole worldwide community that I can also create and adjust") -
  // then markets alphabetically.
  useEffect(() => {
    let alive = true
    Promise.all([
      supabase.from('communities').select('id, name, kind, currency, country_codes').is('retired_at', null),
      supabase.rpc('my_managed_scopes'),
    ]).then(([{ data: c, error: cErr }, { data: m, error: mErr }]) => {
      if (!alive) return
      if (cErr) { setErr(cErr.message); return }
      const sorted = [...(c || [])].filter(Boolean).sort((a, b) => {
        if (a.kind === 'network') return -1
        if (b.kind === 'network') return 1
        return a.name.localeCompare(b.name)
      })
      setCommunities(sorted)
      setManagedIds(new Set(mErr ? [] : (m || []).map((r) => (typeof r === 'string' ? r : r.my_managed_scopes))))
      setScopeKey((k) => k || 'total')
    })
    return () => { alive = false }
  }, [])

  // SWITCHING MARKET OR PERIOD KEEPS THE PAGE (28 Sep 2026). Ethan: "It seems
  // to load in a bit delayed, and the animation isn't that smooth." Every
  // switch used to blank the cards to skeletons and then wait for a scroll
  // observer before they could arrive. Now the old cards stay, dimmed, until
  // the new numbers are in, and the new ones rise straight in.
  const [fetching, setFetching] = useState(false)
  const [shownKey, setShownKey] = useState('')
  const [monthTargets, setMonthTargets] = useState([])
  const [quarterTargets, setQuarterTargets] = useState([])
  // A NEWER REQUEST WINS. Stepping through periods quickly starts several loads and
  // they finish in any order; without this the slowest one (an OLD period) landed
  // last and the page showed one quarter's goals under another's name.
  const loadSeq = useRef(0)
  // A CACHE OF WHAT WAS ALREADY FETCHED (30 Sep 2026). Ethan: "there's lag when switching
  // between them ... the whole page is a bit laggy when loading." Each step was three round
  // trips before anything moved. Now a period that has been seen paints at once from here while
  // the fresh numbers are fetched behind it (the request always still happens, so nothing shown
  // can be stale for more than a moment), and the periods either side are fetched in advance.
  const cacheRef = useRef(new Map())
  const fetchSet = useCallback(async (sc, bs, y, q, m) => {
    const bm = m != null
    const base = () => supabase.from('kpi_targets').select('*, creator:created_by(id, name, photo_url)')
      .eq('community_id', sc).eq('basis', bs).eq('year', y).eq('quarter', q)
    let tq = base()
    tq = bm ? tq.eq('month', m) : tq.is('month', null)
    const other = bm ? base().is('month', null) : base().not('month', 'is', null)
    const [t, o, a] = await Promise.all([
      tq.order('created_at'),
      other.order('created_at'),
      supabase.rpc('kpi_actuals', { p_community_id: sc, p_year: y, p_quarter: q, p_basis: bs, ...(bm ? { p_month: m } : {}) }),
    ])
    return { t, o, a, bm }
  }, [])
  const apply = useCallback((res, key) => {
    const { t, o, a, bm } = res
    if (t.error) { setErr(t.error.message); setTargets([]); return }
    setErr(a.error ? a.error.message : '')
    setTargets(t.data || [])
    if (bm) { setQuarterTargets(o.data || []); setMonthTargets([]) } else { setMonthTargets(o.data || []); setQuarterTargets([]) }
    setActuals(a.data || [])
    setShownKey(key)
  }, [])
  const load = useCallback(async () => {
    if (!scope || isTotal) return
    const mine = ++loadSeq.current
    const key = `${scope}:${basis}:${year}:${quarter}:${month ?? ''}`
    const hit = cacheRef.current.get(key)
    if (hit) apply(hit, key); else setFetching(true)
    const res = await fetchSet(scope, basis, year, quarter, month)
    if (mine !== loadSeq.current) return
    if (!res.t.error) cacheRef.current.set(key, res)
    setFetching(false)
    apply(res, key)
    // the neighbours, when the browser has a spare moment
    const ric = window.requestIdleCallback || ((fn) => setTimeout(fn, 250))
    ric(() => {
      // Either side, AND the other granularity of where we are, so the Quarter / Month switch
      // paints from the cache too.
      const nb = [-1, 1].map((d) => (byMonth ? adjacentMonth(year, month, d) : { ...adjacentQuarter(year, quarter, d), month: null }))
      const cur = currentMonth()
      nb.push(byMonth ? { year, quarter, month: null }
        : (year === cur.year && quarter === cur.quarter ? cur : { year, quarter, month: (quarter - 1) * 3 + 1 }))
      nb.forEach(async (p) => {
        const k = `${scope}:${basis}:${p.year}:${p.quarter}:${p.month ?? ''}`
        if (cacheRef.current.has(k)) return
        const r = await fetchSet(scope, basis, p.year, p.quarter, p.month ?? null)
        if (!r.t.error) cacheRef.current.set(k, r)
      })
    })
  }, [scope, isTotal, basis, year, quarter, month, byMonth, fetchSet, apply])
  useEffect(() => { load() }, [load])

  // EVERYTHING ON THE PAGE MOVES TOGETHER (1 Oct 2026). Ethan: Germany showed "0 out of 500k" with
  // no KPI set, and the UK "showing up once, then deleted. Everything should update." The per-scope
  // cache was cleared after a save or a delete, but the Total and the overview kept their own copies
  // and never asked again, so a deleted goal lived on in them. `invalidate` now clears every cache
  // AND tells every chart to re-read (clearKpiPlanCache bumps a version they all listen to), and a
  // realtime subscription does the same when a goal changes anywhere else - another admin, another
  // tab, a market lead on their phone.
  const invalidate = useCallback(({ reload = true } = {}) => {
    cacheRef.current.clear()
    clearKpiPlanCache()
    if (reload) load()
  }, [load])
  useEffect(() => {
    let timer = null
    const ch = supabase.channel('kpi-targets-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kpi_targets' }, () => {
        clearTimeout(timer)
        timer = setTimeout(() => invalidate(), 250)
      })
      .subscribe()
    return () => { clearTimeout(timer); supabase.removeChannel(ch) }
  }, [invalidate])

  // EVERY MARKET'S CURRENT PERIOD, FETCHED WHILE IDLE (30 Sep 2026), so pressing a market paints at
  // once from the cache instead of skeletons first.
  useEffect(() => {
    if (!scopes.length) return undefined
    const ric = window.requestIdleCallback || ((fn) => setTimeout(fn, 400))
    const id = ric(() => {
      for (const sc of scopes) {
        const k = `${sc.id}:${sc.basis}:${year}:${quarter}:${month ?? ''}`
        if (cacheRef.current.has(k)) continue
        fetchSet(sc.id, sc.basis, year, quarter, month).then((r) => { if (!r.t.error) cacheRef.current.set(k, r) })
      }
    })
    return () => (window.cancelIdleCallback ? window.cancelIdleCallback(id) : clearTimeout(id))
  }, [scopes, year, quarter, month, fetchSet])

  // The picked market slides into view in the scrolling row.
  useEffect(() => {
    const el = marketsRef.current?.querySelector('[aria-selected="true"]')
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  }, [scopeKey])

  // WHAT THE PAGE SHOWS: what somebody set for exactly this period, plus a
  // worked-out row for every KPI that only exists in the other granularity.
  const merged = useMemo(() => {
    if (!targets) return null
    const rows = withDerivedTargets({ period, own: targets, monthsOfQuarter: monthTargets, quarterTargets })
    // A quarter goal set BY HAND next to monthly goals that do not add up to it:
    // say so on the card rather than let two numbers quietly disagree.
    const byKey = new Map()
    for (const m of monthTargets) {
      const k = `${m.metric}:${m.metric === 'custom' ? m.label : ''}`
      if (!byKey.has(k)) byKey.set(k, [])
      byKey.get(k).push(Number(m.target_value))
    }
    return mergeKpiRows(rows, actuals || []).map((r) => {
      if (r.derived || byMonth) return r
      const vals = byKey.get(`${r.metric}:${r.metric === 'custom' ? r.label : ''}`)
      return vals ? { ...r, monthsSum: rollUpTargets(r, vals), monthsSet: vals.length } : r
    })
  }, [targets, actuals, monthTargets, quarterTargets, period, byMonth])
  // Every card's story is fetched while the page is idle, so opening one shows its charts at once.
  useEffect(() => {
    if (isTotal || !merged?.length) return undefined
    const ric = window.requestIdleCallback || ((fn) => setTimeout(fn, 500))
    const id = ric(() => merged.forEach((row) => prefetchKpiDetail({ row, scope, basis, period })))
    return () => (window.cancelIdleCallback ? window.cancelIdleCallback(id) : clearTimeout(id))
  }, [merged, isTotal, scope, basis, period])
  const canEdit = !isTotal && !!(managedIds && scope && managedIds.has(scope))
  const scopeName = isTotal ? tr('Total') : current?.name || ''
  const currency = current?.currency || 'EUR'
  const ready = !!communities && managedIds !== null && (isTotal || merged !== null)
  // The scopes this admin may set goals for, for the market switch inside the goal sheet.
  const editableScopes = useMemo(() => scopes.filter((x) => managedIds?.has(x.id)), [scopes, managedIds])
  // THE YEAR SECTION WAITS ITS TURN (30 Sep 2026): it fires up to twelve requests, and doing that in
  // the same breath as the cards was a large part of the lag. The cards paint first.
  const [yearOn, setYearOn] = useState(false)
  useEffect(() => {
    if (!ready || yearOn) return undefined
    const id = setTimeout(() => setYearOn(true), 600)
    return () => clearTimeout(id)
  }, [ready, yearOn])

  const statuses = useMemo(
    () => (merged || []).map((r) => rowStatus(r, period)),
    [merged, period],
  )
  const metCount = statuses.filter((s) => s.status === 'met').length
  const onTrackCount = statuses.filter((s) => s.status === 'on_track').length
  const derivedRows = (merged || []).filter((r) => r.derived)
  // ONE FLAT GRID (30 Sep 2026). Ethan: "I don't think we necessarily need it to be divided into
  // these groups, it will take up too much space and it's better for everything to just be
  // arranged nicely." Anything behind or missed comes first (that is what you open this page to
  // find), then the rest in their usual order.
  const ordered = useMemo(() => {
    const rank = { missed: 0, behind: 1, on_track: 2, met: 3, upcoming: 4 }
    return (merged || [])
      .map((r, order) => ({ r: { ...r, order }, s: rowStatus(r, period).status }))
      .sort((x, y) => (rank[x.s] - rank[y.s]) || (x.r.order - y.r.order))
      .map((x) => x.r)
  }, [merged, period])
  const actualsMap = useMemo(() => Object.fromEntries((actuals || []).map((a) => [a.metric, Number(a.value)])), [actuals])

  // SAVE THE WORKED-OUT ROWS AS REAL GOALS. One press turns the months
  // combined into the quarter's goal (or the quarter's split into this month's
  // goal), so a number that started as arithmetic can be owned and adjusted.
  async function saveDerived() {
    const rows = derivedRows.map((r) => ({
      community_id: scope, basis, year, quarter, month: byMonth ? month : null,
      metric: r.metric, label: r.label, target_value: r.target_value, is_automated: r.is_automated,
      current_value: r.metric === 'custom' ? (Number(r.current_value) || 0) : null,
      unit: r.unit || 'number', cumulative: r.cumulative !== false, higher_is_better: r.higher_is_better !== false,
      created_by: profile?.id,
    }))
    const { error } = await supabase.from('kpi_targets').insert(rows)
    if (error) { setErr(error.message); return }
    invalidate()
  }

  async function removeTarget(row) {
    const ok = await confirm(
      tr('Delete this KPI target? The numbers behind it are not affected - only the plan is removed.'),
      { danger: true, confirmLabel: tr('Delete') },
    )
    if (!ok) return
    const { error } = await supabase.from('kpi_targets').delete().eq('id', row.id)
    if (error) { setErr(error.message); return }
    invalidate()
  }


  const started = periodStarted(period)
  const startsIn = daysUntil(period)
  const backLabel = periodLabel(byMonth ? now : { ...currentQuarter(), month: null })
  const backToToday = () => setPeriod(byMonth ? now : { ...currentQuarter(), month: null })

  return (
    <div className="page">
      <PageHeader back="/admin" title={tr('KPI tracker')} inlineAction action={(
        /* On phones the jump back sits on the title's line; from lg up it floats over the period. */
        <BackToToday show={!isCurrent} label={tr('Back to {p}', { p: backLabel })} onClick={backToToday} className="lg:hidden" />
      )} />

      {err && <p className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{err}</p>}

      <div className="relative mb-6 flex flex-col gap-2.5 rounded-card border border-gray-100 bg-white p-2 shadow-card animate-fade-up lg:flex-row lg:items-center lg:gap-3">
        {/* TOTAL ON ITS OWN, THE REST SCROLLING (30 Sep 2026). Ethan: "Make the total stand out a bit ...
            a separate button on the left, and then global challenges, Germany, Nordics, Portugal,
            etc., is scrollable." */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            type="button"
            role="tab"
            aria-selected={isTotal}
            onClick={() => setScopeKey(TOTAL)}
            className={cx(
              'flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3.5 text-[13px] font-bold transition-all duration-200',
              isTotal ? 'bg-ink text-white shadow-card' : 'bg-cloud text-ink hoverable:hover:bg-gray-200',
            )}
          >
            <Icon name="globe" className="h-4 w-4" />
            {tr('Total')}
          </button>
          <span aria-hidden className="h-6 w-px shrink-0 bg-gray-200" />
          <div
            ref={marketsRef}
            data-overflow={marketsOverflow ? 'true' : 'false'}
            className="kpi-markets flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overscroll-contain scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="tablist"
            aria-label={tr('Market')}
          >
            {!communities ? (
              <Skeleton className="h-8 w-64" />
            ) : (
              scopes.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  role="tab"
                  aria-selected={scopeKey === c.key}
                  onClick={() => setScopeKey(c.key)}
                  title={c.sub}
                  className={cx(
                    'flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition-all duration-200',
                    scopeKey === c.key
                      ? 'bg-brand text-white shadow-card'
                      : 'text-smoke hoverable:hover:bg-cloud hoverable:hover:text-ink',
                  )}
                >
                  {c.name}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="relative flex items-center justify-between gap-1.5 border-t border-gray-100 pt-2 lg:shrink-0 lg:justify-start lg:border-l lg:border-t-0 lg:pl-3 lg:pt-0">
          <Segmented
            value={byMonth ? 'month' : 'quarter'}
            onChange={setMode}
            size="sm"
            label={tr('Quarter or month')}
            options={[{ value: 'quarter', label: tr('Quarter') }, { value: 'month', label: tr('Month') }]}
          />
          <div className="relative flex items-center gap-0.5 sm:gap-1">
            {/* BACK TO TODAY, CENTRED OVER THE PERIOD (30 Sep 2026). Ethan: it was "too far above it,
                and it's not centred with the Q4 2026. Centre that button, and maybe lower it a bit."
                Absolute, so it never moves anything when it appears. */}
            <span className="pointer-events-none absolute bottom-full left-1/2 mb-6 hidden -translate-x-1/2 lg:block">
              <BackToToday show={!isCurrent} label={tr('Back to {p}', { p: backLabel })} onClick={backToToday} className="pointer-events-auto" />
            </span>
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label={byMonth ? tr('Previous month') : tr('Previous quarter')}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-smoke transition-colors hoverable:hover:bg-cloud hoverable:hover:text-brand"
            >
              <Icon name="chevronLeft" className="h-4 w-4" />
            </button>
            {/* THE PERIOD, IN THE PLATFORM'S OWN STYLE (1 Oct 2026). Ethan did not like the pale orange
                block: it is white with a calendar mark now, like every other control on the bar. */}
            <span className="flex h-8 min-w-[6.5rem] items-center justify-center gap-1.5 overflow-hidden rounded-lg border border-gray-200 bg-white px-3 text-[13px] font-bold tabular-nums text-ink shadow-[0_1px_2px_rgba(26,26,26,0.04)] sm:min-w-[8.5rem]">
              <Icon name="calendar" className="h-3.5 w-3.5 shrink-0 text-brand" />
              <span key={periodLabel(period)} className="animate-pop-in">{periodLabel(period)}</span>
            </span>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label={byMonth ? tr('Next month') : tr('Next quarter')}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-smoke transition-colors hoverable:hover:bg-cloud hoverable:hover:text-brand"
            >
              <Icon name="chevronRight" className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {isTotal ? (
        !communities ? <Skeleton className="h-40 w-full rounded-card" /> : (
          <div key="total" className="animate-page-in">
            <KpiTotal scopes={scopes} period={period} byMonth={byMonth} currency="EUR" onPickScope={setScopeKey} />
          </div>
        )
      ) : !ready && !merged ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 w-full rounded-card" />)}
        </div>
      ) : (
        <>
          <div key={shownKey} className={cx('transition-opacity duration-200', fetching && 'pointer-events-none opacity-60')}>
            {/* ---------- the period at a glance ---------- */}
            {merged.length > 0 && (
              <div className="brand-drift mb-6 overflow-hidden rounded-card px-5 py-4 text-white shadow-card animate-fade-up sm:px-6 sm:py-5">
                <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
                  <div>
                    {started ? (
                      <p className="text-3xl font-bold tabular-nums leading-none">{metCount + onTrackCount}<span className="text-white/70">/{merged.length}</span></p>
                    ) : (
                      <p className="text-3xl font-bold tabular-nums leading-none">{merged.length}</p>
                    )}
                    <p className="mt-1.5 text-xs font-medium uppercase tracking-wide text-white/80">{started ? tr('On track or met') : tr('Goals set')}</p>
                  </div>
                  <div className="min-w-[14rem] flex-1">
                    {/* NOT STARTED READS AS NOT STARTED (30 Sep 2026): a dashed empty track, never a
                        full white bar that looks like "all on track" for a quarter nobody has begun. */}
                    {started ? (
                      <div className="h-2.5 overflow-hidden rounded-full bg-white/25" role="img" aria-label={tr('How the goals are doing')}>
                        <div className="kpi-fill h-full rounded-full" style={{ background: spreadGradient(statuses) }} />
                      </div>
                    ) : (
                      <div className="h-2.5 rounded-full border border-dashed border-white/60" role="img" aria-label={tr('Not started yet')} />
                    )}
                  </div>
                </div>
                <p className="mt-3 text-sm text-white/90">
                  {!started
                    ? (startsIn <= 1
                      ? tr('{p} starts tomorrow. {n} goals are ready for {scope}.', { p: periodLabel(period), n: merged.length, scope: scopeName })
                      : tr('{p} starts in {d} days. {n} goals are ready for {scope}.', { p: periodLabel(period), d: startsIn, n: merged.length, scope: scopeName }))
                    : metCount === merged.length
                      ? tr('Every target for {scope} is met for {p}.', { scope: scopeName, p: periodLabel(period) })
                      : tr('{n} of {total} targets for {scope} are on track or already met.', { n: metCount + onTrackCount, total: merged.length, scope: scopeName })}
                </p>
              </div>
            )}

            {/* THE TWO GRANULARITIES ARE ONE PLAN (29 Sep 2026). Goals set month by
                month show here combined for the quarter, and a quarter's goal shows
                its share in each month. Worked-out rows are marked, never saved
                behind anybody's back, and one press makes them real. */}
            {derivedRows.length > 0 && (
              <div className="mb-5 flex flex-col gap-3 rounded-card border border-gray-100 bg-white p-4 shadow-card animate-fade-up sm:flex-row sm:items-center">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white shadow-card">
                  <Icon name="refresh" className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">
                    {byMonth
                      ? plural(derivedRows.length, 'One goal comes from {q}', '{n} goals come from {q}', { q: periodLabel({ year, quarter, month: null }) })
                      : plural(derivedRows.length, 'One goal is the months added up', '{n} goals are the months added up')}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-smoke">
                    {byMonth
                      ? tr('Shared across the quarter\'s months, rising gently month by month. Save them to make them this month\'s own.')
                      : tr('Worked out from the monthly goals. Save them to make them the quarter\'s own.')}
                  </p>
                </div>
                {canEdit && (
                  <button type="button" onClick={saveDerived} className="btn-primary shrink-0 justify-center !py-2 text-sm transition-transform duration-200 hoverable:hover:scale-[1.03]">
                    <Icon name="check" className="h-4 w-4" strokeWidth={2.4} />
                    {byMonth ? tr('Save as this month\'s goals') : tr('Save as quarter goals')}
                  </button>
                )}
              </div>
            )}

            {/* ---------- the KPIs ---------- */}
            {merged.length === 0 ? (
              <div className="rounded-card border border-dashed border-gray-200 px-6 py-16 text-center animate-fade-up">
                <Icon name="trophy" className="mx-auto h-8 w-8 text-gray-300" />
                <p className="mt-3 text-sm font-semibold text-ink">{tr('No targets set for {q} yet', { q: periodLabel(period) })}</p>
                <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-smoke">
                  {canEdit
                    ? tr('Set a target for challenges run, creators recruited, participation or views.')
                    : tr('The people leading {scope} have not set any targets for {p} yet.', { scope: scopeName, p: periodLabel(period) })}
                </p>
                {canEdit && (
                  <button type="button" onClick={() => setEditing({ community_id: scope })} className="btn-primary mx-auto mt-4">
                    <Icon name="plus" className="h-4 w-4" strokeWidth={2.4} />
                    {tr('Set a KPI target')}
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {ordered.map((row, i) => (
                    <KpiCard
                      style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
                      key={row.id || `${row.derived}:${row.metric}:${row.label}`}
                      row={row}
                      period={period}
                      startsIn={startsIn}
                      currency={currency}
                      canEdit={canEdit}
                      onEdit={() => setEditing(row)}
                      onDelete={() => (row.id ? removeTarget(row) : null)}
                      onOpen={() => setDetail(row)}
                      onPrefetch={() => prefetchKpiDetail({ row, scope, basis, period })}
                    />
                  ))}
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setEditing({ community_id: scope })}
                    className="animate-fade-up flex w-full items-center justify-center gap-2.5 rounded-card border-2 border-dashed border-gray-200 px-4 py-4 text-smoke transition-all duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand/40 hoverable:hover:text-brand"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-cloud">
                      <Icon name="plus" className="h-4 w-4" strokeWidth={2.2} />
                    </span>
                    <span className="text-sm font-semibold">{tr('Add a KPI')}</span>
                    <span className="text-xs text-gray-400">{tr('for {p}', { p: periodLabel(period) })}</span>
                  </button>
                )}
              </div>
            )}
          </div>
          {/* OUTSIDE THE KEYED BLOCK: it depends on the scope and the window, not the exact period,
              so stepping through periods refreshes it in place instead of rebuilding it. */}
          {ready && (yearOn ? <RollingOverview scopes={current ? [current] : []} period={period} byMonth={byMonth} currency={currency} /> : <Skeleton className="mt-8 h-72 w-full rounded-card" />)}
        </>
      )}

      <KpiDetail
        row={detail}
        scope={scope}
        basis={basis}
        currency={currency}
        scopeName={scopeName}
        period={period}
        onClose={() => setDetail(null)}
      />

      {editing && (
        <KpiTargetSheet
          row={editing}
          communityName={scopeName}
          scopes={editableScopes}
          scopeKey={scopeKey}
          currency={currency}
          basis={basis}
          isGlobalScope={basis === 'global'}
          actuals={actualsMap}
          year={year}
          quarter={quarter}
          month={month}
          profileId={profile?.id}
          onClose={() => setEditing(null)}
          onEditExisting={(r) => setEditing(r)}
          onSaved={(p, savedScopeKey) => {
            setEditing(null)
            invalidate({ reload: false })
            if (savedScopeKey && savedScopeKey !== scopeKey) setScopeKey(savedScopeKey)
            // Land on the period the goal was set for, so it is right there.
            if (p && (p.year !== year || p.quarter !== quarter || (p.month ?? null) !== (month ?? null))) setPeriod(p)
            else load()
          }}
        />
      )}
    </div>
  )
}

// A market shows a flag only when it is one country (or a country and its neighbour, like the UK and
// Ireland, which take the first); a region such as the Nordics has no single flag and shows the name alone.
function marketFlag(codes) {
  const c = (codes || []).filter(Boolean)
  return c.length > 0 && c.length <= 2 ? flagEmoji(c[0]) : ''
}

// The solid "Back to Q3 2026" button. Fades and shrinks away when already on today's period, and is
// never removed, so nothing next to it moves.
function BackToToday({ show, label, onClick, className }) {
  return (
    <button
      type="button"
      tabIndex={show ? 0 : -1}
      aria-hidden={!show}
      onClick={onClick}
      className={cx(
        'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full bg-brand px-3.5 text-[12.5px] font-bold text-white shadow-card transition-all duration-300 ease-out hoverable:hover:scale-[1.04] hoverable:hover:shadow-lift active:scale-[0.98]',
        show ? 'translate-y-0 scale-100 opacity-100' : 'pointer-events-none translate-y-1 scale-95 opacity-0',
        className,
      )}
    >
      <Icon name="chevronLeft" className="h-3.5 w-3.5" strokeWidth={2.4} />
      {label}
    </button>
  )
}

// Tones for a bar drawn ON the orange card, not on white: each is checked against both ends of
// the brand gradient (#d94407 to #f5853f).
// Met is a deep green (2 Oct 2026, Ethan: "a bit darker green, especially on the left side").
const SUMMARY_HEX = STATUS_HEX_ON_BRAND

// ONE GRADIENT FOR THE WHOLE SPREAD: each status owns a share of the strip in proportion to how
// many goals are in it, and the colour eases into its neighbour across the seam instead of
// stopping dead. Best first (met, on track, behind, missed), so it reads green to red.
function spreadGradient(statuses) {
  const counts = {}
  for (const x of statuses) counts[x.status] = (counts[x.status] || 0) + 1
  return statusGradient(counts, SUMMARY_HEX)
}
const STATUS_STYLE = {
  met: { ring: 'stroke-emerald-400', bar: 'bg-emerald-400', chip: 'bg-emerald-50 text-emerald-600', label: 'Target met' },
  on_track: { ring: 'stroke-brand', bar: 'bg-brand', chip: 'bg-brand-tint text-brand', label: 'On track' },
  behind: { ring: 'stroke-amber-500', bar: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700', label: 'Behind pace' },
  missed: { ring: 'stroke-red-500', bar: 'bg-red-500', chip: 'bg-red-50 text-red-600', label: 'Missed' },
  upcoming: { ring: 'stroke-gray-300', bar: 'bg-gray-300', chip: 'bg-gray-100 text-smoke', label: 'Not started' },
}

// ONE TARGET.
//
// A PROGRESS BAR, NOT A GAUGE THAT ONLY EVER SHOWS "OUT OF THE TARGET". The
// fill runs to 100% at the target and keeps counting in the LABEL past it -
// a KPI hit at 140% is worth celebrating, not clipping off at a full bar
// that looks identical to one hit at exactly 100%.
function KpiCard({ row, period, startsIn, currency, canEdit, onEdit, onDelete, onOpen, onPrefetch, style: cardStyle }) {
  const tr = useT()
  const def = metricDef(row)
  const { status, pct, progress } = rowStatus(row, period)
  const style = STATUS_STYLE[status]
  const fmt = (v) => formatKpiValue(row, v, currency)

  return (
    // THE CARD OPENS (28 Sep 2026): its history, who is behind it, the charts.
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onPointerEnter={onPrefetch}
      onFocus={onPrefetch}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen?.() } }}
      style={cardStyle}
      className={cx(
        'animate-fade-up group relative flex cursor-pointer flex-col gap-3 rounded-card border bg-white p-4 shadow-card transition-[box-shadow,border-color] duration-300 hoverable:hover:border-brand/30 hoverable:hover:shadow-lift active:scale-[0.99]',
        row.derived ? 'border-dashed border-brand/30' : 'border-gray-100',
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold leading-snug text-ink">{tr(metricLabel(row))}</span>
          {row.derived ? (
            <span className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-brand">
              <Icon name="refresh" className="h-3 w-3" />
              {row.derived === 'rollup' ? tr('Months combined: {m}', { m: row.from }) : tr('Share of the {q} goal', { q: row.from })}
            </span>
          ) : null}
        </span>
        {canEdit && (
          <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100">
            <button type="button" onClick={(e) => { e.stopPropagation(); onEdit() }} aria-label={tr('Edit')} className="flex h-7 w-7 items-center justify-center rounded-full text-smoke hoverable:hover:bg-cloud hoverable:hover:text-ink">
              <Icon name="pencil" className="h-3.5 w-3.5" />
            </button>
            {!row.derived && (
              <button type="button" onClick={(e) => { e.stopPropagation(); onDelete() }} aria-label={tr('Delete')} className="flex h-7 w-7 items-center justify-center rounded-full text-smoke hoverable:hover:bg-red-50 hoverable:hover:text-red-500">
                <Icon name="trash" className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        )}
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-2">
          {status === 'upcoming' ? (
            <>
              <span className="text-2xl font-bold tabular-nums tracking-tight text-ink">{fmt(row.target_value)}</span>
              <span className="text-sm text-smoke">{tr('goal for {p}', { p: periodLabel(period) })}</span>
            </>
          ) : (
            <>
              <span className="text-2xl font-bold tabular-nums tracking-tight text-ink">{fmt(row.actual)}</span>
              <span className="text-sm text-smoke">
                {def.higherIsBetter ? tr('of') : tr('aim for under')} <strong className="font-semibold text-ink">{fmt(row.target_value)}</strong>
              </span>
            </>
          )}
        </div>
        <KpiProgress className="mt-2.5" status={status} pct={pct} progress={progress} isLevel={def.kind === 'level'} startsIn={startsIn} />
        {row.monthsSum != null && Math.abs(row.monthsSum - row.target_value) > 1e-9 && (
          <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium leading-relaxed text-smoke">
            <Icon name="calendar" className="h-3 w-3 text-brand" />
            {row.monthsSet === 1
              ? tr('Your monthly goal: {v}', { v: fmt(row.monthsSum) })
              : tr('Your {n} monthly goals add up to {v}', { n: row.monthsSet, v: fmt(row.monthsSum) })}
          </p>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 pt-0.5">
        <span className={cx('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', style.chip)}>
          {tr(style.label)}
        </span>
        <span className="flex min-w-0 items-center gap-2">
          {status !== 'upcoming' && <span className="text-xs font-semibold tabular-nums text-gray-400">{Math.round(pct * 100)}%</span>}
          {row.creator && (
            <Link to={`/profile/${row.creator.id}`} onClick={(e) => e.stopPropagation()} title={`${tr('Set by')} ${row.creator.name}`} className="flex min-w-0 items-center gap-1.5 rounded-full bg-cloud py-0.5 pl-0.5 pr-2 transition-colors hover:bg-brand-tint">
              <Avatar src={row.creator.photo_url} name={row.creator.name} size="xs" />
              <span className="truncate text-[11px] font-medium text-smoke">{row.creator.name?.split(' ')[0]}</span>
            </Link>
          )}
        </span>
      </div>
    </article>
  )
}
