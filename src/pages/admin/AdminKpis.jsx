import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Link } from 'react-router-dom'
import { Avatar, PageHeader, Skeleton } from '../../components/ui'
import Icon from '../../components/Icon'
import KpiTargetSheet from '../../components/admin/KpiTargetSheet'
import KpiDetail from '../../components/admin/KpiDetail'
import { confirm, promptText } from '../../lib/confirm'
import { cx } from '../../lib/utils'
import {
  METRIC_GROUPS, STANDARD_METRICS, adjacentMonth, adjacentQuarter, currentMonth, currentQuarter, formatKpiValue, mergeKpiRows,
  metricDef, metricLabel, periodLabel, rollUpTargets, rowStatus, withDerivedTargets,
} from '../../lib/kpiTracker'
import Segmented from '../../components/network/Segmented'
import { Bar, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { usePlural, useT } from '../../lib/i18n'

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
  const scopes = useMemo(() => (communities || []).flatMap((c) => (c.kind === 'network'
    ? [
      { key: `${c.id}:all`, id: c.id, basis: 'all', name: tr('Total'), sub: tr('Every market and global'), icon: 'globe', currency: c.currency },
      { key: `${c.id}:global`, id: c.id, basis: 'global', name: tr('Global challenges'), sub: tr('Global challenges only'), icon: 'globe', currency: c.currency },
    ]
    : [{ key: c.id, id: c.id, basis: 'all', name: c.name, currency: c.currency }])), [communities, tr])
  const current = scopes.find((x) => x.key === scopeKey)
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
      supabase.from('communities').select('id, name, kind, currency').is('retired_at', null),
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
      const net = sorted.find((x) => x.kind === 'network')
      setScopeKey((k) => k || (net ? `${net.id}:all` : sorted[0]?.id || ''))
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
  const load = useCallback(async () => {
    if (!scope) return
    const mine = ++loadSeq.current
    setFetching(true)
    // WHO SET IT (26 Sep 2026). Ethan: "show the profile of the admin that
    // actually created the KPI ... so we can see who created it, and then I can
    // follow up if I need to."
    const base = () => supabase.from('kpi_targets').select('*, creator:created_by(id, name, photo_url)')
      .eq('community_id', scope).eq('basis', basis).eq('year', year).eq('quarter', quarter)
    let tq = base()
    tq = byMonth ? tq.eq('month', month) : tq.is('month', null)
    // THE OTHER GRANULARITY, for the derived rows (29 Sep 2026): a quarter reads
    // its months, a month reads its quarter.
    const other = byMonth ? base().is('month', null) : base().not('month', 'is', null)
    const [t, o, a] = await Promise.all([
      tq.order('created_at'),
      other.order('created_at'),
      supabase.rpc('kpi_actuals', { p_community_id: scope, p_year: year, p_quarter: quarter, p_basis: basis, ...(byMonth ? { p_month: month } : {}) }),
    ])
    if (mine !== loadSeq.current) return
    setFetching(false)
    if (t.error) { setErr(t.error.message); setTargets([]); return }
    setErr(a.error ? a.error.message : '')
    setTargets(t.data || [])
    if (byMonth) { setQuarterTargets(o.data || []); setMonthTargets([]) } else { setMonthTargets(o.data || []); setQuarterTargets([]) }
    setActuals(a.data || [])
    setShownKey(`${scope}:${basis}:${year}:${quarter}:${month ?? ''}`)
  }, [scope, basis, year, quarter, month, byMonth])
  useEffect(() => { load() }, [load])

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
  const canEdit = !!(managedIds && scope && managedIds.has(scope))
  const community = communities?.find((c) => c.id === scope)
  const scopeName = current ? (current.basis === 'global' ? tr('Global challenges') : current.basis === 'all' && community?.kind === 'network' ? tr('Total') : community?.name) : ''
  const currency = current?.currency || 'EUR'
  const ready = !!communities && managedIds !== null && merged !== null

  const statuses = useMemo(
    () => (merged || []).map((r) => rowStatus(r, period)),
    [merged, period],
  )
  const metCount = statuses.filter((s) => s.status === 'met').length
  const onTrackCount = statuses.filter((s) => s.status === 'on_track').length
  const derivedRows = (merged || []).filter((r) => r.derived)
  // GROUPED BY WHAT THEY MEASURE. Twenty-odd KPIs in one grid is a wall; under
  // Output / Reach / Participation / Recruitment / Community, and the team's own
  // at the end, it is five short lists that each answer one question.
  const groupedRows = useMemo(() => {
    const groups = [...METRIC_GROUPS.map((g) => ({ ...g, rows: [] })), { key: 'custom', label: 'Your own KPIs', rows: [] }]
    ;(merged || []).forEach((r, order) => {
      const key = metricDef(r).group || 'custom'
      groups.find((g) => g.key === key).rows.push({ ...r, order })
    })
    return groups.filter((g) => g.rows.length)
  }, [merged])
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
    load()
  }

  // A HAND-TRACKED KPI'S PROGRESS IN ONE STEP, from the card, without opening the
  // whole sheet - it is the number somebody changes every few days.
  async function quickUpdate(row) {
    const v = await promptText(tr('What is {name} at now?', { name: row.label }), {
      title: tr('Update progress'), defaultValue: String(row.current_value ?? 0), confirmLabel: tr('Save'),
    })
    if (v === null) return
    const n = Number(v)
    if (!Number.isFinite(n)) { setErr(tr('That is not a number.')); return }
    await supabase.from('kpi_targets').update({ current_value: n }).eq('id', row.id)
    load()
  }

  async function removeTarget(row) {
    const ok = await confirm(
      tr('Delete this KPI target? The numbers behind it are not affected - only the plan is removed.'),
      { danger: true, confirmLabel: tr('Delete') },
    )
    if (!ok) return
    await supabase.from('kpi_targets').delete().eq('id', row.id)
    load()
  }


  return (
    <div className="page">
      <PageHeader
        back="/admin"
        title={tr('KPI tracker')}
        subtitle={tr('Set a target for a quarter or a month, and watch it against the real numbers as they land.')}
      />

      {err && <p className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{err}</p>}

      {/* ---------- scope + quarter, EACH NAMED AND EACH ITS OWN ROW (23 Sep
          2026). Ethan: "it should show clearly when the quarter is... I
          notice that card [the market pills] is worldwide, Germany, etc.,
          and the Q3 2026 is too big, they're not aligned." Sharing one row
          meant the quarter control - a bordered box round two 28px buttons -
          sat at a different height and weight than the market pills next to
          it, and wrapped onto its own line at most widths anyway. Two
          labelled rows, both built from the same pill, read as one control
          panel instead of two controls that happen to be near each other. */}
      {/* ONE COMPACT BAR (28 Sep 2026). Ethan: "too much white space between
          them, so just make it more compact." Market and period share one row
          from a laptop up, each led by a small label rather than a heading. */}
      {/* NO LABEL, NO SCROLLER, ONE LINE (28 Sep 2026). Ethan: the markets
          row "cuts it off a bit" when it scrolls, there was "a lot of white
          space below", it was "not aligned", and "you don't actually need to
          even say markets". The pills now WRAP instead of scrolling, so none
          is ever clipped; the scroller's hidden scrollbar gutter (the space
          under them) is gone with it; and the period sits on the same centre
          line at the right. */}
      <div className="mb-5 flex flex-col gap-2.5 rounded-card border border-gray-100 bg-white p-2 shadow-card animate-fade-up lg:flex-row lg:items-center lg:gap-3">
        {/* ONE LINE, SCROLLING SIDEWAYS (28 Sep 2026, later). Ethan, on what
            happens when you step to another quarter: "the market selection goes
            on 2 lines, rather than being on one line and scrollable."
            Wrapping was the earlier answer to "nothing should be clipped", and
            it has a cost he has now seen: the row's HEIGHT depends on what else
            is in the bar, so the moment the jump-back button appeared the
            markets reflowed onto a second line and the whole card grew. A row
            that scrolls sideways is always exactly one pill tall, whatever is
            beside it and however many markets there are. `overscroll-contain`
            keeps that scroll off the page behind it. */}
        <div
          ref={marketsRef}
          data-overflow={marketsOverflow ? 'true' : 'false'}
          className="kpi-markets flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overscroll-contain scroll-smooth"
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
                {c.icon && <Icon name={c.icon} className="h-3.5 w-3.5" />}
                {c.name}
              </button>
            ))
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-2 lg:shrink-0 lg:border-l lg:border-t-0 lg:pl-3 lg:pt-0">
          <Segmented
            value={byMonth ? 'month' : 'quarter'}
            onChange={setMode}
            size="sm"
            label={tr('Quarter or month')}
            options={[{ value: 'quarter', label: tr('Quarter') }, { value: 'month', label: tr('Month') }]}
          />
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label={byMonth ? tr('Previous month') : tr('Previous quarter')}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-smoke transition-colors hoverable:hover:bg-cloud hoverable:hover:text-brand"
            >
              <Icon name="chevronLeft" className="h-4 w-4" />
            </button>
            <span key={periodLabel(period)} className="flex h-8 min-w-[8.5rem] animate-pop-in items-center justify-center rounded-lg bg-brand-tint px-3 text-[13px] font-bold tabular-nums text-brand">
              {periodLabel(period)}
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

      {/* BACK TO TODAY, OUTSIDE THE CARD AND SAYING WHERE IT GOES (28 Sep
          2026). Ethan: "it shows up a 'this quarter' button which then makes
          that card expand ... also the UI of the 'this quarter' button doesn't
          really make sense as it seems as if I'm viewing the current quarter,
          the UI should be improved and maybe a separate button outside the
          card."
          Two faults, both fixed by moving it out and renaming it. Inside the
          bar it changed the bar's height, which reflowed the markets; and
          "This quarter" is what a LABEL for the period you are on would say,
          so as a button it read as a statement rather than a way back. It
          names the period it returns to now - "Back to Q4 2026" - which can
          only be an action, and it sits under the bar where appearing and
          disappearing moves nothing but itself. */}
      {!isCurrent && (
        <div className="-mt-3 mb-4 flex justify-end animate-fade-up">
          <button
            type="button"
            onClick={() => setPeriod(byMonth ? now : { ...currentQuarter(), month: null })}
            className="inline-flex items-center gap-1.5 rounded-full border border-brand/25 bg-brand-tint px-3 py-1.5 text-xs font-semibold text-brand transition-colors hoverable:hover:bg-brand hoverable:hover:text-white"
          >
            <Icon name="chevronLeft" className="h-3.5 w-3.5" />
            {tr('Back to {p}', { p: periodLabel(byMonth ? now : { ...currentQuarter(), month: null }) })}
          </button>
        </div>
      )}

      {!ready && !merged ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 w-full rounded-card" />)}
        </div>
      ) : (
        <div key={shownKey} className={cx('transition-opacity duration-200', fetching && 'pointer-events-none opacity-50')}>
          {/* ---------- the quarter at a glance ---------- */}
          {merged.length > 0 && (
            <div className="animate-fade-up">
              <div className="brand-drift mb-6 overflow-hidden rounded-card px-5 py-4 text-white shadow-card sm:px-6 sm:py-5">
                <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
                  <div>
                    <p className="text-3xl font-bold tabular-nums leading-none">{metCount + onTrackCount}<span className="text-white/70">/{merged.length}</span></p>
                    <p className="mt-1.5 text-xs font-medium uppercase tracking-wide text-white/80">{tr('On track or met')}</p>
                  </div>
                  <div className="min-w-[14rem] flex-1">
                    {/* THE WHOLE SPREAD IN ONE STRIP: green met, white on track, amber
                        behind, red missed. Each segment grows in from the left. */}
                    <div className="flex h-2.5 overflow-hidden rounded-full bg-black/20" role="img" aria-label={tr('How the goals are doing')}>
                      {['met', 'on_track', 'behind', 'missed'].map((k) => {
                        const n = statuses.filter((x) => x.status === k).length
                        return n ? <span key={k} className={cx('kpi-fill h-full', SUMMARY_TONE[k])} style={{ width: `${(n / merged.length) * 100}%` }} /> : null
                      })}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-medium text-white/85">
                      {['met', 'on_track', 'behind', 'missed'].map((k) => {
                        const n = statuses.filter((x) => x.status === k).length
                        return n ? (
                          <span key={k} className="inline-flex items-center gap-1.5">
                            <span className={cx('h-2 w-2 rounded-full', SUMMARY_TONE[k])} />
                            {n} {tr(STATUS_STYLE[k].label)}
                          </span>
                        ) : null
                      })}
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-sm text-white/90">
                  {metCount === merged.length
                    ? tr('Every target for {scope} is met for {p}.', { scope: scopeName, p: periodLabel(period) })
                    : tr('{n} of {total} targets for {scope} are on track or already met.', { n: metCount + onTrackCount, total: merged.length, scope: scopeName })}
                </p>
              </div>
            </div>
          )}

          {/* THE TWO GRANULARITIES ARE ONE PLAN (29 Sep 2026). Goals set month by
              month show here combined for the quarter, and a quarter's goal shows
              its share in each month. Worked-out rows are marked, never saved
              behind anybody's back, and one press makes them real. */}
          {derivedRows.length > 0 && (
            <div className="mb-5 flex flex-wrap items-center gap-3 rounded-card border border-brand/20 bg-brand-tint/40 px-4 py-3 animate-fade-up">
              <Icon name="refresh" className="h-4 w-4 shrink-0 text-brand" />
              <p className="min-w-0 flex-1 text-sm text-ink">
                {byMonth
                  ? plural(derivedRows.length, 'One goal here is {q}\'s goal shared across its months, rising gently as the quarter goes on.', '{n} goals here are {q}\'s goals shared across its months, rising gently as the quarter goes on.', { q: periodLabel({ year, quarter, month: null }) })
                  : plural(derivedRows.length, 'One goal here is the monthly goals added together. Set a quarter goal to replace it.', '{n} goals here are the monthly goals added together. Set a quarter goal to replace them.')}
              </p>
              {canEdit && (
                <button type="button" onClick={saveDerived} className="btn-secondary !py-1.5 text-xs">
                  {byMonth ? tr('Save as this month\'s goals') : tr('Save as quarter goals')}
                </button>
              )}
            </div>
          )}

          {/* ---------- the KPIs ---------- */}
          {merged.length === 0 ? (
            <div className="rounded-card border border-dashed border-gray-200 px-6 py-16 text-center">
              <Icon name="trophy" className="mx-auto h-8 w-8 text-gray-300" />
              <p className="mt-3 text-sm font-semibold text-ink">{tr('No targets set for {q} yet', { q: periodLabel(period) })}</p>
              <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-smoke">
                {canEdit
                  ? tr('Set a target for challenges run, creators recruited, participation, views, or your own KPI.')
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
            <div className="space-y-7">
              {groupedRows.map((g) => (
                <section key={g.key}>
                  {groupedRows.length > 1 && (
                    <div className="mb-3 flex items-center gap-2.5 animate-fade-up">
                      <h2 className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{tr(g.label)}</h2>
                      <span className="h-px flex-1 bg-gray-100" aria-hidden />
                      <span className="text-[11px] font-semibold tabular-nums text-gray-300">{g.rows.length}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {g.rows.map((row) => (
                      <KpiCard
                        style={{ animationDelay: `${60 + Math.min(row.order, 12) * 45}ms` }}
                        key={row.id || `${row.derived}:${row.metric}:${row.label}`}
                        row={row}
                        period={period}
                        currency={currency}
                        canEdit={canEdit}
                        onQuickUpdate={() => quickUpdate(row)}
                        onEdit={() => setEditing(row)}
                        onDelete={() => (row.id ? removeTarget(row) : null)}
                        onOpen={() => setDetail(row)}
                      />
                    ))}
                  </div>
                </section>
              ))}
              {canEdit && (
                /* ONE ADD BAR AT THE END (29 Sep 2026): with the goals grouped by what
                   they measure, a dashed card in the last grid would sit under one
                   arbitrary group. It closes the list instead. */
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

          {/* ---------- the year, all four quarters at once (23 Sep 2026).
              Ethan: "just work on improving that overall... more overviews,
              like seeing a yearly overview as well." A single quarter answers
              "are we on track right now"; a year answers "is this market
              actually growing", which needs all four numbers side by side,
              not four separate page loads to compare by memory. */}
          {/* WHO BROUGHT THEM IN, above the year (28 Sep 2026). "Creators
              recruited" is a target the cards above can only ever answer with a
              number; this is the chart that says where that number came from,
              and it belongs between "are we on track this quarter" and "is this
              market going anywhere". */}
          <YearOverview scope={scope} basis={basis} year={year} byMonth={byMonth} currency={currency} />
        </div>
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
          currency={currency}
          basis={basis}
          isGlobalScope={basis === 'global'}
          takenKeys={(merged || []).filter((r) => !r.derived && r.metric !== 'custom').map((r) => r.metric)}
          actuals={actualsMap}
          year={year}
          quarter={quarter}
          month={month}
          profileId={profile?.id}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}

// THE YEAR AT A GLANCE: four quarters, or twelve months when the page is on
// months. One query for the year's targets (both granularities, so a quarter can
// show its months combined and a month its share of the quarter), then the live
// numbers only for the periods that actually have a row. A period with nothing to
// show is blank, not zero: a market that started setting KPIs in Q3 did not
// "miss" Q1 and Q2 - it was not tracking yet.
function YearOverview({ scope, basis, year, byMonth, currency }) {
  const tr = useT()
  const [byPeriod, setByPeriod] = useState(null)
  const periods = useMemo(() => (byMonth
    ? Array.from({ length: 12 }, (_, i) => ({ key: i + 1, year, quarter: Math.floor(i / 3) + 1, month: i + 1, short: MONTH_SHORT[i] }))
    : [1, 2, 3, 4].map((q) => ({ key: q, year, quarter: q, month: null, short: `Q${q}` }))), [year, byMonth])

  useEffect(() => {
    if (!scope) return undefined
    let alive = true
    setByPeriod(null)
    ;(async () => {
      const { data: all } = await supabase.from('kpi_targets').select('*').eq('community_id', scope).eq('basis', basis).eq('year', year)
      const results = await Promise.all(periods.map(async (p) => {
        const mine = (all || []).filter((t) => (byMonth ? t.month === p.month : (t.quarter === p.quarter && t.month == null)))
        const rows = withDerivedTargets({
          period: p,
          own: mine,
          monthsOfQuarter: byMonth ? [] : (all || []).filter((t) => t.quarter === p.quarter && t.month != null),
          quarterTargets: byMonth ? (all || []).filter((t) => t.quarter === p.quarter && t.month == null) : [],
        })
        if (rows.length === 0) return { key: p.key, rows: [] }
        const { data: a } = await supabase.rpc('kpi_actuals', {
          p_community_id: scope, p_year: year, p_quarter: p.quarter, p_basis: basis, ...(byMonth ? { p_month: p.month } : {}),
        })
        return { key: p.key, rows: mergeKpiRows(rows, a || []) }
      }))
      if (alive) setByPeriod(results)
    })()
    return () => { alive = false }
  }, [scope, basis, year, byMonth, periods])

  const metrics = useMemo(() => {
    if (!byPeriod) return null
    const order = new Map(STANDARD_METRICS.map((m, i) => [m.key, i]))
    const byKey = new Map()
    for (const { key: pk, rows } of byPeriod) {
      for (const row of rows) {
        const key = `${row.metric}:${row.label}`
        if (!byKey.has(key)) byKey.set(key, { metric: row.metric, label: row.label, periods: {} })
        byKey.get(key).periods[pk] = row
      }
    }
    return [...byKey.values()].sort((a, b) => {
      const ra = order.has(a.metric) ? order.get(a.metric) : 99
      const rb = order.has(b.metric) ? order.get(b.metric) : 99
      return ra !== rb ? ra - rb : a.label.localeCompare(b.label)
    })
  }, [byPeriod])

  return (
    <div className="mt-8">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gray-400">
        {byMonth ? tr('Month by month · {y}', { y: String(year) }) : tr('Year overview · {y}', { y: String(year) })}
      </p>
      {!metrics ? (
        <Skeleton className="h-40 w-full rounded-card" />
      ) : metrics.length === 0 ? (
        <div className="rounded-card border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-smoke">
          {byMonth
            ? tr('Nothing to compare yet - set a target for at least one month of {y}.', { y: String(year) })
            : tr('Nothing to compare yet - set a target in at least one quarter of {y}.', { y: String(year) })}
        </div>
      ) : (
        <>
          <YearChart metrics={metrics} periods={periods} currency={currency} />
          <div className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-card animate-fade-up [animation-delay:120ms]">
            {metrics.map((m, i) => (
              <YearRow key={`${m.metric}:${m.label}`} metric={m} periods={periods} currency={currency} last={i === metrics.length - 1} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

const SUMMARY_TONE = { met: 'bg-emerald-400', on_track: 'bg-white', behind: 'bg-amber-300', missed: 'bg-red-400' }
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function YearRow({ metric, periods, currency, last }) {
  const tr = useT()
  const rows = periods.map((p) => metric.periods[p.key])
  const sample = rows.find(Boolean)
  const def = metricDef(sample || metric)
  const isSum = def.kind === 'sum'
  const withRows = rows.filter(Boolean)
  const totalTarget = withRows.reduce((s, r) => s + r.target_value, 0)
  const totalActual = withRows.reduce((s, r) => s + r.actual, 0)
  const many = periods.length > 4
  const unitWord = many ? tr('month') : tr('quarter')
  const unitWords = many ? tr('months') : tr('quarters')
  const whole = withRows.length === periods.length
  // "For the year" adds up only the periods that HAVE a goal, so it says how
  // many that is whenever it is not all of them. A level (an average, a rate) is
  // not added at all: it is the average of those periods, and how many met it.
  const statuses = withRows.map((r, i) => rowStatus(r, periods.find((p) => metric.periods[p.key] === r) || periods[i]))
  const metCount = statuses.filter((x) => x.status === 'met').length

  return (
    <div className={cx('flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-5', !last && 'border-b border-gray-100')}>
      <div className="flex items-center gap-2.5 sm:w-48 sm:shrink-0">
        <span className="truncate text-sm font-semibold text-ink">{metric.label}</span>
      </div>

      <div className={cx('grid flex-1 gap-1.5', many ? 'grid-cols-6 sm:grid-cols-12' : 'grid-cols-4 gap-2')}>
        {periods.map((p) => {
          const row = metric.periods[p.key]
          if (!row) {
            return (
              <div key={p.key} className="flex flex-col items-center gap-1">
                <div className="flex h-14 w-full items-end justify-center rounded-lg bg-cloud/60">
                  <span className="pb-1.5 text-[10px] text-gray-300">-</span>
                </div>
                <span className="text-[10px] font-semibold uppercase text-gray-300">{p.short}</span>
              </div>
            )
          }
          const { status, pct } = rowStatus(row, p)
          const style = STATUS_STYLE[status]
          const fillPct = Math.max(6, Math.min(100, Math.round(pct * 100)))
          return (
            <div key={p.key} className="flex flex-col items-center gap-1">
              <div
                className="flex h-14 w-full items-end overflow-hidden rounded-lg bg-cloud"
                title={`${formatKpiValue(row, row.actual, currency)} / ${formatKpiValue(row, row.target_value, currency)}${row.derived ? ` · ${tr('worked out from {f}', { f: row.from })}` : ''}`}
              >
                <div className={cx('w-full rounded-t-md transition-[height] duration-500 ease-out', style.bar, row.derived && 'opacity-55')} style={{ height: `${fillPct}%` }} />
              </div>
              <span className="text-[10px] font-semibold uppercase text-gray-400">{p.short}</span>
            </div>
          )
        })}
      </div>

      <div className="text-right sm:w-36 sm:shrink-0">
        {withRows.length === 0 ? (
          <>
            <p className="text-sm font-bold text-ink">-</p>
            <p className="text-[11px] text-gray-400">{tr('no targets yet')}</p>
          </>
        ) : isSum ? (
          <>
            <p className="text-sm font-bold tabular-nums text-ink">{formatKpiValue(sample, totalActual, currency)}</p>
            <p className="text-[11px] text-gray-400">
              {whole
                ? tr('of {t} for the year', { t: formatKpiValue(sample, totalTarget, currency) })
                : withRows.length === 1
                  ? tr('of {t} in the only {unit} with a target', { t: formatKpiValue(sample, totalTarget, currency), unit: unitWord })
                  : tr('of {t} across the {n} {unit} with a target', { t: formatKpiValue(sample, totalTarget, currency), n: withRows.length, unit: unitWords })}
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-bold tabular-nums text-ink">
              {tr('met in {a} of {b}', { a: metCount, b: withRows.length })}
            </p>
            <p className="text-[11px] text-gray-400">{tr('an average, so it is not added up')}</p>
          </>
        )}
      </div>
    </div>
  )
}

const STATUS_STYLE = {
  met: { ring: 'stroke-emerald-500', bar: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700', label: 'Target met' },
  on_track: { ring: 'stroke-brand', bar: 'bg-brand', chip: 'bg-brand-tint text-brand', label: 'On track' },
  behind: { ring: 'stroke-amber-500', bar: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700', label: 'Behind pace' },
  missed: { ring: 'stroke-red-500', bar: 'bg-red-500', chip: 'bg-red-50 text-red-600', label: 'Missed' },
}

// A GRAPH IN THE OVERVIEW (28 Sep 2026). Ethan: "we should maybe have some
// graphs in the overviews below as well, because currently we don't have any
// graphs there." One metric at a time, picked with a chip: what landed in each
// quarter (or month) in orange beside its target in pale peach, so a period
// that fell short is a short orange bar next to a tall pale one.
const tipStyle = {
  borderRadius: 12, border: '1px solid #F1F1F2', fontFamily: 'Poppins',
  fontSize: 12, boxShadow: '0 4px 16px rgba(26,26,26,0.08)',
}
function YearChart({ metrics, periods, currency }) {
  const tr = useT()
  const [pick, setPick] = useState(0)
  const m = metrics[Math.min(pick, metrics.length - 1)]
  const sample = Object.values(m.periods)[0]
  const data = periods.map((p) => {
    const row = m.periods[p.key]
    return { name: p.short, actual: row ? row.actual : null, target: row ? row.target_value : null }
  })
  const fmt = (v) => (v == null ? '-' : formatKpiValue(sample, v, currency))
  return (
    <section className="mb-4 rounded-card border border-gray-100 bg-white p-4 shadow-card animate-fade-up sm:p-5">
      {metrics.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {metrics.map((x, i) => (
            <button
              key={`${x.metric}:${x.label}`}
              type="button"
              onClick={() => setPick(i)}
              className={cx(
                'rounded-full px-3 py-1 text-xs font-semibold transition-all duration-200',
                i === pick ? 'bg-brand text-white shadow-card' : 'bg-cloud text-smoke hoverable:hover:text-ink',
              )}
            >
              {metricLabel(x)}
            </button>
          ))}
        </div>
      )}
      <div className="mb-2 flex items-center gap-4 text-[11px] font-semibold text-smoke">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand" />{tr('Achieved')}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#fde3d1]" />{tr('Goal')}</span>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart key={pick} data={data} barGap={6} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#F1F1F2" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} tickFormatter={fmt} axisLine={false} tickLine={false} allowDecimals width={52} />
            <Tooltip contentStyle={tipStyle} cursor={{ fill: 'rgba(217,68,7,0.06)' }} formatter={(v, k) => [fmt(v), k === 'actual' ? tr('Achieved') : tr('Goal')]} />
            <Bar dataKey="target" fill="#fde3d1" radius={[6, 6, 0, 0]} maxBarSize={52} animationDuration={500} />
            <Bar dataKey="actual" fill="#d94407" radius={[6, 6, 0, 0]} maxBarSize={52} animationDuration={800} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

// ONE TARGET.
//
// A PROGRESS BAR, NOT A GAUGE THAT ONLY EVER SHOWS "OUT OF THE TARGET". The
// fill runs to 100% at the target and keeps counting in the LABEL past it -
// a KPI hit at 140% is worth celebrating, not clipping off at a full bar
// that looks identical to one hit at exactly 100%.
function KpiCard({ row, period, currency, canEdit, onEdit, onDelete, onOpen, onQuickUpdate, style: cardStyle }) {
  const tr = useT()
  const def = metricDef(row)
  const { status, pct, progress } = rowStatus(row, period)
  const style = STATUS_STYLE[status]
  const fillPct = Math.min(100, Math.round(pct * 100))
  const fmt = (v) => formatKpiValue(row, v, currency)

  return (
    // THE CARD OPENS (28 Sep 2026): its history, who is behind it, the charts.
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen?.() } }}
      style={cardStyle}
      className={cx(
        'animate-fade-up group relative flex cursor-pointer flex-col gap-3 rounded-card border bg-white p-4 shadow-card transition-all duration-300 hoverable:hover:-translate-y-1 hoverable:hover:border-brand/30 hoverable:hover:shadow-lift',
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
          ) : !row.is_automated ? (
            <span className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-gray-400">
              <Icon name="pencil" className="h-3 w-3" />
              {tr('Tracked by hand')}
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
          <span className="text-2xl font-bold tabular-nums tracking-tight text-ink">{fmt(row.actual)}</span>
          <span className="text-sm text-smoke">
            {def.higherIsBetter ? tr('of') : tr('aim for under')} <strong className="font-semibold text-ink">{fmt(row.target_value)}</strong>
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-cloud">
          <div
            className={cx('kpi-fill h-full rounded-full', style.bar)}
            style={{ width: `${Math.max(fillPct > 0 ? 3 : 0, fillPct)}%` }}
          />
        </div>
        {def.kind === 'sum' && progress > 0 && progress < 1 && status !== 'met' && (
          <p className="mt-1.5 text-[11px] leading-relaxed text-gray-400">
            {tr('{p}% through · a steady pace would be at {n} today', {
              p: Math.round(progress * 100),
              n: fmt(Math.round(row.target_value * progress)),
            })}
          </p>
        )}
        {def.kind === 'level' && (
          <p className="mt-1.5 text-[11px] leading-relaxed text-gray-400">{tr('An average, so it is held against the goal all the way through.')}</p>
        )}
        {row.monthsSum != null && Math.abs(row.monthsSum - row.target_value) > 1e-9 && (
          <p className="mt-1 text-[11px] font-medium leading-relaxed text-amber-600">
            {tr('The {n} monthly goals you set come to {v}.', { n: row.monthsSet, v: fmt(row.monthsSum) })}
          </p>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 pt-0.5">
        <span className={cx('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', style.chip)}>
          {tr(style.label)}
        </span>
        <span className="flex min-w-0 items-center gap-2">
          {canEdit && !row.is_automated && !row.derived && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onQuickUpdate?.() }}
              className="rounded-full border border-gray-200 px-2 py-0.5 text-[11px] font-semibold text-smoke transition-colors hoverable:hover:border-brand hoverable:hover:text-brand"
            >
              {tr('Update progress')}
            </button>
          )}
          <span className="text-xs font-semibold tabular-nums text-gray-400">{Math.round(pct * 100)}%</span>
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
