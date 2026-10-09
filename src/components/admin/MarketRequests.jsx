import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Avatar, Skeleton, Spinner } from '../ui'
import Icon from '../Icon'
import FlagTile from '../network/FlagTile'
import { notice, promptText } from '../../lib/confirm'
import { toastSuccess } from '../../lib/toast'
import { cx, formatDate, timeAgo } from '../../lib/utils'

// MARKET REQUESTS, IN APPLICATIONS (10 Oct 2026, migration 378).
//
// Ethan: admins should be notified "perhaps under applications but highlighted that it's relating to just join another
// market, these can then be approved and they'll have access to multiple markets, or declined." So these are not
// applications to the community - the person is already a member - and the card says so first: where they are now, an
// arrow, where they want to be, and their reason. Approving ADDS the market (they keep the ones they have); declining
// asks for a sentence, which is what the creator reads. On 10 Oct two had been waiting five and one days, because the
// notice linked to Global settings.
export function usePendingMarketRequests() {
  const [n, setN] = useState(null)
  const load = useCallback(async () => {
    const { count } = await supabase.from('market_join_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending')
    setN(count ?? 0)
  }, [])
  useEffect(() => { load() }, [load])
  return [n, load]
}

export default function MarketRequests({ onChanged }) {
  const [rows, setRows] = useState(null)
  const [markets, setMarkets] = useState({})
  const [busy, setBusy] = useState(null)
  const [showDone, setShowDone] = useState(false)

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 45 * 864e5).toISOString()
    const [{ data: req }, { data: comms }] = await Promise.all([
      supabase.from('market_join_requests')
        .select('id, community_id, profile_id, note, status, created_at, decided_at, decision_note, challenge_id, profiles:profile_id(id, name, photo_url, country, city, instagram_url, tiktok_url, is_vip, status)')
        .or(`status.eq.pending,decided_at.gte.${since}`)
        .order('created_at', { ascending: false }),
      supabase.from('communities').select('id, name, slug, country_codes, kind'),
    ])
    const byId = Object.fromEntries((comms || []).map((c) => [c.id, c]))
    const ids = [...new Set((req || []).map((r) => r.profile_id))]
    const { data: mem } = ids.length
      ? await supabase.from('community_members').select('profile_id, community_id, status, role').in('profile_id', ids).eq('status', 'active')
      : { data: [] }
    const now = {}
    for (const m of mem || []) if (byId[m.community_id]?.kind === 'chapter' && m.role === 'creator') (now[m.profile_id] = now[m.profile_id] || []).push(byId[m.community_id])
    setMarkets({ byId, now })
    setRows(req || [])
  }, [])
  useEffect(() => { load() }, [load])

  async function decide(r, accept) {
    let reason = null
    if (!accept) {
      reason = await promptText(`Tell ${r.profiles?.name || 'them'} why, in a sentence. They read exactly this.`, {
        title: `Decline ${markets.byId?.[r.community_id]?.name || 'this market'}`, confirmLabel: 'Decline', placeholder: 'For example: Spain is full for this month; ask again in November.',
      })
      if (reason === null) return
      if (!reason.trim()) { notice('Give a reason, so they know why.'); return }
    }
    setBusy(r.id)
    const { error } = await supabase.rpc('decide_join_request', { p_request: r.id, p_accept: accept, p_reason: reason })
    setBusy(null)
    if (error) { notice(error.message); return }
    toastSuccess(accept ? `${r.profiles?.name || 'They'} can now use ${markets.byId?.[r.community_id]?.name || 'the market'} as well.` : 'Declined. They have been told why.')
    await load()
    onChanged?.()
  }

  if (rows === null) return <div className="space-y-3"><Skeleton className="h-36 w-full rounded-card" /><Skeleton className="h-36 w-full rounded-card" /></div>
  const pending = rows.filter((r) => r.status === 'pending')
  const done = rows.filter((r) => r.status !== 'pending')

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-card border border-brand/20 bg-brand-tint/50 px-4 py-3.5 animate-rise">
        <Icon name="globe" className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
        <p className="text-sm leading-relaxed text-ink">
          <strong>Creators already in the community, asking to join another market as well.</strong>{' '}
          <span className="text-smoke">Approving adds the market: they keep the ones they are in. To place someone yourself, use Markets on their row in Creators.</span>
        </p>
      </div>

      {pending.length === 0 ? (
        <div className="rounded-card border border-dashed border-gray-200 bg-white px-6 py-12 text-center animate-rise">
          <Icon name="check" className="mx-auto h-8 w-8 text-brand" />
          <p className="mt-2 text-sm font-semibold text-ink">No market requests waiting</p>
          <p className="mt-1 text-xs text-smoke">A creator asks from their menu or the Worldwide page; it lands here and in your notifications.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {pending.map((r, i) => {
            const p = r.profiles || {}
            const want = markets.byId?.[r.community_id]
            const have = markets.now?.[r.profile_id] || []
            return (
              <li key={r.id} className="relative overflow-hidden rounded-card border border-gray-100 bg-white p-4 shadow-card transition-all duration-300 animate-rise hoverable:hover:-translate-y-0.5 hoverable:hover:shadow-lift sm:p-5" style={{ animationDelay: `${i * 60}ms` }}>
                <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-brand to-brand-light" />
                <div className="flex flex-wrap items-start gap-3">
                  <Link to={`/profile/${p.id}`} className="group flex min-w-0 flex-1 items-center gap-3">
                    <Avatar src={p.photo_url} name={p.name} size="md" className="transition-transform duration-200 group-hover:scale-105" />
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-bold text-ink group-hover:text-brand">{p.name}</span>
                      <span className="block truncate text-xs text-smoke">{[p.city, p.country].filter(Boolean).join(', ') || 'No location on profile'} · {timeAgo(r.created_at)}</span>
                    </span>
                  </Link>
                  <span className="shrink-0 rounded-full bg-brand px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide text-white">Another market</span>
                </div>

                {/* WHERE THEY ARE, WHERE THEY WANT TO BE. */}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {have.length ? have.map((m) => (
                    <span key={m.id} className="inline-flex items-center gap-1.5 rounded-full bg-cloud px-2.5 py-1 text-xs font-semibold text-ink"><FlagTile codes={m.country_codes} kind="chapter" size="h-5 w-5" glyph="text-[12px]" />{m.name}</span>
                  )) : <span className="rounded-full bg-cloud px-2.5 py-1 text-xs font-semibold text-smoke">Worldwide only</span>}
                  <Icon name="chevronRight" className="h-4 w-4 text-brand" strokeWidth={2.4} />
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-tint px-2.5 py-1 text-xs font-bold text-brand ring-1 ring-brand/20"><FlagTile codes={want?.country_codes} kind="chapter" size="h-5 w-5" glyph="text-[12px]" />+ {want?.name || 'a market'}</span>
                </div>
                {r.note && <blockquote className="mt-3 rounded-xl bg-cloud/60 px-3.5 py-2.5 text-sm italic leading-relaxed text-ink">"{r.note}"</blockquote>}
                {p.is_vip && <p className="mt-2 text-xs font-semibold text-amber-700">They are on a paid programme now; their market is set in VIP tools.</p>}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button type="button" disabled={busy === r.id} onClick={() => decide(r, true)} className="btn-primary !py-2 text-sm disabled:opacity-50">
                    {busy === r.id ? <Spinner className="h-4 w-4" /> : <Icon name="check" className="h-4 w-4" />}Add {want?.name || 'market'}
                  </button>
                  <button type="button" disabled={busy === r.id} onClick={() => decide(r, false)} className="btn-secondary !py-2 text-sm disabled:opacity-50"><Icon name="close" className="h-4 w-4" />Decline</button>
                  <Link to={`/messages?to=${p.id}`} className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-smoke transition-colors hover:text-brand"><Icon name="chat" className="h-4 w-4" />Message</Link>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {done.length > 0 && (
        <section>
          <button type="button" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone} className="flex items-center gap-1.5 px-1 text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400 hover:text-ink">
            <Icon name="chevronRight" className={cx('h-3.5 w-3.5 transition-transform duration-200', showDone && 'rotate-90')} />Decided in the last 45 days ({done.length})
          </button>
          {showDone && (
            <ul className="mt-2 divide-y divide-gray-50 rounded-card border border-gray-100 bg-white shadow-card animate-rise">
              {done.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar src={r.profiles?.photo_url} name={r.profiles?.name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{r.profiles?.name} <span className="font-normal text-smoke">to {markets.byId?.[r.community_id]?.name}</span></span>
                    {r.decision_note && <span className="block truncate text-xs text-smoke">{r.decision_note}</span>}
                  </span>
                  <span className={cx('shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold', r.status === 'accepted' ? 'bg-brand-tint text-brand' : 'bg-cloud text-smoke')}>{r.status === 'accepted' ? 'Added' : 'Declined'}</span>
                  <span className="hidden shrink-0 text-xs text-gray-400 sm:block">{r.decided_at ? formatDate(r.decided_at) : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
