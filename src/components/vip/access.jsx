import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Avatar, Select, Skeleton, Spinner } from '../ui'
import Icon from '../Icon'
import { confirm, notice } from '../../lib/confirm'
import { toastSuccess } from '../../lib/toast'
import { clearVipAccess, vipRpc, useKindT } from '../../lib/vip'
import { formatDate } from '../../lib/utils'

// WHO CAN OPEN THE VIP TOOLS (30 Sep 2026, migration 296).
//
// Ethan: "The entire Tryp.com team should not be able to see it but I should, and I should be able to add other
// managers to it, for example Marta who is leading the Spanish VIP program."
//
// The owner always has it. Anybody else needs a row here, per programme, so a Spanish lead runs Spain and sees
// nothing of Romania. Only the owner sees this tab and only the owner can write the list (the functions refuse
// anyone else; this page is a courtesy, not the lock).
export function VipAccessTab({ programmes }) {
  const tr = useKindT()
  const [rows, setRows] = useState(null)
  const [q, setQ] = useState('')
  const [found, setFound] = useState([])
  const [searching, setSearching] = useState(false)
  const [pick, setPick] = useState(null)
  const [pid, setPid] = useState(programmes[0]?.id || '')
  const [saving, setSaving] = useState(false)
  const seq = useRef(0)

  const load = useCallback(async () => {
    try {
      const list = (await vipRpc('vip_managers_list')) || []
      // The team's demo login keeps its access for testing, but it is not somebody to list here (3 Oct 2026).
      const ids = [...new Set(list.map((r) => r.profile_id))]
      const { data: hide } = ids.length ? await supabase.from('profiles').select('id').in('id', ids).or('is_test.eq.true,is_sandbox.eq.true') : { data: [] }
      const hidden = new Set((hide || []).map((h) => h.id))
      setRows(list.filter((r) => !hidden.has(r.profile_id)))
    } catch (e) { setRows([]); notice(e.message) }
  }, [])
  useEffect(() => { load() }, [load])

  // PEOPLE SEARCH, FAST (3 Oct 2026). Ethan: "type in a name, it shows searching ... if I delete it, it just keeps showing
  // searching ... it takes a while for them to show up." The search box was waiting a quarter of a second, asking the
  // database, and never clearing its "Searching" flag when the box was emptied. Now the team (admins first) is fetched
  // once when the tab opens and filtered as you type, with no wait; anybody else is looked up behind it.
  const [team, setTeam] = useState(null)
  useEffect(() => {
    let alive = true
    supabase.from('profiles').select('id, name, photo_url, role_title, is_admin').eq('is_test', false).eq('is_sandbox', false)
      .or('is_admin.eq.true,platform_role.in.(owner,global_admin)').order('name').limit(200)
      .then(({ data }) => { if (alive) setTeam(data || []) })
    return () => { alive = false }
  }, [])
  useEffect(() => {
    const term = q.trim().replace(/[%_,()]/g, ' ')
    if (term.length < 2 || pick) { seq.current += 1; setFound([]); setSearching(false); return undefined }
    const mine = ++seq.current
    setSearching(true)
    const id = setTimeout(async () => {
      const { data } = await supabase.from('profiles').select('id, name, photo_url, role_title, is_admin')
        .ilike('name', `%${term}%`).eq('is_test', false).eq('is_sandbox', false).order('is_admin', { ascending: false }).limit(8)
      if (mine === seq.current) { setFound(data || []); setSearching(false) }
    }, 120)
    return () => clearTimeout(id)
  }, [q, pick])
  const term = q.trim().toLowerCase()
  const quick = term && !pick ? (team || []).filter((p) => String(p.name || '').toLowerCase().includes(term)) : []
  const shownPeople = [...quick, ...found.filter((f) => !quick.some((x) => x.id === f.id))].slice(0, 8)

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
        {rows === null ? <Skeleton className="h-28 w-full rounded-card" /> : byPerson.size === 0 ? (
          <p className="rounded-card border border-dashed border-gray-200 px-6 py-8 text-center text-sm text-smoke">{tr('Nobody else has access yet. Add a manager below.')}</p>
        ) : (
          <ul className="divide-y divide-gray-50 overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
            {[...byPerson.values()].map((person) => (
              <li key={person.profile_id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 animate-rise">
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
              {!pick && term.length >= 1 && (shownPeople.length > 0 || (searching && term.length >= 2) || (!searching && term.length >= 2)) && (
                <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-xl border border-gray-100 bg-white p-1 shadow-lg animate-rise">
                  {searching && shownPeople.length === 0 && <li className="flex items-center gap-2 px-3 py-2 text-sm text-smoke"><Spinner className="h-4 w-4" />{tr('Searching')}</li>}
                  {!searching && shownPeople.length === 0 && <li className="px-3 py-2 text-sm text-smoke">{tr('Nobody found.')}</li>}
                  {shownPeople.map((p) => (
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
          <p className="mt-3 text-xs text-smoke">{tr('They run that programme: its members, bonuses, month-end payouts and content. They can also see how every other market is doing, but not change it. They cannot add other managers.')}</p>
        </div>
      </section>
    </div>
  )
}
