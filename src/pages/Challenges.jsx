import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useMyScopes, inScope } from '../lib/scope'
import Icon from '../components/Icon'
import { PageHeader, Badge, SkeletonCards, EmptyState } from '../components/ui'
import { formatDate, formatMoney, challengeDeadline } from '../lib/utils'
import { convert } from '../lib/programme'
import Reveal from '../components/network/Reveal'
import LiveChallengeCard from '../components/LiveChallengeCard'
import WinnersPodium from '../components/WinnersPodium'
import { loadWinnerGalleries } from '../lib/winners'

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

      setGalleries(await loadWinnerGalleries(all))
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
  // ONE NUMBER, IN EUROS, ROUNDED TO THE NEAREST TEN.
  //
  // It was one figure per currency side by side ("£250 + €40"), which is honest
  // and unreadable: a creator wants to know what this programme has paid out,
  // not to do currency arithmetic in their head. Most markets settle in euros
  // now, so euros is the number.
  //
  // ROUNDED, and deliberately so. Converting £250 at a rate that moves daily
  // and printing "€292" claims a precision that does not exist - it would be a
  // different number tomorrow with nothing having happened. Ethan: "don't give
  // the exact figure if you're converting, always round it to the nearest ten."
  // Under ten it is left alone, because rounding €4 to €0 says nothing was won.
  const prizeTotalEur = useMemo(() => {
    const total = Object.entries(prizesAwarded ?? {})
      .reduce((sum, [currency, amount]) => sum + (convert(amount, currency, 'EUR') || 0), 0)
    if (total <= 0) return 0
    return total < 10 ? Math.round(total) : Math.round(total / 10) * 10
  }, [prizesAwarded])

  const mine = challenges.filter((c) => inScope(scopeIds, c.community_id))
  // A GLOBAL BRIEF LEADS THE BOARD.
  //
  // Everyone is a member of Worldwide, so a challenge on the network row is the
  // one brief on this page that every creator in every market can enter. It is
  // not "one more live challenge" and stacking it in date order with a market
  // brief said it was. It goes first, and it gets a card that looks like the
  // bigger thing it is.
  const isGlobal = (c) => !!networkId && c.community_id === networkId
  const live = mine.filter(isLive).sort((a, b) => Number(isGlobal(b)) - Number(isGlobal(a)))
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
          action={isAdmin && <Link to="/admin/challenges/new" className="btn-primary">+ New challenge</Link>}
        />
      </Reveal>

      {prizeTotalEur > 0 && (
        <Reveal from="down" delay={0.06} className="mb-8">
          {/* A pill inside a tinted pill inside a bordered pill was three
              containers for six words. One line: the trophy, the money, what
              the money is. */}
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[15px]">
            <Icon name="trophy" className="h-[18px] w-[18px] shrink-0 translate-y-0.5 text-brand" />
            <span className="font-bold tabular-nums text-brand">
              {formatMoney(prizeTotalEur, 'EUR')}
            </span>
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
              <LiveChallengeCard
                challenge={c}
                global={isGlobal(c)}
                entries={c.submissions?.[0]?.count ?? 0}
                participation={participation[c.id]}
              />
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
