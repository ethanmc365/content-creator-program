import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, startOfWeek, subWeeks } from 'date-fns'
import { supabase } from '../../../lib/supabase'
import { allRows } from '../../../lib/fetchAll'
import { Avatar, Badge, Skeleton, StatCard } from '../../../components/ui'
import Icon from '../../../components/Icon'
import { cx, downloadCsv, formatMoney, formatViews } from '../../../lib/utils'
import { referralStage, referralTerms } from '../../../lib/referrals'

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

export default function Referrals({ market = '', memberRows = [], scopeLabel = 'Worldwide' }) {
  const [raw, setRaw] = useState(null)
  const [sort, setSort] = useState('stage')

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
    const referrerById = new Map(raw.referrers.map((r) => [r.id, r]))
    const subsBy = new Map()
    for (const s of raw.subs) (subsBy.get(s.creator_id) ?? subsBy.set(s.creator_id, []).get(s.creator_id)).push(s)
    const bestRank = new Map()
    for (const r of raw.results) {
      if (r.rank == null) continue
      if (!bestRank.has(r.creator_id) || r.rank < bestRank.get(r.creator_id)) bestRank.set(r.creator_id, r.rank)
    }

    const people = raw.people
      .filter((p) => keep(p.referred_by))
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

    const rewards = raw.rewards.filter((r) => keep(r.creator_id))
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

    // Twelve weeks: sign-ups through a link, and referrals that came to count.
    const now = new Date()
    const weeks = Array.from({ length: 12 }, (_, i) => {
      const start = startOfWeek(subWeeks(now, 11 - i), { weekStartsOn: 1 })
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

    return { people, counts, rewards, rewardValue, leaderboard, weeks, contribution }
  }, [raw, inMarket])

  const sorted = useMemo(() => {
    if (!data) return []
    const list = [...data.people]
    if (sort === 'views') list.sort((a, b) => b.views - a.views)
    else if (sort === 'recent') list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    else list.sort((a, b) => b.stage.step - a.stage.step || b.views - a.views)
    return list
  }, [data, sort])

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
  const maxWeek = Math.max(1, ...data.weeks.map((w) => w.signed))
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

  return (
    <div className="space-y-8">
      {/* ---- The headline numbers ---- */}
      <div className="grid auto-rows-fr grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: 'Invite link opens', value: counts.clicks },
          { label: 'Signed up', value: counts.signed, hint: `${pct(counts.signed, counts.clicks)}% of opens` },
          { label: 'Accepted', value: counts.accepted, hint: `${pct(counts.accepted, counts.signed)}% of sign-ups` },
          { label: 'Counted', value: counts.posted, hint: 'accepted and posted' },
          { label: 'Vouchers earned', value: data.rewards.length, hint: moneyLine },
          { label: 'Views from referrals', value: formatViews(data.contribution.views), hint: `${data.contribution.entries} ${data.contribution.entries === 1 ? 'entry' : 'entries'}` },
        ].map((s, i) => (
          <div key={s.label} className="animate-fade-up" style={{ animationDelay: `${i * 50}ms` }}>
            <StatCard label={s.label} value={s.value} hint={s.hint} />
          </div>
        ))}
      </div>

      {/* ---- The funnel ---- */}
      <section className="rounded-card border border-gray-100 p-5 shadow-card animate-fade-up sm:p-6" style={{ animationDelay: '120ms' }}>
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">From invite to first video</h2>
            <p className="mt-0.5 text-sm text-smoke">
              Every {terms.per} counted referrals earn the referrer a {formatMoney(terms.amount, terms.currency)} {terms.label}.
            </p>
          </div>
          <Link to="/admin/referrals" className="btn-secondary !py-2 text-xs">Follow up referrals</Link>
        </div>
        <ol className="space-y-4">
          {STEPS.map((step, i) => {
            const n = counts[step.key]
            const prev = i > 0 ? counts[STEPS[i - 1].key] : null
            const top = Math.max(1, counts.clicks, counts.signed)
            return (
              <li key={step.key} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 sm:grid-cols-[14rem_1fr_7rem]">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{step.label}</p>
                  <p className="text-[11px] text-smoke">{step.hint}</p>
                </div>
                <div className="order-3 col-span-2 h-3 sm:order-none sm:col-span-1">
                  <GrowBar value={n / top} delay={i * 90} />
                </div>
                <p className="text-right tabular-nums">
                  <span className="text-lg font-bold text-ink">{n}</span>
                  {prev != null && (
                    <span className="ml-1.5 text-xs text-smoke">{pct(n, prev)}%</span>
                  )}
                </p>
              </li>
            )
          })}
        </ol>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ---- Over time ---- */}
        <section className="rounded-card border border-gray-100 p-5 shadow-card animate-fade-up sm:p-6" style={{ animationDelay: '180ms' }}>
          <h2 className="text-base font-semibold">Referrals by week</h2>
          <p className="mt-0.5 text-sm text-smoke">Sign-ups through a link, and how many of those came to count.</p>
          <div className="mt-5 flex h-40 items-end gap-1.5">
            {data.weeks.map((w, i) => (
              <div key={w.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${w.label}: ${w.signed} signed up, ${w.counted} counted`}>
                <div className="relative flex w-full flex-1 items-end">
                  <div
                    className="w-full origin-bottom rounded-t-md bg-brand/25 animate-bar-rise"
                    style={{ height: `${(w.signed / maxWeek) * 100}%`, animationDelay: `${i * 35}ms` }}
                  />
                  <div
                    className="absolute bottom-0 left-0 w-full origin-bottom rounded-t-md bg-brand animate-bar-rise"
                    style={{ height: `${(w.counted / maxWeek) * 100}%`, animationDelay: `${i * 35 + 120}ms` }}
                  />
                </div>
                <span className="hidden text-[10px] text-smoke sm:block">{i % 2 === 0 ? w.label : ''}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-4 text-xs text-smoke">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand/25" /> Signed up</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand" /> Counted</span>
          </div>
        </section>

        {/* ---- Who brings people in ---- */}
        <section className="rounded-card border border-gray-100 p-5 shadow-card animate-fade-up sm:p-6" style={{ animationDelay: '220ms' }}>
          <h2 className="text-base font-semibold">Top referrers</h2>
          <p className="mt-0.5 text-sm text-smoke">Ranked by referrals that counted, then accepted, then signed up.</p>
          {data.leaderboard.length === 0 ? (
            <p className="mt-6 text-sm text-smoke">Nobody in {scopeLabel} has shared an invite link yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-gray-50">
              {data.leaderboard.slice(0, 10).map((r, i) => {
                const toNext = r.posted % terms.per
                return (
                  <li key={r.referrer.id} className="flex items-center gap-3 py-2.5 animate-fade-up" style={{ animationDelay: `${Math.min(i, 8) * 45 + 260}ms` }}>
                    <span className="w-5 shrink-0 text-center text-xs font-semibold text-smoke">{i + 1}</span>
                    <Avatar src={r.referrer.photo_url} name={r.referrer.name} size="sm" />
                    <Link to={`/profile/${r.referrer.id}`} className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold hover:text-brand">{r.referrer.name}</span>
                      <span className="block text-[11px] text-smoke">
                        {r.clicks} opens · {r.signed} signed up · {r.accepted} accepted
                      </span>
                      <span className="mt-1 flex items-center gap-2">
                        <span className="h-1.5 w-24 shrink-0"><GrowBar value={toNext / terms.per} delay={i * 45 + 300} /></span>
                        <span className="text-[11px] text-smoke">{toNext} of {terms.per} to next voucher</span>
                      </span>
                    </Link>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-bold tabular-nums text-brand">{r.posted}</span>
                      <span className="block text-[10px] uppercase tracking-wide text-smoke">counted</span>
                      {r.vouchers > 0 && <Badge tone="green">{r.vouchers} voucher{r.vouchers === 1 ? '' : 's'}</Badge>}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      {/* ---- Every referred creator, and how they took part ---- */}
      <section className="overflow-hidden rounded-card border border-gray-100 shadow-card animate-fade-up" style={{ animationDelay: '260ms' }}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 p-5 sm:px-6">
          <div>
            <h2 className="text-base font-semibold">Referred creators ({data.people.length})</h2>
            <p className="mt-0.5 text-sm text-smoke">Where each one is, and what they have done since joining.</p>
          </div>
          <div className="flex items-center gap-2">
            <div role="radiogroup" aria-label="Sort" className="flex gap-1 rounded-full bg-cloud p-1">
              {[['stage', 'Stage'], ['views', 'Views'], ['recent', 'Newest']].map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={sort === k}
                  onClick={() => setSort(k)}
                  className={cx('rounded-full px-3 py-1 text-xs font-semibold transition-all', sort === k ? 'bg-brand text-white shadow-card' : 'text-smoke hover:text-ink')}
                >
                  {l}
                </button>
              ))}
            </div>
            <button type="button" onClick={exportCsv} className="btn-secondary inline-flex items-center gap-1.5 !py-1.5 text-xs">
              <Icon name="download" className="h-3.5 w-3.5" /> CSV
            </button>
          </div>
        </div>
        {sorted.length === 0 ? (
          <p className="p-6 text-sm text-smoke">No one has joined through an invite link in {scopeLabel} yet.</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {sorted.map((p, i) => (
              <li key={p.id} className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 px-5 py-3.5 animate-fade-up sm:grid-cols-[auto_1fr_auto_auto] sm:px-6" style={{ animationDelay: `${Math.min(i, 8) * 45 + 300}ms` }}>
                <Avatar src={p.photo_url} name={p.name} size="sm" />
                <div className="min-w-0">
                  <Link to={`/profile/${p.id}`} className="block truncate text-sm font-semibold hover:text-brand">{p.name}</Link>
                  <p className="truncate text-[11px] text-smoke">
                    Invited by {p.referrer?.name ?? 'someone'} · signed up {p.created_at ? format(new Date(p.created_at), 'd MMM') : '-'}
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
      </section>
    </div>
  )
}
