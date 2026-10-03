import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Modal, Skeleton } from '../ui'
import Icon from '../Icon'
import KpiProgress from '../admin/KpiProgress'
import { notice } from '../../lib/confirm'
import { cx, formatViews } from '../../lib/utils'
import { kpiStatus } from '../../lib/kpiTracker'
import { STATUS_HEX_ON_BRAND, statusGradient } from '../../lib/barGradient'
import { money, monthLabel, nf, vipRpc } from '../../lib/vip'
import { useT } from '../../lib/i18n'

// THE VIP KPIs, BUILT LIKE THE KPI PAGE (3 Oct 2026).
//
// Ethan: "the KPIs thing makes no sense. I want it to be the same structure as the actual KPIs thing we have here."
// So it is the KPI page's shape, for one VIP market and one month: an orange summary card saying how many goals are
// on track with the same one-gradient spread bar, the same month stepper with a "back to this month" button, and one
// card per goal with the same status chip and the same pace bar (KpiProgress: the fill is where you are, the tick is
// where a steady pace would be). Every actual is counted live by `vip_kpi_actuals` from the videos the payouts use.
const METRICS = [
  { key: 'views', label: 'Views counted', icon: 'eye', fmt: (v) => formatViews(v) },
  { key: 'videos', label: 'Videos posted', icon: 'video', fmt: (v) => nf(v) },
  { key: 'active_creators', label: 'VIPs with views', icon: 'users', fmt: (v) => nf(v), level: true },
  { key: 'spend', label: 'Spend on views', icon: 'money', fmt: (v, cur) => money(v, cur, { cents: false }), lower: true },
  { key: 'hit_target', label: 'VIPs who hit their target', icon: 'trophy', fmt: (v) => nf(v), level: true },
]
const STYLE = {
  met: { chip: 'bg-emerald-50 text-emerald-600', label: 'Target met' },
  on_track: { chip: 'bg-brand-tint text-brand', label: 'On track' },
  behind: { chip: 'bg-amber-50 text-amber-700', label: 'Behind pace' },
  missed: { chip: 'bg-red-50 text-red-600', label: 'Missed' },
  upcoming: { chip: 'bg-gray-100 text-smoke', label: 'Not started' },
}

function thisMonth() {
  const d = new Date()
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

export function VipKpiTab({ programme }) {
  const tr = useT()
  const { profile } = useAuth()
  const today = thisMonth()
  const [ym, setYm] = useState(today)
  const [actual, setActual] = useState(null)
  const [targets, setTargets] = useState({})
  const [editing, setEditing] = useState(null)
  const [val, setVal] = useState('')
  const cur = programme.currency
  const isToday = ym.year === today.year && ym.month === today.month

  const load = useCallback(async () => {
    const [a, t] = await Promise.all([
      vipRpc('vip_kpi_actuals', { p_programme: programme.id, p_year: ym.year, p_month: ym.month }).catch(() => ({})),
      supabase.from('vip_kpi_targets').select('*').eq('programme_id', programme.id).eq('year', ym.year).eq('month', ym.month),
    ])
    setActual(a || {}); setTargets(Object.fromEntries((t.data || []).map((x) => [x.metric, x])))
  }, [programme.id, ym])
  useEffect(() => { setActual(null); load() }, [load])

  const step = (d) => setYm((p) => { const i = p.year * 12 + (p.month - 1) + d; return { year: Math.floor(i / 12), month: (i % 12) + 1 } })

  async function save() {
    const metric = editing
    const n = Number(String(val).replace(/[\s,]/g, ''))
    if (val === '' || Number.isNaN(n)) {
      if (targets[metric]) await supabase.from('vip_kpi_targets').delete().eq('id', targets[metric].id)
    } else {
      const { error } = await supabase.from('vip_kpi_targets').upsert({ programme_id: programme.id, year: ym.year, month: ym.month, metric, target_value: n, created_by: profile?.id }, { onConflict: 'programme_id,year,month,metric' })
      if (error) { notice(error.message); return }
    }
    setEditing(null); load()
  }

  const rows = METRICS.map((m) => {
    const v = Number(actual?.[m.key] || 0)
    const t = targets[m.key]
    const st = t ? kpiStatus({ target: Number(t.target_value), actual: v, year: ym.year, quarter: Math.ceil(ym.month / 3), month: ym.month, kind: m.level ? 'level' : 'sum', higherIsBetter: !m.lower }) : null
    return { ...m, v, t, st }
  })
  const goals = rows.filter((r) => r.st)
  const counts = goals.reduce((a, r) => ({ ...a, [r.st.status]: (a[r.st.status] || 0) + 1 }), {})
  const good = (counts.met || 0) + (counts.on_track || 0)
  const editingRow = rows.find((r) => r.key === editing)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-smoke">{tr('Goals for {p}, month by month, counted live from the same videos the payouts use.', { p: programme.name })}</p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setYm(today)} tabIndex={isToday ? -1 : 0} aria-hidden={isToday} className={cx('inline-flex h-8 items-center gap-1.5 rounded-full bg-brand px-3.5 text-[12.5px] font-bold text-white shadow-card transition-all duration-300', isToday ? 'pointer-events-none scale-95 opacity-0' : 'opacity-100 hoverable:hover:scale-[1.04]')}>
            <Icon name="chevronLeft" className="h-3.5 w-3.5" strokeWidth={2.4} />{tr('This month')}
          </button>
          <div className="flex items-center gap-1 rounded-xl border border-gray-100 bg-white p-1 shadow-card">
            <button type="button" onClick={() => step(-1)} aria-label={tr('Previous month')} className="flex h-8 w-8 items-center justify-center rounded-lg text-smoke transition-colors hoverable:hover:bg-cloud hoverable:hover:text-brand"><Icon name="chevronLeft" className="h-4 w-4" /></button>
            <span className="min-w-[8.5rem] text-center text-[13px] font-bold tabular-nums text-ink">{monthLabel(ym.year, ym.month)}</span>
            <button type="button" onClick={() => step(1)} aria-label={tr('Next month')} className="flex h-8 w-8 items-center justify-center rounded-lg text-smoke transition-colors hoverable:hover:bg-cloud hoverable:hover:text-brand"><Icon name="chevronRight" className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      {actual === null ? <><Skeleton className="h-32 w-full rounded-card" /><Skeleton className="h-64 w-full rounded-card" /></> : (
        <>
          <section key={`${ym.year}-${ym.month}`} className="relative overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light p-5 text-white shadow-card animate-rise sm:p-6">
            <span aria-hidden className="pointer-events-none absolute -right-10 -top-14 h-48 w-48 rounded-full bg-white/15 blur-2xl" />
            <p className="relative text-[11px] font-bold uppercase tracking-[0.14em] text-white/85">{programme.name} · {monthLabel(ym.year, ym.month)}</p>
            {goals.length === 0 ? (
              <p className="relative mt-2 text-lg font-bold">{tr('No goals set for this month yet. Press a card below to set one.')}</p>
            ) : (
              <>
                <p className="relative mt-1.5 text-3xl font-bold tabular-nums">{tr('{a} of {b} goals on track', { a: good, b: goals.length })}</p>
                <div className="relative mt-4 h-2.5 overflow-hidden rounded-full bg-white/25">
                  <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: '100%', background: statusGradient(counts, STATUS_HEX_ON_BRAND) }} />
                </div>
                <p className="relative mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-white/90">
                  {['met', 'on_track', 'behind', 'missed', 'upcoming'].filter((k) => counts[k]).map((k) => <span key={k}>{counts[k]} {tr(STYLE[k].label).toLowerCase()}</span>)}
                </p>
              </>
            )}
          </section>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((r, i) => {
              const st = r.st
              return (
                <article
                  key={`${ym.year}-${ym.month}-${r.key}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => { setEditing(r.key); setVal(r.t ? String(Number(r.t.target_value)) : '') }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { setEditing(r.key); setVal(r.t ? String(Number(r.t.target_value)) : '') } }}
                  style={{ animationDelay: `${i * 50}ms` }}
                  className={cx('group flex cursor-pointer flex-col gap-3 rounded-card border bg-white p-4 shadow-card transition-[box-shadow,border-color,transform] duration-300 animate-rise hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand/30 hoverable:hover:shadow-lift', r.t ? 'border-gray-100' : 'border-dashed border-gray-200')}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand"><Icon name={r.icon} className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1 pt-1 text-[15px] font-semibold leading-snug text-ink">{tr(r.label)}</span>
                    <Icon name="pencil" className="mt-1.5 h-3.5 w-3.5 text-gray-300 transition-colors group-hover:text-brand" />
                  </div>
                  <div>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-2xl font-bold tabular-nums tracking-tight text-ink">{r.fmt(r.v, cur)}</span>
                      {r.t && <span className="text-sm text-smoke">{r.lower ? tr('aim for under') : tr('of')} <strong className="font-semibold text-ink">{r.fmt(Number(r.t.target_value), cur)}</strong></span>}
                    </div>
                    {st ? <KpiProgress className="mt-2.5" status={st.status} pct={st.pct} progress={st.progress} isLevel={!!r.level} />
                      : <p className="mt-2.5 text-xs text-smoke">{tr('No goal yet. Press to set one.')}</p>}
                  </div>
                  {st && (
                    <div className="mt-auto flex items-center justify-between gap-2">
                      <span className={cx('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', STYLE[st.status].chip)}>{tr(STYLE[st.status].label)}</span>
                      {st.status !== 'upcoming' && <span className="text-xs font-semibold tabular-nums text-gray-400">{Math.round(st.pct * 100)}%</span>}
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        </>
      )}

      <Modal open={!!editingRow} onClose={() => setEditing(null)} title={editingRow ? tr(editingRow.label) : ''}>
        {editingRow && (
          <div className="space-y-4">
            <p className="text-sm text-smoke">{tr('The goal for {p} in {m}. Leave it empty to remove it.', { p: programme.name, m: monthLabel(ym.year, ym.month) })}</p>
            <input autoFocus className="input" inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save() }} placeholder={tr('For example: {n}', { n: editingRow.key === 'views' ? '2,000,000' : editingRow.key === 'spend' ? '600' : '40' })} />
            <p className="text-xs text-smoke">{tr('So far this month: {v}', { v: editingRow.fmt(editingRow.v, cur) })}</p>
            <button type="button" onClick={save} className="btn-primary w-full justify-center">{tr('Save goal')}</button>
          </div>
        )}
      </Modal>
    </div>
  )
}
