import { useEffect, useMemo, useRef, useState } from 'react'
import { confirm } from '../../lib/confirm'
import { supabase } from '../../lib/supabase'
import { Avatar, Badge, EmptyState, PageHeader, Skeleton, StatCard, Select } from '../../components/ui'
import Icon from '../../components/Icon'
import { formatDate, downloadCsv } from '../../lib/utils'
import { useMarkets, resolveMarketForCountryName } from '../../lib/markets'
import Reveal from '../../components/network/Reveal'
import { referralStage } from '../../lib/referrals'

// Admin view of referrals. Two sources:
//  1. Creators who joined through someone's invite link (profiles.referred_by) -
//     grouped by the creator who referred them, each shown with the exact stage
//     the referred person has reached (finishing signup / awaiting review /
//     joined but not posted / counted). A referral only COUNTS once the referred
//     creator submits a video to a challenge - see lib/referrals.js.
//  2. Manual leads a creator typed in (the referrals table) - follow-up list.
const STATUSES = ['new', 'contacted', 'joined', 'declined']
const STATUS_TONE = { new: 'amber', contacted: 'light', joined: 'green', declined: 'grey' }

function StageBadge({ stage }) {
  return <Badge tone={stage.tone} title={stage.hint}>{stage.label}</Badge>
}

export default function AdminReferrals() {
  const [referrals, setReferrals] = useState([])
  const [referrerNames, setReferrerNames] = useState({})
  const [groups, setGroups] = useState([]) // [{ referrer, people:[{...profile, stage}], counted }]
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [market, setMarket] = useState('')
  const markets = useMarkets()

  async function load() {
    const [{ data: refs }, { data: joinedProfiles }] = await Promise.all([
      supabase.from('referrals').select('*').order('created_at', { ascending: false }),
      supabase
        .from('profiles')
        .select('id, name, photo_url, created_at, status, onboarded, country, country_code, referred_by, referrer:referred_by(id, name, photo_url, country, country_code)')
        .not('referred_by', 'is', null)
        .order('created_at', { ascending: false }),
    ])
    setReferrals(refs ?? [])

    // Which referred creators have actually submitted a challenge video? That is
    // the only thing that makes a referral "count".
    const joined = joinedProfiles ?? []
    const joinedIds = joined.map((p) => p.id)
    let submitted = new Set()
    if (joinedIds.length) {
      const { data: subs } = await supabase.from('submissions').select('creator_id').in('creator_id', joinedIds)
      submitted = new Set((subs ?? []).map((s) => s.creator_id))
    }

    // Group referred creators under the person who referred them.
    const byReferrer = new Map()
    joined.forEach((p) => {
      const rid = p.referred_by
      if (!byReferrer.has(rid)) byReferrer.set(rid, { referrer: p.referrer, people: [], counted: 0 })
      const g = byReferrer.get(rid)
      const stage = referralStage(p, submitted.has(p.id))
      if (stage.key === 'counted') g.counted += 1
      g.people.push({ ...p, stage })
    })
    // Sort each group's people by stage progress (counted first), and groups by
    // most counted referrals.
    const list = [...byReferrer.values()].map((g) => ({
      ...g,
      people: g.people.sort((a, b) => b.stage.step - a.stage.step || new Date(b.created_at) - new Date(a.created_at)),
    }))
    list.sort((a, b) => b.counted - a.counted || b.people.length - a.people.length)
    setGroups(list)

    // Referrer names for the manual leads.
    const ids = [...new Set((refs ?? []).map((r) => r.referrer_id).filter(Boolean))]
    if (ids.length) {
      const { data: people } = await supabase.from('profiles').select('id, name').in('id', ids)
      setReferrerNames(Object.fromEntries((people ?? []).map((p) => [p.id, p.name])))
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function setStatus(referral, status) {
    await supabase.from('referrals').update({ status }).eq('id', referral.id)
    load()
  }

  // Long-press a lead to delete it (tidy up follow-ups).
  const pressTimer = useRef(null)
  async function deleteReferral(r) {
    if (!await confirm(`Delete the lead "${r.referred_name}"?`)) return
    setReferrals((prev) => prev.filter((x) => x.id !== r.id))
    await supabase.from('referrals').delete().eq('id', r.id)
  }
  const startPress = (r) => { pressTimer.current = setTimeout(() => deleteReferral(r), 550) }
  const cancelPress = () => clearTimeout(pressTimer.current)

  // A REFERRAL BELONGS TO THE MARKET OF THE PERSON WHO MADE IT.
  //
  // Not the person who was referred: a UK creator bringing in a friend in Spain
  // is still a UK creator's referral, and it is the UK manager who follows it
  // up. Both are shown on the row so the second case is never a surprise.
  const marketName = (p) => {
    const r = resolveMarketForCountryName(p?.country, markets)
    return r.market?.name ?? (r.outcome === 'worldwide' ? 'Worldwide' : 'Unknown')
  }

  const tabs = useMemo(() => {
    const tally = {}
    for (const g of groups) tally[marketName(g.referrer)] = (tally[marketName(g.referrer)] ?? 0) + g.people.length
    return Object.entries(tally).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, markets])

  // Searching matches EITHER end of a referral: you look up "who did Denisa
  // bring in" as often as "who brought this person in".
  const shownGroups = useMemo(() => {
    const q = search.trim().toLowerCase()
    return groups
      .filter((g) => !market || marketName(g.referrer) === market)
      .map((g) => {
        if (!q) return g
        if ((g.referrer?.name ?? '').toLowerCase().includes(q)) return g
        const people = g.people.filter((p) => (p.name ?? '').toLowerCase().includes(q))
        return people.length ? { ...g, people } : null
      })
      .filter(Boolean)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, search, market, markets])

  const shownLeads = useMemo(() => {
    const q = search.trim().toLowerCase()
    return referrals.filter((r) => {
      if (!q) return true
      return `${r.referred_name ?? ''} ${r.referred_contact ?? ''} ${referrerNames[r.referrer_id] ?? ''}`.toLowerCase().includes(q)
    })
  }, [referrals, search, referrerNames])

  const totalJoined = groups.reduce((n, g) => n + g.people.length, 0)
  const totalCounted = groups.reduce((n, g) => n + g.counted, 0)
  const inProgress = totalJoined - totalCounted

  // AN EXPORT IS WHAT IS ON SCREEN. Filtering to Spain and then exporting the
  // world is a quiet way to hand somebody the wrong file, so the market tab and
  // the search box apply here too - and the filename says which slice it is.
  function exportCsv() {
    const rows = [
      ...shownGroups.flatMap((g) =>
        g.people.map((p) => ({
          referred_name: p.name,
          referred_by: g.referrer?.name ?? '',
          market: marketName(g.referrer),
          contact: '',
          stage: p.stage.label,
          counts: p.stage.key === 'counted' ? 'Yes' : 'No',
          date: formatDate(p.created_at),
        }))
      ),
      ...(market ? [] : shownLeads.map((r) => ({
        referred_name: r.referred_name,
        referred_by: referrerNames[r.referrer_id] ?? '',
        market: '',
        contact: r.referred_contact,
        stage: `Lead: ${r.status}`,
        counts: 'No',
        date: formatDate(r.created_at),
      }))),
    ]
    const slug = market ? market.toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'all'
    downloadCsv(`tryp-referrals-${slug}-${new Date().toISOString().slice(0, 10)}.csv`, rows, [
      { key: 'referred_name', label: 'Referred creator' },
      { key: 'referred_by', label: 'Referred by' },
      { key: 'market', label: "Referrer's market" },
      { key: 'contact', label: 'Contact' },
      { key: 'stage', label: 'Stage' },
      { key: 'counts', label: 'Counts towards a reward' },
      { key: 'date', label: 'Date' },
    ])
  }

  return (
    <div className="page">
      <PageHeader
        back="/admin"
        title="Referrals"
        subtitle="Who your creators brought in, and exactly how far each referred creator has got. A referral only counts once they submit a video to a challenge."
        action={<button onClick={exportCsv} className="btn-secondary">Export CSV ↓</button>}
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Counted referrals" value={totalCounted} accent />
        <StatCard label="In progress" value={inProgress} />
        <StatCard label="Open leads" value={referrals.filter((r) => r.status === 'new' || r.status === 'contacted').length} />
      </div>

      {/* Market first, then search. Two rows, because they answer different
          questions and using one should not clear the other. */}
      {!loading && (groups.length > 0 || referrals.length > 0) && (
        <div className="mb-6 space-y-3">
          {tabs.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {[['', 'All', totalJoined], ...tabs.map(([m, n]) => [m, m, n])].map(([key, label, count]) => {
                const on = market === key
                return (
                  <button
                    key={key || 'all'}
                    type="button"
                    onClick={() => setMarket(key)}
                    aria-pressed={on}
                    className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 ${
                      on ? 'border-brand bg-brand text-white' : 'border-gray-200 bg-white text-smoke hover:-translate-y-0.5 hover:border-brand hover:text-brand'
                    }`}
                  >
                    {label}
                    <span className={on ? 'text-white/80' : 'text-gray-400'}>{count}</span>
                  </button>
                )
              })}
            </div>
          )}
          <input
            type="search"
            className="input sm:max-w-xs"
            placeholder="Search either name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search referrals"
          />
        </div>
      )}

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}</div>
      ) : groups.length === 0 && referrals.length === 0 ? (
        <EmptyState icon={<Icon name="share" className="h-7 w-7" />} title="No referrals yet" hint="When creators share their invite links or refer people, they'll show up here." />
      ) : (
        <div className="space-y-10">
          {shownGroups.length > 0 && (
            <section>
              <h2 className="mb-4 text-lg font-semibold">Who referred who</h2>
              <Reveal className="grid grid-cols-1 gap-5 lg:grid-cols-2" stagger={0.05}>
                {shownGroups.map((g, gi) => (
                  <div key={g.referrer?.id ?? `g${gi}`} className="card !p-6 transition-all duration-200 hover:shadow-lift">
                    {/* Referrer header */}
                    <div className="flex items-center gap-3 border-b border-gray-50 pb-4">
                      <Avatar src={g.referrer?.photo_url} name={g.referrer?.name} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{g.referrer?.name ?? 'A creator'}</p>
                        <p className="text-xs text-smoke">
                          {marketName(g.referrer)} · {g.people.length} referred · {g.counted} counted
                        </p>
                      </div>
                      {g.counted > 0 && (
                        <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-bold text-green-700">{g.counted} ✓</span>
                      )}
                    </div>

                    {/* The people they referred, each with their exact stage. */}
                    <ul className="mt-3 space-y-2.5">
                      {g.people.map((p) => (
                        <li key={p.id} className="flex items-center gap-3">
                          <Avatar src={p.photo_url} name={p.name} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{p.name}</p>
                            <p className="text-[11px] text-smoke">{p.stage.hint}</p>
                          </div>
                          <StageBadge stage={p.stage} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </Reveal>
            </section>
          )}

          {(groups.length > 0 && shownGroups.length === 0) && (
            <p className="rounded-card border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-smoke">
              No referrals match that.
            </p>
          )}

          {shownLeads.length > 0 && (
            <section>
              <h2 className="mb-1 text-lg font-semibold">Leads to follow up</h2>
              <p className="mb-4 text-xs text-smoke">People a creator flagged for the team to reach out to. Long-press a lead to delete it.</p>
              <div className="space-y-3">
                {shownLeads.map((r) => (
                  <div
                    key={r.id}
                    onTouchStart={() => startPress(r)} onTouchEnd={cancelPress} onTouchMove={cancelPress}
                    onMouseDown={() => startPress(r)} onMouseUp={cancelPress} onMouseLeave={cancelPress}
                    onContextMenu={(e) => { e.preventDefault(); deleteReferral(r) }}
                    className="card flex select-none flex-wrap items-center gap-4 !p-5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{r.referred_name}</p>
                      <p className="text-xs text-smoke">
                        {r.referred_contact || 'No contact'} · referred by {referrerNames[r.referrer_id] ?? 'a creator'} · {formatDate(r.created_at)}
                      </p>
                      {r.note && <p className="mt-1 text-xs italic text-smoke">"{r.note}"</p>}
                    </div>
                    <div onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
                      <Select
                        value={r.status}
                        onChange={(v) => setStatus(r, v)}
                        className="w-36"
                        ariaLabel={`Status for ${r.referred_name}`}
                        options={STATUSES.map((s) => ({ value: s, label: s }))}
                      />
                    </div>
                    <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
