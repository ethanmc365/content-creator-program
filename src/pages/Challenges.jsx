import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useMyScopes, inScope } from '../lib/scope'
import Icon from '../components/Icon'
import { PageHeader, Badge, Skeleton } from '../components/ui'
import { LiveChallengeSkeleton } from '../components/network/Skeletons'
import { formatDate, formatMoney, challengeDeadline } from '../lib/utils'
import { convert } from '../lib/programme'
import Reveal from '../components/network/Reveal'
import { CountUp } from '../components/network/Motion'
import LiveChallengeCard from '../components/LiveChallengeCard'
import { NoLiveChallenge } from '../components/network/LiveChallengeCard'
import WinnersPodium from '../components/WinnersPodium'
import { loadWinnerGalleries } from '../lib/winners'
import { useT } from '../lib/i18n'
import { testFlags, isHiddenTestRow } from '../lib/testData'
import { useCachedPage, writePageCache } from '../lib/pageCache'

const STATUS_TONE = { active: 'brand', ended: 'amber', archived: 'grey', draft: 'red' }

// SECOND AND LATER VISITS TO THIS TAB DRAW THE PAGE, NOT A PLACEHOLDER.
// See lib/pageCache - the queries still run every time; the cache only decides
// what is on screen while they do.
const CACHE_KEY = 'challenges'

// All challenges: the live one up top, past challenges browsable below.
export default function Challenges() {
  const tr = useT()
  const { isAdmin } = useAuth()
  const { ids: scopeIds, networkId, loading: scopesLoading } = useMyScopes()
  const cached = useCachedPage(CACHE_KEY)
  const [challenges, setChallenges] = useState(cached?.challenges ?? [])
  const [galleries, setGalleries] = useState(cached?.galleries ?? {}) // challenge_id -> {winners, totalViews}
  // challenge_id -> {posted, total}. Keyed rather than singular: the moment a
  // second market opened, "the live challenge" stopped being a single thing,
  // and a lone object silently attached the UK bar to Spain's numbers.
  const [participation, setParticipation] = useState(cached?.participation ?? {})
  // { GBP: 250, EUR: 40 } - kept per currency, never added together.
  const [prizesAwarded, setPrizesAwarded] = useState(cached?.prizesAwarded ?? null)
  const [loading, setLoading] = useState(!cached)
  // Captured once at mount (lazy initialiser, not read during render) so the
  // "is this challenge past its deadline" check stays pure per the lint rules.
  const [nowMs] = useState(() => Date.now())

  // What creators have won, per currency. Re-read whenever the page comes back
  // into view, so the headline follows new prizes without a reload.
  function loadPrizesWon() {
    supabase.rpc('prizes_won_total').then(({ data, error }) => {
      if (error || !data) return
      setPrizesAwarded(Object.fromEntries(data.map((r) => [r.currency || 'EUR', Number(r.amount) || 0])))
    })
  }
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') loadPrizesWon() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

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
      //
      // AND IT INCLUDES THE 47 CHALLENGES BEFORE THE PLATFORM (22 Sep 2026).
      // Ethan: "EUR 290 won by creators so far ... is incorrect, it's way
      // higher because we added in the other analytics." `prizes_won_total`
      // (migration 248) adds `challenge_history` - which creators cannot read
      // directly - to the rewards, per currency.
      loadPrizesWon()

      setGalleries(await loadWinnerGalleries(all))
    }
    load()
  }, [])

  // WHO IS AHEAD IN EACH LIVE CHALLENGE. See the Leaders block in
  // LiveChallengeCard for why a live card carries a top three at all.
  //
  // IT READS `results`, WHICH IS THE BOARD (3 Sep 2026).
  //
  // This used to sum `submissions.logged_views` per creator and sort by that -
  // its own private opinion about who was winning, computed in a component. On
  // a views challenge it happened to agree with the leaderboard. On a POINTS
  // challenge it was simply a different contest: it ranked by view count, and
  // its `views > 0` filter dropped anybody whose entries had not been synced
  // yet even when they were top of the actual board on posting points. The
  // global challenge launching next week is a points challenge, so this card -
  // the first thing every creator in every market sees - would have led with
  // the wrong three people.
  //
  // `results` is now rebuilt on every path that can change a score (migration
  // 181), so reading it is both correct and cheaper than recomputing it. Test
  // accounts are still dropped: a sandbox profile at the top of a live
  // leaderboard is not encouraging, it is a bug report waiting to be written.
  const [leaders, setLeaders] = useState(cached?.leaders ?? {})
  useEffect(() => {
    const liveIds = challenges
      .filter((c) => c.status === 'active' && challengeDeadline(c.end_date).getTime() > Date.now())
      .map((c) => c.id)
    if (!liveIds.length) return undefined
    let cancelled = false
    supabase.from('results')
      .select('challenge_id, creator_id, rank, final_views, total_views, profiles:creator_id(name, photo_url, is_test)')
      .in('challenge_id', liveIds)
      .lte('rank', 5)
      .order('rank')
      .then(({ data }) => {
        if (cancelled) return
        const out = {}
        for (const r of data || []) {
          if (isHiddenTestRow(r.profiles)) continue
          ;(out[r.challenge_id] ||= []).push({
            creator_id: r.creator_id,
            name: r.profiles?.name,
            photo_url: r.profiles?.photo_url,
            // `score` is what the board RANKS on - points on a points
            // challenge, views on the others. `views` is always the reach.
            score: Number(r.final_views) || 0,
            views: Number(r.total_views) || 0,
          })
        }
        setLeaders(out)
      })
    return () => { cancelled = true }
  }, [challenges])

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
              .eq('profiles.is_admin', false).in('profiles.is_test', testFlags()).eq('profiles.status', 'active')
              .is('profiles.deletion_requested_at', null)
          : supabase.from('profiles').select('id', { count: 'exact', head: true })
              .eq('status', 'active').eq('is_admin', false).in('is_test', testFlags())
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

  // KEEP THE CACHE IN STEP, so the next tap on this tab paints the board rather
  // than a screen of grey. Nothing is skipped on the way in - the queries above
  // run on every visit exactly as they always did. See lib/pageCache.
  useEffect(() => {
    if (loading) return
    writePageCache(CACHE_KEY, { challenges, galleries, participation, prizesAwarded, leaders })
  }, [loading, challenges, galleries, participation, prizesAwarded, leaders])

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
    // Past a thousand it is a headline, not a ledger: rounded DOWN to the
    // hundred and shown with a "+" ("EUR 9,000+"), so it never overstates.
    if (total >= 1000) return Math.floor(total / 100) * 100
    return total < 10 ? Math.round(total) : Math.round(total / 10) * 10
  }, [prizesAwarded])

  // WHAT THIS BOARD IS ABOUT: my markets, plus everybody's archive.
  //
  // The client filter exists because RLS ends in `or is_admin()` - an admin can
  // read every market, so without this they get Spain's live card stacked above
  // the UK's with no way to tell which is which. That is still true of LIVE
  // challenges and the scope filter still applies to them.
  //
  // An ARCHIVED one is different, and migration 193 says so in the database:
  // once a challenge is over it is the programme's own portfolio, and hiding it
  // from a creator in another market leaves somebody who joined last week with
  // an empty page and nothing to learn from. Both halves have to agree or the
  // policy opens a door the page keeps shut - which is exactly what happened
  // here before, and is invisible from either side on its own.
  const isArchived = (c) => c.status === 'archived'
  const mine = challenges.filter((c) => isArchived(c) || inScope(scopeIds, c.community_id))
  // A GLOBAL BRIEF LEADS THE BOARD.
  //
  // Everyone is a member of Worldwide, so a challenge on the network row is the
  // one brief on this page that every creator in every market can enter. It is
  // not "one more live challenge" and stacking it in date order with a market
  // brief said it was. It goes first, and it gets a card that looks like the
  // bigger thing it is.
  const isGlobal = (c) => !!networkId && c.community_id === networkId
  const live = mine.filter(isLive).sort((a, b) => Number(isGlobal(b)) - Number(isGlobal(a)))
  // A DRAFT IS NOT A PAST CHALLENGE. It has not run, it has no winners and no
  // entries, and filing it under "Past challenges" said it had finished.
  // Ethan: "this shouldn't be under past challenges, a separate section called
  // drafts should show up above the past challenges section but below the live
  // challenge cards".
  //
  // ONLY ADMINS EVER SEE ONE, and that is enforced in the DATABASE rather than
  // here: the `challenges: read published` policy is
  // `is_admin() OR (is_member() AND status <> 'draft' AND ...)`. Rehearsed
  // 20 Sep 2026 as a real non-admin creator inside a rolled-back transaction -
  // one draft in the table, zero rows visible. This section cannot leak one
  // because the row never arrives; the `isAdmin` guard below is about not
  // drawing an empty heading, not about access.
  const drafts = mine.filter((c) => !isLive(c) && c.status === 'draft')
  const past = mine.filter((c) => !isLive(c) && c.status !== 'draft')

  return (
    <div className="page">
      {/* THE PAGE ARRIVES, IT DOES NOT APPEAR. Everything else in the network
          shell rises into view; this board - the page most creators open first
          - was the one that simply blinked into existence. Header, prize pill
          and the live card each carry their own place in the queue, so the eye
          is led down the page in the order the page wants to be read. */}
      <Reveal from="down">
        <PageHeader
          title={tr("Challenges")}
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
              <CountUp value={prizeTotalEur} format={(n) => formatMoney(n, 'EUR')} />{prizeTotalEur >= 1000 ? '+' : ''}
            </span>
            <span className="text-smoke">{tr("won by creators so far")}</span>
          </p>
        </Reveal>
      )}

      {loading || scopesLoading ? (
        // THE SKELETON IS THE SHAPE OF WHAT IS COMING, not three small cards.
        // This page loads ONE big live challenge card and then a two-column
        // grid of past ones; `SkeletonCards` drew a three-column grid of little
        // avatar-and-two-lines tiles, so the placeholder and the page had
        // nothing in common and everything moved when the data landed.
        <div className="space-y-12">
          <LiveChallengeSkeleton />
          <div>
            <Skeleton className="mb-5 h-6 w-40 rounded-md" />
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {[0, 1].map((i) => (
                <div key={i} className="card space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <Skeleton className="h-6 w-20 rounded-full" />
                    <Skeleton className="h-4 w-40 rounded-md" />
                  </div>
                  <Skeleton className="h-6 w-3/4 rounded-md" />
                  <Skeleton className="h-4 w-full rounded-md" />
                  <Skeleton className="h-24 w-full rounded-xl" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : mine.length === 0 ? (
        /* THE SAME PANEL AS AN EMPTY MARKET, and for the same reason. A flag in
           a grey square and the words "No challenges yet" is a page that has
           stopped; the market boards have had a proper answer to this for
           weeks - the plane, a sentence about what happens next, and a create
           button for whoever can act on it. See NoLiveChallenge. */
        <Reveal from="down" delay={0.12}>
          <NoLiveChallenge
            canCreate={isAdmin}
            title={tr("No challenge running right now")}
            hint={tr("The next challenge is landing here soon, and you will get a notification the moment it does.")}
          />
        </Reveal>
      ) : (
        <div className="space-y-12">
          {/* ---------- Nothing live ----------
              Without this the board went straight from the prize pill to "Past
              challenges", which reads as a page that has stopped rather than a
              programme between briefs. It is a panel and not a card: there is
              nowhere to go yet, and a card is a promise of a destination. */}
          {/* NOTHING LIVE, DRAWN THE WAY THE MARKETS DRAW IT (4 Sep 2026).
              Ethan: "on the challenges page, when there's no challenge running,
              rather than just that weird icon I want an actual nice page
              similar to how the market ones are. Use that same copy, but
              obviously just say no challenge - don't say the market name. And
              the button for admins to create a challenge would be nice. And
              that nice Tryp.com animated plane, you can have it nice and big
              there."
              It was a flag glyph in a tinted square on a grey panel, which is
              the generic empty state this app uses for lists that are empty by
              accident. An empty board is the NORMAL state between briefs, and
              the market cards have said so properly for weeks. One component
              now. */}
          {live.length === 0 && (
            <Reveal from="down" delay={0.12}>
              <NoLiveChallenge
                canCreate={isAdmin}
                title={tr("No challenge running right now")}
                hint={tr("The next challenge is landing here soon, and you will get a notification when it does. Past challenges and their winners are below.")}
              />
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
                leaders={leaders[c.id]}
              />
            </Reveal>
          ))}

          {/* ---------- Drafts (admins only; see the note by `drafts`) ---------- */}
          {drafts.length > 0 && (
            <section>
              <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1">
                <h2 className="text-lg font-semibold text-smoke">{tr('Drafts')}</h2>
                <span className="rounded-full bg-cloud px-2.5 py-0.5 text-[11px] font-semibold text-smoke">
                  {tr('Only you can see these')}
                </span>
              </div>
              <Reveal className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {drafts.map((c) => (
                  // A COMPACT CARD, DELIBERATELY. The past card carries a
                  // podium, an entry count and a winners gallery; a draft has
                  // none of those because it has never run. What an admin wants
                  // from this row is "what is it, when is it meant to run, let
                  // me finish it" - so it links straight to the editor.
                  // EVERY DRAFT THE SAME SIZE (21 Sep 2026). Ethan: "the
                  // Portugal draft card is a different size to the Global
                  // Challenge draft." A two-line title or a missing description
                  // made each card its own height. `h-full` fills the grid cell
                  // Reveal stretches, the title and blurb hold two lines each
                  // whether they use them or not, and the link sits at the foot.
                  <div key={c.id} className="card group relative flex h-full flex-col border-dashed transition-all hover:-translate-y-0.5 hover:shadow-lift">
                    <Link
                      to={`/admin/challenges/${c.id}/edit`}
                      className="absolute inset-0 z-0 rounded-card"
                      aria-label={`${c.title} - finish this draft`}
                    />
                    <div className="pointer-events-none relative z-10 flex flex-1 flex-col">
                      <div className="flex items-center justify-between gap-3">
                        <Badge tone={STATUS_TONE.draft}>{tr('draft')}</Badge>
                        {(c.start_date || c.end_date) && (
                          <span className="text-xs text-smoke">
                            {formatDate(c.start_date)} → {formatDate(c.end_date)}
                          </span>
                        )}
                      </div>
                      <h3 className="mt-4 line-clamp-2 min-h-[3.5rem] text-xl font-semibold leading-7 group-hover:text-brand">{c.title || tr('Untitled challenge')}</h3>
                      <p className="mt-2 line-clamp-2 min-h-[2.5rem] text-sm leading-5 text-smoke">{c.description || ''}</p>
                      <p className="mt-auto pt-4 text-xs font-medium text-brand">{tr('Finish and publish →')}</p>
                    </div>
                  </div>
                ))}
              </Reveal>
            </section>
          )}

          {/* ---------- Past ---------- */}
          {past.length > 0 && (
            <section>
              <h2 className="mb-5 text-lg font-semibold text-smoke">{tr("Past challenges")}</h2>
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
                    <div className="pointer-events-none relative z-10 flex flex-1 flex-col">
                      <div className="flex items-center justify-between gap-3">
                        {/* Still status 'active' but past its deadline → show "ended", not "active". */}
                        <Badge tone={c.status === 'active' ? STATUS_TONE.ended : STATUS_TONE[c.status]}>{c.status === 'active' ? 'ended' : c.status}</Badge>
                        <span className="text-xs text-smoke">{formatDate(c.start_date)} → {formatDate(c.end_date)}</span>
                      </div>
                      <h3 className="mt-4 text-xl font-semibold group-hover:text-brand">{c.title}</h3>
                      <p className="mt-2 text-sm text-smoke line-clamp-2">{c.description}</p>
                      {galleries[c.id] ? (
                        /* ONE PODIUM, OR ONE PER BOARD. A challenge run as two
                           leaderboards has two sets of winners, and ranks are
                           stored per board - so a single podium off the flat
                           list would show two firsts and a second. See
                           lib/winners. */
                        galleries[c.id].boards?.length > 0 ? (
                          <div className="pointer-events-auto mt-5 space-y-4">
                            {galleries[c.id].boards.map((b) => (
                              <div key={b.id ?? 'all'}>
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand">{b.name}</p>
                                <WinnersPodium
                                  winners={b.winners}
                                  entries={b.entries}
                                  totalScore={b.totalScore}
                                  scoring={c.scoring}
                                  voucherWinners={[]}
                                  voucherPrize={c.participation_prize}
                                />
                              </div>
                            ))}
                          </div>
                        ) : (
                        <WinnersPodium
                          className="pointer-events-auto mt-5"
                          winners={galleries[c.id].winners}
                          entries={c.submissions?.[0]?.count ?? 0}
                          totalScore={galleries[c.id].totalScore}
                          scoring={c.scoring}
                          voucherWinners={galleries[c.id].voucherWinners}
                          voucherPrize={c.participation_prize}
                        />
                        )
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
