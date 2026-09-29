import { useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Modal } from '../ui'
import Icon from '../Icon'
import Segmented from '../network/Segmented'
import {
  CUSTOM_UNITS, METRIC_GROUPS, STANDARD_METRICS, formatKpiValue, metricDef, periodLabel, splitQuarterTarget,
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
export default function KpiTargetSheet({
  row, communityName, currency = 'EUR', basis = 'all', isGlobalScope = false,
  year, quarter, month = null, profileId, takenKeys = [], actuals = {}, onClose, onSaved,
}) {
  const tr = useT()
  // A derived row has no id: saving it makes it a real target for this period.
  const isNew = !row?.id
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

  const isCustom = mode === 'custom'
  const taken = useMemo(() => new Set(takenKeys), [takenKeys])
  const q = search.trim().toLowerCase()
  const groups = useMemo(() => METRIC_GROUPS.map((g) => ({
    ...g,
    items: STANDARD_METRICS.filter((m) => m.group === g.key
      && !(isGlobalScope && m.people)
      && (!q || m.label.toLowerCase().includes(q) || m.how.toLowerCase().includes(q))),
  })).filter((g) => g.items.length), [q, isGlobalScope])

  const customRow = { metric: 'custom', label, unit, cumulative: running, higher_is_better: higher }
  const shapeRow = isCustom ? customRow : { metric }
  const targetNum = Number(target)
  const valid = Number.isFinite(targetNum) && target !== '' && targetNum >= 0
  const months = !month && valid && (isCustom || metric) ? splitQuarterTarget(shapeRow, targetNum) : null
  const soFar = !isCustom && metric && actuals[metric] != null ? actuals[metric] : null

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
      month: month ?? null,
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
      setErr(error.code === '23505' ? tr('That KPI already has a goal for {p} - edit it instead of adding another.', { p: periodLabel({ year, quarter, month }) }) : error.message)
      return
    }
    onSaved()
  }

  const unitSuffix = isCustom
    ? (unit === 'percent' ? '%' : unit === 'currency' ? currency : '')
    : (metricDef({ metric }).unit === 'percent' ? '%' : '')

  return (
    <Modal open onClose={onClose} title={isNew ? tr('Set a KPI goal') : tr('Edit this goal')} wide>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-tint px-3 py-1.5 text-sm font-bold text-brand">
          <Icon name="calendar" className="h-4 w-4" />
          {communityName} · {periodLabel({ year, quarter, month })}
        </span>
        {row?.derived && (
          <span className="rounded-full bg-cloud px-3 py-1.5 text-xs font-semibold text-smoke">
            {row.derived === 'rollup'
              ? tr('Saving this sets the quarter goal itself. It now shows the months combined ({m}).', { m: row.from })
              : tr('Saving this sets this month itself. It now shows its share of {q}.', { q: row.from })}
          </span>
        )}
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
            {/* A fixed-height scroller so choosing never resizes the dialog. */}
            <div className="max-h-[19rem] space-y-3 overflow-y-auto overscroll-contain rounded-card border border-gray-100 p-2">
              {groups.map((g) => (
                <div key={g.key}>
                  <p className="px-2 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">{tr(g.label)}</p>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {g.items.map((m) => {
                      const used = taken.has(m.key) && m.key !== row?.metric
                      const on = metric === m.key
                      const locked = (!isNew || !!row?.derived) && !on
                      return (
                        <button
                          key={m.key}
                          type="button"
                          disabled={used || locked}
                          onClick={() => setMetric(m.key)}
                          aria-pressed={on}
                          className={cx(
                            'rounded-xl border px-3 py-2.5 text-left transition-colors',
                            on ? 'border-brand bg-brand text-white' : 'border-gray-100 bg-white hoverable:hover:border-brand/40',
                            (used || locked) && 'cursor-not-allowed opacity-40',
                          )}
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className="text-[13px] font-semibold leading-snug">{tr(m.label)}</span>
                            {used && <span className="shrink-0 text-[10px] font-bold uppercase">{tr('Already set')}</span>}
                          </span>
                          <span className={cx('mt-0.5 block text-[11px] leading-snug', on ? 'text-white/85' : 'text-smoke')}>{tr(m.how)}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
              {groups.length === 0 && <p className="px-2 py-6 text-center text-sm text-smoke">{tr('Nothing matches that.')}</p>}
            </div>
            {(!isNew || row?.derived) && <p className="mt-1.5 text-xs text-gray-400">{tr('The metric cannot change once a goal exists - delete it and set a new one instead.')}</p>}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">{tr('What are you tracking?')}</label>
              <input type="text" className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={tr('e.g. Average engagement rate')} maxLength={80} readOnly={!!row?.derived} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">{tr('Measured as')}</label>
                <select className="input" value={unit} onChange={(e) => setUnit(e.target.value)}>
                  {CUSTOM_UNITS.map((u) => <option key={u.value} value={u.value}>{tr(u.label)}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">{tr('Better means')}</label>
                <Segmented
                  size="sm"
                  value={higher ? 'up' : 'down'}
                  onChange={(v) => setHigher(v === 'up')}
                  label={tr('Better means')}
                  options={[{ value: 'up', label: tr('Higher') }, { value: 'down', label: tr('Lower') }]}
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">{tr('It behaves like')}</label>
              <Segmented
                size="sm"
                value={running ? 'total' : 'level'}
                onChange={(v) => setRunning(v === 'total')}
                label={tr('It behaves like')}
                options={[{ value: 'total', label: tr('A running total') }, { value: 'level', label: tr('An average or rate') }]}
              />
              <p className="mt-1.5 text-xs text-gray-400">
                {running
                  ? tr('It builds up through the period, so being halfway to the goal halfway through is on track.')
                  : tr('It is a level, not a total, so it is held against the goal itself all the way through.')}
              </p>
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
          {months && (
            <p className="mt-1.5 rounded-lg bg-cloud px-3 py-2 text-xs text-smoke">
              {tr('By month, rising gently through the quarter:')}{' '}
              <strong className="text-ink">{months.map((v) => formatKpiValue(shapeRow, v, currency)).join(' · ')}</strong>
            </p>
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
