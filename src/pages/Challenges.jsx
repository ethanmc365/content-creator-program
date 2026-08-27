import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useMyScopes, inScope } from '../lib/scope'
import CountdownTimer from '../components/CountdownTimer'
import Icon from '../components/Icon'
import { PageHeader, Badge, SkeletonCards, EmptyState } from '../components/ui'
import { formatDate, formatMoney, challengeDeadline } from '../lib/utils'
import Reveal from '../components/network/Reveal'
import ParticipationBar from '../components/network/ParticipationBar'
import WinnersPodium from '../components/WinnersPodium'

const STATUS_TONE = { active: 'brand', ended: 'amber', archived: 'grey', draft: 'red' }

// All challenges: the live one up top, past challenges browsable below.
export default function Challenges() {
  const { isAdmin } = useAuth()
  const { ids: scopeIds, networkId, loading: scopesLoading } = useMyScopes()
  const [challenges, setChallenges] = useState([])
  const [galleries, setGalleries] = useState({}) // challenge_id -> {winners, totalViews}
  // challenge_id -> {posted, total}. Keyed rather than singular: the moment a
  // second market opened, "the live challenge" stopped being a single thing,
  // and a lone object silently attached the UK bar to Spain's numbers.
  const [participation, setParticipation] = useState({})
  // { GBP: 250, EUR: 40 } - kept per currency, never added together.
  const [prizesAwarded, setPrizesAwarded] = useState(null)
  const [loading, setLoading] = useState(true)
  // Captured once at mount (lazy initialiser, not read during render) so the
  // "is this challenge past its deadline" check stays pure per the lint rules.
  const [nowMs] = useState(() => Date.now())

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('challenges')
        .select('*, submissions(count)')
        .order('start_date', { ascending: false })
      const all = data ?? []
      setChallenges(all)
      setLoading(false)

      // WHAT THIS NUMBER IS, AND THE THREE THINGS WRONG WITH IT BEFORE.
      //
      // It read "£665 awarded in prizes so far", which was wrong three ways at
      // once. (1) It added a hardcoded £500 "pre-platform baseline" nobody can
      // check, to a figure presented as a fact. (2) It summed `amount` ACROSS
      // CURRENCIES, so a €30 voucher added 30 to a pounds total. (3) It counted
      // only `distributed`, so a prize somebody had won and was waiting to be
      // paid was not "awarded" - which is the opposite of what the word means.
      //
      // Now: everything a creator has actually won, pending included, kept per
      // currency and shown per currency. No baseline, no conversion, nothing
      // invented. Test accounts excluded, because they win things constantly.
      supabase.from('rewards')
        .select('amount, currency, profiles:creator_id(is_test)')
        .then(({ data: won }) => {
          const byCurrency = {}
          for (const r of won ?? []) {
            if (r.profiles?.is_test) continue
            const c = r.currency || 'GBP'
            byCurrency[c] = (byCurrency[c] || 0) + Number(r.amount || 0)
          }
          setPrizesAwarded(byCurrency)
        })

      // The winners block, but only for challenges an admin has actually
      // PUBLISHED. Results rows exist from the moment views are first logged -
      // including the interim standings posted mid-challenge - so keying the
      // podium off "are there results" published a half-finished leaderboard as
      // a final one the day the archive cron ran.
      const publishedIds = all.filter((c) => c.winners_published_at).map((c) => c.id)
      if (publishedIds.length === 0) return
      const [{ data: results }, { data: subs }] = await Promise.all([
        supabase.from('results')
          .select('challenge_id, creator_id, final_views, rank, profiles:creator_id(id, name, photo_url)')
          .in('challenge_id', publishedIds)
          .order('final_views', { ascending: false }),
        supabase.from('submissions')
          .select('challenge_id, creator_id, video_url, platform, logged_views, profiles:creator_id(id, name, photo_url)')
          .in('challenge_id', publishedIds),
      ])

      const bestVideo = new Map()   // `${challenge}:${creator}` -> best submission
      const subCount = new Map()    // `${challenge}:${creator}` -> how many they posted
      const person = new Map()      // creator id -> profile, for the voucher faces
      for (const s of subs ?? []) {
        const k = `${s.challenge_id}:${s.creator_id}`
        const cur = bestVideo.get(k)
        if (!cur || (s.logged_views ?? 0) > (cur.logged_views ?? 0)) bestVideo.set(k, s)
        subCount.set(k, (subCount.get(k) || 0) + 1)
        if (s.profiles) person.set(s.creator_id, s.profiles)
      }

      const byChallenge = {}
      for (const r of results ?? []) (byChallenge[r.challenge_id] ||= []).push(r)
      const built = {}
      for (const c of all) {
        const rows = byChallenge[c.id]
        if (!c.winners_published_at || !rows?.length) continue
        // How many places this challenge actually pays. Three was hard-coded,
        // so a five-winner challenge quietly lost two of its winners.
        const places = Math.max(1, c.winners_count || (Array.isArray(c.prize_structure) ? c.prize_structure.length : 0) || 3)
        const ranked = rows
          .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || b.final_views - a.final_views)
          .slice(0, places)
          .map((r, i) => ({
            ...r,
            rank: i + 1,
            videoUrl: bestVideo.get(`${c.id}:${r.creator_id}`)?.video_url ?? null,
            platform: bestVideo.get(`${c.id}:${r.creator_id}`)?.platform ?? null,
          }))
        // EVERYONE who cleared the participation threshold, podium included.
        // They were excluded before, on the reasoning that the voucher is for
        // turning up rather than for placing - but the row says "for everyone
        // here" and then quietly left out the three people most obviously here,
        // so it read as broken. Placing does not un-earn the voucher.
        const threshold = c.participation_threshold
        const voucherWinners = threshold
          ? [...subCount.entries()]
              .filter(([k, n]) => k.startsWith(`${c.id}:`) && n >= threshold)
              .map(([k]) => person.get(k.split(':')[1]))
              .filter(Boolean)
          : []
        built[c.id] = {
          winners: ranked,
          totalScore: rows.reduce((sum, r) => sum + (r.final_views || 0), 0),
          voucherWinners,
        }
      }
      setGalleries(built)
    }
    load()
  }, [])

  // Participation, computed per live challenge and against the RIGHT crowd.
  //
  // This used to count every active profile on the platform, which was correct
  // while there was one market and became wrong the instant there were two: a
  // Spanish challenge with no Spanish creators reported "0 of 43", 43 being the
  // UK. The denominator is the challenge's own market, so a market with nobody
  // in it says so instead of borrowing another market's roster.
  useEffect(() => {
    const liveOnes = challenges.filter(
      (c) => c.status === 'active' && challengeDeadline(c.end_date).getTime() > Date.now(),
    )
    if (liveOnes.length === 0) return
    let cancelled = false
    async function tally() {
      const entries = await Promise.all(liveOnes.map(async (c) => {
        const roster = c.community_id
          ? supabase.from('community_members')
              .select('profile_id, profiles!inner(is_admin, is_test, status, deletion_requested_at)', { count: 'exact', head: true })
              .eq('community_id', c.community_id).eq('status', 'active')
              .eq('profiles.is_admin', false).eq('profiles.is_test', false).eq('profiles.status', 'active')
              .is('profiles.deletion_requested_at', null)
          : supabase.from('profiles').select('id', { count: 'exact', head: true })
              .eq('status', 'active').eq('is_admin', false).eq('is_test', false)
              .is('deletion_requested_at', null)
        const [{ data: entrants }, { count }] = await Promise.all([
          supabase.from('submissions').select('creator_id').eq('challenge_id', c.id),
          roster,
        ])
        return [c.id, {
          posted: new Set((entrants ?? []).map((e) => e.creator_id)).size,
          total: count ?? 0,
        }]
      }))
      if (!cancelled) setParticipation(Object.fromEntries(entries))
    }
    tally()
    return () => { cancelled = true }
  }, [challenges])

  const isLive = (c) => c.status === 'active' && challengeDeadline(c.end_date).getTime() > nowMs
  // This page is the creator's OWN community's challenge board. RLS already
  // narrows it for a creator; an admin can read every market, so without this
  // they get Spain's live card stacked above the UK's with no way to tell which
  // is which. Every market's board is at /c/<slug>/challenges.
  // Biggest currency first, so the headline number is the one that matters.
  const prizeTotals = Object.entries(prizesAwarded ?? {})
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])

  const mine = challenges.filter((c) => inScope(scopeIds, c.community_id))
  const live = mine.filter(isLive)
  const past = mine.filter((c) => !isLive(c))

  return (
    <div className="page">
      {/* THE PAGE ARRIVES, IT DOES NOT APPEAR. Everything else in the network
          shell rises into view; this board - the page most creators open first
          - was the one that simply blinked into existence. Header, prize pill
          and the live card each carry their own place in the queue, so the eye
          is led down the page in the order the page wants to be read. */}
      <Reveal from="down">
        <PageHeader
          title="Challenges"
          subtitle="One brief, one deadline, real prizes. Enter with your best video."
          action={isAdmin && <Link to="/admin/challenges/new" className="btn-primary">+ New challenge</Link>}
        />
      </Reveal>

      {prizeTotals.length > 0 && (
        <Reveal from="down" delay={0.06} className="mb-8">
          {/* A pill inside a tinted pill inside a bordered pill was three
              containers for six words. One line: the trophy, the money, what
              the money is. */}
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[15px]">
            <Icon name="trophy" className="h-[18px] w-[18px] shrink-0 translate-y-0.5 text-brand" />
            {prizeTotals.map(([currency, total], i) => (
              <span key={currency} className="font-bold tabular-nums text-brand">
                {i > 0 && <span className="mr-2 font-normal text-gray-300">+</span>}
                {formatMoney(total, currency)}
              </span>
            ))}
            <span className="text-smoke">won by creators so far</span>
          </p>
        </Reveal>
      )}

      {loading || scopesLoading ? (
        <SkeletonCards count={3} />
      ) : mine.length === 0 ? (
        <EmptyState icon={<Icon name="flag" className="h-7 w-7" />} title="No challenges yet" hint="The first challenge will appear here once the team posts it." />
      ) : (
        <div className="space-y-12">
          {/* ---------- Nothing live ----------
              Without this the board went straight from the prize pill to "Past
              challenges", which reads as a page that has stopped rather than a
              programme between briefs. It is a panel and not a card: there is
              nowhere to go yet, and a card is a promise of a destination. */}
          {live.length === 0 && (
            <Reveal from="down" delay={0.12}>
              <div className="rounded-card border border-gray-100 bg-cloud/50 px-6 py-8 text-center sm:py-10">
                <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-tint text-brand">
                  <Icon name="flag" className="h-5 w-5" />
                </span>
                <h2 className="text-lg font-semibold">No challenge running right now</h2>
                <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-smoke">
                  The next brief lands here as soon as the team posts it, and you will get a notification when
                  it does. Past challenges and their winners are below.
                </p>
                {isAdmin && (
                  <Link to="/admin/challenges/new" className="btn-secondary mt-5 inline-flex !py-2 text-sm">
                    Post a challenge
                  </Link>
                )}
              </div>
            </Reveal>
          )}

          {/* ---------- Live ---------- */}
          {live.map((c) => (
            <Reveal key={c.id} from="down" delay={0.12} as="div" data-tour="challenge-card">
              <div className="relative block overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light p-6 text-white shadow-lift sm:p-10">
                {/* Soft light bloom for depth, matching the home hero. */}
                <div className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
                <div className="pointer-events-none absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-black/5 blur-2xl" />
                <div className="relative">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/80" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                      </span>
                      Live now
                    </span>
                    {/* A global brief sits on every creator's board in every
                        country, so it has to say so or it reads as one more
                        local challenge that happens to be in English. */}
                    {networkId && c.community_id === networkId && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-brand">
                        <Icon name="globe" className="h-3.5 w-3.5" />
                        Open to everyone
                      </span>
                    )}
                    <span className="text-xs text-white/75">{formatDate(c.start_date)} → {formatDate(c.end_date)}</span>
                  </div>
                  {/* The title grows slightly on hover rather than underlining.
                      An underline reads as "this is a link in a paragraph"; a
                      heading that swells reads as "this whole thing is the
                      target", which is what it actually is. origin-left keeps
                      it anchored to the text's start instead of drifting. */}
                  <Link to={`/challenges/${c.id}`} className="group block">
                    <h2 className="mt-4 inline-block origin-left text-2xl font-bold transition-transform duration-200 ease-out group-hover:scale-[1.03] sm:text-3xl">
                      {c.title}
                    </h2>
                    <p className="mt-2 max-w-2xl text-white/85 line-clamp-2">{c.description}</p>
                  </Link>
                  <div className="mt-8 flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/75">Closes in</p>
                      <CountdownTimer endDate={c.end_date} hero />
                    </div>
                    <div className="flex flex-col gap-2.5 lg:items-end">
                      <div className="flex flex-wrap gap-3">
                        <Link to={`/challenges/${c.id}`} className="btn border border-white/40 text-white hover:bg-white/10">Read the brief →</Link>
                        <Link to={`/challenges/${c.id}?submit=1`} className="btn bg-white !text-brand hover:bg-white/90">Submit your video</Link>
                      </div>
                      <p className="text-sm text-white/80">{c.submissions?.[0]?.count ?? 0} {(c.submissions?.[0]?.count ?? 0) === 1 ? 'entry' : 'entries'} so far</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Participation pace: nudges the quiet majority, names no one.
                  The shared component, not a fourth hand-rolled copy of it -
                  this one had drifted into `Math.max(pct, 2)`, which paints a
                  sliver of orange under "0 of 43 have posted" and is the exact
                  bug ParticipationBar was written to avoid. */}
              {participation[c.id] && (
                <ParticipationBar
                  participation={participation[c.id]}
                  where=""
                  className="mt-4"
                />
              )}
            </Reveal>
          ))}

          {/* ---------- Past ---------- */}
          {past.length > 0 && (
            <section>
              <h2 className="mb-5 text-lg font-semibold text-smoke">Past challenges</h2>
              <Reveal className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                {past.map((c) => (
                  /* The card used to BE a <Link>, which is why nothing inside it
                     could ever be its own target - a winner's face, their video,
                     all of it was swallowed by the one anchor around the lot.
                     The link is now a stretched overlay sitting UNDERNEATH the
                     content, so the card still opens the challenge from any dead
                     space while every real control on top of it works. */
                  <div key={c.id} className="card group relative transition-all hover:-translate-y-0.5 hover:shadow-lift">
                    <Link
                      to={`/challenges/${c.id}`}
                      className="absolute inset-0 z-0 rounded-card"
                      aria-label={`${c.title} - challenge details`}
                    />
                    <div className="pointer-events-none relative z-10">
                      <div className="flex items-center justify-between gap-3">
                        {/* Still status 'active' but past its deadline → show "ended", not "active". */}
                        <Badge tone={c.status === 'active' ? STATUS_TONE.ended : STATUS_TONE[c.status]}>{c.status === 'active' ? 'ended' : c.status}</Badge>
                        <span className="text-xs text-smoke">{formatDate(c.start_date)} → {formatDate(c.end_date)}</span>
                      </div>
                      <h3 className="mt-4 text-xl font-semibold group-hover:text-brand">{c.title}</h3>
                      <p className="mt-2 text-sm text-smoke line-clamp-2">{c.description}</p>
                      {galleries[c.id] ? (
                        <WinnersPodium
                          className="pointer-events-auto mt-5"
                          winners={galleries[c.id].winners}
                          entries={c.submissions?.[0]?.count ?? 0}
                          totalScore={galleries[c.id].totalScore}
                          scoring={c.scoring}
                          voucherWinners={galleries[c.id].voucherWinners}
                          voucherPrize={c.participation_prize}
                        />
                      ) : (
                        <p className="mt-4 text-xs font-medium text-smoke">{c.submissions?.[0]?.count ?? 0} entries · results inside →</p>
                      )}
                    </div>
                  </div>
                ))}
              </Reveal>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
