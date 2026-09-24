import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Select, Skeleton, Spinner } from '../../components/ui'
import Icon from '../../components/Icon'
import { confirm, notice, promptText } from '../../lib/confirm'
import { toast } from '../../lib/toast'
import { hookTier } from '../../lib/hooks'
import { cx } from '../../lib/utils'

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
  const [openFam, setOpenFam] = useState(null)
  const [text, setText] = useState('')
  const [family, setFamily] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('hooks')
      .select('id, text, family, uses, is_active, source, created_at')
      .order('uses', { ascending: false }).order('text').limit(5000)
    if (error) { notice(error.message); setRows([]); return }
    setRows(data || [])
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

  const q = query.trim().toLowerCase()
  const matches = useMemo(
    () => (q ? (rows || []).filter((h) => h.text.toLowerCase().includes(q)) : null),
    [rows, q],
  )
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
      <li key={h.id} className={cx('group flex items-start gap-3 px-5 py-3', !h.is_active && 'opacity-50')}>
        <span className={cx('mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', TIER_STYLE[tier.key])}>
          {h.source === 'team' ? 'Team' : tier.label}
        </span>
        <p className="min-w-0 flex-1 text-sm leading-snug text-ink [overflow-wrap:anywhere]">{h.text}</p>
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
      <PageHeader
        back="/admin"
        title="Hooks"
        subtitle="Every opener behind the Hook me up button on the challenges. Proven ones are dealt first."
      />

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
            ariaLabel="Family"
            value={family}
            onChange={setFamily}
            placeholder="Family"
            options={[{ value: '', label: 'More ideas' }, ...families.filter((f) => f.name !== 'More ideas').map((f) => ({ value: f.name, label: f.name }))]}
          />
          <button type="submit" disabled={saving || text.trim().length < 3} className="btn-primary justify-center disabled:opacity-50">
            {saving ? <Spinner /> : <><Icon name="plus" className="h-4 w-4" /> Add</>}
          </button>
        </div>
      </form>

      {/* ---- The bank ---- */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-smoke">
          <span className="font-semibold text-ink">{active.toLocaleString()}</span> in rotation
          {' · '}{families.length} families
        </p>
        <div className="relative w-full sm:w-72">
          <Icon name="magnifier" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the hooks" className="input !py-2 !pl-9 text-sm" aria-label="Search the hooks" />
        </div>
      </div>

      {rows === null ? (
        <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-card" />)}</div>
      ) : matches ? (
        <div className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
          <p className="border-b border-gray-100 px-5 py-3 text-xs font-semibold text-smoke">{matches.length} matching</p>
          <ul className="max-h-[70vh] divide-y divide-gray-50 overflow-y-auto overscroll-contain">{matches.slice(0, 300).map(row)}</ul>
        </div>
      ) : (
        <div className="space-y-3">
          {families.map((f) => {
            const isOpen = openFam === f.name
            return (
              <section key={f.name} className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
                <button
                  type="button"
                  onClick={() => setOpenFam(isOpen ? null : f.name)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-cloud/40"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{f.name}</span>
                    <span className="block truncate text-xs text-smoke">{f.hooks[0]?.text}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-cloud px-2.5 py-0.5 text-xs font-semibold tabular-nums text-smoke">{f.active}</span>
                  <Icon name="chevronDown" className={cx('h-4 w-4 shrink-0 text-smoke transition-transform duration-300', isOpen && 'rotate-180')} />
                </button>
                {isOpen && (
                  <ul className="max-h-[60vh] divide-y divide-gray-50 overflow-y-auto overscroll-contain border-t border-gray-100">
                    {f.hooks.map(row)}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
