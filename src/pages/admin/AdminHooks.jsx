import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Select, Skeleton, Spinner } from '../../components/ui'
import Icon from '../../components/Icon'
import { confirm, notice } from '../../lib/confirm'
import { toast } from '../../lib/toast'
import AutoTextarea from '../../components/AutoTextarea'
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

// NO TIER CHIPS (28 Sep 2026). Ethan: "I don't like the 'Validated',
// 'Promising' new headings ... it just adds more clutter." The order still
// puts the most-used hooks first; nothing is labelled with it.

export default function AdminHooks() {
  const { profile } = useAuth()
  const [rows, setRows] = useState(null)
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('all')
  const [limit, setLimit] = useState(120)
  const [text, setText] = useState('')
  const [family, setFamily] = useState('')
  const [saving, setSaving] = useState(false)
  // EDITED IN PLACE, IN A BOX THAT GROWS (28 Sep 2026). Ethan: "if a hook is
  // a bit longer, it's hard to write it because it doesn't really fit in the
  // box." The one-line prompt dialog is gone; the row itself opens.
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState('')

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

  function startEdit(h) {
    setEditingId(h.id)
    setDraft(h.text)
  }

  async function saveEdit(h) {
    const next = draft.trim().replace(/\s+/g, ' ')
    setEditingId(null)
    if (!next || next === h.text) return
    setRows((cur) => cur.map((x) => (x.id === h.id ? { ...x, text: next } : x)))
    const { error } = await supabase.from('hooks').update({ text: next }).eq('id', h.id)
    if (error) { notice(error.message); load() } else toast('Hook saved.')
  }

  async function remove(h) {
    if (!await confirm(`"${h.text}"`, { title: 'Delete this hook?', confirmLabel: 'Delete', danger: true })) return
    setRows((cur) => cur.filter((x) => x.id !== h.id))
    const { error } = await supabase.from('hooks').delete().eq('id', h.id)
    if (error) { notice(error.message); load() }
  }

  const row = (h, i) => {
    const editingThis = editingId === h.id
    return (
      <li
        key={h.id}
        style={{ animationDelay: `${Math.min(i, 14) * 22}ms` }}
        className={cx(
          'group animate-fade-up flex items-start gap-3 px-4 py-3.5 transition-colors sm:px-5',
          !h.is_active && 'opacity-50',
          editingThis ? 'bg-brand-tint/40' : 'hover:bg-cloud/40',
        )}
      >
        <span aria-hidden className="mt-0.5 select-none font-serif text-2xl font-bold leading-none text-brand/30">&ldquo;</span>
        {editingThis ? (
          <form
            className="min-w-0 flex-1"
            onSubmit={(e) => { e.preventDefault(); saveEdit(h) }}
          >
            <AutoTextarea
              autoFocus
              value={draft}
              minRows={2}
              maxLength={400}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditingId(null)
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(h) }
              }}
              className="input no-ios-zoom w-full resize-none text-sm leading-relaxed"
            />
            <span className="mt-2 flex items-center gap-2">
              <button type="submit" className="btn-primary !py-1.5 text-xs">Save</button>
              <button type="button" onClick={() => setEditingId(null)} className="btn-ghost !py-1.5 text-xs">Cancel</button>
              <span className="ml-auto text-[11px] tabular-nums text-smoke">{draft.length}/400</span>
            </span>
          </form>
        ) : (
          <button type="button" onClick={() => startEdit(h)} className="min-w-0 flex-1 text-left" title="Edit">
            <span className="block text-[15px] font-medium leading-snug text-ink [overflow-wrap:anywhere]">{h.text}</span>
            {(group === 'all' || h.source === 'team') && (
              <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-smoke">
                {group === 'all' && <span>{h.family}</span>}
                {h.source === 'team' && <span className="rounded-full bg-brand-tint px-1.5 py-px font-semibold text-brand">Added by the team</span>}
              </span>
            )}
          </button>
        )}
        {!editingThis && (
          <span className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
            <button type="button" onClick={() => toggle(h)} title={h.is_active ? 'Hide from the button' : 'Put back in the rotation'}
              className="flex h-8 w-8 items-center justify-center rounded-full text-smoke transition-colors hover:bg-cloud hover:text-ink">
              <Icon name={h.is_active ? 'eye' : 'ban'} className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => startEdit(h)} title="Edit"
              className="flex h-8 w-8 items-center justify-center rounded-full text-smoke transition-colors hover:bg-cloud hover:text-ink">
              <Icon name="pencil" className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => remove(h)} title="Delete"
              className="flex h-8 w-8 items-center justify-center rounded-full text-smoke transition-colors hover:bg-red-50 hover:text-red-600">
              <Icon name="trash" className="h-3.5 w-3.5" />
            </button>
          </span>
        )}
      </li>
    )
  }

  return (
    <div className="page max-w-5xl">
      <PageHeader back="/admin" title="Hooks" />

      {/* ---- Add one ---- */}
      <form onSubmit={add} className="mb-6 rounded-card border border-gray-100 bg-white p-4 shadow-card sm:p-5">
        <p className="mb-2 text-sm font-semibold">Add a hook</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <AutoTextarea
            className="input no-ios-zoom flex-1 resize-none leading-relaxed"
            minRows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit() } }}
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

      {/* ONE LINE OF TABS THAT SCROLLS SIDEWAYS, at every width (28 Sep
          2026). Ethan: "I want it all in one line, like tabs, and then I can
          scroll horizontally ... rather than just having a bunch of buttons
          everywhere." The picked tab slides itself into view. */}
      <div className="relative mb-5">
      <div className="-mx-4 flex gap-1 overflow-x-auto scroll-smooth border-b border-gray-100 px-4 sm:mx-0 sm:px-0" role="tablist" aria-label="Hook groups">
        {[{ name: 'all', label: 'All', count: (rows || []).length }, ...families.map((f) => ({ name: f.name, label: f.name, count: f.hooks.length }))].map((g, i) => {
          const on = group === g.name
          return (
            <button
              key={g.name}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={(e) => {
                setGroup(g.name); setLimit(120); setEditingId(null)
                e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
              }}
              style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
              className={cx(
                'animate-fade-up relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 pb-3 pt-2 text-sm font-semibold transition-colors duration-200',
                on ? 'text-brand' : 'text-smoke hover:text-ink',
              )}
            >
              {g.label === 'all' ? 'All' : g.label}
              <span className={cx('rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums transition-colors', on ? 'bg-brand text-white' : 'bg-cloud text-smoke')}>{g.count}</span>
              <span aria-hidden className={cx('absolute inset-x-2 bottom-0 h-[3px] rounded-full bg-brand transition-all duration-300', on ? 'opacity-100' : 'scale-x-0 opacity-0')} />
            </button>
          )
        })}
      </div>
      </div>

      {rows === null ? (
        <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-card" />)}</div>
      ) : shown.length === 0 ? (
        <p className="rounded-card border border-dashed border-gray-200 px-5 py-10 text-center text-sm text-smoke">Nothing matches that.</p>
      ) : (
        <div key={group} className="animate-fade-up overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
          <ul className="divide-y divide-gray-50">{shown.slice(0, limit).map((h, i) => row(h, i))}</ul>
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
