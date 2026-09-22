import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { fetchAll } from '../../lib/fetchAll'
import { marketSplit, NO_MARKET } from '../../lib/marketSplit'
import { formatViews, cx } from '../../lib/utils'
import Segmented from '../network/Segmented'
import FlagTile from '../network/FlagTile'
import { Skeleton } from '../ui'

// PARTICIPATION BY MARKET (22 Sep 2026).
//
// Ethan: "I want to see the participation split between the markets, for
// example a graph and numbers like how many submitted from the UK market and
// from Spain." A worldwide challenge is only worth running worldwide if every
// market shows up; this is the card that says which ones did.
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
  const [homes, setHomes] = useState(null) // [{ community_id, profile_id, profiles }]

  // Every home placement, once. ~130 rows today; `fetchAll` so the count stays
  // true past the 1000-row ceiling.
  useEffect(() => {
    let alive = true
    fetchAll(
      () => supabase
        .from('community_members')
        .select('community_id, profile_id, profiles:profile_id(status, is_admin, is_test)')
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
            Each creator counts in their home market.
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
              className="group grid grid-cols-[8.5rem_1fr_4.5rem] items-center gap-3 sm:grid-cols-[11rem_1fr_6rem]"
              title={`${r.name}: ${r.creators} creators, ${r.entries} entries, ${formatViews(r.views)} views${r.members ? `, ${pct(r.rate)} of ${r.members} members took part` : ''}`}
            >
              <span className="flex min-w-0 items-center gap-2">
                {r.codes.length > 0
                  ? <FlagTile codes={r.codes} size="h-6 w-6" />
                  : <span className="h-6 w-6 shrink-0 rounded-md bg-cloud" />}
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
                <td className="py-2.5 pr-4 font-semibold">{r.name}</td>
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
    </section>
  )
}
