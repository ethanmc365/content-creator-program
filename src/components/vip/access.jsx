import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Avatar, Select, Skeleton, Spinner } from '../ui'
import Icon from '../Icon'
import { confirm, notice } from '../../lib/confirm'
import { toastSuccess } from '../../lib/toast'
import { clearVipAccess, vipRpc } from '../../lib/vip'
import { formatDate } from '../../lib/utils'
import { useT } from '../../lib/i18n'

// WHO CAN OPEN THE VIP TOOLS (30 Sep 2026, migration 296).
//
// Ethan: "The entire Tryp.com team should not be able to see it but I should, and I should be able to add other
// managers to it, for example Marta who is leading the Spanish VIP program."
//
// The owner always has it. Anybody else needs a row here, per programme, so a Spanish lead runs Spain and sees
// nothing of Romania. Only the owner sees this tab and only the owner can write the list (the functions refuse
// anyone else; this page is a courtesy, not the lock).
export function VipAccessTab({ programmes }) {
  const tr = useT()
  const [rows, setRows] = useState(null)
  const [q, setQ] = useState('')
  const [found, setFound] = useState([])
  const [searching, setSearching] = useState(false)
  const [pick, setPick] = useState(null)
  const [pid, setPid] = useState(programmes[0]?.id || '')
  const [saving, setSaving] = useState(false)
  const seq = useRef(0)

  const load = useCallback(async () => {
    try { setRows(await vipRpc('vip_managers_list')) } catch (e) { setRows([]); notice(e.message) }
  }, [])
  useEffect(() => { load() }, [load])

  // people search: names only, never the test accounts
  useEffect(() => {
    const term = q.trim().replace(/[%_,()]/g, ' ')
    if (term.length < 2 || pick) { setFound([]); return undefined }
    const mine = ++seq.current
    setSearching(true)
    const id = setTimeout(async () => {
      const { data } = await supabase.from('profiles').select('id, name, photo_url, role_title, is_admin')
        .ilike('name', `%${term}%`).eq('is_test', false).order('is_admin', { ascending: false }).limit(8)
      if (mine === seq.current) { setFound(data || []); setSearching(false) }
    }, 220)
    return () => clearTimeout(id)
  }, [q, pick])

  async function add() {
    if (!pick || !pid) return
    setSaving(true)
    try {
      await vipRpc('vip_add_manager', { p_profile: pick.id, p_programme: pid })
      toastSuccess(tr('{n} can now open the VIP tools.', { n: pick.name }))
      setPick(null); setQ('')
      await load()
    } catch (e) { notice(e.message) } finally { setSaving(false) }
  }
  async function remove(r) {
    if (!await confirm(tr('Take {n} off {p}? They will no longer see it.', { n: r.name, p: r.programme }), { confirmLabel: tr('Take off'), danger: true })) return
    try { await vipRpc('vip_remove_manager', { p_profile: r.profile_id, p_programme: r.programme_id }); clearVipAccess(); await load() } catch (e) { notice(e.message) }
  }

  const byPerson = new Map()
  for (const r of rows || []) {
    const cur = byPerson.get(r.profile_id) || { ...r, programmes: [] }
    cur.programmes.push(r)
    byPerson.set(r.profile_id, cur)
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">{tr('Who can open the VIP tools')}</h2>
        <p className="mb-3 text-sm text-smoke">{tr('Only you, and the people you add here. Nobody else on the team can see the VIP tools, the payouts or the VIP rooms. Add a market lead for their own programme.')}</p>
        {rows === null ? <Skeleton className="h-28 w-full rounded-card" /> : byPerson.size === 0 ? (
          <p className="rounded-card border border-dashed border-gray-200 px-6 py-8 text-center text-sm text-smoke">{tr('Nobody else has access yet. Add a manager below.')}</p>
        ) : (
          <ul className="divide-y divide-gray-50 overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
            {[...byPerson.values()].map((person) => (
              <li key={person.profile_id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 animate-fade-up">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar src={person.photo_url} name={person.name} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">{person.name}</span>
                    <span className="block truncate text-xs text-smoke">{person.role_title || tr('Team')}</span>
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {person.programmes.map((r) => (
                    <span key={r.programme_id} className="inline-flex items-center gap-1 rounded-full bg-brand-tint py-1 pl-2.5 pr-1 text-[11px] font-semibold text-brand" title={tr('Added {d}', { d: formatDate(r.added_at) })}>
                      {r.programme}
                      <button type="button" onClick={() => remove(r)} aria-label={tr('Take off')} className="flex h-5 w-5 items-center justify-center rounded-full transition-colors hoverable:hover:bg-brand hoverable:hover:text-white">
                        <Icon name="close" className="h-3 w-3" strokeWidth={2.6} />
                      </button>
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gray-400">{tr('Add a manager')}</h2>
        <div className="rounded-card border border-gray-100 bg-white p-4 shadow-card">
          <div className="grid gap-3 sm:grid-cols-[1fr_14rem_auto] sm:items-end">
            <div className="relative">
              <span className="label">{tr('Who?')}</span>
              {pick ? (
                <div className="input flex items-center gap-2.5 !py-2">
                  <Avatar src={pick.photo_url} name={pick.name} size="xs" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{pick.name}</span>
                  <button type="button" onClick={() => { setPick(null); setQ('') }} aria-label={tr('Choose someone else')} className="text-smoke hoverable:hover:text-ink"><Icon name="close" className="h-4 w-4" /></button>
                </div>
              ) : (
                <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Type a name')} autoComplete="off" />
              )}
              {!pick && (searching || found.length > 0) && (
                <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-xl border border-gray-100 bg-white p-1 shadow-lg animate-fade-up">
                  {searching && found.length === 0 && <li className="flex items-center gap-2 px-3 py-2 text-sm text-smoke"><Spinner className="h-4 w-4" />{tr('Searching')}</li>}
                  {found.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => { setPick(p); setFound([]) }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hoverable:hover:bg-cloud">
                        <Avatar src={p.photo_url} name={p.name} size="xs" />
                        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{p.name}</span>{(p.role_title || p.is_admin) && <span className="block truncate text-[11px] text-smoke">{p.role_title || tr('Team')}</span>}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <span className="label">{tr('For which programme?')}</span>
              <Select value={pid} onChange={setPid} options={programmes.map((p) => ({ value: p.id, label: p.name }))} ariaLabel={tr('Programme')} variant="field" />
            </div>
            <button type="button" onClick={add} disabled={!pick || !pid || saving} className="btn-primary !py-2.5 text-sm">
              {saving ? <Spinner className="h-4 w-4" /> : <Icon name="plus" className="h-4 w-4" strokeWidth={2.4} />}{tr('Give access')}
            </button>
          </div>
          <p className="mt-3 text-xs text-smoke">{tr('They get the VIP tools for that programme: its members, bonuses, month-end payouts, numbers and rooms. They cannot add other managers.')}</p>
        </div>
      </section>
    </div>
  )
}
