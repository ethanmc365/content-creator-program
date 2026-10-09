import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { isGlobalRole, useCommunity } from '../../context/CommunityContext'
import { Avatar, Modal, Spinner } from '../ui'
import Icon from '../Icon'
import FlagTile from '../network/FlagTile'
import { notice } from '../../lib/confirm'
import { toastSuccess } from '../../lib/toast'
import { cx } from '../../lib/utils'

// PLACING A CREATOR IN MARKETS (10 Oct 2026, migration 378).
//
// Ethan: "the ability for admins to manually add creators, we have the ability for them to move but this seems to remove
// them from the community they were in, we would need this function too but also the function to add them to multiple."
// So one dialog answers both: every open market as a tile, the ones they are in already ticked. Tick another and they are
// ADDED to it (they keep the rest); untick one and they leave it; do both and that is a move. Underneath, in words, what
// will happen before anything does. One call (`admin_set_creator_markets`) writes the lot, keeps one home market, notifies
// the creator about markets they were added to, and writes the audit log. A market they MANAGE is never touched.
export function CreatorMarketsModal({ person, onClose, onDone }) {
  const { chapters } = useCommunity()
  const [current, setCurrent] = useState(null)
  const [picked, setPicked] = useState(new Set())
  const [home, setHome] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    supabase.from('community_members').select('community_id, role, is_home, communities!inner(kind)').eq('profile_id', person.id).eq('status', 'active')
      .then(({ data }) => {
        if (!alive) return
        const rows = (data || []).filter((r) => r.communities?.kind === 'chapter')
        const mine = rows.filter((r) => r.role === 'creator').map((r) => r.community_id)
        setCurrent({ creator: new Set(mine), managed: new Set(rows.filter((r) => r.role === 'manager').map((r) => r.community_id)) })
        setPicked(new Set(mine))
        setHome(rows.find((r) => r.is_home)?.community_id || mine[0] || null)
      })
    return () => { alive = false }
  }, [person.id])

  const open = useMemo(() => (chapters || []).filter((c) => !c.retired_at), [chapters])
  const name = (id) => open.find((c) => c.id === id)?.name || 'a market'
  const adds = current ? [...picked].filter((id) => !current.creator.has(id)) : []
  const leaves = current ? [...current.creator].filter((id) => !picked.has(id)) : []
  const homeNow = home && picked.has(home) ? home : [...picked][0] || null
  const [homeAtStart, setHomeAtStart] = useState(undefined)
  if (current && homeAtStart === undefined) setHomeAtStart(home)
  const changed = adds.length > 0 || leaves.length > 0 || homeNow !== homeAtStart

  function toggle(id) {
    setPicked((p) => {
      const n = new Set(p)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  async function save() {
    if (picked.size === 0) { notice('Pick at least one market. To take somebody out of the community, use Remove on their record.'); return }
    setBusy(true)
    const { data, error } = await supabase.rpc('admin_set_creator_markets', { p_profile: person.id, p_markets: [...picked], p_home: homeNow })
    setBusy(false)
    if (error) { notice(error.message); return }
    const a = data?.added || []
    const r = data?.removed || []
    toastSuccess([a.length ? `Added to ${a.join(' and ')}` : '', r.length ? `left ${r.join(' and ')}` : ''].filter(Boolean).join(', ') || 'Saved')
    onDone?.(data)
    onClose()
  }

  return (
    <Modal open onClose={onClose} title="Markets">
      <div className="space-y-5">
        <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-cloud/40 p-3">
          <Avatar src={person.photo_url} name={person.name} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{person.name}</p>
            <p className="text-xs text-smoke">Tick every market they make videos for. They see each one's rooms, briefs and challenges.</p>
          </div>
        </div>

        {current === null ? <div className="grid gap-2 sm:grid-cols-2">{[0, 1, 2, 3].map((i) => <span key={i} className="h-14 animate-pulse rounded-2xl bg-cloud" />)}</div> : (
          <div role="group" aria-label="Markets" className="grid gap-2 sm:grid-cols-2">
            {open.map((c, i) => {
              const on = picked.has(c.id)
              const managed = current.managed.has(c.id)
              const was = current.creator.has(c.id)
              return (
                <button key={c.id} type="button" aria-pressed={on} disabled={managed} onClick={() => toggle(c.id)}
                  className={cx('group relative flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-all duration-200 animate-rise disabled:cursor-not-allowed disabled:opacity-60',
                    on ? 'border-brand bg-brand text-white shadow-card' : 'border-gray-100 bg-white hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand/40')}
                  style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}>
                  <FlagTile codes={c.country_codes} kind="chapter" size="h-9 w-9" glyph="text-[20px]" title={c.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{c.name}</span>
                    <span className={cx('block truncate text-[11px]', on ? 'text-white/85' : 'text-smoke')}>
                      {managed ? 'They manage this one' : was && on ? 'In it now' : was ? 'Will leave' : on ? 'Will be added' : c.is_active ? 'Open' : 'Not open yet'}
                    </span>
                  </span>
                  <span className={cx('flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200', on ? 'border-white bg-white text-brand' : 'border-gray-200')}>
                    {on && <Icon name="check" className="h-4 w-4 animate-pop-in" strokeWidth={2.6} />}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {picked.size > 1 && (
          <div className="animate-rise">
            <p className="label">Home market</p>
            <p className="-mt-1 mb-2 text-[11px] text-smoke">Where they are listed first. Everything else is the same in every market they are in.</p>
            <div className="flex flex-wrap gap-1.5">
              {[...picked].map((id) => (
                <button key={id} type="button" aria-pressed={homeNow === id} onClick={() => setHome(id)}
                  className={cx('rounded-full px-3 py-1.5 text-xs font-bold transition-all duration-200', homeNow === id ? 'bg-brand text-white shadow-card' : 'bg-cloud text-smoke hoverable:hover:text-ink')}>
                  {homeNow === id && <Icon name="star" className="mr-1 inline h-3.5 w-3.5 -translate-y-px" />}{name(id)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* WHAT WILL HAPPEN, IN WORDS, BEFORE IT DOES. */}
        {(adds.length > 0 || leaves.length > 0) && (
          <div className="space-y-1.5 rounded-2xl bg-brand-tint/50 px-4 py-3 text-sm animate-rise">
            {adds.length > 0 && <p className="flex items-start gap-2 text-ink"><Icon name="plus" className="mt-0.5 h-4 w-4 shrink-0 text-brand" strokeWidth={2.4} />Added to <strong>{adds.map(name).join(', ')}</strong>, and told so.</p>}
            {leaves.length > 0 && <p className="flex items-start gap-2 text-ink"><Icon name="close" className="mt-0.5 h-4 w-4 shrink-0 text-red-500" strokeWidth={2.4} />Leaves <strong>{leaves.map(name).join(', ')}</strong>. Their videos, points and connections there are kept.</p>}
          </div>
        )}

        <button type="button" onClick={save} disabled={busy || current === null || !changed} className="btn-primary w-full justify-center disabled:opacity-50">
          {busy ? <Spinner className="h-4 w-4" /> : <Icon name="check" className="h-4 w-4" />}
          {adds.length && leaves.length ? 'Save the move' : adds.length ? `Add to ${adds.length === 1 ? name(adds[0]) : `${adds.length} markets`}` : 'Save'}
        </button>
      </div>
    </Modal>
  )
}

/** The block in a creator's admin sheet: the markets they are in, and the door to change them. Global admins only. */
export function CreatorMarketsBlock({ creator, onChanged }) {
  const { profile } = useAuth()
  const [rows, setRows] = useState(null)
  const [open, setOpen] = useState(false)
  const load = useCallback(async () => {
    if (!creator?.id) return
    const { data } = await supabase.from('community_members').select('community_id, role, is_home, communities!inner(name, kind, country_codes)').eq('profile_id', creator.id).eq('status', 'active')
    setRows((data || []).filter((r) => r.communities?.kind === 'chapter'))
  }, [creator?.id])
  useEffect(() => { load() }, [load])
  if (!isGlobalRole(profile?.platform_role) || !creator) return null
  return (
    <div className="border-t border-gray-100 pt-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">Markets</p>
        <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 px-3 py-1 text-xs font-semibold text-brand transition-all duration-200 hoverable:hover:-translate-y-px hoverable:hover:bg-brand hoverable:hover:text-white">
          <Icon name="globe" className="h-3.5 w-3.5" />Add or move
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {rows === null ? <span className="h-7 w-28 animate-pulse rounded-full bg-cloud" /> : rows.length === 0 ? <span className="text-xs text-smoke">Worldwide only</span> : rows.map((r) => (
          <span key={r.community_id} className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', r.is_home ? 'bg-brand-tint text-brand' : 'bg-cloud text-ink')}>
            <FlagTile codes={r.communities.country_codes} kind="chapter" size="h-5 w-5" glyph="text-[12px]" />{r.communities.name}
            {r.role === 'manager' && <span className="text-[10px] font-bold uppercase text-smoke">lead</span>}
            {r.is_home && <Icon name="star" className="h-3 w-3" />}
          </span>
        ))}
      </div>
      {open && <CreatorMarketsModal person={{ id: creator.id, name: creator.name, photo_url: creator.photo_url }} onClose={() => setOpen(false)} onDone={() => { load(); onChanged?.() }} />}
    </div>
  )
}
