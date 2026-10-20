import { useMemo, useState } from 'react'
import { Modal, Select } from '../../../../components/ui'
import Icon from '../../../../components/Icon'
import { teamApi } from '../../../../api/team'
import { confirm, notice } from '../../../../lib/confirm'
import { toastSuccess } from '../../../../lib/toast'
import { addMonths, buildPlan, monthKey, monthLabel, monthRange, neededGrowth, parseMonth } from '../../../../lib/cccTargets'
import { cx } from '../../../../lib/utils'
import { Segmented, parseViews, signedPct, views } from './parts'

// CHANGING THE PLAN. Every month of one side (community or VIP) in one place: the view target typed the way people say
// it ("17m", "16,954k"), the EPM and target CPM, other costs the platform cannot see, and, rarely, a hand-set achieved
// figure. The builder fills the targets in from a start and a goal ("17 million by January, then 7% a month").
const SIDES = [{ key: 'community', label: 'Community' }, { key: 'vip', label: 'VIP' }]
const fmtNum = (n) => (n == null ? '' : String(Number(n)))

function formRows(targets, segment, from, to) {
  const mine = targets.filter((t) => t.segment === segment)
  const keys = new Set([...monthRange(from, to), ...mine.map((t) => monthKey(t.year, t.month))])
  const last = mine[mine.length - 1]
  return [...keys].sort().map((key) => {
    const t = mine.find((x) => monthKey(x.year, x.month) === key)
    return {
      key, id: t?.id || null, suggested: !!t?.suggested,
      target: t ? views(t.view_target) : '',
      epm: fmtNum(t?.epm ?? last?.epm ?? 0.9),
      cpm: fmtNum(t?.cpm ?? last?.cpm ?? (segment === 'vip' ? 0.25 : 0.5)),
      other: t && Number(t.other_costs) ? fmtNum(t.other_costs) : '',
      override: t?.achieved_override != null ? views(t.achieved_override) : '',
      note: t?.note || '',
      dirty: false,
    }
  })
}

export default function PlanEditor({ segment: initial, focus, targets, from, to, onClose, onSaved }) {
  const [segment, setSegment] = useState(initial)
  const [forms, setForms] = useState(() => ({ community: formRows(targets, 'community', from, to), vip: formRows(targets, 'vip', from, to) }))
  const rows = forms[segment]
  const [busy, setBusy] = useState(false)
  const [builder, setBuilder] = useState(false)
  const setRow = (key, patch) => setForms((f) => ({ ...f, [segment]: f[segment].map((r) => (r.key === key ? { ...r, ...patch, dirty: true } : r)) }))
  const dirtyCount = forms.community.filter((r) => r.dirty).length + forms.vip.filter((r) => r.dirty).length

  function addMonth(where) {
    setForms((f) => {
      const list = f[segment]
      const key = where === 'start' ? addMonths(list[0]?.key || from, -1) : addMonths(list[list.length - 1]?.key || to, 1)
      const near = where === 'start' ? list[0] : list[list.length - 1]
      const row = { key, id: null, suggested: false, target: '', epm: near?.epm || '0.9', cpm: near?.cpm || '0.5', other: '', override: '', note: '', dirty: true }
      return { ...f, [segment]: where === 'start' ? [row, ...list] : [...list, row] }
    })
  }
  async function removeMonth(r) {
    if (!r.id) { setForms((f) => ({ ...f, [segment]: f[segment].filter((x) => x.key !== r.key) })); return }
    if (!(await confirm(`Remove ${monthLabel(r.key, 'long')} from the ${segment === 'vip' ? 'VIP' : 'community'} plan?`, { confirmLabel: 'Remove', danger: true }))) return
    const { error } = await teamApi.cccTargets().delete().eq('id', r.id)
    if (error) { notice(error.message || 'Could not remove that month.'); return }
    setForms((f) => ({ ...f, [segment]: f[segment].filter((x) => x.key !== r.key) }))
    toastSuccess('Month removed')
  }

  function validate() {
    for (const side of ['community', 'vip']) {
      for (const r of forms[side].filter((x) => x.dirty)) {
        const name = `${side === 'vip' ? 'VIP' : 'Community'}, ${monthLabel(r.key, 'long')}`
        if (r.target !== '' && parseViews(r.target) == null) return `${name}: the target should be a number like 17m or 16,954,000.`
        if (r.override !== '' && parseViews(r.override) == null) return `${name}: the achieved figure should be a number, or empty.`
        for (const [f, l] of [['epm', 'EPM'], ['cpm', 'CPM'], ['other', 'Other costs']]) {
          if (r[f] !== '' && !(Number(r[f]) >= 0)) return `${name}: ${l} should be a number.`
        }
      }
    }
    return null
  }

  async function save() {
    const problem = validate()
    if (problem) { notice(problem); return }
    const payload = ['community', 'vip'].flatMap((side) => forms[side].filter((r) => r.dirty && r.target !== '').map((r) => {
      const { year, month } = parseMonth(r.key)
      return {
        segment: side, year, month, view_target: parseViews(r.target), epm: Number(r.epm || 0), cpm: Number(r.cpm || 0),
        other_costs: Number(r.other || 0), achieved_override: r.override === '' ? null : parseViews(r.override),
        note: r.note.trim() || null, suggested: false,
      }
    }))
    if (!payload.length) { onClose(); return }
    setBusy(true)
    const { error } = await teamApi.cccTargets().upsert(payload, { onConflict: 'segment,year,month' })
    setBusy(false)
    if (error) { notice(error.message?.includes('SANDBOX') ? 'The demo account can look at the plan but not change it.' : (error.message || 'The plan could not be saved.')); return }
    toastSuccess(`Plan saved (${payload.length} month${payload.length === 1 ? '' : 's'})`)
    onSaved()
  }

  const footer = (
    <div className="flex w-full items-center justify-between gap-3">
      <span className="text-[13px] text-smoke">{dirtyCount ? `${dirtyCount} month${dirtyCount === 1 ? '' : 's'} changed` : 'No changes yet'}</span>
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        <button type="button" onClick={save} disabled={busy || !dirtyCount} className="btn-primary disabled:opacity-50">{busy ? 'Saving…' : 'Save plan'}</button>
      </div>
    </div>
  )

  return (
    <Modal open onClose={onClose} title="Edit the plan" wide footer={footer}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Segmented value={segment} options={SIDES} onChange={setSegment} />
          <button type="button" onClick={() => setBuilder((b) => !b)} aria-pressed={builder}
            className={cx('inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-all duration-200', builder ? 'bg-brand text-white shadow-card' : 'bg-cloud text-ink hoverable:hover:-translate-y-0.5')}>
            <Icon name="trendUp" className={cx('h-4 w-4', builder ? 'text-white' : 'text-brand')} />Build targets from a goal
          </button>
        </div>
        <p className="text-[13px] text-smoke">
          Type views in full or short (17m, 16,954k). EPM is what 1,000 views earn Tryp; target CPM is what they should cost.
          Other costs are spend the platform cannot see, such as staff, ads or tools. Leave achieved empty to use the platform&apos;s count.
        </p>

        {builder && <Builder rows={rows} segment={segment} onApply={(plan, rates) => setForms((f) => ({
          ...f,
          [segment]: mergePlan(f[segment], plan, rates),
        }))} />}

        <div className="overflow-x-auto rounded-2xl border border-gray-100">
          <table className="w-full min-w-[46rem] border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-[13px] font-semibold text-smoke">
                <th className="border-b border-gray-100 px-3 py-2">Month</th>
                <th className="border-b border-gray-100 px-2 py-2">View target</th>
                <th className="border-b border-gray-100 px-2 py-2">EPM €</th>
                <th className="border-b border-gray-100 px-2 py-2">Target CPM €</th>
                <th className="border-b border-gray-100 px-2 py-2">Other costs €</th>
                <th className="border-b border-gray-100 px-2 py-2">Achieved (by hand)</th>
                <th className="border-b border-gray-100 px-2 py-2">Note</th>
                <th className="border-b border-gray-100 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              <tr><td colSpan={8} className="px-3 py-1.5"><AddButton onClick={() => addMonth('start')} label="Add an earlier month" /></td></tr>
              {rows.map((r, i) => {
                const prev = parseViews(rows[i - 1]?.target)
                const g = neededGrowth(prev, parseViews(r.target), 1)
                return (
                  <tr key={r.key} className={cx('transition-colors', r.key === focus && 'bg-brand-tint/50', r.dirty && 'bg-amber-50/40')}>
                    <td className="whitespace-nowrap border-b border-gray-50 px-3 py-1.5 font-semibold text-ink">
                      {monthLabel(r.key, 'long')}
                      {r.suggested && !r.dirty && <span className="ml-1.5 rounded-full bg-brand-tint px-1.5 py-0.5 text-[13px] font-semibold text-brand">Suggested</span>}
                    </td>
                    <td className="border-b border-gray-50 px-2 py-1.5">
                      <input value={r.target} onChange={(e) => setRow(r.key, { target: e.target.value })} onBlur={() => { const n = parseViews(r.target); if (n != null) setRow(r.key, { target: views(n) }) }}
                        inputMode="decimal" placeholder="e.g. 17m" autoFocus={r.key === focus} className="input w-36 !py-1.5 text-right tabular-nums" />
                      {g != null && <span className={cx('mt-0.5 block text-right text-[13px]', g >= 0 ? 'text-smoke' : 'text-red-600')}>{signedPct(g)}</span>}
                    </td>
                    <td className="border-b border-gray-50 px-2 py-1.5"><Num value={r.epm} onChange={(v) => setRow(r.key, { epm: v })} /></td>
                    <td className="border-b border-gray-50 px-2 py-1.5"><Num value={r.cpm} onChange={(v) => setRow(r.key, { cpm: v })} /></td>
                    <td className="border-b border-gray-50 px-2 py-1.5"><Num value={r.other} onChange={(v) => setRow(r.key, { other: v })} placeholder="0" wide /></td>
                    <td className="border-b border-gray-50 px-2 py-1.5">
                      <input value={r.override} onChange={(e) => setRow(r.key, { override: e.target.value })} inputMode="decimal" placeholder="Platform" className="input w-32 !py-1.5 text-right tabular-nums" />
                    </td>
                    <td className="border-b border-gray-50 px-2 py-1.5">
                      <input value={r.note} onChange={(e) => setRow(r.key, { note: e.target.value.slice(0, 500) })} placeholder="Optional" className="input w-44 !py-1.5" />
                    </td>
                    <td className="border-b border-gray-50 px-2 py-1.5 text-right">
                      <button type="button" onClick={() => removeMonth(r)} aria-label={`Remove ${monthLabel(r.key, 'long')}`} className="rounded-lg p-1.5 text-gray-400 transition-colors hoverable:hover:bg-red-50 hoverable:hover:text-red-600">
                        <Icon name="trash" className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
              <tr><td colSpan={8} className="px-3 py-1.5"><AddButton onClick={() => addMonth('end')} label="Add a later month" /></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  )
}

function mergePlan(list, plan, rates) {
  const byKey = Object.fromEntries(list.map((r) => [r.key, r]))
  for (const p of plan) {
    const r = byKey[p.key] || { key: p.key, id: null, suggested: false, epm: '0.9', cpm: '0.5', other: '', override: '', note: '' }
    byKey[p.key] = { ...r, target: views(p.view_target), ...(rates.epm !== '' ? { epm: rates.epm } : {}), ...(rates.cpm !== '' ? { cpm: rates.cpm } : {}), dirty: true }
  }
  return Object.values(byKey).sort((a, b) => (a.key < b.key ? -1 : 1))
}

function Builder({ rows, segment, onApply }) {
  const keys = rows.map((r) => r.key)
  const first = rows.find((r) => parseViews(r.target) != null) || rows[0]
  const [start, setStart] = useState(first?.key || keys[0])
  const [startValue, setStartValue] = useState(first?.target || '')
  const [goal, setGoal] = useState(keys.includes('2027-01') ? '2027-01' : keys[Math.min(keys.length - 1, 4)])
  const [goalValue, setGoalValue] = useState(segment === 'community' ? '17m' : '')
  const [shape, setShape] = useState('linear')
  const [after, setAfter] = useState('7')
  const [until, setUntil] = useState(keys[keys.length - 1])
  const [epm, setEpm] = useState('')
  const [cpm, setCpm] = useState('')
  const options = useMemo(() => monthRange(addMonths(keys[0], -6), addMonths(keys[keys.length - 1], 12)).map((k) => ({ value: k, label: monthLabel(k, 'long') })), [keys])
  const plan = buildPlan({ start, startValue: parseViews(startValue), goal, goalValue: parseViews(goalValue), until, shape, after: Number(after) / 100 })
  const rate = neededGrowth(parseViews(startValue), parseViews(goalValue), monthRange(start, goal).length - 1)
  return (
    <div className="animate-rise rounded-2xl border border-brand/20 bg-brand-tint/30 p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Start month"><Select variant="pill" value={start} onChange={setStart} options={options} search={false} ariaLabel="Start month" /></Field>
        <Field label="Start views"><input value={startValue} onChange={(e) => setStartValue(e.target.value)} placeholder="7.5m" className="input !py-1.5" /></Field>
        <Field label="Goal month"><Select variant="pill" value={goal} onChange={setGoal} options={options} search={false} ariaLabel="Goal month" /></Field>
        <Field label="Goal views"><input value={goalValue} onChange={(e) => setGoalValue(e.target.value)} placeholder="17m" className="input !py-1.5" /></Field>
        <Field label="Getting there">
          <Segmented size="sm" value={shape} options={[{ key: 'linear', label: 'Same amount' }, { key: 'compound', label: 'Same %' }]} onChange={setShape} />
        </Field>
        <Field label="Then grow a month (%)"><input value={after} onChange={(e) => setAfter(e.target.value)} inputMode="decimal" className="input !py-1.5" /></Field>
        <Field label="Until"><Select variant="pill" value={until} onChange={setUntil} options={options} search={false} ariaLabel="Until" /></Field>
        <Field label="EPM / CPM for these months (optional)">
          <span className="flex gap-2">
            <input value={epm} onChange={(e) => setEpm(e.target.value)} placeholder="EPM" inputMode="decimal" className="input w-full !py-1.5" />
            <input value={cpm} onChange={(e) => setCpm(e.target.value)} placeholder="CPM" inputMode="decimal" className="input w-full !py-1.5" />
          </span>
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 text-[13px] text-smoke">
          {plan.length ? (
            <>
              {plan.length} months · {rate != null && <>about <span className="font-semibold text-ink">{signedPct(rate)}</span> a month to the goal · </>}
              ends at <span className="font-semibold text-ink">{views(plan[plan.length - 1].view_target)}</span>
            </>
          ) : 'Fill in a start and a goal after it.'}
        </p>
        <button type="button" disabled={!plan.length} onClick={() => onApply(plan, { epm, cpm })} className="btn-primary !py-1.5 text-[13px] disabled:opacity-40">
          Fill in these targets
        </button>
      </div>
      {plan.length > 0 && (
        <div className="scrollbar-none mt-3 flex gap-1.5 overflow-x-auto pb-1">
          {plan.map((p, i) => (
            <span key={p.key} className="shrink-0 animate-pop-in rounded-xl bg-white px-2.5 py-1.5 text-center shadow-card" style={{ animationDelay: `${i * 25}ms` }}>
              <span className="block text-[13px] text-smoke">{monthLabel(p.key)}</span>
              <span className="block text-sm font-bold tabular-nums text-ink">{(p.view_target / 1e6).toFixed(2)}M</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function Field({ label, children }) {
  return <label className="block"><span className="mb-1 block text-[13px] font-semibold text-smoke">{label}</span>{children}</label>
}
function Num({ value, onChange, placeholder, wide }) {
  return <input value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" placeholder={placeholder} className={cx('input !py-1.5 text-right tabular-nums', wide ? 'w-28' : 'w-20')} />
}
function AddButton({ onClick, label }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[13px] font-semibold text-brand transition-colors hoverable:hover:bg-brand-tint">
      <Icon name="plus" className="h-3.5 w-3.5" />{label}
    </button>
  )
}
