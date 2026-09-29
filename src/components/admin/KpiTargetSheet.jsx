import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Modal } from '../ui'
import Icon from '../Icon'
import Segmented from '../network/Segmented'
import {
  STANDARD_METRICS, adjacentMonth, adjacentQuarter, currentMonth, formatKpiValue, metricDef, periodLabel, splitQuarterTarget,
} from '../../lib/kpiTracker'
import { cx } from '../../lib/utils'
import { useT } from '../../lib/i18n'

// SETTING OR EDITING ONE KPI GOAL.
//
// EVERY GOAL IS MEASURED BY THE PLATFORM (1 Oct 2026). Ethan: "We have 'My own KPI', but we want
// to remove this completely. Only the 'Measured for you'." So the sheet is three things, top to
// bottom: WHEN (a quarter or a month, any of them), WHAT (one of the measured metrics, laid out as
// tiles grouped by what they measure) and HOW MUCH (a goal, typed, no spinner arrows).
//
// THE PERIOD IS ANY PERIOD, AND IT CAN CHANGE AFTER SAVING. The month choice used to be the three
// months of the quarter on screen, and a saved goal was stuck in the period it was made in. Now
// both lists scroll sideways across a year and a half, and editing a goal can move it.
//
// A QUARTER'S GOAL SHOWS ITS MONTHS. Type 24 for a quarter and the sheet says 7 / 8 / 9
// underneath, because that is what the month pages will show.
const monthShort = (y, m) => new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short' })

// Numbers only: digits and one decimal point. A text field (not type=number) so there are no
// spinner arrows and a stray letter cannot turn the value into ''.
const cleanNumber = (v) => {
  const s = v.replace(/,/g, '.').replace(/[^\d.]/g, '')
  const i = s.indexOf('.')
  return i === -1 ? s : s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '')
}

// EDITING AN EXISTING GOAL FROM THE PICKER SWAPS THE BODY, NOT THE DIALOG (2 Oct 2026). Ethan: a
// tile showing "3" opened with the goal at 0. The sheet kept the state of the NEW goal it had been
// opened as; the body is now keyed on the row, so pressing a set goal loads its own number, notes
// and period, and the dialog stays put instead of closing and reopening.
export default function KpiTargetSheet(props) {
  const tr = useT()
  const isNew = !props.row?.id
  return (
    <Modal open onClose={props.onClose} title={isNew ? tr('Set a KPI goal') : tr('Edit this goal')} wide>
      <SheetBody key={props.row?.id || 'new'} {...props} />
    </Modal>
  )
}

function SheetBody({
  row, communityName, currency = 'EUR', basis = 'all', isGlobalScope = false,
  year, quarter, month = null, profileId, actuals = {}, onClose, onSaved, onEditExisting,
}) {
  const tr = useT()
  const isNew = !row?.id
  const pickingMetric = isNew && !row?.derived
  const [metric, setMetric] = useState(row?.metric && row.metric !== 'custom' ? row.metric : '')
  const [target, setTarget] = useState(row?.target_value != null ? String(Number(row.target_value)) : '')
  const [notes, setNotes] = useState(row?.notes || '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  // WHEN. An editing row starts on its own period; a new one on the page's.
  const start = row?.id ? { year: row.year, quarter: row.quarter, month: row.month ?? null } : { year, quarter, month }
  const [p, setP] = useState(start)
  const byMonth = p.month != null
  const quarters = useMemo(() => {
    const out = []
    for (let d = -2; d <= 5; d += 1) out.push({ ...adjacentQuarter(start.year, start.quarter, d), month: null })
    return out
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const months = useMemo(() => {
    const anchor = start.month ?? (start.quarter - 1) * 3 + 1
    const out = []
    for (let d = -6; d <= 11; d += 1) out.push(adjacentMonth(start.year, anchor, d))
    return out
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const setMode = (v) => {
    const today = currentMonth()
    const inToday = today.year === p.year && today.quarter === p.quarter
    if (v === 'month') setP(inToday ? today : { year: p.year, quarter: p.quarter, month: (p.quarter - 1) * 3 + 1 })
    else setP({ year: p.year, quarter: p.quarter, month: null })
  }
  const same = (a, b) => a.year === b.year && a.quarter === b.quarter && (a.month ?? null) === (b.month ?? null)

  // The picked period scrolls into view (instantly on open, smoothly after).
  const railRef = useRef(null)
  const firstScroll = useRef(true)
  useLayoutEffect(() => {
    const rail = railRef.current
    const on = rail?.querySelector('[aria-pressed="true"]')
    if (!rail || !on) return
    const left = on.offsetLeft - rail.clientWidth / 2 + on.clientWidth / 2
    rail.scrollTo({ left, behavior: firstScroll.current ? 'auto' : 'smooth' })
    firstScroll.current = false
  }, [p, byMonth])

  // What already has a goal in the period being set, so pressing it edits THAT goal.
  const [existing, setExisting] = useState({})
  useEffect(() => {
    if (!pickingMetric) return undefined
    let alive = true
    let q = supabase.from('kpi_targets').select('*').eq('community_id', row.community_id).eq('basis', basis).eq('year', p.year).eq('quarter', p.quarter)
    q = byMonth ? q.eq('month', p.month) : q.is('month', null)
    q.neq('metric', 'custom').then(({ data }) => {
      if (alive) setExisting(Object.fromEntries((data || []).map((r) => [r.metric, r])))
    })
    return () => { alive = false }
  }, [pickingMetric, row?.community_id, basis, p.year, p.quarter, p.month, byMonth])

  const offered = useMemo(() => STANDARD_METRICS.filter((m) => !(isGlobalScope && m.people)), [isGlobalScope])
  const chosen = STANDARD_METRICS.find((m) => m.key === metric)

  const targetNum = Number(target)
  const valid = target !== '' && Number.isFinite(targetNum) && targetNum >= 0
  const split = !byMonth && valid && metric ? splitQuarterTarget({ metric }, targetNum) : null
  const splitMax = split ? Math.max(...split, 1) : 1
  const samePeriodAsPage = p.year === year && p.quarter === quarter && (p.month ?? null) === (month ?? null)
  const soFar = metric && samePeriodAsPage && actuals[metric] != null ? actuals[metric] : null

  async function save() {
    if (!metric) { setErr(tr('Pick what you want to track.')); return }
    if (!valid) { setErr(tr('The goal needs to be a number, zero or more.')); return }
    setSaving(true)
    setErr('')
    const payload = {
      community_id: row.community_id,
      basis,
      year: p.year,
      quarter: p.quarter,
      month: p.month ?? null,
      metric,
      label: chosen.label,
      target_value: targetNum,
      is_automated: true,
      current_value: null,
      unit: 'number',
      cumulative: true,
      higher_is_better: true,
      notes: notes.trim() || null,
    }
    const { error } = isNew
      ? await supabase.from('kpi_targets').insert({ ...payload, created_by: profileId })
      : await supabase.from('kpi_targets').update(payload).eq('id', row.id)
    setSaving(false)
    if (error) {
      setErr(error.code === '23505' ? tr('That KPI already has a goal for {p} - edit it instead of adding another.', { p: periodLabel(p) }) : error.message)
      return
    }
    onSaved({ year: p.year, quarter: p.quarter, month: p.month ?? null })
  }

  const unitSuffix = metricDef({ metric }).unit === 'percent' ? '%' : ''

  return (
      <div className="space-y-6 animate-page-in">
        {/* ---- WHEN ---- */}
        <section>
          {/* WHO IT IS FOR, LEFT OF WHEN (2 Oct 2026). Ethan: showing the market "looks good ... but the
              design and where you placed it isn't very good ... maybe show it to the left of quarter and
              month. Add a nice card slot there." */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex h-9 min-w-0 items-center gap-2 rounded-xl border border-gray-100 bg-white pl-1.5 pr-3 shadow-card">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-brand text-white">
                <Icon name="globe" className="h-3.5 w-3.5" />
              </span>
              <span className="truncate text-[13px] font-bold text-ink">{communityName}</span>
            </span>
            <Segmented
              value={byMonth ? 'month' : 'quarter'}
              onChange={setMode}
              size="sm"
              label={tr('Quarter or month')}
              options={[{ value: 'quarter', label: tr('Quarter') }, { value: 'month', label: tr('Month') }]}
            />
          </div>
          <div
            ref={railRef}
            className="-mx-1 flex gap-1.5 overflow-x-auto overscroll-contain px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="radiogroup"
            aria-label={byMonth ? tr('Month') : tr('Quarter')}
          >
            {(byMonth ? months : quarters).map((o) => {
              const on = same(o, p)
              const newYear = byMonth ? o.month === 1 : o.quarter === 1
              return (
                <button
                  key={`${o.year}-${o.quarter}-${o.month ?? ''}`}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setP(o)}
                  className={cx(
                    'flex h-12 shrink-0 flex-col items-center justify-center rounded-lg px-3.5 transition-all duration-200',
                    byMonth ? 'min-w-[3.75rem]' : 'min-w-[5rem]',
                    on ? 'bg-brand text-white shadow-card' : 'bg-cloud text-smoke hoverable:hover:-translate-y-0.5 hoverable:hover:text-ink',
                  )}
                >
                  <span className="text-[13px] font-bold leading-none">{byMonth ? monthShort(o.year, o.month) : `Q${o.quarter}`}</span>
                  <span className={cx('mt-1 text-[10px] font-semibold leading-none tabular-nums', on ? 'text-white/80' : newYear ? 'text-brand' : 'text-gray-400')}>{o.year}</span>
                </button>
              )
            })}
          </div>
          {row?.derived && (
            <p className="mt-2 text-xs text-smoke">
              {row.derived === 'rollup'
                ? tr('Saving this sets the quarter goal itself. It now shows the months combined ({m}).', { m: row.from })
                : tr('Saving this sets this month itself. It now shows its share of {q}.', { q: row.from })}
            </p>
          )}
        </section>

        {/* ---- WHAT ---- */}
        {pickingMetric ? (
          /* ONE LIST, NOT FIVE (2 Oct 2026). Ethan: the groups "make it a long list, and there are a lot
             of gaps ... everything can be together, just labelled clearly with the nice icons", and
             "just the icon in the Trip.com orange", no tinted box round it. */
          <section>
            <p className="mb-2 text-sm font-medium text-ink">{tr('What to track')}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {offered.map((m) => {
                const done = existing[m.key]
                const on = metric === m.key
                return (
                  <button
                    key={m.key}
                    type="button"
                    aria-pressed={on}
                    title={tr(m.how)}
                    onClick={() => (done ? onEditExisting?.(done) : setMetric(m.key))}
                    className={cx(
                      'group relative flex min-h-[3rem] items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-all duration-200 sm:gap-3 sm:px-3',
                      on
                        ? 'bg-brand text-white shadow-lift'
                        : 'bg-white ring-1 ring-gray-100 hoverable:hover:-translate-y-0.5 hoverable:hover:shadow-card hoverable:hover:ring-brand/30',
                    )}
                  >
                    <Icon name={m.icon} className={cx('h-5 w-5 shrink-0', on ? 'text-white' : 'text-brand')} />
                    <span className="min-w-0 flex-1">
                      <span className={cx('block text-[12.5px] font-semibold leading-snug sm:text-[13px]', done && 'pr-6 sm:pr-0')}>{tr(m.label)}</span>
                      {done && (
                        <span className={cx('hidden text-[11px] leading-snug sm:block', on ? 'text-white/85' : 'text-smoke')}>
                          {tr('Set for {p}. Press to edit.', { p: periodLabel(p) })}
                        </span>
                      )}
                    </span>
                    {done && (
                      <span className="absolute right-1.5 top-1.5 flex shrink-0 items-center gap-1 rounded-md bg-brand-tint px-1 py-0.5 text-[10px] font-bold tabular-nums text-brand sm:static sm:px-1.5 sm:text-[11px]">
                        <Icon name="pencil" className="hidden h-3 w-3 sm:block" />
                        {formatKpiValue(m, done.target_value, currency)}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            {chosen && (
              <p className="mt-2.5 flex items-start gap-1.5 text-xs leading-relaxed text-smoke animate-fade-up">
                <Icon name={chosen.icon} className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
                {tr(chosen.how)}
              </p>
            )}
          </section>
        ) : chosen ? (
          <section className="flex items-start gap-3 rounded-xl border border-gray-100 bg-white p-3.5 shadow-card">
            <Icon name={chosen.icon} className="mt-0.5 h-6 w-6 shrink-0 text-brand" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">{tr(chosen.label)}</span>
              <span className="mt-0.5 block text-xs leading-snug text-smoke">{tr(chosen.how)}</span>
            </span>
          </section>
        ) : null}

        {/* ---- HOW MUCH ---- */}
        <section>
          <label htmlFor="kpi-goal" className="mb-1.5 block text-sm font-medium text-ink">{tr('Goal')}</label>
          <div className="relative">
            <input
              id="kpi-goal"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              className={cx('input no-ios-zoom text-lg font-semibold tabular-nums', unitSuffix && '!pr-12')}
              value={target}
              onChange={(e) => setTarget(cleanNumber(e.target.value))}
              onKeyDown={(e) => { if (e.key === 'Enter') save() }}
              placeholder="0"
            />
            {unitSuffix && <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-smoke">{unitSuffix}</span>}
          </div>
          {soFar != null && (
            <p className="mt-1.5 text-xs text-smoke">{tr('So far this period: {n}', { n: formatKpiValue({ metric }, soFar, currency) })}</p>
          )}
          {split && (
            <div className="mt-3 animate-fade-up rounded-xl bg-cloud px-4 py-3">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">{tr('Month by month')}</p>
              <div className="grid grid-cols-3 gap-3">
                {split.map((v, i) => (
                  <div key={i} className="flex flex-col items-center gap-1.5">
                    <div className="flex h-12 w-full items-end rounded-lg bg-white">
                      <div className="w-full rounded-lg bg-gradient-to-t from-brand to-brand-light transition-[height] duration-500 ease-out" style={{ height: `${Math.max(12, (v / splitMax) * 100)}%` }} />
                    </div>
                    <span className="text-sm font-bold tabular-nums text-ink">{formatKpiValue({ metric }, v, currency)}</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-smoke">{monthShort(p.year, (p.quarter - 1) * 3 + 1 + i)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section>
          <label htmlFor="kpi-notes" className="mb-1.5 block text-sm font-medium text-ink">{tr('Notes (optional)')}</label>
          <textarea id="kpi-notes" className="input min-h-[4.5rem] resize-none" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={tr('Anything worth remembering about this goal')} maxLength={400} />
        </section>

        {err && <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-600">{err}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">{tr('Cancel')}</button>
          <button type="button" onClick={save} disabled={saving || !metric || !valid} className="btn-primary flex-1 justify-center disabled:opacity-60">
            {saving ? tr('Saving…') : isNew ? tr('Save for {p}', { p: periodLabel(p) }) : tr('Save')}
          </button>
        </div>
      </div>
  )
}
