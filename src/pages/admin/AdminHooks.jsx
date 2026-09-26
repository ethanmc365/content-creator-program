import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Select, Skeleton, Spinner } from '../../components/ui'
import Icon from '../../components/Icon'
import { confirm, notice, promptText } from '../../lib/confirm'
import { toast } from '../../lib/toast'
import { hookTier } from '../../lib/hooks'
import { cx } from '../../lib/utils'
import { fetchAll } from '../../lib/fetchAll'

// THE HOOK BANK, FOR THE TEAM (24 Sep 2026).
//
// Ethan: "There should be a new admin page called Hooks where I can add in
// other hooks... or just see all the hooks that are in. You can group them by
// families."
//
// Everything the creator's "Hook me up" button deals from is here: grouped by
// the formula it follows, the most-used families first, and inside a family the
// hooks that have worked most often first. A hidden hook stays in the bank but
// is never dealt. The tier chip is the one hint of how proven a hook is - the
// creator's button shows none of this.

const TIER_STYLE = {
  proven: 'bg-brand text-white',
  validated: 'bg-brand/15 text-brand',
  promising: 'bg-cloud text-ink',
  fresh: 'bg-cloud text-smoke',
}

export default function AdminHooks() {
  const { profile } = useAuth()
  const [rows, setRows] = useState(null)
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('all')
  const [limit, setLimit] = useState(120)
  const [text, setText] = useState('')
  const [family, setFamily] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    // PAGED: the API answers at most 1,000 rows and the bank holds ~1,500, so
    // a single read said "1,000 in rotation" and hid a third of the bank.
    const { data, error } = await fetchAll(() => supabase.from('hooks')
      .select('id, text, family, uses, is_active, source, created_at'))
    if (error) { notice(error.message); setRows([]); return }
    setRows((data || []).sort((a, b) => b.uses - a.uses || a.text.localeCompare(b.text)))
  }, [])
  useEffect(() => { load() }, [load])

  const families = useMemo(() => {
    const by = new Map()
    for (const h of rows || []) {
      const f = by.get(h.family) || { name: h.family, hooks: [], uses: 0, active: 0 }
      f.hooks.push(h)
      f.uses += h.uses
      if (h.is_active) f.active += 1
      by.set(h.family, f)
    }
    return [...by.values()].sort((a, b) => (a.name === 'More ideas') - (b.name === 'More ideas') || b.uses - a.uses)
  }, [rows])

  // ONE LIST, FILTERED (26 Sep 2026). Ethan: "just have a big, huge list ...
  // Or actually, perhaps keep it in these filters ... but really improve it."
  // So the groups are chips over a single list rather than thirteen closed
  // drawers, and the search narrows whatever group is picked.
  const q = query.trim().toLowerCase()
  const shown = useMemo(() => {
    let list = rows || []
    if (group !== 'all') list = list.filter((h) => h.family === group)
    if (q) list = list.filter((h) => h.text.toLowerCase().includes(q))
    return list
  }, [rows, group, q])
  const active = (rows || []).filter((h) => h.is_active).length

  async function add(e) {
    e.preventDefault()
    const t = text.trim().replace(/\s+/g, ' ')
    if (t.length < 3) return
    setSaving(true)
    const { error } = await supabase.from('hooks').insert({
      text: t, family: family || 'More ideas', source: 'team', uses: 1, created_by: profile?.id ?? null,
    })
    setSaving(false)
    if (error) {
      notice(error.code === '23505' ? 'That hook is already in the bank.' : error.message)
      return
    }
    setText('')
    toast('Hook added. It is in the rotation now.')
    load()
  }

  async function toggle(h) {
    setRows((cur) => cur.map((x) => (x.id === h.id ? { ...x, is_active: !x.is_active } : x)))
    const { error } = await supabase.from('hooks').update({ is_active: !h.is_active }).eq('id', h.id)
    if (error) { notice(error.message); load() }
  }

  async function edit(h) {
    const next = await promptText('Edit the hook. Keep it short enough to say in the first two seconds.', {
      title: 'Edit hook', defaultValue: h.text, confirmLabel: 'Save',
    })
    if (next === null || next.trim() === h.text) return
    const { error } = await supabase.from('hooks').update({ text: next.trim() }).eq('id', h.id)
    if (error) { notice(error.message); return }
    load()
  }

  async function remove(h) {
    if (!await confirm(`"${h.text}"`, { title: 'Delete this hook?', confirmLabel: 'Delete', danger: true })) return
    setRows((cur) => cur.filter((x) => x.id !== h.id))
    const { error } = await supabase.from('hooks').delete().eq('id', h.id)
    if (error) { notice(error.message); load() }
  }

  const row = (h) => {
    const tier = hookTier(h.uses)
    return (
      <li key={h.id} className={cx('group flex items-start gap-3 px-4 py-3 sm:px-5', !h.is_active && 'opacity-50')}>
        <span className="min-w-0 flex-1">
          <span className="block text-sm leading-snug text-ink [overflow-wrap:anywhere]">{h.text}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className={cx('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', TIER_STYLE[tier.key])}>
              {h.source === 'team' ? 'Team' : tier.label}
            </span>
            {group === 'all' && <span className="text-[11px] text-smoke">{h.family}</span>}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-0.5">
          <button type="button" onClick={() => toggle(h)} title={h.is_active ? 'Hide from the button' : 'Put back in the rotation'}
            className="flex h-7 w-7 items-center justify-center rounded-full text-smoke transition-colors hover:bg-cloud hover:text-ink">
            <Icon name={h.is_active ? 'eye' : 'ban'} className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => edit(h)} title="Edit"
            className="flex h-7 w-7 items-center justify-center rounded-full text-smoke transition-colors hover:bg-cloud hover:text-ink">
            <Icon name="pencil" className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => remove(h)} title="Delete"
            className="flex h-7 w-7 items-center justify-center rounded-full text-smoke transition-colors hover:bg-red-50 hover:text-red-600">
            <Icon name="trash" className="h-3.5 w-3.5" />
          </button>
        </span>
      </li>
    )
  }

  return (
    <div className="page max-w-5xl">
      <PageHeader back="/admin" title="Hooks" />

      {/* ---- Add one ---- */}
      <form onSubmit={add} className="mb-6 rounded-card border border-gray-100 bg-white p-4 shadow-card sm:p-5">
        <p className="mb-2 text-sm font-semibold">Add a hook</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            className="input flex-1"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder='e.g. "Flights to Lisbon are cheaper than my weekly food shop"'
            maxLength={400}
          />
          <Select
            className="sm:w-60"
            variant="field"
            ariaLabel="Group"
            value={family}
            onChange={setFamily}
            placeholder="Group"
            options={[{ value: '', label: 'More ideas' }, ...families.filter((f) => f.name !== 'More ideas').map((f) => ({ value: f.name, label: f.name }))]}
          />
          <button type="submit" disabled={saving || text.trim().length < 3} className="btn-primary justify-center disabled:opacity-50">
            {saving ? <Spinner /> : <><Icon name="plus" className="h-4 w-4" /> Add</>}
          </button>
        </div>
      </form>

      {/* ---- The bank ---- */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-smoke">
          <span className="font-semibold text-ink">{active.toLocaleString()}</span> in rotation
        </p>
        <div className="relative w-full sm:w-80">
          <Icon name="magnifier" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
          <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(120) }} placeholder="Search the hooks" className="input no-ios-zoom !py-2.5 !pl-9 text-sm" aria-label="Search the hooks" />
        </div>
      </div>

      <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 pt-0.5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0" role="tablist" aria-label="Hook groups">
        {[{ name: 'all', label: 'All', count: (rows || []).length }, ...families.map((f) => ({ name: f.name, label: f.name, count: f.hooks.length }))].map((g, i) => {
          const on = group === g.name
          return (
            <button
              key={g.name}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => { setGroup(g.name); setLimit(120) }}
              style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
              className={cx(
                'animate-fade-up inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-all duration-200',
                on ? 'bg-brand text-white shadow-card' : 'border border-gray-200 bg-white text-ink hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand/40',
              )}
            >
              {g.label}
              <span className={cx('rounded-full px-1.5 text-[10px] font-bold tabular-nums', on ? 'bg-white/25' : 'bg-cloud text-smoke')}>{g.count}</span>
            </button>
          )
        })}
      </div>

      {rows === null ? (
        <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-card" />)}</div>
      ) : shown.length === 0 ? (
        <p className="rounded-card border border-dashed border-gray-200 px-5 py-10 text-center text-sm text-smoke">Nothing matches that.</p>
      ) : (
        <div key={group} className="animate-fade-up overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
          <ul className="divide-y divide-gray-50">{shown.slice(0, limit).map(row)}</ul>
          {shown.length > limit && (
            <button
              type="button"
              onClick={() => setLimit((n) => n + 200)}
              className="flex w-full items-center justify-center gap-1.5 border-t border-gray-100 px-5 py-3.5 text-sm font-semibold text-brand hover:bg-cloud/40"
            >
              Show more <span className="text-smoke">({(shown.length - limit).toLocaleString()} left)</span>
              <Icon name="chevronDown" className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
