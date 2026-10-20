import { useMemo, useState } from 'react'
import { Modal, Select } from '../../../../components/ui'
import Icon from '../../../../components/Icon'
import { teamApi } from '../../../../api/team'
import { notice } from '../../../../lib/confirm'
import { toastSuccess } from '../../../../lib/toast'
import { addMonths, monthKey, monthLabel, monthRange, parseMonth, planOf, planTarget } from '../../../../lib/cccTargets'
import { cx, formatViews } from '../../../../lib/utils'
import { Segmented, Term, parseViews, views } from './parts'

// CHANGING THE PLAN (rebuilt 20 Oct 2026, migration 446). Two ways, as Ethan asked for both:
//
//   THE GROWTH PLAN   one anchor month and its target, and a growth a month. "If I change October to 10 million, then
//                     all the other ones would also go by 7%": change the anchor (or the growth) and every month moves.
//   ONE MONTH         type a different target into a month and choose "Just this month" (it is set by hand and only it
//                     changes) or "Re-plan from it" (it becomes the anchor and every month follows it).
//
// Months are never added or removed: the plan has a target for every month from its start, so new months simply appear.
const SIDES = [{ key: 'community', label: 'Community' }, { key: 'vip', label: 'VIP' }]
const fmt = (n) => (n == null ? '' : String(Number(n)))
const pctText = (g) => String(Math.round(g * 1000) / 10)

function planForm(plans, segment) {
  const p = planOf(plans, segment)
  return { start: p.start, anchor: p.anchor, anchorViews: views(p.anchorViews), growth: pctText(p.growth), epm: fmt(p.epm), cpm: fmt(p.cpm), dirty: false }
}
function monthForms(targets, segment, keys) {
  const mine = targets.filter((t) => t.segment === segment)
  const all = new Set([...keys, ...mine.map((t) => monthKey(t.year, t.month))])
  return [...all].sort().map((key) => {
    const t = mine.find((x) => monthKey(x.year, x.month) === key)
    return {
      key, id: t?.id || null,
      target: t?.pinned && t.view_target != null ? views(t.view_target) : '',
      pinned: !!(t?.pinned && t.view_target != null), mode: 'pin',
      epm: fmt(t?.epm), cpm: fmt(t?.cpm),
      other: t && Number(t.other_costs) ? fmt(t.other_costs) : '',
      override: t?.achieved_override != null ? views(t.achieved_override) : '',
      note: t?.note || '', more: false, dirty: false,
    }
  })
}
// The plan as the form describes it, for the live numbers.
function livePlan(f) {
  return { start: f.start, anchor: f.anchor, anchorViews: parseViews(f.anchorViews) ?? 0, growth: (Number(f.growth) || 0) / 100, epm: Number(f.epm) || 0, cpm: Number(f.cpm) || 0 }
}

export default function PlanEditor({ segment: initial, focus, plans, targets, from, to, nowKey, onClose, onSaved }) {
  const [segment, setSegment] = useState(initial)
  const last = [to, addMonths(nowKey, 9)].sort()[1]
  const keysFor = (s) => monthRange(planOf(plans, s).start < from ? planOf(plans, s).start : from, last)
  const [planF, setPlanF] = useState(() => ({ community: planForm(plans, 'community'), vip: planForm(plans, 'vip') }))
  const [months, setMonths] = useState(() => ({
    community: monthForms(targets, 'community', keysFor('community')),
    vip: monthForms(targets, 'vip', keysFor('vip')),
  }))
  const [busy, setBusy] = useState(false)
  const f = planF[segment]
  const rows = months[segment]
  const plan = useMemo(() => livePlan(f), [f])
  const setPlan = (patch) => setPlanF((x) => ({ ...x, [segment]: { ...x[segment], ...patch, dirty: true } }))
  const setRow = (key, patch) => setMonths((x) => ({ ...x, [segment]: x[segment].map((r) => (r.key === key ? { ...r, ...patch, dirty: true } : r)) }))
  const changed = ['community', 'vip'].reduce((n, s) => n + (planF[s].dirty ? 1 : 0) + months[s].filter((r) => r.dirty).length, 0)
  const monthOptions = useMemo(() => monthRange(addMonths(rows[0]?.key || from, -12), addMonths(rows[rows.length - 1]?.key || to, 12)).map((k) => ({ value: k, label: monthLabel(k, 'long') })), [rows, from, to])

  // "Re-plan from it": this month becomes the anchor with the typed figure, and stops being a one-off.
  function replanFrom(r) {
    const n = parseViews(r.target)
    if (n == null) return
    setPlan({ anchor: r.key, anchorViews: views(n) })
    setRow(r.key, { target: '', pinned: false, mode: 'pin' })
    toastSuccess(`Every month now follows ${monthLabel(r.key, 'long')}`)
  }

  function validate() {
    for (const s of ['community', 'vip']) {
      const p = planF[s]
      const side = s === 'vip' ? 'VIP' : 'Community'
      if (parseViews(p.anchorViews) == null) return `${side}: the anchor target should be a number like 17m.`
      if (!(Number(p.growth) > -50 && Number(p.growth) < 200)) return `${side}: growth should be a percentage, like 7.`
      for (const [k, l] of [['epm', 'EPM'], ['cpm', 'Target CPM']]) if (!(Number(p[k]) >= 0) || p[k] === '') return `${side}: ${l} should be a number.`
      for (const r of months[s].filter((x) => x.dirty)) {
        const name = `${side}, ${monthLabel(r.key, 'long')}`
        if (r.target !== '' && parseViews(r.target) == null) return `${name}: the target should be a number like 17m, or empty to follow the plan.`
        if (r.override !== '' && parseViews(r.override) == null) return `${name}: the achieved figure should be a number, or empty.`
        for (const [k, l] of [['epm', 'EPM'], ['cpm', 'CPM'], ['other', 'Other costs']]) if (r[k] !== '' && !(Number(r[k]) >= 0)) return `${name}: ${l} should be a number.`
      }
    }
    return null
  }

  async function save() {
    const problem = validate()
    if (problem) { notice(problem); return }
    setBusy(true)
    const planRows = ['community', 'vip'].filter((s) => planF[s].dirty).map((s) => {
      const p = livePlan(planF[s])
      const a = parseMonth(p.anchor)
      const st = parseMonth(p.start)
      return { segment: s, start_year: st.year, start_month: st.month, anchor_year: a.year, anchor_month: a.month, anchor_views: p.anchorViews, growth: p.growth, epm: p.epm, cpm: p.cpm }
    })
    if (planRows.length) {
      const { error } = await teamApi.cccPlans().upsert(planRows, { onConflict: 'segment' })
      if (error) { setBusy(false); notice(error.message?.includes('SANDBOX') ? 'The demo account can look at the plan but not change it.' : (error.message || 'The plan could not be saved.')); return }
    }
    const upserts = []
    const deletes = []
    for (const s of ['community', 'vip']) {
      const p = livePlan(planF[s])
      for (const r of months[s].filter((x) => x.dirty)) {
        const { year, month } = parseMonth(r.key)
        const target = r.target === '' ? null : parseViews(r.target)
        const pinned = target != null && target !== planTarget(p, r.key)
        const epm = r.epm === '' || Number(r.epm) === p.epm ? null : Number(r.epm)
        const cpm = r.cpm === '' || Number(r.cpm) === p.cpm ? null : Number(r.cpm)
        const other = Number(r.other || 0)
        const override = r.override === '' ? null : parseViews(r.override)
        const note = r.note.trim() || null
        if (!pinned && epm == null && cpm == null && !other && override == null && !note) { if (r.id) deletes.push(r.id); continue }
        upserts.push({ segment: s, year, month, view_target: pinned ? target : null, pinned, epm, cpm, other_costs: other, achieved_override: override, note, suggested: false })
      }
    }
    if (upserts.length) {
      const { error } = await teamApi.cccTargets().upsert(upserts, { onConflict: 'segment,year,month' })
      if (error) { setBusy(false); notice(error.message?.includes('SANDBOX') ? 'The demo account can look at the plan but not change it.' : (error.message || 'The months could not be saved.')); return }
    }
    if (deletes.length) {
      const { error } = await teamApi.cccTargets().delete().in('id', deletes)
      if (error) { setBusy(false); notice(error.message || 'A month could not be reset.'); return }
    }
    setBusy(false)
    toastSuccess('Plan saved')
    onSaved()
  }

  const footer = (
    <div className="flex w-full items-center justify-between gap-3">
      <span className="text-[13px] text-smoke">{changed ? `${changed} change${changed === 1 ? '' : 's'} not saved yet` : 'No changes yet'}</span>
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        <button type="button" onClick={save} disabled={busy || !changed} className="btn-primary disabled:opacity-50">{busy ? 'Saving…' : 'Save plan'}</button>
      </div>
    </div>
  )

  const preview = rows.filter((r) => r.key >= f.start).slice(0, 12)
  return (
    <Modal open onClose={onClose} title="Edit the plan" wide footer={footer}>
      <div className="space-y-6">
        <Segmented value={segment} options={SIDES} onChange={setSegment} />

        {/* ---- THE GROWTH PLAN ---- */}
        <section className="rounded-2xl border border-brand/15 bg-brand-tint/30 p-4 sm:p-5">
          <h4 className="flex items-center gap-2 text-[15px] font-bold text-ink"><Icon name="trendUp" className="h-5 w-5 text-brand" />Growth plan</h4>
          <p className="mt-1 text-[13px] text-smoke">Pick one month and its target, and how much to grow each month. Every other month follows, backwards and forwards, including months that have not arrived yet.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Field label="Anchor month"><Select variant="field" value={f.anchor} onChange={(v) => setPlan({ anchor: v })} options={monthOptions} search={false} ariaLabel="Anchor month" /></Field>
            <Field label="Target that month">
              <input value={f.anchorViews} onChange={(e) => setPlan({ anchorViews: e.target.value })} onBlur={() => { const n = parseViews(f.anchorViews); if (n != null) setPlan({ anchorViews: views(n) }) }}
                inputMode="decimal" placeholder="17m" className="input tabular-nums" />
            </Field>
            <Field label="Growth each month">
              <span className="relative block">
                <input value={f.growth} onChange={(e) => setPlan({ growth: e.target.value })} inputMode="decimal" className="input pr-8 tabular-nums" />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-smoke">%</span>
              </span>
            </Field>
            <Field label="Plan starts"><Select variant="field" value={f.start} onChange={(v) => setPlan({ start: v })} options={monthOptions} search={false} ariaLabel="Plan starts" /></Field>
            <Field label={<Term k="epm">EPM, € per 1,000 views</Term>}><input value={f.epm} onChange={(e) => setPlan({ epm: e.target.value })} inputMode="decimal" className="input tabular-nums" /></Field>
            <Field label={<Term k="cpm">Target CPM, €</Term>}><input value={f.cpm} onChange={(e) => setPlan({ cpm: e.target.value })} inputMode="decimal" className="input tabular-nums" /></Field>
          </div>
          <div className="scrollbar-none mt-4 flex gap-2 overflow-x-auto pb-1">
            {preview.map((r, i) => {
              const v = r.pinned && parseViews(r.target) != null ? parseViews(r.target) : planTarget(plan, r.key)
              const anchor = r.key === f.anchor
              return (
                <span key={`${r.key}-${v}`} className={cx('shrink-0 animate-pop-in rounded-xl px-3 py-2 text-center shadow-card', anchor ? 'bg-brand text-white' : 'bg-white')} style={{ animationDelay: `${i * 20}ms` }}>
                  <span className={cx('block text-[13px]', anchor ? 'text-white/85' : 'text-smoke')}>{monthLabel(r.key)}</span>
                  <span className={cx('block text-sm font-bold tabular-nums', anchor ? 'text-white' : 'text-ink')}>{v != null ? formatViews(v) : '-'}</span>
                  {r.pinned && !anchor && <span className="mx-auto mt-0.5 block h-1 w-1 rounded-full bg-brand" title="Set by hand" />}
                </span>
              )
            })}
          </div>
        </section>

        {/* ---- MONTH BY MONTH ---- */}
        <section>
          <h4 className="text-[15px] font-bold text-ink">Month by month</h4>
          <p className="mt-1 text-[13px] text-smoke">Leave a target empty to follow the growth plan. Type one to change a single month, or to re-plan every month from it.</p>
          <ul className="mt-3 divide-y divide-gray-100 rounded-2xl border border-gray-100">
            {rows.filter((r) => r.key >= f.start).map((r) => {
              const auto = planTarget(plan, r.key)
              const typed = parseViews(r.target)
              const anchor = r.key === f.anchor
              const differs = typed != null && typed !== auto
              return (
                <li key={r.key} className={cx('px-3 py-3 transition-colors sm:px-4', r.key === focus && 'bg-brand-tint/40', r.dirty && 'bg-amber-50/50')}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span className="flex w-48 shrink-0 items-center gap-1.5 text-sm font-semibold text-ink">
                      {monthLabel(r.key, 'long')}
                      {anchor && <span className="rounded-full bg-brand px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">Anchor</span>}
                    </span>
                    <span className="relative">
                      <input value={r.target} onChange={(e) => setRow(r.key, { target: e.target.value })}
                        onBlur={() => { const n = parseViews(r.target); if (n != null) setRow(r.key, { target: views(n) }) }}
                        inputMode="decimal" placeholder={auto != null ? views(auto) : 'Not set'} autoFocus={r.key === focus} disabled={anchor}
                        aria-label={`Target for ${monthLabel(r.key, 'long')}`}
                        className={cx('input w-40 !py-1.5 text-right tabular-nums placeholder:text-gray-400', r.pinned && !r.dirty && 'border-brand/40')} />
                    </span>
                    {r.pinned && !r.dirty && (
                      <button type="button" onClick={() => setRow(r.key, { target: '', pinned: false })} className="inline-flex items-center gap-1 rounded-full bg-brand-tint px-2.5 py-1 text-[13px] font-semibold text-brand transition-transform hoverable:hover:-translate-y-0.5">
                        <Icon name="refresh" className="h-3.5 w-3.5" />Set by hand · follow the plan
                      </button>
                    )}
                    {differs && r.dirty && !anchor && (
                      <span className="flex animate-pop-in gap-1.5">
                        <span className="rounded-full bg-ink px-2.5 py-1 text-[13px] font-semibold text-white">Just this month</span>
                        <button type="button" onClick={() => replanFrom(r)} className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[13px] font-semibold text-ink transition-all hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand/40 hoverable:hover:text-brand">
                          Re-plan every month from this
                        </button>
                      </span>
                    )}
                    <button type="button" onClick={() => setMonths((x) => ({ ...x, [segment]: x[segment].map((y) => (y.key === r.key ? { ...y, more: !y.more } : y)) }))}
                      aria-expanded={r.more} className="ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-semibold text-smoke transition-colors hoverable:hover:bg-cloud hoverable:hover:text-ink">
                      {r.epm || r.cpm || r.other || r.override || r.note ? <span className="h-1.5 w-1.5 rounded-full bg-brand" /> : null}
                      Rates, costs, note
                      <Icon name="chevronDown" className={cx('h-4 w-4 transition-transform duration-200', r.more && 'rotate-180')} />
                    </button>
                  </div>
                  {r.more && (
                    <div className="mt-3 grid animate-rise gap-3 sm:grid-cols-5">
                      <Field label={<Term k="epm">EPM €</Term>}><input value={r.epm} onChange={(e) => setRow(r.key, { epm: e.target.value })} placeholder={fmt(plan.epm)} inputMode="decimal" className="input !py-1.5 tabular-nums" /></Field>
                      <Field label={<Term k="cpm">Target CPM €</Term>}><input value={r.cpm} onChange={(e) => setRow(r.key, { cpm: e.target.value })} placeholder={fmt(plan.cpm)} inputMode="decimal" className="input !py-1.5 tabular-nums" /></Field>
                      <Field label={<Term k="other">Other costs €</Term>}><input value={r.other} onChange={(e) => setRow(r.key, { other: e.target.value })} placeholder="0" inputMode="decimal" className="input !py-1.5 tabular-nums" /></Field>
                      <Field label="Achieved (by hand)"><input value={r.override} onChange={(e) => setRow(r.key, { override: e.target.value })} placeholder="From the platform" inputMode="decimal" className="input !py-1.5 tabular-nums" /></Field>
                      <Field label="Note"><input value={r.note} onChange={(e) => setRow(r.key, { note: e.target.value.slice(0, 500) })} placeholder="Optional" className="input !py-1.5" /></Field>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </Modal>
  )
}

function Field({ label, children }) {
  return <div className="block"><span className="mb-1 block text-[13px] font-semibold text-smoke">{label}</span>{children}</div>
}
