import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Avatar, Skeleton } from '../ui'
import Icon from '../Icon'
import { cx, formatDate } from '../../lib/utils'
import { copyToClipboard, emailList } from '../../lib/clipboard'
import { toastSuccess } from '../../lib/toast'
import { notice } from '../../lib/confirm'
import { nf, useKindT } from '../../lib/vip'

// THE VIPS, AS A TAB OF THE CREATORS PAGE (1 Oct 2026). Ethan: "under creators there should also be a separate tab
// at the top in the same style showing VIP total and then VIP by market."
//
// The total across every market, then one card per market with the people in it. Only people the viewer may see come
// back (vip_members is fenced by vip_can_see), so a market lead who is not on the VIP access list gets an empty tab
// rather than a leak. A name opens the same admin popup as everywhere else, which is where the move back lives.
export default function VipCreatorsView({ creators, onOpen }) {
  const tr = useKindT()
  const [rows, setRows] = useState(null)
  const [programmes, setProgrammes] = useState(null)
  useEffect(() => {
    let alive = true
    Promise.all([
      supabase.from('vip_programmes').select('id, name, active').order('name'),
      supabase.from('vip_members').select('profile_id, programme_id, status, joined_on, source'),
    ]).then(([p, m]) => { if (alive) { setProgrammes(p.data || []); setRows(m.data || []) } })
    return () => { alive = false }
  }, [])

  const byId = useMemo(() => new Map((creators || []).map((c) => [c.id, c])), [creators])
  const groups = useMemo(() => (programmes || []).map((p) => {
    // ONLY PEOPLE THE ROSTER KNOWS (9 Oct 2026): the test VIP account and anybody who has not finished their profile are
    // not on the roster, so they are not in the counts either (the list hid them but the numbers still included them).
    const mine = (rows || []).filter((r) => r.programme_id === p.id && byId.has(r.profile_id))
    return {
      ...p,
      active: mine.filter((r) => r.status === 'active'),
      paused: mine.filter((r) => r.status === 'paused').length,
      left: mine.filter((r) => r.status === 'left').length,
    }
  }), [programmes, rows, byId])

  // EMAILS ON DEMAND (9 Oct 2026): "easily copy all the emails of the VIPs". One read when a button is pressed, never on load.
  async function copyEmails(ids) {
    const { data, error } = await supabase.rpc('admin_list_emails')
    if (error) { notice(error.message); return }
    const byUser = Object.fromEntries((data || []).map((r) => [r.id, r.email]))
    const list = ids.map((id) => byUser[id]).filter(Boolean)
    if (!list.length) { notice(tr('No email addresses found.')); return }
    if (await copyToClipboard(emailList(list))) toastSuccess(tr('Copied {n} email addresses.', { n: new Set(list).size }))
    else notice(tr('Could not copy. Try again.'))
  }

  if (rows === null) return <div className="space-y-3"><Skeleton className="h-28 w-full rounded-card" /><Skeleton className="h-52 w-full rounded-card" /></div>
  const total = groups.reduce((n, g) => n + g.active.length, 0)
  if (!groups.length) return <p className="rounded-card border border-dashed border-gray-200 px-6 py-12 text-center text-sm text-smoke">{tr('The VIP list is for the people who run the VIP programme.')}</p>

  return (
    <div className="space-y-6">
      <div className="brand-drift relative overflow-hidden rounded-card p-5 text-white shadow-card sm:p-6">
        <span aria-hidden className="survey-orb pointer-events-none absolute -right-10 -top-14 h-44 w-44 rounded-full bg-white/15 blur-2xl" />
        <p className="relative text-[11px] font-bold uppercase tracking-[0.16em] text-white/85">{tr('VIP creators in total')}</p>
        <p className="relative text-5xl font-bold tabular-nums leading-tight">{nf(total)}</p>
        <p className="relative text-sm text-white/90">{tr('across {n} markets', { n: groups.length })}</p>
        <button type="button" onClick={() => copyEmails(groups.flatMap((g) => g.active.map((r) => r.profile_id)))} className="relative mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3.5 py-1.5 text-xs font-bold text-white backdrop-blur transition-colors hoverable:hover:bg-white/30"><Icon name="envelope" className="h-3.5 w-3.5" />{tr('Copy emails ({n})', { n: total })}</button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {groups.map((g) => (
          <section key={g.id} className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
            <div className="flex items-center justify-between gap-3 border-b border-gray-100 bg-gradient-to-r from-brand-tint to-white px-4 py-3">
              <p className="flex items-center gap-2 text-[15px] font-bold text-ink"><Icon name="star" className="h-4 w-4 text-brand" />{g.name}</p>
              <div className="flex items-center gap-2">
                {g.active.length > 0 && <button type="button" onClick={() => copyEmails(g.active.map((r) => r.profile_id))} aria-label={tr('Copy emails ({n})', { n: g.active.length })} title={tr('Copy emails ({n})', { n: g.active.length })} className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-smoke shadow-sm transition-colors hoverable:hover:text-brand"><Icon name="envelope" className="h-4 w-4" /></button>}
                <p className="text-2xl font-bold tabular-nums text-brand">{nf(g.active.length)}</p>
              </div>
            </div>
            <p className="px-4 pt-2.5 text-[11px] text-smoke">{[g.paused ? tr('{n} paused', { n: g.paused }) : null, g.left ? tr('{n} moved back', { n: g.left }) : null].filter(Boolean).join(' · ') || tr('Everybody is active')}</p>
            <ul className="divide-y divide-gray-50 px-2 py-2">
              {g.active.length === 0 && <li className="px-2 py-5 text-center text-sm text-smoke">{tr('Nobody yet.')}</li>}
              {g.active.map((r) => {
                const c = byId.get(r.profile_id)
                if (!c) return null
                return (
                  <li key={r.profile_id}>
                    <button type="button" onClick={() => onOpen(c)} className={cx('flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hoverable:hover:bg-cloud')}>
                      <Avatar src={c.photo_url} name={c.name} size="sm" />
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{c.name}</span><span className="block truncate text-xs text-smoke">{tr('VIP since {d}', { d: formatDate(r.joined_on) })}</span></span>
                      <Icon name="chevronRight" className="h-4 w-4 text-gray-300" />
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
