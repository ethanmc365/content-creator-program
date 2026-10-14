import { useEffect, useMemo, useState } from 'react'
import { fetchAll } from '../../lib/fetchAll'
import { marketSplit, NO_MARKET } from '../../lib/marketSplit'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { formatViews, cx, timeAgo } from '../../lib/utils'
import Segmented from '../network/Segmented'
import FlagTile from '../network/FlagTile'
import { Avatar, Skeleton } from '../ui'
import { marketsApi } from '../../api/markets'

// PARTICIPATION BY MARKET.
//
// A worldwide challenge is only worth running worldwide if every market shows up; this is the card that says which ones
// did.
//
// ONE HUE, ONE AXIS. The bars compare a single measure across markets (a
// magnitude job), so every bar is the brand orange and the market is named on
// the row - colour carries no identity here, and the toggle swaps which
// measure is drawn rather than stacking four measures on two scales. The
// numbers under it are the table view of the same thing.

const METRICS = [
  { value: 'creators', label: 'Creators' },
  { value: 'entries', label: 'Entries' },
  { value: 'views', label: 'Views' },
  { value: 'points', label: 'Points' },
]

const pct = (x) => (x == null ? '-' : `${Math.round(x * 100)}%`)

export default function MarketSplit({ subs = [], results = [], markets = [], scoring }) {
  const [metric, setMetric] = useState('creators')
  const [openMarket, setOpenMarket] = useState(null)
  const [homes, setHomes] = useState(null) // [{ community_id, profile_id, profiles }]

  // Every home placement, once. ~130 rows today; `fetchAll` so the count stays
  // true past the 1000-row ceiling.
  useEffect(() => {
    let alive = true
    fetchAll(
      () => marketsApi
        .communityMembers()
        .select('community_id, profile_id, profiles:profile_id(id, name, photo_url, last_seen_at, status, is_admin, is_test, is_vip)')
        .eq('is_home', true)
        .eq('status', 'active'),
      { orderBy: ['community_id', 'profile_id'] },
    ).then(({ data }) => { if (alive) setHomes(data ?? []) })
    return () => { alive = false }
  }, [])

  const split = useMemo(() => {
    if (!homes) return null
    const homeOf = new Map(homes.map((h) => [h.profile_id, h.community_id]))
    // The denominator is the market's approved creators - not admins, not the
    // two QA accounts - which is who the challenge was open to.
    const membersOf = new Map()
    for (const h of homes) {
      const p = h.profiles
      if (!p || p.status !== 'active' || p.is_admin || p.is_test) continue
      membersOf.set(h.community_id, (membersOf.get(h.community_id) || 0) + 1)
    }
    const pointsOf = new Map(results.map((r) => [r.creator_id, Number(r.final_views) || 0]))
    const real = markets.filter((m) => m.kind !== 'network' && m.slug !== 'worldwide' && m.is_active !== false && !m.retired_at)
    return marketSplit({ subs, homeOf, markets: real, membersOf, pointsOf })
  }, [homes, subs, results, markets])

  // The bars grow from zero once the numbers are in and again when the measure
  // changes, so the switch reads as the data moving. NOT on every refresh: the
  // page re-reads on each sync, and a live update should slide the bars from
  // where they are, which the width transition already does.
  const ready = !!split
  const [grownFor, setGrownFor] = useState(null)
  useEffect(() => {
    if (!ready) return undefined
    const t = setTimeout(() => setGrownFor(metric), 60)
    return () => clearTimeout(t)
  }, [ready, metric])
  const grown = grownFor === metric

  const metrics = scoring === 'points' ? METRICS : METRICS.filter((m) => m.value !== 'points')

  if (!split) {
    return (
      <section className="card mb-10" aria-busy="true">
        <Skeleton className="h-6 w-56" />
        <div className="mt-6 space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
      </section>
    )
  }

  const { rows, totals } = split
  const max = Math.max(1, ...rows.map((r) => r[metric] || 0))
  const lead = rows.find((r) => r.entries > 0 && r.id !== NO_MARKET)
  const fmt = (r) => (metric === 'views' ? formatViews(r.views) : Number(r[metric] || 0).toLocaleString())
  const pointsTotal = rows.reduce((n, r) => n + r.points, 0)
  const shareOf = (r) => (metric === 'creators' ? r.shareCreators : metric === 'entries' ? r.shareEntries : metric === 'views' ? r.shareViews
    : (pointsTotal ? r.points / pointsTotal : 0))

  return (
    <section className="card mb-10 animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-semibold">Participation by market</h2>
          <p className="mt-0.5 text-sm text-smoke">
            {totals.marketsTakingPart} of {rows.filter((r) => r.id !== NO_MARKET).length} markets have entered
            {lead ? <> · <span className="font-semibold text-ink">{lead.name}</span> leads with {pct(lead.shareEntries)} of entries</> : null}.
            Each creator counts in their home market. <span className="font-semibold text-brand">Press a market to see who has and has not posted.</span>
          </p>
        </div>
        <Segmented value={metric} onChange={setMetric} options={metrics} size="sm" label="Measure" />
      </div>

      {/* ---------- The bars ---------- */}
      <ul className="mt-6 space-y-2.5">
        {rows.map((r, i) => {
          const w = (r[metric] || 0) / max
          const none = !r[metric]
          return (
            <li
              key={r.id}
              role="button"
              tabIndex={0}
              onClick={() => setOpenMarket(r)}
              onKeyDown={(e) => { if (e.key === 'Enter') setOpenMarket(r) }}
              className="group grid cursor-pointer grid-cols-[8.5rem_1fr_4.5rem] items-center gap-3 rounded-lg transition-colors hover:bg-cloud/50 sm:grid-cols-[11rem_1fr_6rem]"
              title={`${r.name}: ${r.creators} creators, ${r.entries} entries, ${formatViews(r.views)} views${r.members ? `, ${pct(r.rate)} of ${r.members} members took part` : ''}`}
            >
              <span className="flex min-w-0 items-center gap-2">
                {r.codes.length > 0
                  ? <FlagTile codes={r.codes} size="h-6 w-6" />
                  // A creator with no home market is somebody everywhere and nowhere: the globe, not an empty square
                  // (the team).
                  : <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-cloud text-sm leading-none" aria-hidden>🌍</span>}
                <span className={cx('truncate text-sm font-medium', none ? 'text-smoke' : 'text-ink')}>{r.name}</span>
              </span>
              <span className="relative h-7 overflow-hidden rounded-lg bg-cloud/70">
                <span
                  className="absolute inset-y-0 left-0 rounded-lg bg-gradient-to-r from-brand to-brand-light transition-[width] duration-700 ease-out group-hover:brightness-110"
                  style={{ width: grown ? `${Math.max(none ? 0 : 2, w * 100)}%` : '0%', transitionDelay: `${Math.min(i, 8) * 55}ms` }}
                />
                {!none && (
                  <span
                    className={cx(
                      'absolute inset-y-0 flex items-center text-[11px] font-semibold tabular-nums transition-opacity duration-500',
                      w > 0.22 ? 'left-2.5 text-white' : 'text-smoke',
                      grown ? 'opacity-100' : 'opacity-0',
                    )}
                    style={w > 0.22 ? undefined : { left: `calc(${w * 100}% + 0.5rem)` }}
                  >
                    {pct(shareOf(r))}
                  </span>
                )}
              </span>
              <span className={cx('text-right text-sm font-bold tabular-nums', none ? 'text-smoke/60' : 'text-ink')}>{fmt(r)}</span>
            </li>
          )
        })}
      </ul>

      {/* ---------- The numbers ---------- */}
      <div className="-mx-5 mt-7 overflow-x-auto px-5 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-[11px] font-semibold uppercase tracking-wide text-smoke">
              <th className="py-2 pr-4">Market</th>
              <th className="py-2 pr-4 text-right">Creators</th>
              <th className="py-2 pr-4 text-right">Took part</th>
              <th className="py-2 pr-4 text-right">Entries</th>
              <th className="py-2 pr-4 text-right">Per creator</th>
              <th className="py-2 pr-4 text-right">Views</th>
              <th className="py-2 pr-4 text-right">Per entry</th>
              {scoring === 'points' && <th className="py-2 text-right">Points</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={cx('border-b border-gray-50 last:border-0', !r.entries && 'text-smoke')}>
                <td className="py-2.5 pr-4 font-semibold"><button type="button" onClick={() => setOpenMarket(r)} className="hover:text-brand hover:underline">{r.name}</button></td>
                <td className="py-2.5 pr-4 text-right tabular-nums">{r.creators}</td>
                <td className="py-2.5 pr-4 text-right tabular-nums">
                  {r.members ? <>{pct(r.rate)} <span className="text-xs text-smoke">of {r.members}</span></> : '-'}
                </td>
                <td className="py-2.5 pr-4 text-right tabular-nums">{r.entries}</td>
                <td className="py-2.5 pr-4 text-right tabular-nums">{r.creators ? r.perCreator.toFixed(1) : '-'}</td>
                <td className="py-2.5 pr-4 text-right font-semibold tabular-nums text-brand">{r.views ? formatViews(r.views) : '-'}</td>
                <td className="py-2.5 pr-4 text-right tabular-nums">{r.perEntry ? formatViews(r.perEntry) : '-'}</td>
                {scoring === 'points' && <td className="py-2.5 text-right tabular-nums">{r.points || '-'}</td>}
              </tr>
            ))}
            <tr className="border-t border-gray-200 font-semibold">
              <td className="py-2.5 pr-4">All markets</td>
              <td className="py-2.5 pr-4 text-right tabular-nums">{totals.creators}</td>
              <td className="py-2.5 pr-4 text-right tabular-nums text-smoke">
                {(() => {
                  const m = rows.reduce((n, r) => n + (r.members || 0), 0)
                  return m ? <>{pct(totals.creators / m)} <span className="text-xs font-normal">of {m}</span></> : '-'
                })()}
              </td>
              <td className="py-2.5 pr-4 text-right tabular-nums">{totals.entries}</td>
              <td className="py-2.5 pr-4 text-right tabular-nums">{totals.creators ? (totals.entries / totals.creators).toFixed(1) : '-'}</td>
              <td className="py-2.5 pr-4 text-right tabular-nums text-brand">{formatViews(totals.views)}</td>
              <td className="py-2.5 pr-4" />
              {scoring === 'points' && <td className="py-2.5 text-right tabular-nums">{pointsTotal}</td>}
            </tr>
          </tbody>
        </table>
      </div>
      {openMarket && (
        <MarketPeople market={openMarket} homes={homes} subs={subs} results={results} scoring={scoring} onClose={() => setOpenMarket(null)} />
      )}
    </section>
  )
}

// ONE MARKET'S CREATORS IN THIS CHALLENGE (14 Oct 2026). "Clicking on that, I want to see each creator that has
// participated and the ones that haven't, see how many videos they posted, and even what creators are online and haven't
// posted." Every approved home member of the market, with their videos, views and points here, when they were last in
// the app, and a Message button - so the follow-up is one press from the number that prompted it.
const ONLINE_MS = 15 * 60000
const TODAY_MS = 24 * 3600000
function MarketPeople({ market, homes, subs, results, scoring, onClose }) {
  const [filter, setFilter] = useState('all')
  const [now] = useState(() => Date.now())
  const people = useMemo(() => {
    const byCreator = new Map()
    for (const s of subs) {
      const x = byCreator.get(s.creator_id) || { videos: 0, views: 0 }
      x.videos += 1
      x.views += Number(s.logged_views) || 0
      byCreator.set(s.creator_id, x)
    }
    const pts = new Map(results.map((r) => [r.creator_id, Number(r.final_views) || 0]))
    const rank = new Map(results.map((r) => [r.creator_id, r.rank]))
    const inMarket = market.id === NO_MARKET
      ? [...byCreator.keys()].filter((id) => !(homes || []).some((h) => h.profile_id === id)).map((id) => ({ id, name: subs.find((s) => s.creator_id === id)?.profiles?.name || 'Creator' }))
      : (homes || []).filter((h) => h.community_id === market.id && h.profiles && h.profiles.status === 'active' && !h.profiles.is_admin && !h.profiles.is_test && !h.profiles.is_vip)
        .map((h) => h.profiles)
    return inMarket.map((p) => {
      const seen = p.last_seen_at ? now - Date.parse(p.last_seen_at) : Infinity
      return { ...p, ...(byCreator.get(p.id) || { videos: 0, views: 0 }), points: pts.get(p.id) ?? null, rank: rank.get(p.id) ?? null, online: seen < ONLINE_MS, today: seen < TODAY_MS }
    }).sort((a, b) => (b.videos - a.videos) || (b.views - a.views) || (Number(b.today) - Number(a.today)) || String(a.name).localeCompare(String(b.name)))
  }, [market, homes, subs, results, now])
  const counts = {
    all: people.length,
    posted: people.filter((p) => p.videos > 0).length,
    not: people.filter((p) => p.videos === 0).length,
    active: people.filter((p) => p.videos === 0 && p.today).length,
  }
  const shown = people.filter((p) => (filter === 'posted' ? p.videos > 0 : filter === 'not' ? p.videos === 0 : filter === 'active' ? p.videos === 0 && p.today : true))
  const FILTERS = [['all', 'Everyone'], ['posted', 'Posted'], ['not', 'Not posted'], ['active', 'In the app today, not posted']]
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/40 animate-page-in sm:items-center sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-lift animate-pop-in sm:rounded-3xl">
        <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
          {market.codes?.length ? <FlagTile codes={market.codes} size="h-8 w-8" /> : <span className="text-2xl">🌍</span>}
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold">{market.name}</h2>
            <p className="text-xs text-smoke">{counts.posted} of {counts.all} have posted · {subs.filter((s) => people.some((p) => p.id === s.creator_id)).length} videos</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2 text-smoke hover:bg-cloud hover:text-ink">✕</button>
        </div>
        <div className="flex gap-1 overflow-x-auto px-5 py-3 scrollbar-none">
          {FILTERS.map(([k, label]) => (
            <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k}
              className={cx('shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors', filter === k ? 'bg-brand text-white' : 'bg-cloud text-smoke hover:text-ink')}>
              {label} <span className="ml-0.5 tabular-nums opacity-80">{counts[k]}</span>
            </button>
          ))}
        </div>
        <ul key={filter} className="min-h-0 flex-1 divide-y divide-gray-50 overflow-y-auto px-5 pb-4 animate-tab-in">
          {shown.length === 0 && <li className="py-10 text-center text-sm text-smoke">Nobody here.</li>}
          {shown.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-3">
              <span className="relative shrink-0">
                <Avatar src={p.photo_url} name={p.name || '?'} size="sm" />
                {p.online && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white" title="In the app now" />}
              </span>
              <div className="min-w-0 flex-1">
                <Link to={`/profile/${p.id}`} className="block truncate text-sm font-semibold hover:text-brand">{p.name}</Link>
                <p className="truncate text-xs text-smoke">
                  {p.videos > 0
                    ? `${p.videos} ${p.videos === 1 ? 'video' : 'videos'} · ${formatViews(p.views)} views${p.rank ? ` · #${p.rank}` : ''}${scoring === 'points' && p.points != null ? ` · ${p.points} pts` : ''}`
                    : 'No video yet'}
                  {p.online ? ' · online now' : p.last_seen_at ? ` · seen ${timeAgo(p.last_seen_at)}` : ''}
                </p>
              </div>
              <Link to={`/messages?to=${p.id}`} className={cx('shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors', p.videos === 0 ? 'bg-brand text-white' : 'border border-gray-200 text-smoke hover:border-brand hover:text-brand')}>
                Message
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  )
}
