import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, startOfWeek, subWeeks } from 'date-fns'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabase } from '../../../lib/supabase'
import { allRows } from '../../../lib/fetchAll'
import { Avatar, Badge, Skeleton, StatCard } from '../../../components/ui'
import Icon from '../../../components/Icon'
import { cx, downloadCsv, formatMoney, formatViews } from '../../../lib/utils'
import { REFERRAL_STAGES, referralStage, referralTerms } from '../../../lib/referrals'
import Segmented from '../../../components/network/Segmented'

// REFERRALS, AS A TAB OF ITS OWN (22 Sep 2026).
//
// Ethan: referrals were "only seen as a little piece on the analytics page"
// when you scrolled the Overview. He wanted a tab that tracks them properly:
// every step a referred person goes through, who brought them in, and how they
// took part once they arrived.
//
// Everything here is read from the same facts the voucher is paid on
// (`referralStage` mirrors `qualifying_referrals`, migration 242), so the
// funnel, the leaderboard and the rewards cannot disagree with each other.
//
// Scoped by the REFERRER'S market, the same rule the Referrals page uses: a UK
// creator bringing in a friend in Spain is the UK's referral.

const STEPS = [
  { key: 'clicks', label: 'Opened an invite link', hint: 'Every visit to a creator\'s invite link' },
  { key: 'signed', label: 'Signed up', hint: 'Created an account through a link' },
  { key: 'profile', label: 'Finished their profile', hint: 'Submitted it for review' },
  { key: 'accepted', label: 'Accepted', hint: 'Approved into the community' },
  { key: 'posted', label: 'Posted in a challenge', hint: 'This is when a referral counts' },
]

const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : 0)
const ordinal = (n) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`

// A bar that grows from zero once it is on screen, so the funnel reads as a
// flow rather than arriving fully drawn.
function GrowBar({ value, delay = 0, className = '' }) {
  const [w, setW] = useState(0)
  useEffect(() => {
    const t = requestAnimationFrame(() => setW(Math.max(0, Math.min(1, value))))
    return () => cancelAnimationFrame(t)
  }, [value])
  return (
    <div className="h-full w-full overflow-hidden rounded-full bg-gray-100">
      <div
        className={cx('h-full rounded-full bg-gradient-to-r from-brand to-brand-light transition-[width] duration-700 ease-out', className)}
        style={{ width: `${Math.max(w * 100, w > 0 ? 2 : 0)}%`, transitionDelay: `${delay}ms` }}
      />
    </div>
  )
}

// THE SECOND PASS (22 Sep 2026). Ethan: "there seem to be some issues with the
// charts there, please work on improving the UI for everything. Improve the
// referrals UI and functionality." What was wrong, measured on the page:
//   - "Referrals by week" was hand-drawn divs with no axis and no tooltip; the
//     "counted" bar was absolutely positioned and drew BESIDE its week's
//     sign-up bar rather than inside it; every other week had no label; and a
//     quiet quarter was twelve columns of mostly nothing. It is a real chart
//     now (recharts, one axis, both series side by side per week, a tooltip
//     on every week) over 8, 12 or 26 weeks.
//   - the funnel said how many reached each step and never how many were LOST
//     between two, which is the number a funnel exists to show.
//   - nothing could be narrowed: a range, one referrer's people, one stage.
//     All three are filters now, and they drive every figure on the page.

const RANGES = [
  { value: 'all', label: 'All time' },
  { value: '90', label: '90 days' },
  { value: '30', label: '30 days' },
]
const WEEK_SPANS = { 90: 13, 30: 8 }
const STAGE_ORDER = ['counted', 'joined', 'in_review', 'signing_up', 'declined']
const tooltipStyle = {
  borderRadius: 12, border: '1px solid #F1F1F2', fontFamily: 'Poppins',
  fontSize: 12, boxShadow: '0 4px 16px rgba(26,26,26,0.08)',
}

export default function Referrals({ market = '', memberRows = [], scopeLabel = 'Worldwide' }) {
  const [raw, setRaw] = useState(null)
  const [sort, setSort] = useState('stage')
  const [range, setRange] = useState('all')
  const [byReferrer, setByReferrer] = useState(null)
  const [stageFilter, setStageFilter] = useState('all')
  // BUILT FOR A LONG LIST (24 Sep 2026). Ethan: "whenever there are more
  // referrals, it becomes crowded." A search over both ends of a referral, and
  // the first fifteen rows with the rest one press away.
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [allReferrers, setAllReferrers] = useState(false)
  // Read once, at mount: the range is "the last N days from when you opened it".
  const [openedAt] = useState(() => Date.now())

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [people, referrers, rewards, settings] = await Promise.all([
        allRows(() => supabase.from('profiles')
          .select('id, name, photo_url, created_at, status, onboarded, country, referred_by, is_test')
          .not('referred_by', 'is', null)),
        allRows(() => supabase.from('profiles')
          .select('id, name, photo_url, country, referral_clicks, is_test')
          .gt('referral_clicks', 0)),
        allRows(() => supabase.from('rewards')
          .select('id, creator_id, amount, currency, status, created_at, referred_creator_id')
          .not('referred_creator_id', 'is', null)),
        supabase.from('app_settings').select('value').eq('key', 'referral_reward').maybeSingle(),
      ])
      const ids = people.map((p) => p.id)
      const [subs, results] = ids.length
        ? await Promise.all([
          allRows(() => supabase.from('submissions')
            .select('id, creator_id, challenge_id, logged_views, submitted_at').in('creator_id', ids)),
          allRows(() => supabase.from('results')
            .select('id, creator_id, challenge_id, rank').in('creator_id', ids)),
        ])
        : [[], []]
      // Referrers who have no clicks but did bring somebody in.
      const known = new Set(referrers.map((r) => r.id))
      const missing = [...new Set(people.map((p) => p.referred_by))].filter((id) => id && !known.has(id))
      const extra = missing.length
        ? (await supabase.from('profiles').select('id, name, photo_url, country, referral_clicks, is_test').in('id', missing)).data ?? []
        : []
      if (!alive) return
      setRaw({
        people: people.filter((p) => !p.is_test),
        referrers: [...referrers, ...extra].filter((r) => !r.is_test),
        rewards, subs, results,
        terms: referralTerms(settings?.data?.value),
      })
    })()
    return () => { alive = false }
  }, [])

  const inMarket = useMemo(() => {
    if (!market) return null
    return new Set(memberRows.filter((r) => r.community_id === market).map((r) => r.profile_id))
  }, [market, memberRows])

  const data = useMemo(() => {
    if (!raw) return null
    const keep = (id) => !inMarket || inMarket.has(id)
    const since = range === 'all' ? null : openedAt - Number(range) * 86_400_000
    const inRange = (d) => !since || (d && new Date(d).getTime() >= since)
    const referrerById = new Map(raw.referrers.map((r) => [r.id, r]))
    const subsBy = new Map()
    for (const s of raw.subs) (subsBy.get(s.creator_id) ?? subsBy.set(s.creator_id, []).get(s.creator_id)).push(s)
    const bestRank = new Map()
    for (const r of raw.results) {
      if (r.rank == null) continue
      if (!bestRank.has(r.creator_id) || r.rank < bestRank.get(r.creator_id)) bestRank.set(r.creator_id, r.rank)
    }

    const people = raw.people
      .filter((p) => keep(p.referred_by) && inRange(p.created_at))
      .map((p) => {
        const mine = subsBy.get(p.id) ?? []
        const stage = referralStage(p, mine.length > 0)
        const dates = mine.map((s) => s.submitted_at).filter(Boolean).sort()
        return {
          ...p,
          stage,
          referrer: referrerById.get(p.referred_by) ?? null,
          entries: mine.length,
          challenges: new Set(mine.map((s) => s.challenge_id)).size,
          views: mine.reduce((sum, s) => sum + (Number(s.logged_views) || 0), 0),
          firstPost: dates[0] ?? null,
          lastPost: dates[dates.length - 1] ?? null,
          bestRank: bestRank.get(p.id) ?? null,
        }
      })

    const clicks = raw.referrers.filter((r) => keep(r.id)).reduce((s, r) => s + (Number(r.referral_clicks) || 0), 0)
    const counts = {
      clicks,
      signed: people.length,
      profile: people.filter((p) => p.onboarded || p.stage.step >= 2).length,
      accepted: people.filter((p) => p.stage.step >= 3).length,
      posted: people.filter((p) => p.stage.key === 'counted').length,
    }

    const rewards = raw.rewards.filter((r) => keep(r.creator_id) && inRange(r.created_at))
    const rewardValue = rewards.reduce((acc, r) => {
      acc[r.currency || 'EUR'] = (acc[r.currency || 'EUR'] || 0) + Number(r.amount || 0)
      return acc
    }, {})

    // One row per referrer, with where they are towards their next voucher.
    const board = new Map()
    for (const r of raw.referrers.filter((x) => keep(x.id))) {
      board.set(r.id, { referrer: r, clicks: Number(r.referral_clicks) || 0, signed: 0, accepted: 0, posted: 0, views: 0, vouchers: 0 })
    }
    for (const p of people) {
      const row = board.get(p.referred_by)
      if (!row) continue
      row.signed += 1
      if (p.stage.step >= 3) row.accepted += 1
      if (p.stage.key === 'counted') row.posted += 1
      row.views += p.views
    }
    for (const r of rewards) if (board.has(r.creator_id)) board.get(r.creator_id).vouchers += 1
    const leaderboard = [...board.values()]
      .filter((r) => r.signed > 0 || r.clicks > 0)
      .sort((a, b) => b.posted - a.posted || b.accepted - a.accepted || b.signed - a.signed || b.clicks - a.clicks)

    // Sign-ups through a link, and referrals that came to count, per week.
    const now = new Date(openedAt)
    // "All time" starts at the week of the first referral, not a fixed half
    // year: a fixed 26 weeks drew four months of nothing before the programme
    // began and squeezed the real weeks into slivers. Never fewer than 8.
    const first = people.reduce((m, p) => (p.created_at && (!m || p.created_at < m) ? p.created_at : m), null)
    const weeksSinceFirst = first ? Math.ceil((openedAt - new Date(first).getTime()) / (7 * 86_400_000)) + 1 : 8
    const span = range === 'all' ? Math.min(52, Math.max(8, weeksSinceFirst)) : (WEEK_SPANS[range] ?? 12)
    const weeks = Array.from({ length: span }, (_, i) => {
      const start = startOfWeek(subWeeks(now, span - 1 - i), { weekStartsOn: 1 })
      return { start, label: format(start, 'd MMM'), signed: 0, counted: 0 }
    })
    const weekOf = (d) => {
      const t = new Date(d).getTime()
      for (let i = weeks.length - 1; i >= 0; i--) if (t >= weeks[i].start.getTime()) return weeks[i]
      return null
    }
    for (const p of people) {
      const w = weekOf(p.created_at); if (w) w.signed += 1
      if (p.stage.key === 'counted' && p.firstPost) { const c = weekOf(p.firstPost); if (c) c.counted += 1 }
    }

    const contribution = {
      entries: people.reduce((s, p) => s + p.entries, 0),
      views: people.reduce((s, p) => s + p.views, 0),
    }

    const stageCounts = {}
    for (const p of people) stageCounts[p.stage.key] = (stageCounts[p.stage.key] || 0) + 1

    return { people, counts, rewards, rewardValue, leaderboard, weeks, contribution, stageCounts }
  }, [raw, inMarket, range, openedAt])

  const sorted = useMemo(() => {
    if (!data) return []
    const list = data.people
      .filter((p) => !byReferrer || p.referred_by === byReferrer)
      .filter((p) => stageFilter === 'all' || p.stage.key === stageFilter)
      .filter((p) => {
        const q = query.trim().toLowerCase()
        return !q || (p.name || '').toLowerCase().includes(q) || (p.referrer?.name || '').toLowerCase().includes(q)
      })
    if (sort === 'views') list.sort((a, b) => b.views - a.views)
    else if (sort === 'recent') list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    else list.sort((a, b) => b.stage.step - a.stage.step || b.views - a.views)
    return list
  }, [data, sort, byReferrer, stageFilter, query])

  if (!data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    )
  }

  const { counts, terms } = { ...data, terms: raw.terms }
  const moneyLine = Object.entries(data.rewardValue).map(([c, a]) => formatMoney(a, c)).join(' + ') || formatMoney(0, terms.currency)

  function exportCsv() {
    downloadCsv(`referrals-${scopeLabel.toLowerCase().replace(/\s+/g, '-')}.csv`, sorted.map((p) => ({
      referred_creator: p.name,
      referred_by: p.referrer?.name ?? '',
      signed_up: p.created_at?.slice(0, 10) ?? '',
      stage: p.stage.label,
      entries: p.entries,
      challenges: p.challenges,
      views: p.views,
      best_rank: p.bestRank ?? '',
      first_post: p.firstPost?.slice(0, 10) ?? '',
      last_post: p.lastPost?.slice(0, 10) ?? '',
    })))
  }

  const focus = byReferrer ? data.leaderboard.find((r) => r.referrer.id === byReferrer)?.referrer : null
  const hasWeeks = data.weeks.some((w) => w.signed || w.counted)

  return (
    <div className="space-y-8">
      {/* ---- The range, which every figure below follows ---- */}
      <div className="flex flex-wrap items-center justify-between gap-3 animate-fade-up">
        <p className="text-sm text-smoke">
          {range === 'all' ? 'Every referral so far' : `Referrals signed up in the last ${range} days`}
          {' '}in <span className="font-semibold text-ink">{scopeLabel}</span>.
          {range !== 'all' && <span className="ml-1 text-xs">(Invite link opens are a running total and do not filter by date.)</span>}
        </p>
        <Segmented value={range} onChange={setRange} options={RANGES} size="sm" label="Time range" />
      </div>

      {/* ---- The headline numbers ---- */}
      <div className="grid auto-rows-fr grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: 'Invite link opens', value: counts.clicks },
          { label: 'Signed up', value: counts.signed, hint: counts.clicks ? `${pct(counts.signed, counts.clicks)}% of opens` : '' },
          { label: 'Accepted', value: counts.accepted, hint: `${pct(counts.accepted, counts.signed)}% of sign-ups` },
          { label: 'Counted', value: counts.posted, hint: 'accepted and posted', accent: true },
          { label: 'Vouchers earned', value: data.rewards.length, hint: moneyLine },
          { label: 'Views from referrals', value: formatViews(data.contribution.views), hint: `${data.contribution.entries} ${data.contribution.entries === 1 ? 'entry' : 'entries'}` },
        ].map((s, i) => (
          <div key={s.label} className="animate-fade-up" style={{ animationDelay: `${i * 50}ms` }}>
            <StatCard label={s.label} value={s.value} hint={s.hint} accent={s.accent} />
          </div>
        ))}
      </div>

      {/* ---- The funnel, and what it loses at each step ---- */}
      <section className="rounded-card border border-gray-100 bg-white p-5 shadow-card animate-fade-up sm:p-6" style={{ animationDelay: '120ms' }}>
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">From invite to first video</h2>
            <p className="mt-0.5 text-sm text-smoke">
              Every {terms.per} counted referrals earn the referrer a {formatMoney(terms.amount, terms.currency)} {terms.label}.
            </p>
          </div>
        </div>
        <ol>
          {STEPS.map((step, i) => {
            const n = counts[step.key]
            const prev = i > 0 ? counts[STEPS[i - 1].key] : null
            const top = Math.max(1, counts.clicks, counts.signed)
            const lost = prev != null ? Math.max(0, prev - n) : 0
            return (
              <li key={step.key}>
                {/* THE DROP BETWEEN TWO STEPS, said as a number of people. */}
                {prev != null && (
                  <div className="flex items-center gap-2 py-1.5 pl-1 text-[11px] text-smoke sm:pl-[14.75rem]">
                    <svg viewBox="0 0 10 10" className="h-2.5 w-2.5 text-gray-300" aria-hidden><path d="M5 9 1 3h8z" fill="currentColor" /></svg>
                    {lost > 0
                      ? <span><span className="font-semibold text-ink">{lost}</span> did not go on · {pct(n, prev)}% carried through</span>
                      : <span>everyone carried through</span>}
                  </div>
                )}
                <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 sm:grid-cols-[14rem_1fr_4.5rem]">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{step.label}</p>
                    <p className="text-[11px] text-smoke">{step.hint}</p>
                  </div>
                  <div className="order-3 col-span-2 h-3.5 sm:order-none sm:col-span-1">
                    <GrowBar value={n / top} delay={i * 110} />
                  </div>
                  <p className="text-right text-lg font-bold tabular-nums text-ink">{n}</p>
                </div>
              </li>
            )
          })}
        </ol>
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* ---- Over time ---- */}
        <section className="rounded-card border border-gray-100 bg-white p-5 shadow-card animate-fade-up sm:p-6 lg:col-span-3" style={{ animationDelay: '180ms' }}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">Referrals by week</h2>
              <p className="mt-0.5 text-sm text-smoke">Sign-ups through a link, and the week each one first counted.</p>
            </div>
            <div className="flex gap-4 text-xs text-smoke">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#f5b48a]" /> Signed up</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand" /> Counted</span>
            </div>
          </div>
          <div className="mt-5 h-60">
            {!hasWeeks ? (
              <p className="flex h-full items-center justify-center rounded-xl bg-cloud/50 text-sm text-smoke">No sign-ups through a link in this period.</p>
            ) : (
              <ResponsiveContainer>
                <BarChart data={data.weeks} margin={{ top: 8, right: 4, left: -24, bottom: 0 }} barGap={2} barCategoryGap="22%">
                  <CartesianGrid vertical={false} stroke="#F1F1F2" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6B7280' }} tickLine={false} axisLine={{ stroke: '#E5E7EB' }} interval="preserveStartEnd" minTickGap={18} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#6B7280' }} tickLine={false} axisLine={false} width={40} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    cursor={{ fill: 'rgba(217,68,7,0.06)' }}
                    labelFormatter={(l) => `Week of ${l}`}
                    formatter={(v, k) => [v, k === 'signed' ? 'Signed up' : 'Counted']}
                  />
                  <Bar dataKey="signed" fill="#f5b48a" radius={[4, 4, 0, 0]} maxBarSize={22} animationDuration={700} />
                  <Bar dataKey="counted" fill="#d94407" radius={[4, 4, 0, 0]} maxBarSize={22} animationDuration={700} animationBegin={150} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        {/* ---- Who brings people in ---- */}
        <section className="rounded-card border border-gray-100 bg-white p-5 shadow-card animate-fade-up sm:p-6 lg:col-span-2" style={{ animationDelay: '220ms' }}>
          <h2 className="text-base font-semibold">Top referrers</h2>
          <p className="mt-0.5 text-sm text-smoke">Press one to see only the people they brought in.</p>
          {data.leaderboard.length === 0 ? (
            <p className="mt-6 text-sm text-smoke">Nobody in {scopeLabel} has shared an invite link yet.</p>
          ) : (
            <ul className="mt-3 space-y-1">
              {data.leaderboard.slice(0, allReferrers ? undefined : 6).map((r, i) => {
                const toNext = r.posted % terms.per
                const picked = byReferrer === r.referrer.id
                return (
                  <li key={r.referrer.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 8) * 45 + 260}ms` }}>
                    <button
                      type="button"
                      onClick={() => setByReferrer(picked ? null : r.referrer.id)}
                      aria-pressed={picked}
                      className={cx(
                        'flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-all duration-200',
                        // PICKED IS SOLID BRAND WITH WHITE ON IT.
                        picked ? 'bg-brand text-white shadow-card' : 'hover:-translate-y-0.5 hover:bg-cloud/70',
                      )}
                    >
                      <span className={cx('w-4 shrink-0 text-center text-xs font-semibold', picked ? 'text-white/80' : 'text-smoke')}>{i + 1}</span>
                      <Avatar src={r.referrer.photo_url} name={r.referrer.name} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{r.referrer.name}</span>
                        <span className={cx('block text-[11px]', picked ? 'text-white/80' : 'text-smoke')}>
                          {r.clicks} opens · {r.signed} signed · {r.accepted} accepted
                        </span>
                        <span className="mt-1 flex items-center gap-2">
                          <span className="h-1.5 w-20 shrink-0"><GrowBar value={toNext / terms.per} delay={i * 45 + 300} className={picked ? '!from-white !to-white' : ''} /></span>
                          <span className={cx('text-[10px]', picked ? 'text-white/80' : 'text-smoke')}>{toNext}/{terms.per} to next voucher</span>
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className={cx('block text-base font-bold tabular-nums', picked ? 'text-white' : 'text-brand')}>{r.posted}</span>
                        <span className={cx('block text-[9px] font-semibold uppercase tracking-wide', picked ? 'text-white/80' : 'text-smoke')}>counted</span>
                        {r.vouchers > 0 && <Badge tone="green">{r.vouchers} voucher{r.vouchers === 1 ? '' : 's'}</Badge>}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {data.leaderboard.length > 6 && (
            <button type="button" onClick={() => setAllReferrers((v) => !v)} className="mt-2 w-full rounded-xl py-2 text-xs font-semibold text-brand transition-colors hover:bg-cloud/70">
              {allReferrers ? 'Show the top six' : `Show all ${data.leaderboard.length} referrers`}
            </button>
          )}
        </section>
      </div>

      {/* ---- Every referred creator, and how they took part ---- */}
      <section className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-card animate-fade-up" style={{ animationDelay: '260ms' }}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 p-5 sm:px-6">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">
              Referred creators ({sorted.length}{sorted.length !== data.people.length ? ` of ${data.people.length}` : ''})
            </h2>
            <p className="mt-0.5 text-sm text-smoke">
              {focus ? <>Brought in by <span className="font-semibold text-ink">{focus.name}</span>.</> : 'Where each one is, and what they have done since joining.'}
              {focus && <button type="button" onClick={() => setByReferrer(null)} className="ml-2 text-xs font-semibold text-brand hover:underline">Show everyone</button>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented value={sort} onChange={setSort} size="sm" label="Sort" options={[
              { value: 'stage', label: 'Stage' }, { value: 'views', label: 'Views' }, { value: 'recent', label: 'Newest' },
            ]} />
            <button type="button" onClick={exportCsv} className="btn-secondary inline-flex items-center gap-1.5 !py-1.5 text-xs">
              <Icon name="download" className="h-3.5 w-3.5" /> CSV
            </button>
          </div>
        </div>
        {/* WHERE THEY ARE, AS FILTERS WITH THEIR COUNTS, and a search. */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-gray-50 px-5 py-3 sm:px-6">
          <div className="relative mr-1 w-full sm:w-56">
            <Icon name="magnifier" className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-300" />
            <input
              type="search"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setShowAll(false) }}
              placeholder="Search either name"
              aria-label="Search referred creators or who invited them"
              className="input !h-8 !py-0 !pl-8 text-xs"
            />
          </div>
          {[{ key: 'all', label: 'Everyone', n: data.people.length }, ...STAGE_ORDER
            .filter((k) => data.stageCounts[k])
            .map((k) => ({ key: k, label: REFERRAL_STAGES[k].label, n: data.stageCounts[k] }))].map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => { setStageFilter(f.key); setShowAll(false) }}
              aria-pressed={stageFilter === f.key}
              className={cx(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all duration-200',
                stageFilter === f.key ? 'bg-brand text-white shadow-card' : 'bg-cloud text-smoke hover:-translate-y-0.5 hover:text-ink',
              )}
            >
              {f.label}
              <span className={cx('rounded-full px-1.5 text-[10px] tabular-nums', stageFilter === f.key ? 'bg-white/25' : 'bg-white')}>{f.n}</span>
            </button>
          ))}
        </div>
        {sorted.length === 0 ? (
          <p className="p-6 text-sm text-smoke">
            {data.people.length === 0 ? `No one has joined through an invite link in ${scopeLabel} in this period.` : 'Nobody matches these filters.'}
          </p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {(showAll ? sorted : sorted.slice(0, 15)).map((p, i) => (
              <li key={p.id} className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 px-5 py-3.5 transition-colors animate-fade-up hover:bg-cloud/40 sm:grid-cols-[auto_1fr_auto_auto] sm:px-6" style={{ animationDelay: `${Math.min(i, 8) * 45 + 120}ms` }}>
                <Avatar src={p.photo_url} name={p.name} size="sm" />
                <div className="min-w-0">
                  <Link to={`/profile/${p.id}`} className="block truncate text-sm font-semibold hover:text-brand">{p.name}</Link>
                  <p className="truncate text-[11px] text-smoke">
                    Invited by{' '}
                    {p.referrer
                      ? <button type="button" onClick={() => setByReferrer(p.referrer.id)} className="font-medium text-ink hover:text-brand">{p.referrer.name}</button>
                      : 'someone'}
                    {' '}· signed up {p.created_at ? format(new Date(p.created_at), 'd MMM') : '-'}
                  </p>
                </div>
                <div className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1 pl-11 text-xs text-smoke sm:col-span-1 sm:pl-0">
                  <span><span className="font-semibold tabular-nums text-ink">{p.entries}</span> {p.entries === 1 ? 'entry' : 'entries'}</span>
                  <span><span className="font-semibold tabular-nums text-ink">{formatViews(p.views)}</span> views</span>
                  {p.challenges > 0 && <span>{p.challenges} challenge{p.challenges === 1 ? '' : 's'}</span>}
                  {p.bestRank && <span>best {ordinal(p.bestRank)}</span>}
                </div>
                <div className="col-span-2 pl-11 sm:col-span-1 sm:pl-0">
                  <Badge tone={p.stage.tone} title={p.stage.hint}>{p.stage.label}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
        {sorted.length > 15 && (
          <button type="button" onClick={() => setShowAll((v) => !v)} className="flex w-full items-center justify-center gap-1.5 border-t border-gray-50 py-3 text-sm font-semibold text-brand transition-colors hover:bg-cloud/40">
            {showAll ? 'Show fewer' : `Show all ${sorted.length}`}
            <Icon name="chevronDown" className={cx('h-4 w-4 transition-transform duration-300', showAll && 'rotate-180')} />
          </button>
        )}
      </section>
    </div>
  )
}
