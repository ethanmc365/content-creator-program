import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Modal } from '../ui'
import Icon from '../Icon'
import Segmented from '../network/Segmented'
import {
  CUSTOM_UNITS, STANDARD_METRICS, formatKpiValue, metricDef, periodLabel, splitQuarterTarget,
} from '../../lib/kpiTracker'
import { cx } from '../../lib/utils'
import { useT } from '../../lib/i18n'

// SETTING OR EDITING ONE KPI TARGET.
//
// ONE DECISION DRIVES THE FORM: measured for you, or your own. A measured KPI
// reads its number live off the platform - there is nothing to type but the
// goal. "My own" flips the shape: a name, what kind of figure it is, and the
// current progress, because nothing automated is watching it.
//
// THE PICKER IS A LIST, GROUPED, EACH WITH ITS DEFINITION (29 Sep 2026). It was a
// five-item dropdown. With twenty-one measured KPIs a dropdown is a guessing
// game, and the question that matters when you are setting a goal with a market
// lead is "what exactly does this count?", so the answer sits under each name.
//
// A QUARTER'S GOAL SHOWS ITS MONTHS. Type 24 for a quarter and the sheet says
// 7 / 8 / 9 underneath, because that is what the month pages will show - the
// plan for a month is never a surprise.
const monthName = (y, m) => new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short' })

// A big two-way choice: two whole cards to press, not a pair of tiny pills. Used for "better
// means higher or lower" and "behaves like a total or a level" (Ethan, 30 Sep 2026: the higher /
// lower control "seems too small").
function Choice({ value, onChange, options, label }) {
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const on = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cx(
              'flex items-start gap-2.5 rounded-xl border-2 p-3 text-left transition-all duration-200',
              on ? 'border-brand bg-brand-tint/60 shadow-card' : 'border-gray-100 bg-white hoverable:hover:border-brand/40',
            )}
          >
            <span className={cx('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors', on ? 'bg-brand text-white' : 'bg-cloud text-smoke')}>
              <Icon name={o.icon} className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className={cx('block text-sm font-semibold leading-snug', on ? 'text-brand' : 'text-ink')}>{o.label}</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-smoke">{o.hint}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

export default function KpiTargetSheet({
  row, communityName, currency = 'EUR', basis = 'all', isGlobalScope = false,
  year, quarter, month = null, profileId, actuals = {}, onClose, onSaved, onEditExisting,
}) {
  const tr = useT()
  // A derived row has no id: saving it makes it a real target for this period.
  const isNew = !row?.id
  const canPickPeriod = isNew && !row?.derived
  const [mode, setMode] = useState(row?.metric === 'custom' ? 'custom' : 'auto')
  const [metric, setMetric] = useState(row?.metric && row.metric !== 'custom' ? row.metric : '')
  const [search, setSearch] = useState('')
  const [label, setLabel] = useState(row?.metric === 'custom' ? (row?.label || '') : '')
  const [unit, setUnit] = useState(row?.unit || 'number')
  const [running, setRunning] = useState(row?.cumulative !== false)
  const [higher, setHigher] = useState(row?.higher_is_better !== false)
  const [target, setTarget] = useState(row?.target_value != null ? String(row.target_value) : '')
  const [current, setCurrent] = useState(row?.current_value != null ? String(row.current_value) : '0')
  const [notes, setNotes] = useState(row?.notes || '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  // THE PERIOD IS CHOSEN AT THE TOP, EVERY TIME (30 Sep 2026). Ethan: "when setting this KPI it
  // should always show an option at the top to switch to month KPI rather than quarter or vice
  // versa." Which month of the quarter is chosen here too.
  const [pMonth, setPMonth] = useState(month)
  const byMonth = pMonth != null
  const qMonths = [0, 1, 2].map((i) => (quarter - 1) * 3 + 1 + i)

  // What already has a goal in the period being set, straight from the database so it follows the
  // switch above. Pressing one of those opens THAT goal for editing rather than sitting greyed out.
  const [existing, setExisting] = useState({})
  useEffect(() => {
    if (!canPickPeriod) return undefined
    let alive = true
    let q = supabase.from('kpi_targets').select('*').eq('community_id', row.community_id).eq('basis', basis).eq('year', year).eq('quarter', quarter)
    q = byMonth ? q.eq('month', pMonth) : q.is('month', null)
    q.neq('metric', 'custom').then(({ data }) => {
      if (alive) setExisting(Object.fromEntries((data || []).map((r) => [r.metric, r])))
    })
    return () => { alive = false }
  }, [canPickPeriod, row?.community_id, basis, year, quarter, pMonth, byMonth])

  const isCustom = mode === 'custom'
  const q = search.trim().toLowerCase()
  const items = useMemo(() => STANDARD_METRICS.filter((m) => !(isGlobalScope && m.people)
    && (!q || m.label.toLowerCase().includes(q) || m.how.toLowerCase().includes(q))), [q, isGlobalScope])

  const customRow = { metric: 'custom', label, unit, cumulative: running, higher_is_better: higher }
  const shapeRow = isCustom ? customRow : { metric }
  const targetNum = Number(target)
  const valid = Number.isFinite(targetNum) && target !== '' && targetNum >= 0
  const months = !byMonth && valid && (isCustom || metric) ? splitQuarterTarget(shapeRow, targetNum) : null
  const soFar = !isCustom && metric && actuals[metric] != null ? actuals[metric] : null
  const monthMax = months ? Math.max(...months, 1) : 1

  async function save() {
    if (!isCustom && !metric) { setErr(tr('Pick what you want to track.')); return }
    if (!valid) { setErr(tr('The goal needs to be a number, zero or more.')); return }
    if (isCustom && !label.trim()) { setErr(tr('A custom KPI needs a name.')); return }
    setSaving(true)
    setErr('')
    const payload = {
      community_id: row.community_id,
      basis,
      year,
      quarter,
      month: pMonth ?? null,
      metric: isCustom ? 'custom' : metric,
      label: isCustom ? label.trim() : STANDARD_METRICS.find((m) => m.key === metric).label,
      target_value: targetNum,
      is_automated: !isCustom,
      current_value: isCustom ? (Number(current) || 0) : null,
      unit: isCustom ? unit : 'number',
      cumulative: isCustom ? running : true,
      higher_is_better: isCustom ? higher : true,
      notes: notes.trim() || null,
    }
    const { error } = isNew
      ? await supabase.from('kpi_targets').insert({ ...payload, created_by: profileId })
      : await supabase.from('kpi_targets').update(payload).eq('id', row.id)
    setSaving(false)
    if (error) {
      setErr(error.code === '23505' ? tr('That KPI already has a goal for {p} - edit it instead of adding another.', { p: periodLabel({ year, quarter, month: pMonth }) }) : error.message)
      return
    }
    onSaved({ year, quarter, month: pMonth ?? null })
  }

  const unitSuffix = isCustom
    ? (unit === 'percent' ? '%' : unit === 'currency' ? currency : '')
    : (metricDef({ metric }).unit === 'percent' ? '%' : '')

  return (
    <Modal open onClose={onClose} title={isNew ? tr('Set a KPI goal') : tr('Edit this goal')} wide>
      {/* THE PERIOD, FIRST. Quarter or month, and which month. */}
      <div className="mb-5 space-y-3">
        {canPickPeriod ? (
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              value={byMonth ? 'month' : 'quarter'}
              onChange={(v) => setPMonth(v === 'month' ? (month ?? qMonths[0]) : null)}
              label={tr('Quarter or month')}
              options={[{ value: 'quarter', label: tr('Whole quarter') }, { value: 'month', label: tr('Single month') }]}
            />
            <div className={cx('flex gap-1 overflow-hidden transition-all duration-300', byMonth ? 'max-w-xs opacity-100' : 'max-w-0 opacity-0')} aria-hidden={!byMonth}>
              {qMonths.map((m) => (
                <button
                  key={m}
                  type="button"
                  tabIndex={byMonth ? 0 : -1}
                  onClick={() => setPMonth(m)}
                  aria-pressed={pMonth === m}
                  className={cx('h-8 rounded-lg px-3 text-[13px] font-semibold transition-colors', pMonth === m ? 'bg-brand text-white' : 'bg-cloud text-smoke hoverable:hover:text-ink')}
                >
                  {monthName(year, m)}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-tint px-3 py-1.5 text-sm font-bold text-brand">
            <Icon name="calendar" className="h-4 w-4" />
            {communityName} · {periodLabel({ year, quarter, month: pMonth })}
          </span>
          {row?.derived && (
            <span className="rounded-full bg-cloud px-3 py-1.5 text-xs font-semibold text-smoke">
              {row.derived === 'rollup'
                ? tr('Saving this sets the quarter goal itself. It now shows the months combined ({m}).', { m: row.from })
                : tr('Saving this sets this month itself. It now shows its share of {q}.', { q: row.from })}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-5">
        {isNew && !row?.derived && (
          <Segmented
            value={mode}
            onChange={setMode}
            label={tr('Kind of KPI')}
            options={[
              { value: 'auto', label: tr('Measured for you') },
              { value: 'custom', label: tr('My own KPI') },
            ]}
          />
        )}

        {!isCustom ? (
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label className="text-sm font-medium text-ink">{tr('What are you tracking?')}</label>
              {isNew && !row?.derived && (
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={tr('Search')}
                  aria-label={tr('Search the KPIs')}
                  className="input !w-40 !py-1.5 text-sm"
                />
              )}
            </div>
            {/* A fixed-height scroller so choosing never resizes the dialog. One flat list. */}
            <div className="max-h-[19rem] overflow-y-auto overscroll-contain rounded-card border border-gray-100 p-2">
              <div className="grid gap-1.5 sm:grid-cols-2">
                {items.map((m) => {
                  const done = canPickPeriod ? existing[m.key] : null
                  const on = metric === m.key
                  const locked = (!isNew || !!row?.derived) && !on
                  return (
                    <button
                      key={m.key}
                      type="button"
                      disabled={locked}
                      // A goal that already exists opens for editing - it is not a dead end.
                      onClick={() => (done ? onEditExisting?.(done) : setMetric(m.key))}
                      aria-pressed={on}
                      className={cx(
                        'rounded-xl border px-3 py-2.5 text-left transition-colors',
                        on ? 'border-brand bg-brand text-white' : done ? 'border-brand/25 bg-brand-tint/40 hoverable:hover:border-brand' : 'border-gray-100 bg-white hoverable:hover:border-brand/40',
                        locked && 'cursor-not-allowed opacity-40',
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-semibold leading-snug">{tr(m.label)}</span>
                        {done && <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold uppercase text-brand"><Icon name="pencil" className="h-3 w-3" />{tr('Edit')}</span>}
                      </span>
                      <span className={cx('mt-0.5 block text-[11px] leading-snug', on ? 'text-white/85' : 'text-smoke')}>
                        {done ? tr('Goal set: {n}. Press to edit it.', { n: formatKpiValue(m, done.target_value, currency) }) : tr(m.how)}
                      </span>
                    </button>
                  )
                })}
              </div>
              {items.length === 0 && <p className="px-2 py-6 text-center text-sm text-smoke">{tr('Nothing matches that.')}</p>}
            </div>
            {(!isNew || row?.derived) && <p className="mt-1.5 text-xs text-gray-400">{tr('The metric cannot change once a goal exists - delete it and set a new one instead.')}</p>}
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">{tr('What are you tracking?')}</label>
              <input type="text" className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={tr('e.g. Average engagement rate')} maxLength={80} readOnly={!!row?.derived} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">{tr('Measured as')}</label>
              <select className="input" value={unit} onChange={(e) => setUnit(e.target.value)}>
                {CUSTOM_UNITS.map((u) => <option key={u.value} value={u.value}>{tr(u.label)}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">{tr('Better means')}</label>
              <Choice
                value={higher ? 'up' : 'down'}
                onChange={(v) => setHigher(v === 'up')}
                label={tr('Better means')}
                options={[
                  { value: 'up', icon: 'arrow-up', label: tr('Higher is better'), hint: tr('Like views or videos: reach the goal or go past it.') },
                  { value: 'down', icon: 'arrow-down', label: tr('Lower is better'), hint: tr('Like cost or delay: stay at or under the goal.') },
                ]}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">{tr('It behaves like')}</label>
              <Choice
                value={running ? 'total' : 'level'}
                onChange={(v) => setRunning(v === 'total')}
                label={tr('It behaves like')}
                options={[
                  { value: 'total', icon: 'chart', label: tr('A running total'), hint: tr('Builds up through the period, so halfway to the goal halfway through is on track.') },
                  { value: 'level', icon: 'chartPie', label: tr('An average or rate'), hint: tr('A level, held against the goal itself all the way through.') },
                ]}
              />
            </div>
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink">{tr('Goal')}</label>
          <div className="relative">
            <input
              type="number" inputMode="decimal" min="0" step="any"
              className={cx('input', unitSuffix && '!pr-14')}
              value={target} onChange={(e) => setTarget(e.target.value)} placeholder="0"
              autoFocus={isNew && !!metric}
            />
            {unitSuffix && <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-smoke">{unitSuffix}</span>}
          </div>
          {soFar != null && (
            <p className="mt-1.5 text-xs text-smoke">{tr('So far this period: {n}', { n: formatKpiValue({ metric }, soFar, currency) })}</p>
          )}
          {/* THE MONTHS, AS THREE SMALL COLUMNS (30 Sep 2026). It was a sentence - "By month,
              rising gently through the quarter: 18 · 20 · 22" - that made you work out what
              the numbers were. Now each month is its own labelled column, taller as it rises. */}
          {months && (
            <div className="mt-3 animate-fade-up rounded-xl bg-cloud px-4 py-3">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">{tr('Month by month')}</p>
              <div className="grid grid-cols-3 gap-3">
                {months.map((v, i) => (
                  <div key={i} className="flex flex-col items-center gap-1.5">
                    <div className="flex h-12 w-full items-end rounded-lg bg-white">
                      <div className="w-full rounded-lg bg-gradient-to-t from-brand to-brand-light transition-[height] duration-500 ease-out" style={{ height: `${Math.max(12, (v / monthMax) * 100)}%` }} />
                    </div>
                    <span className="text-sm font-bold tabular-nums text-ink">{formatKpiValue(shapeRow, v, currency)}</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-smoke">{monthName(year, qMonths[i])}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {isCustom && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">{tr('Current progress')}</label>
            <input type="number" inputMode="decimal" step="any" className="input" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="0" />
            <p className="mt-1.5 text-xs text-gray-400">{tr('Nothing on the platform can count this automatically - update it as it moves.')}</p>
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink">{tr('Notes (optional)')}</label>
          <textarea className="input min-h-[4.5rem] resize-none" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={tr('Anything worth remembering about this goal')} maxLength={400} />
        </div>

        {err && <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-600">{err}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">{tr('Cancel')}</button>
          <button type="button" onClick={save} disabled={saving} className="btn-primary flex-1 justify-center disabled:opacity-60">
            {saving ? tr('Saving…') : tr('Save')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
