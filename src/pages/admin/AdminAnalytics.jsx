import AnalyticsTabs from './analytics/AnalyticsTabs'
import { useViewsGained, viewsReportDays, withViewsGained } from '../../lib/useViewsGained'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Area, Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, Tooltip, XAxis, YAxis,
} from 'recharts'
import { format, startOfMonth, startOfWeek, subWeeks } from 'date-fns'
import ErrorWatch from '../../components/admin/ErrorWatch'
import { allRows as allRowsSeq } from '../../lib/fetchAll'

// Every big table here is read four pages at a time (see lib/fetchAll).
const allRows = (build, opts) => allRowsSeq(build, { parallel: 4, ...opts })

// THE LAST READ IS KEPT FOR THE SESSION. Every visit re-downloaded a dozen whole tables before drawing a number. Now a
// visit within ten minutes of the last draws that read at once and refreshes it underneath; a fresh session still waits
// for the first one.
let RAW_CACHE = null
let MARKETS_CACHE = null
const RAW_TTL_MS = 10 * 60 * 1000
import { PageHeader, Skeleton, StatCard } from '../../components/ui'
import PeriodPicker from '../../components/PeriodPicker'
import { formatMoney, formatViewsTotal, formatCpm, cx } from '../../lib/utils'
import ProgrammePerformance from './analytics/ProgrammePerformance'
import { challengeSpend } from '../../lib/challengeSpend'
import CommunityHealth from './analytics/CommunityHealth'
import Referrals from './analytics/Referrals'
import Growth from './analytics/Growth'
import MarketLeague from './analytics/MarketLeague'
import VipAnalytics from './analytics/VipAnalytics'
import VipEarnings from './analytics/VipEarnings'
import { VIP_PERIODS } from '../../components/vip/analytics'
import ViewsReport from './analytics/ViewsReport'
import PerCreator from './analytics/PerCreator'
import { scopeToMarket } from '../../lib/analyticsScope'
import { PERIODS, applyPeriod, bucketFor, bucketKey, buckets, change, inRange, periodHeadline, periodRange } from '../../lib/analyticsPeriod'
import { convert } from '../../lib/programme'
import { FILL, BAR_END, gridProps, xAxisProps, yAxisProps, lineProps, barProps, cursorFill, stackShape, tooltipStyle } from '../../components/charts/chartTheme'
import ChartPanel from '../../components/charts/ChartPanel'
import Icon from '../../components/Icon'
import { flagFromIso } from '../../lib/flags'
import Recruitment from './analytics/Recruitment'
import Targets from './analytics/Targets'
import { TABS } from './analytics/tabs'

const VIEW_PERIODS = ['last_7', 'this_week', 'last_week', 'last_3', 'this_month', 'last_month', 'last_30', 'last_90', 'custom'].map((k) => PERIODS.find((p) => p.key === k))
import { moneyApi } from '../../api/money'
import { challengesApi } from '../../api/challenges'
import { submissionsApi } from '../../api/submissions'
import { profilesApi } from '../../api/profiles'
import { chatApi } from '../../api/chat'
import { marketsApi } from '../../api/markets'
import { gamesApi } from '../../api/games'
import { flightsApi } from '../../api/flights'
import { contentApi } from '../../api/content'
import { teamApi } from '../../api/team'

// THE ORDER IS THE ORDER SOMEBODY READS THEM IN, AND ETHAN SET IT.
//
// "I would just change the name to Challenges rather than Challenge performance.
// I would also move it over to the very left. So Overview, then Challenges,
// then Growth, then Community health, then Per creator, then Connections, and
// then Error monitoring on the very right. I think this is a better layout."
//
// It is, and the reason is worth writing down: the tab strip was ordered by
// when each tab was BUILT, which put the programme's headline numbers - the
// half of this page a pitch runs on - fourth, behind two tabs about how the
// community is doing. Challenges is what the programme IS. Errors go last
// because a tab you want to be empty does not belong beside the ones you open
// every day.
//
// "Challenge performance" became "Challenges" for the same reason the market
// filter became a chip: the tab does not need to explain itself in its own
// label, and the longer name was the widest thing on the strip.

// Admin analytics: the community's health at a glance. Recharts (free) for the
// charts, every dataset exportable to CSV, and every tile that has a natural
// destination is clickable.
// A family of orange shades - no yellows or off-brand colours anywhere.
const BRAND = '#d94407'       // core Tryp orange




export default function AdminAnalytics() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [marketPending, startMarket] = useTransition()
  const [raw, setRaw] = useState(() => RAW_CACHE)
  // THE MARKET CHIPS DO NOT WAIT FOR THE WHOLE LOAD. The list of markets is one tiny read; it was queued behind every
  // paged table on the page. It is asked for on its own now and drawn the moment it lands.
  const [quickMarkets, setQuickMarkets] = useState(() => MARKETS_CACHE)
  useEffect(() => {
    if (MARKETS_CACHE) return undefined
    let alive = true
    marketsApi.communities().select('id, slug, name, kind, currency, country_codes, retired_at').order('name')
      .then(({ data }) => { MARKETS_CACHE = data || []; if (alive) setQuickMarkets(MARKETS_CACHE) })
    return () => { alive = false }
  }, [])
  useEffect(() => {
    if (RAW_CACHE && Date.now() - RAW_CACHE.loadedAt < RAW_TTL_MS / 3) return
    async function load() {
      // THE BIG ONES ARE PAGED. PostgREST answers with at most a thousand rows
      // and says so only in a header, so a page that COUNTS over a whole table
      // does not fail when it crosses that - it starts quietly under-reporting
      // by a margin that grows every day, with every figure still plausible.
      // `game_scores` is one row per player per daily puzzle and is the one
      // about to cross. See lib/fetchAll. The unpaged reads below are bounded
      // by how many challenges have ever been run.
      const [
        profiles, { data: challenges }, { data: history }, submissions,
        rewards, messages, results,
        { data: feedback }, reactionRows, pollRows,
        gameScores, connections, tripRows,
        decisions, { data: seenRows }, { data: voucherCounts },
        memberRows, { data: marketRows },
      ] = await Promise.all([
        allRows(() => profilesApi.profiles().select('id, name, photo_url, created_at, accepted_at, status, is_admin, onboarded, referred_by, deletion_requested_at, is_test, last_seen_at')),
        // `community_id` is what makes a market's challenge list a real list.
        // Without it every market reported "0 challenges run here" while Spain
        // and the UK had one each.
        challengesApi.challenges().select('id, title, status, start_date, end_date, scoring, vouchers_given, community_id, prize_amount, prize_currency, cpm_target').neq('status', 'draft').order('start_date'),
        // THE PROGRAMME DID NOT START WHEN THE PLATFORM DID. Forty-nine
        // challenges ran on a spreadsheet before this existed (migrations
        // 197/198). Without them the Overview - the first screen anybody opens -
        // said the programme had run ONE challenge and produced 76,600 views,
        // against a real record of forty-nine and nineteen and a half million.
        // The linked row is dropped here for the same reason it is dropped in
        // `admin_challenge_metrics`: it is the same contest as a live one.
        challengesApi.challengeHistory().select('*').is('challenge_id', null),
        allRows(() => submissionsApi.submissions().select('id, challenge_id, creator_id, logged_views, submitted_at')),
        // `creator_id` and `currency` matter now: the per-creator table cannot
        // attribute a payout without the first, and cannot convert it without
        // the second. Without them every creator's spend read as zero, which
        // made every one of them look infinitely efficient.
        allRows(() => moneyApi.rewards().select('id, amount, status, challenge_id, reward_type, creator_id, currency, source, prize_slot, created_at, distributed_at')),
        allRows(() => chatApi.messages().select('id, sender_id, channel, created_at').eq('deleted', false)),
        // `challenge_id` so the market scope can follow a result to its
        // contest - see lib/analyticsScope.
        allRows(() => challengesApi.results().select('final_views, challenge_id')),
        // TIMESTAMPS AND WHO, NOT JUST A COUNT, so the Overview can be read over a period and a market.
        contentApi.feedback().select('status, created_at, creator_id'),
        allRows(() => chatApi.reactions().select('id, creator_id, created_at')),
        allRows(() => chatApi.pollVotes().select('id, voter_id, created_at')),
        allRows(() => gamesApi.gameScores().select('mode, created_at, player_id')),
        allRows(() => profilesApi.connections().select('id, status, creator_id, connected_creator_id, created_at, accepted_at')),
        allRows(() => flightsApi.collabPosts().select('id, creator_id, created_at')),
        allRows(() => teamApi.applicationDecisions().select('decision, created_at')),
        teamApi.adminListLastSeen(),
        // Participation vouchers are COUNTED from the entries, not read off a
        // number somebody typed. The typed one was never kept up: on the
        // Creative Challenge it said 0 where six creators had actually earned
        // one. See migration 115.
        challengesApi.challengeVoucherCounts(),
        // WHO BELONGS WHERE, so every number on this page can be read one
        // market at a time. Scoping is a filter over these same datasets rather
        // than a second set of queries - there is one definition of "a view" on
        // this page and it must not fork.
        allRows(() => marketsApi.communityMembers().select('community_id, profile_id').eq('status', 'active'), { orderBy: ['community_id', 'profile_id'] }),
        // `slug` and `country_codes` are for the market league, which draws a flag
        // per market and needs a stable key for the CSV. Without them the league
        // rendered every market with an empty flag slot and no way to tell why.
        marketsApi.communities().select('id, slug, name, kind, currency, country_codes, retired_at').order('name'),
      ])
      // WHAT A RUNNING CHALLENGE HAS COMMITTED SO FAR, for its live CPM: the
      // vouchers and awards earned to date (challenge_prize_standings, the one
      // definition). A finished challenge's cost is in `rewards` instead.
      const withEntries = new Set((submissions || []).map((s) => s.challenge_id))
      const live = (challenges || []).filter((c) => withEntries.has(c.id))
      const standings = await Promise.all(live.map((c) => challengesApi
        .challengePrizeStandings({ p_challenge: c.id })
        .then(({ data }) => [c.id, data || []], () => [c.id, []])))
      // Default every dataset so one failed query can never blank the page.
      // `loadedAt` is captured here (not in render) so derived time windows
      // stay pure under the react-hooks purity rules.
      const next = {
        profiles: profiles || [], challenges: challenges || [], history: history || [],
        submissions: submissions || [], rewards: rewards || [],
        messages: messages || [], results: results || [], feedback: feedback || [],
        reactionRows: reactionRows || [], pollRows: pollRows || [], tripRows: tripRows || [],
        reactionCount: (reactionRows || []).length, pollVoteCount: (pollRows || []).length,
        gameScores: gameScores || [], connections: connections || [],
        tripCount: (tripRows || []).length, decisions: decisions || [],
        seenRows: seenRows || [],
        voucherCounts: voucherCounts || [],
        memberRows: memberRows || [],
        marketRows: marketRows || [],
        liveStandings: Object.fromEntries(standings),
        loadedAt: Date.now(),
      }
      RAW_CACHE = next
      setRaw(next)
    }
    load()
  }, [])

  // ---------- Derived datasets ----------
  // THE REPORTING CURRENCY, READ BEFORE THE FIGURES ARE BUILT.
  //
  // In the URL with everything else, so "Spain's per-creator table in pounds"
  // is a link somebody can send. It has to be in scope ABOVE `derived`, because
  // every money figure on this page is now converted into it rather than being
  // a plain sum over rows in whatever currency each one happens to carry.
  const currency = params.get('ccy') === 'GBP' ? 'GBP' : 'EUR'

  // THE MARKET IS READ HERE, ABOVE EVERYTHING THAT USES IT, AND THAT IS NOT A
  // STYLE CHOICE (7 Sep 2026).
  //
  // THE BUG THIS FIXES: this line lived two hundred lines further down, next to
  // its setter, while `scoped` below it read `market`. `const` is hoisted into a
  // TEMPORAL DEAD ZONE rather than to `undefined`, so reading it before the
  // declaration is executed throws
  //
  //     ReferenceError: Cannot access 'market' before initialization
  //
  // on the FIRST render of the component. Every visit to /admin/analytics hit
  // the error boundary - Ethan: "analytics doesn't seem to be opening at all
  // now, I get the mayday mayday error."
  //
  // Nothing in the toolchain catches this. `eslint` passed, `vite build`
  // passed, and all 599 tests passed, because none of them render this page.
  // The only thing that finds it is opening the page, which is now what happens
  // before this file is committed.
  const tab = params.get('tab') === 'network' ? 'community' : (params.get('tab') || 'overview')
  const market = params.get('market') || ''
  // Which views the Weekly views tab counts, in the URL like the rest.
  const viewScope = ['community', 'vip'].includes(params.get('views')) ? params.get('views') : 'both'
  const setViewScope = (v) => {
    const q = { ...Object.fromEntries(params) }
    if (v === 'both') delete q.views; else q.views = v
    setParams(q, { replace: true })
  }

  // THE SCOPE IS RESOLVED BEFORE ANYTHING IS COMPUTED FROM IT.
  //
  // Growth and Per creator already read `scoped`; the Overview read `raw`, so
  // the picker existed two tabs away from the eight headline numbers everybody
  // looks at first. This block used to sit two hundred lines further down -
  // below `derived` - which is exactly why the overview could not use it.
  const markets = (raw?.marketRows || quickMarkets || []).filter((m) => m.kind !== 'network' && !m.retired_at)
  const marketName = markets.find((m) => m.id === market)?.name || null
  const scopeLabel = marketName || 'Worldwide'
  // Scoped copy of everything. `scopeToMarket` returns the ORIGINAL object when
  // there is no market, so the global case costs nothing.
  const scoped = scopeToMarket(raw, market, raw?.memberRows || [])

  // THE PERIOD, IN THE URL beside the market and the currency, so "Spain, last month" is a link. Measured against the
  // moment the data was loaded, not against render time, so the memo stays pure.
  const periodKey = PERIODS.some((p) => p.key === params.get('period')) ? params.get('period') : 'all'
  const customFrom = params.get('from') || ''
  const customTo = params.get('to') || ''
  const loadedAt = raw?.loadedAt ?? 0
  const range = useMemo(
    () => periodRange(loadedAt ? periodKey : 'all', new Date(loadedAt || 0), { from: customFrom, to: customTo }),
    [loadedAt, periodKey, customFrom, customTo],
  )
  const periodOn = !!(range.start || range.end)
  // The eight headline figures for the period and for the one before it, worked out the same way.
  const [openedAt] = useState(() => Date.now())
  const overviewRange = useMemo(() => periodOn ? range : periodRange('this_month', new Date(loadedAt || openedAt)), [periodOn, range, loadedAt, openedAt])
  const overviewDays = viewsReportDays(overviewRange)
  const overviewViews = useViewsGained(tab === 'overview' ? overviewDays.from : null, tab === 'overview' ? overviewDays.to : null, market)
  // THIS MONTH SO FAR AGAINST THE SAME DAYS LAST MONTH, for the All time overview.
  const monthCompare = useMemo(() => {
    if (!scoped || periodOn || !loadedAt) return null
    const money = (n, from) => convert(Number(n) || 0, from || 'EUR', currency) || 0
    const r = periodRange('this_month', new Date(loadedAt))
    return { now: withViewsGained(periodHeadline(scoped, r, money), overviewViews.data?.totals), prev: r.prev ? withViewsGained(periodHeadline(scoped, r.prev, money), overviewViews.data?.prev) : null }
  }, [scoped, periodOn, loadedAt, currency, overviewViews.data])
  const headline = useMemo(() => {
    if (!scoped || !periodOn) return null
    const money = (n, from) => convert(Number(n) || 0, from || 'EUR', currency) || 0
    return {
      now: withViewsGained(periodHeadline(scoped, range, money), overviewViews.data?.totals),
      prev: range.prev ? withViewsGained(periodHeadline(scoped, range.prev, money), overviewViews.data?.prev) : null,
    }
  }, [scoped, range, periodOn, currency, overviewViews.data])


  const derived = useMemo(() => {
    if (!scoped) return null
    // Everything below reads `raw`, and now `raw` IS the scoped copy. Shadowing
    // rather than renaming two hundred references: `scopeToMarket` returns the
    // ORIGINAL object when no market is chosen, so the worldwide case is
    // byte-identical to what this always did.
    // AND THE PERIOD: `applyPeriod` narrows everything that HAPPENED to the chosen stretch of time and returns the same
    // object for All time, so that case is still byte-identical. `whole` keeps the market's un-narrowed rows for the few
    // things that are about a challenge as a whole or about the state of the roster.
    const whole = scoped
    const periodOn = !!(range?.start || range?.end)
    const raw = applyPeriod(scoped, range)
    // EVERY AMOUNT COMES THROUGH HERE.
    //
    // THE BUG THIS FIXES: the overview's money tiles were raw `reduce`s over `r.amount` across a table holding both
    // pounds and euros, and the currency toggle changed only the SYMBOL in front of the result - so "£190" and "€190"
    // were the same number, and neither of them was right. Being in euros means being converted into euros, not
    // relabelled.
    const money = (n, from) => convert(Number(n) || 0, from || 'EUR', currency) || 0
    const {
      profiles, challenges, history, submissions, rewards, messages, results, feedback,
      reactionCount, pollVoteCount, gameScores, connections, tripCount,
      seenRows, voucherCounts, loadedAt,
    } = raw

    // THE PROGRAMME'S RECORD IS BOTH HALVES. `history` holds the forty-nine
    // challenges that ran before this platform (migrations 197/198); `challenges`
    // holds the one that has run on it. The headline tiles below are about the
    // PROGRAMME, so they count both, and the per-challenge charts stay on the
    // live half because a spreadsheet row has no submissions to chart.
    //
    // NULL VIEWS ARE NOT ZERO VIEWS. Fourteen historical rows were never
    // measured, so they contribute prize money and no views - and are therefore
    // excluded from anything divided by views. Same rule as lib/programme.
    const hist = history || []
    const histMeasured = hist.filter((h) => h.total_views != null)
    const histViews = histMeasured.reduce((n, h) => n + Number(h.total_views || 0), 0)
    const histPrize = hist.reduce((n, h) => n + money(h.prize_total, h.prize_currency), 0)
    const histMeasuredPrize = histMeasured.reduce((n, h) => n + money(h.prize_total, h.prize_currency), 0)
    const histPosts = hist.reduce((n, h) => n + Number(h.posts || 0), 0)

    const realCreators = profiles.filter((p) => !p.is_admin && !p.deletion_requested_at && !p.is_test)

    // 1. Creator growth: new sign-ups per month + cumulative total.
    // 2. Submission momentum: entries per month.
    // OVER A PERIOD THE TIMELINES ARE CUT TO FIT IT: by day up to a fortnight, by week up to a quarter, by month beyond
    // (lib/analyticsPeriod.bucketFor), every bucket drawn so a quiet day is a zero and not a gap. The running total
    // starts from everybody who had joined BEFORE the period, so the line is the real roster.
    let growth
    let momentum
    if (periodOn) {
      const unit = bucketFor(range)
      const keyOf = bucketKey(unit)
      const slots = buckets(range, unit)
      const signups = {}
      for (const p of realCreators) if (inRange(p.created_at, range)) signups[keyOf(p.created_at)] = (signups[keyOf(p.created_at)] || 0) + 1
      const subsBy = {}
      for (const s of submissions) subsBy[keyOf(s.submitted_at)] = (subsBy[keyOf(s.submitted_at)] || 0) + 1
      let running = range.start ? realCreators.filter((p) => new Date(p.created_at) < range.start).length : 0
      growth = slots.map((b) => {
        running += signups[b.key] || 0
        return { month: b.label, newCreators: signups[b.key] || 0, creators: running }
      })
      momentum = slots.map((b) => ({ month: b.label, submissions: subsBy[b.key] || 0 }))
    } else {
      const byMonth = {}
      for (const p of realCreators) {
        const key = format(startOfMonth(new Date(p.created_at)), 'yyyy-MM')
        byMonth[key] = (byMonth[key] || 0) + 1
      }
      let running = 0
      growth = Object.keys(byMonth).sort().map((key) => {
        running += byMonth[key]
        return { month: format(new Date(key + '-01'), 'MMM yy'), newCreators: byMonth[key], creators: running }
      })
      const subsByMonth = {}
      for (const s of submissions) {
        const key = format(startOfMonth(new Date(s.submitted_at)), 'yyyy-MM')
        subsByMonth[key] = (subsByMonth[key] || 0) + 1
      }
      momentum = Object.keys(subsByMonth).sort().map((key) => ({
        month: format(new Date(key + '-01'), 'MMM yy'), submissions: subsByMonth[key],
      }))
    }

    // 3. Per-challenge: submissions + total/average logged views.
    // A challenge's bars are the WHOLE challenge (every entry, whenever it came in): over a period the list is the
    // challenges that were open in it, but a CPM worked out on half a challenge's entries is not that challenge's CPM.
    const perChallenge = challenges.map((c) => {
      const subs = whole.submissions.filter((s) => s.challenge_id === c.id)
      const viewed = subs.filter((s) => s.logged_views != null)
      const totalViews = viewed.reduce((sum, s) => sum + s.logged_views, 0)
      return {
        id: c.id,
        status: c.status,
        name: c.title.length > 18 ? c.title.slice(0, 18) + '…' : c.title,
        fullTitle: c.title,
        creators: new Set(subs.map((s) => s.creator_id)).size,
        submissions: subs.length,
        totalViews,
        avgViews: viewed.length ? Math.round(totalViews / viewed.length) : 0,
        prizesPaid: rewards
          .filter((r) => r.challenge_id === c.id && r.status === 'distributed')
          .reduce((sum, r) => sum + money(r.amount, r.currency), 0),
        // CPM PER CHALLENGE. Running: the cash pot plus vouchers earned so far over views so far - the same number as
        // the live band on the challenge's own page (lib/challengeSpend). Finished: what was actually awarded, cash and
        // vouchers, pending included.
        cpm: (() => {
          if (!totalViews) return null
          if (c.status === 'active') {
            const sp = challengeSpend(c, raw.liveStandings?.[c.id] || [], totalViews, rewards.filter((r) => r.challenge_id === c.id))
            return money(sp.spend, c.prize_currency) / (totalViews / 1000)
          }
          const awarded = rewards
            .filter((r) => r.challenge_id === c.id && r.status !== 'cancelled')
            .reduce((sum, r) => sum + money(r.amount, r.currency), 0)
          const spend = awarded > 0 ? awarded : money(c.prize_amount, c.prize_currency)
          return spend > 0 ? spend / (totalViews / 1000) : null
        })(),
      }
    })

    // ---- Money and reach ----
    // Keep cash prizes and Tryp.com voucher value separate so the split between
    // real cash paid out and vouchers gifted is obvious at a glance.
    const distributed = rewards.filter((r) => r.status === 'distributed')
    const cashPaid = distributed.filter((r) => r.reward_type !== 'voucher').reduce((s, r) => s + money(r.amount, r.currency), 0)
    const voucherPaid = distributed.filter((r) => r.reward_type === 'voucher').reduce((s, r) => s + money(r.amount, r.currency), 0)
    const totalPaid = cashPaid + voucherPaid
    const liveViews = perChallenge.reduce((s, c) => s + c.totalViews, 0)
    const totalViews = liveViews + histViews
    // A points board keeps its SCORE in `final_views`, so it is not a view count.
    const pointsBoards = new Set(challenges.filter((c) => c.scoring === 'points').map((c) => c.id))
    const verifiedViews = results.filter((r) => !pointsBoards.has(r.challenge_id)).reduce((s, r) => s + (r.final_views || 0), 0)
    // The programme's cash: what the reward ledger knows about, plus what the
    // spreadsheet recorded before there was a ledger.
    const programmeCash = cashPaid + histPrize
    // Divided like by like - the numerator only counts challenges whose views are known, exactly as lib/programme does.
    // Mixing them is what made the Challenge performance tab read EUR 0.47 against the team's own EUR 0.38.
    const measuredCash = cashPaid + histMeasuredPrize
    const costPer1k = totalViews > 0 && measuredCash > 0 ? measuredCash / (totalViews / 1000) : null
    // Two CPMs, deliberately, and never one blended average of averages: cash is
    // what left the bank, vouchers are face value we granted. Reporting only the
    // first understates the programme and only the second overstates the cost.
    const combinedCpm = totalViews > 0 && totalPaid + histMeasuredPrize > 0
      ? (totalPaid + histMeasuredPrize) / (totalViews / 1000) : null

    // ---- Community health ----
    const active = realCreators.filter((p) => p.status === 'active')
    const pendingReview = realCreators.filter((p) => p.status === 'pending' && p.onboarded)
    const notCompleted = realCreators.filter((p) => p.status === 'pending' && !p.onboarded)
    const submittedIds = new Set(submissions.map((s) => s.creator_id))
    const participating = active.filter((p) => submittedIds.has(p.id)).length
    const participationRate = active.length ? Math.round((participating / active.length) * 100) : 0
    // New creators in the last 30 days - a quick read on recent growth momentum.
    const thirtyAgo = loadedAt - 30 * 24 * 60 * 60 * 1000
    const newLast30 = realCreators.filter((p) => new Date(p.created_at).getTime() >= thirtyAgo).length
    // Average logged views per submission - a simple reach-efficiency metric.
    // THE DENOMINATOR HAS TO COVER THE SAME POSTS AS THE NUMERATOR. `totalViews`
    // is now the whole programme, so dividing it by the LIVE entries alone
    // reported 519,000 average views per entry against a real figure nearer
    // 7,500 - the same like-for-like mistake as the CPM, one line further down.
    const liveViewed = submissions.filter((s) => s.logged_views != null).length
    const histMeasuredPosts = histMeasured.reduce((n, h) => n + Number(h.posts || 0), 0)
    const viewedCount = liveViewed + histMeasuredPosts
    const avgViewsPerEntry = viewedCount ? Math.round(totalViews / viewedCount) : 0

    // ---- Platform activity ----
    // "Active" = in-app heartbeat OR a login, whichever is newer (the RPC
    // exposes auth last_sign_in_at, which catches people on sessions that
    // predate the heartbeat column).
    const weekAgo = loadedAt - 7 * 24 * 60 * 60 * 1000
    const lastActivityById = {}
    for (const r of seenRows) {
      const ts = [r.last_seen_at, r.last_sign_in_at].filter(Boolean).map((x) => new Date(x).getTime())
      if (ts.length) lastActivityById[r.id] = Math.max(...ts)
    }
    const activeThisWeek = realCreators.filter((p) => {
      const ts = lastActivityById[p.id] ?? (p.last_seen_at ? new Date(p.last_seen_at).getTime() : 0)
      return ts >= weekAgo
    }).length
    // Over a period, "active" is DID SOMETHING in it - posted, wrote, played, reacted or voted - because the only
    // last-seen we keep is the latest one, which says nothing about last month.
    const activeInPeriod = periodOn ? (() => {
      const real = new Set(realCreators.map((p) => p.id))
      const did = new Set([
        ...submissions.map((x) => x.creator_id), ...messages.map((x) => x.sender_id),
        ...gameScores.map((x) => x.player_id), ...(raw.reactionRows || []).map((x) => x.creator_id),
        ...(raw.pollRows || []).map((x) => x.voter_id),
      ])
      return [...did].filter((id) => real.has(id)).length
    })() : null
    const connectionsMade = connections.filter((c) => c.status === 'accepted').length
    const testIds = new Set(profiles.filter((p) => p.is_test).map((p) => p.id))
    const realGameScores = gameScores.filter((g) => !testIds.has(g.player_id))

    // Games played per mode (friendly labels).
    const GAME_LABEL = { flags: 'Flags', map: 'Find on map', airports: 'Airports', currencies: 'Currencies', pinpoint: 'Guess the Country', zip: 'Flight Path' }
    const gamesByMode = Object.entries(
      realGameScores.reduce((acc, g) => { acc[g.mode] = (acc[g.mode] || 0) + 1; return acc }, {})
    ).map(([m, plays]) => ({ name: GAME_LABEL[m] || m, plays })).sort((a, b) => b.plays - a.plays)

    // Weekly pulse: messages, submissions and game plays per week, last 8 weeks.
    // Over a period it is the period, cut the same way as the timelines above.
    const pulseUnit = periodOn ? bucketFor(range) : 'week'
    const weeks = periodOn
      ? buckets(range, pulseUnit).map((b) => b.key)
      : Array.from({ length: 8 }, (_, i) => format(startOfWeek(subWeeks(loadedAt, 7 - i), { weekStartsOn: 1 }), 'yyyy-MM-dd'))
    const weekLabels = periodOn ? Object.fromEntries(buckets(range, pulseUnit).map((b) => [b.key, b.label])) : null
    const weekKey = periodOn ? bucketKey(pulseUnit) : (d) => format(startOfWeek(new Date(d), { weekStartsOn: 1 }), 'yyyy-MM-dd')
    const tally = (rows, dateOf) => rows.reduce((acc, r) => {
      const k = weekKey(dateOf(r))
      acc[k] = (acc[k] || 0) + 1
      return acc
    }, {})
    const msgByWeek = tally(messages.filter((m) => m.created_at), (m) => m.created_at)
    const subByWeek = tally(submissions, (s) => s.submitted_at)
    const gameByWeek = tally(realGameScores, (g) => g.created_at)
    const weeklyPulse = weeks.map((k) => {
      return {
        week: weekLabels ? weekLabels[k] : format(new Date(k + 'T00:00:00'), 'd MMM'),
        messages: msgByWeek[k] || 0,
        submissions: subByWeek[k] || 0,
        games: gameByWeek[k] || 0,
      }
    })

    // ---- Engagement ----
    const openFeedback = feedback.filter((f) => f.status === 'new').length

    return {
      growth, momentum,
      totalPaid, cashPaid: programmeCash, voucherPaid, totalViews, verifiedViews, costPer1k, combinedCpm,
      activity7d: { activeThisWeek, activeInPeriod, connectionsMade, tripsPosted: tripCount, gamesPlayed: realGameScores.length },
      gamesByMode, weeklyPulse,
      engagement: {
        reactions: reactionCount, pollVotes: pollVoteCount, chatMessages: messages.length, feedbackTotal: feedback.length, openFeedback,
        vouchersGiven: (voucherCounts ?? []).reduce((sum, v) => sum + (v.vouchers || 0), 0),
      },
      community: { active: active.length, pendingReview: pendingReview.length, notCompleted: notCompleted.length, participating, participationRate },
      totals: {
        creators: active.length,
        submissions: submissions.length + histPosts,
        challenges: challenges.length + hist.length,
        unmeasuredChallenges: hist.length - histMeasured.length,
        newLast30,
        avgViewsPerEntry,
      },
    }
  }, [scoped, currency, range])

  // The three tabs answer three different questions, and each is a page's worth of material on its own: what is
  // happening, what the money bought, and whether the community is actually alive. The tab is in the URL so a link to
  // "the CPM table" lands on the CPM table. `network` was the Connections tab; it is a section of Community health now,
  // so an old link lands there.
  const setCurrency = (next) => {
    const q = { ...Object.fromEntries(params) }
    if (next === 'EUR') delete q.ccy; else q.ccy = next
    setParams(q, { replace: true })
  }

  // A DRILL-DOWN FROM A CHART.
  //
  // The growth charts answer "when", and the next question is always "who" -
  // which month was that, and which creators. Clicking a month takes you to the
  // per-creator table for the same scope, which is where that answer lives.
  const drillTo = (nextTab) => {
    const q = { ...Object.fromEntries(params) }
    q.tab = nextTab
    setParams(q, { replace: true })
  }
  const setTab = (next) => {
    const q = { ...Object.fromEntries(params) }
    if (next === 'overview') delete q.tab; else q.tab = next
    setParams(q, { replace: true })
  }
  // THE MARKET IS IN THE URL TOO, so "Spain's growth chart" is a link somebody
  // can send. It survives a tab change on purpose: a country manager picks
  // their market once and then reads across the tabs.
  const setPeriod = (next, from, to) => {
    const q = { ...Object.fromEntries(params) }
    if (next === 'all') delete q.period; else q.period = next
    if (next === 'custom') { q.from = from; q.to = to } else { delete q.from; delete q.to }
    setParams(q, { replace: true })
  }
  // A MARKET SWITCH IS A TRANSITION: every figure on the page is rebuilt for the new market, and doing that inside the
  // click froze the chips for a moment - "it takes a while for Germany, Nordic, Portugal... to load in". The chip now
  // lights at once and the page dims while the numbers catch up.
  const marketRowRef = useRef(null)
  useEffect(() => {
    const row = marketRowRef.current
    const chip = row?.querySelector('[aria-pressed="true"]')
    if (!row || !chip) return
    const l = chip.offsetLeft - 12
    const r = chip.offsetLeft + chip.offsetWidth + 12 - row.clientWidth
    if (l < row.scrollLeft) row.scrollTo({ left: Math.max(0, l), behavior: 'smooth' })
    else if (r > row.scrollLeft) row.scrollTo({ left: r, behavior: 'smooth' })
  }, [market])
  const setMarket = (next) => {
    const q = { ...Object.fromEntries(params) }
    if (next) q.market = next; else delete q.market
    startMarket(() => setParams(q, { replace: true }))
  }

  // ---------------------------------------------------------------------
  // ONE FILTER BAR, NOT FOUR ROWS OF CONTROLS.
  //
  // They are counting six horizontal bands of chrome above the first number on the page, and the reason there were six
  // is that each one was added by whoever needed it, in its own row, without anybody looking at the stack. Three of them
  // asked the same two questions twice: this page had a market scope AND the Challenges tab had its own "Where"; this
  // page had a currency toggle AND the Challenges tab had its own "Money".
  //
  // WHAT IS LEFT IS TWO BANDS. The tabs, then one bar that holds every control
  // that narrows what you are reading - where, and in what money - with the
  // scope note as quiet text at its end rather than as a row of its own. The
  // period and the actions belong to the Challenges tab and stay with it, one
  // row, above the content they act on.
  //
  // The bar SCROLLS SIDEWAYS below `sm` for the same reason the tab strip does:
  // eight market chips wrapped is three rows of chrome on a phone, which is the
  // complaint, in miniature, being made by the fix for it.
  // ---------------------------------------------------------------------
  const scopeNote = market
    ? `${(scoped?.profiles || []).filter((p) => !p.is_test && !p.is_admin).length} creators · ${(scoped?.challenges || []).length} challenges here`
    : null

  const filterBar = (marketsOff = false, periodOff = false, extra = {}) => (
    <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-gray-100 bg-white p-1.5 shadow-card">
      {/* ON A PHONE THE MARKETS GET THEIR OWN ROW. Squeezed beside the date they scrolled in a sliver, and a picked
          market chip clipped at the edge read as "an orange bar on the right side" of the date. Full width, a fade at
          the edge instead of a hard cut, and the picked chip scrolled into view. */}
      {/* THE MARKETS, WITH A SLIDING PILL (15 Oct 2026). Flags and a globe so a market reads at a glance; on the VIP tab
          each chip is that market's VIP programme ("Spain VIP" with a star). The row has its own inner padding and the
          picked chip is scrolled fully into view, so its rounded corners are never cut by the scroller's edge. */}
      <MarketChips rowRef={marketRowRef} off={marketsOff} market={market} markets={markets} onPick={setMarket} vip={!!extra.vip} />

      {scopeNote && <span className="shrink-0 px-1 text-[11px] text-smoke max-lg:hidden">{scopeNote}</span>}

      {/* WHEN. One custom dropdown, the presets people actually ask for, and "Custom dates" opening two day fields.
          Overview only: the other tabs have their own clocks (the league is a month, the log has its year/month), so
          here it is dimmed rather than removed and the bar never changes shape between tabs. */}
      <PeriodPicker
        value={extra.periodValue ?? periodKey}
        from={customFrom}
        to={customTo}
        onChange={setPeriod}
        disabled={periodOff}
        periods={extra.periods}
      />

      {/* THE REPORTING CURRENCY. Half the markets are in euros and half in
          pounds, and a figure that does not say which is not a figure. EUR is
          the default because it is what the programme reports in; the toggle
          converts rather than re-reads, so the two views are always the same
          money.

          IT IS ON EVERY TAB BECAUSE IT WAS ON TWO AND SHOULD HAVE BEEN ON ALL.
          The Overview shows four money figures that all read `currency` and all
          convert correctly, and the control simply was not rendered there - so
          the whole thing was reachable by typing `?ccy=GBP` into the address
          bar. Now it lives once, here, and the Challenges tab is handed the
          same value rather than keeping a second one that could disagree. */}
      {extra.right ?? (
      <div className="flex shrink-0 items-center gap-0.5 border-gray-100 pl-3 max-sm:border-l-0 sm:border-l">
        {['EUR', 'GBP'].map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCurrency(c)}
            aria-pressed={currency === c}
            className={cx(
              'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
              currency === c ? 'bg-brand text-white' : 'text-smoke hover:bg-cloud hover:text-ink',
            )}
          >
            {c === 'EUR' ? '€ EUR' : '£ GBP'}
          </button>
        ))}
      </div>
      )}
    </div>
  )

  // IT SCROLLS SIDEWAYS, IT DOES NOT WRAP.
  //
  // THE BUG THIS FIXES: five tabs, two of them called "Challenge performance" and "Community health", inside `flex-wrap`
  // with the underline rule on the same element. On a phone that is three rows of tabs, and only the LAST row sits on
  // the rule - the other two float above it with their active underline drawn in mid-air, over a heading's worth of
  // vertical space.
  //
  // The rule belongs to the wrapper and the tabs scroll under it, which is one
  // row at every width. `-mb-px` is on the ROW now rather than each button, so
  // the active tab's underline lands on the rule wherever it has scrolled to.
  const tabBar = <AnalyticsTabs tabs={TABS} active={tab} onChange={setTab} />

  // ONE FRAME FOR EVERY TAB, AND NO SENTENCE UNDER THE TITLE. Every tab used to return its own page with its own header,
  // so a switch rebuilt the header, the tab strip and the filter row, and the subtitle's line count moved everything
  // below it. Now the header, the strip and the filters are one tree that stays mounted, and only the body (keyed on the
  // tab) fades in under them.
  //
  // NO MARKET FILTER ON THE LEAGUE: the page is the comparison, so scoping it to one market would leave a
  // league table with one row in it. NO MARKET PICKER ON ERRORS: a crash is a property of the code and the
  // route, not of a market, and a control that cannot change the answer teaches people controls do not work - so
  // on those two tabs the bar stays where it is but is dimmed and switched off.
  const shell = (body, { filters = true, bar = true, markets: marketsOn = true, period: periodCtl = false, extra } = {}) => (
    <div className="page">
      <PageHeader back="/admin" title="Analytics" />
      {tabBar}
      {/* Kept in place on the two tabs it cannot change (dimmed, not removed), so
          the body starts at the same height on every tab and nothing jumps. */}
      {bar && <div aria-hidden={!filters} className={cx('transition-opacity duration-200', !filters && 'pointer-events-none select-none opacity-35')}>{filterBar(!marketsOn, !periodCtl, extra)}</div>}
      <div key={tab} className={cx('animate-tab-in transition-opacity duration-200', marketPending && 'opacity-50')}>{body}</div>
    </div>
  )

  if (tab === 'errors') return shell(<ErrorWatch />, { filters: false })
  // TARGETS & PROFIT HAS ITS OWN CONTROLS (who, which months, which costs) and the plan is programme-wide, not per market,
  // so the page's bar is left out rather than dimmed: two bars of controls, one of them dead, read as one broken one.
  if (tab === 'targets') return shell(<Targets />, { filters: false, bar: false })
  if (tab === 'recruitment') return shell(<Recruitment raw={scoped} market={market} markets={markets} scopeLabel={scopeLabel} range={periodOn ? range : null} />, { period: true })
  // WEEKLY VIEWS USES THE PAGE'S OWN BAR (14 Oct 2026). It used to grey the bar out and draw a second panel of controls
  // under it. Now the markets narrow it, the period picker holds the views periods (a year of days at most, so All time
  // reads as the last 7 days here), and the currency switch becomes the Community / VIP switch.
  if (tab === 'views') {
    const vKey = VIEW_PERIODS.some((p) => p.key === periodKey) ? periodKey : 'last_7'
    const vRange = periodRange(vKey, new Date(loadedAt || openedAt), { from: customFrom, to: customTo })
    const scopeToggle = (
      <div className="flex shrink-0 items-center gap-0.5 border-gray-100 pl-3 max-sm:border-l-0 sm:border-l">
        {[['both', 'All'], ['community', 'Community'], ['vip', 'VIP']].map(([k, label]) => (
          <button key={k} type="button" onClick={() => setViewScope(k)} aria-pressed={viewScope === k}
            className={cx('rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors', viewScope === k ? 'bg-brand text-white' : 'text-smoke hover:bg-cloud hover:text-ink')}>
            {label}
          </button>
        ))}
      </div>
    )
    return shell(<ViewsReport market={market} marketName={marketName} allMarkets={markets} periodKey={vKey} range={vRange} scope={viewScope} />,
      { period: true, extra: { periods: VIEW_PERIODS, periodValue: vKey, right: scopeToggle } })
  }
  if (tab === 'vip') {
    const vKey = VIP_PERIODS.includes(periodKey) ? periodKey : 'last_30'
    const vRange = periodRange(vKey, new Date(loadedAt || openedAt), { from: customFrom, to: customTo })
    return shell(<VipAnalytics market={market} periodKey={vKey} range={vRange} />,
      { period: true, extra: { vip: true, periods: VIP_PERIODS.map((k) => PERIODS.find((p) => p.key === k)), periodValue: vKey, right: <span /> } })
  }
  if (tab === 'earnings') return shell(<VipEarnings market={market} marketName={marketName} />, { extra: { right: <span /> } })
  if (tab === 'markets') return shell(<MarketLeague raw={raw} currency={currency} />, { markets: false })
  if (tab === 'growth') return shell(<Growth raw={scoped} scopeLabel={scopeLabel} onDrill={drillTo} />)
  if (tab === 'referrals') return shell(<Referrals market={market} memberRows={raw?.memberRows || []} scopeLabel={scopeLabel} />)
  if (tab === 'creators') return shell(<PerCreator raw={applyPeriod(scoped, range)} currency={currency} scopeLabel={periodOn ? `${scopeLabel} · ${range.label}` : scopeLabel} />, { period: true })
  if (tab === 'programme') return shell(<ProgrammePerformance market={marketName} currency={currency} mode="list" range={periodOn ? range : null} />, { period: true })
  if (tab === 'community') return shell(<CommunityHealth market={market} memberRows={raw?.memberRows || []} scopeLabel={scopeLabel} />)

  if (!derived) {
    return shell(
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2"><Skeleton className="h-80" /><Skeleton className="h-80" /></div>
      </div>,
      { period: true },
    )
  }

  const pulseKeys = ['messages', 'games', 'submissions']
  return shell(
    <>
      {/* ---- Headline numbers ---- */}
      {overviewViews.error && <p role="alert" className="mb-4 rounded-xl border border-brand/20 bg-brand-tint p-4 text-sm">Views could not be loaded: {overviewViews.error}</p>}
      {periodOn && headline ? (
        <PeriodTiles
          now={headline.now}
          prev={headline.prev}
          range={range}
          scopeLabel={scopeLabel}
          members={derived.totals.creators}
          currency={currency}
          onCreators={() => navigate('/admin/creators')}
          onChallenges={() => setTab('programme')}
          onMoney={() => navigate('/admin/rewards')}
        />
      ) : (
        <>
          <div className="mb-6 grid auto-rows-fr grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              <StatCard key="c" label="Creators" value={derived.totals.creators} hint={derived.totals.newLast30 > 0 ? `+${derived.totals.newLast30} in last 30 days` : undefined} onClick={() => navigate('/admin/creators')} />,
              <StatCard key="ch" label="Challenges run" value={derived.totals.challenges} hint={derived.totals.unmeasuredChallenges ? `${derived.totals.unmeasuredChallenges} with no views logged` : 'live and logged'} onClick={() => setTab('programme')} />,
              <StatCard key="s" label="Submissions" value={derived.totals.submissions} hint={derived.totals.avgViewsPerEntry > 0 ? `${formatViewsTotal(derived.totals.avgViewsPerEntry)} avg views/entry` : undefined} />,
              <StatCard key="v" label="Total views" value={formatViewsTotal(derived.totalViews)} hint={derived.verifiedViews > 0 ? `${formatViewsTotal(derived.verifiedViews)} verified` : 'logged by creators'} />,
              <StatCard key="cp" label="Cash prizes paid" value={formatMoney(derived.cashPaid, currency)} hint="the whole programme" onClick={() => navigate('/admin/rewards')} />,
              <StatCard key="vo" label="Voucher value given" value={formatMoney(derived.voucherPaid, currency)} hint="Tryp.com vouchers" onClick={() => navigate('/admin/rewards')} />,
              <StatCard key="cc" label="Cash CPM" value={derived.costPer1k != null ? formatMoney(derived.costPer1k, currency) : '·'} hint="cash spend per 1,000 views" />,
              <StatCard key="tc" label="Total CPM" value={derived.combinedCpm != null ? formatMoney(derived.combinedCpm, currency) : '·'} hint="cash and vouchers per 1,000 community views gained" />,
            ].map((el, i) => <div key={i} className="animate-rise" style={{ animationDelay: `${i * 35}ms` }}>{el}</div>)}
          </div>
          {monthCompare?.prev && <MonthCompare data={monthCompare} currency={currency} onPick={() => setPeriod('this_month')} />}
        </>
      )}

      {/* ---- Economics: ratios, month by month, every challenge ---- */}
      <div className="mb-10 mt-10">
        <ProgrammePerformance market={marketName} currency={currency} mode="summary" range={periodOn ? range : null} />
      </div>

      {/* ---- Growth ---- */}
      <div className="mb-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartPanel
          title="Creator growth"
          subtitle={periodOn ? `New sign-ups per ${bucketFor(range)} (bars) and members in total (line)` : 'New sign-ups per month (bars) and creators in total (line)'}
          data={derived.growth} minPoint={30}
          csv={{ name: 'creator-growth.csv', rows: derived.growth.map(({ month, newCreators, creators }) => ({ month, new_signups: newCreators, cumulative: creators })) }}
          render={(rows) => (
            <ComposedChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="month" {...xAxisProps} />
              <YAxis yAxisId="l" {...yAxisProps} allowDecimals={false} />
              <YAxis yAxisId="r" orientation="right" {...yAxisProps} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={cursorFill} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
              <Bar yAxisId="l" dataKey="newCreators" name="New sign-ups" fill={FILL.light} {...barProps} />
              <Line yAxisId="r" dataKey="creators" name="Creators in total" stroke={BRAND} {...lineProps} />
            </ComposedChart>
          )}
        />
        <ChartPanel
          title="Submission momentum"
          subtitle={periodOn ? `Videos submitted per ${bucketFor(range)}` : 'Videos submitted per month'}
          data={derived.momentum} minPoint={30}
          csv={{ name: 'submission-momentum.csv' }}
          render={(rows) => (
            <ComposedChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="month" {...xAxisProps} />
              <YAxis {...yAxisProps} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={cursorFill} />
              <Area dataKey="submissions" name="Videos" stroke={BRAND} fill={FILL.area} {...lineProps} />
            </ComposedChart>
          )}
        />
      </div>

      {/* ---- Community activity: kept, but quiet. The team: "not really important stuff, but we should still have it
           somewhere". One strip of plain numbers (no highlighted box) and two charts. ---- */}
      <section className="mb-4">
        <h2 className="mb-3 text-lg font-semibold">Community activity{periodOn && <span className="font-normal text-smoke"> · {range.label}</span>}</h2>
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 rounded-card border border-gray-100 bg-white px-5 py-4 shadow-card animate-rise sm:grid-cols-3 lg:grid-cols-5">
          <QuietStat label={periodOn ? 'Active creators' : 'Active this week'} value={periodOn ? derived.activity7d.activeInPeriod : derived.activity7d.activeThisWeek} onClick={() => navigate('/admin/creators')} />
          <QuietStat label="Games played" value={derived.activity7d.gamesPlayed} />
          <QuietStat label="Connections made" value={derived.activity7d.connectionsMade} onClick={() => setTab('community')} />
          <QuietStat label="Trips posted" value={derived.activity7d.tripsPosted} onClick={() => navigate('/collab')} />
          <QuietStat label="Chat messages" value={derived.engagement.chatMessages} />
          <QuietStat label="Reactions" value={derived.engagement.reactions} />
          <QuietStat label="Poll votes" value={derived.engagement.pollVotes} />
          <QuietStat label="Feedback" value={derived.engagement.feedbackTotal} hint={derived.engagement.openFeedback > 0 ? `${derived.engagement.openFeedback} to triage` : null} onClick={() => navigate('/admin/feedback')} />
          <QuietStat label="Vouchers given" value={derived.engagement.vouchersGiven} />
          <QuietStat label="Participation" value={`${derived.community.participationRate}%`} hint={`${derived.community.participating} have posted`} />
        </div>
      </section>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartPanel
          title={periodOn ? 'Activity pulse' : 'Weekly pulse'}
          subtitle={periodOn ? `Messages, game plays and videos per ${bucketFor(range)}` : 'Messages, game plays and videos per week, last 8 weeks'}
          data={derived.weeklyPulse} minPoint={36}
          csv={{ name: 'weekly-pulse.csv' }}
          render={(rows) => (
            <BarChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="week" {...xAxisProps} />
              <YAxis {...yAxisProps} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={cursorFill} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
              <Bar dataKey="messages" name="Messages" stackId="pulse" fill={FILL.pale} maxBarSize={36} animationDuration={600} shape={stackShape(pulseKeys, 'messages')} />
              <Bar dataKey="games" name="Game plays" stackId="pulse" fill={FILL.light} maxBarSize={36} animationDuration={600} shape={stackShape(pulseKeys, 'games')} />
              <Bar dataKey="submissions" name="Videos" stackId="pulse" fill={FILL.brand} maxBarSize={36} animationDuration={600} shape={stackShape(pulseKeys, 'submissions')} />
            </BarChart>
          )}
        />
        <ChartPanel
          title="Games played by mode"
          subtitle="Which travel games the community plays"
          data={derived.gamesByMode} height={220}
          csv={{ name: 'games-by-mode.csv' }}
          render={(rows) => (
            <BarChart className="chart-h" data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid {...gridProps} vertical horizontal={false} />
              <XAxis type="number" {...xAxisProps} allowDecimals={false} />
              <YAxis type="category" dataKey="name" {...yAxisProps} width={110} />
              <Tooltip contentStyle={tooltipStyle} cursor={cursorFill} />
              <Bar dataKey="plays" name="Plays" fill={FILL.brandH} radius={BAR_END} maxBarSize={18} animationDuration={600} />
            </BarChart>
          )}
        />
      </div>
    </>,
    { period: true },
  )
}

// THIS MONTH AGAINST LAST (14 Oct 2026). "We don't seem to have month versus month for ... the main overview." Month to
// date against the same days of last month, so the comparison is fair on the 14th as on the 30th. Pressing it switches
// the page to This month for the full picture.
function MonthCompare({ data, currency, onPick }) {
  const { now, prev } = data
  const items = [
    ['New creators', now.newCreators, prev.newCreators, (v) => v],
    ['Videos', now.submissions, prev.submissions, (v) => v],
    ['Community views gained', now.views, prev.views, (v) => v == null ? '…' : formatViewsTotal(v)],
    ['Cash paid', now.cash, prev.cash, (v) => formatMoney(v, currency)],
    ['Total CPM', now.totalCpm, prev.totalCpm, (v) => (v == null ? '·' : formatCpm(v, currency)), true],
  ]
  return (
    <button type="button" onClick={onPick} className="group block w-full rounded-card border border-gray-100 bg-white px-5 py-4 text-left shadow-card transition-all duration-200 animate-rise hoverable:hover:-translate-y-0.5 hoverable:hover:shadow-lift" style={{ animationDelay: '280ms' }}>
      {/* ONE TITLE IN ONE TYPE (15 Oct 2026): the comparison was a second, smaller grey sentence beside a bold one. */}
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
        <span>This month so far vs the same days last month</span>
        <Icon name="chevronRight" className="ml-auto h-4 w-4 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-5">
        {items.map(([label, a, b, f, lowerIsBetter]) => {
          const pct = change(a, b)
          const good = pct == null || pct === 0 ? null : (pct > 0) !== !!lowerIsBetter
          return (
            <span key={label} className="block min-w-0">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-smoke">{label}</span>
              <span className="mt-0.5 flex items-baseline gap-1.5">
                <span className="text-lg font-bold tabular-nums">{f(a)}</span>
                {pct != null && (
                  <span className={cx('text-[11px] font-bold tabular-nums', good == null ? 'text-smoke' : good ? 'text-emerald-600' : 'text-red-500')}>
                    {pct === 0 ? '=' : pct > 0 ? `\u2191${Math.min(pct, 999)}%` : `\u2193${Math.abs(pct)}%`}
                  </span>
                )}
              </span>
              <span className="block truncate text-[11px] text-gray-400">was {f(b)}</span>
            </span>
          )
        })}
      </div>
    </button>
  )
}

function QuietStat({ label, value, hint, onClick }) {
  const body = (
    <>
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-smoke">{label}</span>
      <span className="mt-0.5 block text-xl font-bold tabular-nums text-ink">{typeof value === 'number' ? value.toLocaleString() : value}</span>
      {hint && <span className="block text-[11px] text-gray-400">{hint}</span>}
    </>
  )
  return onClick
    ? <button type="button" onClick={onClick} className="block min-w-0 text-left transition-colors hover:text-brand">{body}</button>
    : <span className="block min-w-0">{body}</span>
}

// THE HEADLINE OVER A PERIOD. The same eight tiles in the same places as All time, each with how it moved against
// the period before, so switching between "this month" and "last month" is reading one grid that changes, not two
// different pages.
function PeriodTiles({ now, prev, range, scopeLabel, members, currency, onCreators, onChallenges, onMoney }) {
  const vs = range.short
  const d = (key, lowerIsBetter = false) => (prev ? { pct: change(now[key], prev[key]), vs, lowerIsBetter } : null)
  const cpm = (v) => formatCpm(v, currency)
  return (
    <div className="mb-10">
      <p className="mb-3 flex flex-wrap items-baseline gap-x-2 text-sm text-smoke">
        <span className="text-base font-semibold text-ink">{range.label}</span>
        <span>{scopeLabel}</span>
        {range.prev && <span className="text-xs text-gray-400">compared with {vs}</span>}
      </p>
      <div key={`${range.key}-${range.start?.getTime()}`} className="grid auto-rows-fr grid-cols-2 gap-4 animate-tab-in lg:grid-cols-4">
        <StatCard label="New creators" value={now.newCreators} delta={d('newCreators')} hint={`${members} members in total`} onClick={onCreators} />
        <StatCard label="Challenges running" value={now.challenges} delta={d('challenges')} hint="open at any point in it" onClick={onChallenges} />
        <StatCard label="Videos submitted" value={now.submissions} delta={d('submissions')} />
        <StatCard label="Community views gained" value={now.views == null ? '…' : formatViewsTotal(now.views)} delta={d('views')} hint={now.combinedViews == null ? 'Reading views gained in these dates' : `${formatViewsTotal(now.vipViews)} VIP · ${formatViewsTotal(now.combinedViews)} combined`} />
        <StatCard label="Cash prizes paid" value={formatMoney(now.cash, currency)} delta={d('cash')} onClick={onMoney} />
        <StatCard label="Voucher value given" value={formatMoney(now.vouchers, currency)} delta={d('vouchers')} onClick={onMoney} />
        <StatCard label="Cash CPM" value={cpm(now.cashCpm)} delta={d('cashCpm', true)} hint="cash per 1,000 community views gained" />
        <StatCard label="Total CPM" value={cpm(now.totalCpm)} delta={d('totalCpm', true)} hint="cash and vouchers per 1,000 community views gained" />
      </div>
    </div>
  )
}

// The market chips of the filter bar: a pill that slides to the picked chip (measured from the chip's own offset in the
// row, so nothing outside the row moves it), the flag before each name, a globe for Worldwide.
function MarketChips({ rowRef, off, market, markets, onPick, vip }) {
  const [pill, setPill] = useState(null)
  useLayoutEffect(() => {
    const measure = () => {
      const el = rowRef.current?.querySelector('[aria-pressed="true"]')
      if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth, height: el.offsetHeight, top: el.offsetTop })
    }
    measure()
    const t = setTimeout(measure, 300)
    window.addEventListener('resize', measure)
    return () => { clearTimeout(t); window.removeEventListener('resize', measure) }
  }, [market, markets.length, vip, rowRef])
  const chip = (on) => cx('relative z-10 flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors duration-200',
    on ? 'text-white' : 'text-smoke hover:bg-cloud hover:text-ink')
  return (
    <div aria-hidden={off || undefined} ref={rowRef}
      className={cx('relative flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-0.5 py-0.5 transition-opacity duration-200 [-ms-overflow-style:none] [scrollbar-width:none] max-sm:basis-full [&::-webkit-scrollbar]:hidden', off && 'pointer-events-none select-none opacity-35')}>
      {pill && (
        <span aria-hidden className="pointer-events-none absolute left-0 top-0 rounded-lg bg-brand shadow-card transition-[transform,width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ width: pill.width, height: pill.height, transform: `translate(${pill.left}px, ${pill.top}px)` }} />
      )}
      <button type="button" onClick={() => onPick('')} aria-pressed={!market} className={chip(!market)}>
        {vip ? <Icon name="star" className="h-3.5 w-3.5" /> : <Icon name="globe" className="h-3.5 w-3.5" />}
        {vip ? 'All VIP markets' : 'Worldwide'}
      </button>
      {markets.map((m) => {
        const on = market === m.id
        return (
          <button key={m.id} type="button" onClick={() => onPick(m.id)} aria-pressed={on} className={chip(on)}>
            <span aria-hidden className="text-[13px] leading-none">{flagFromIso((m.country_codes || [])[0]) || ''}</span>
            {m.name}
            {vip && <span className="inline-flex items-center gap-0.5">VIP<Icon name="star" className={cx('h-3 w-3', on ? 'text-white' : 'text-brand')} /></span>}
          </button>
        )
      })}
    </div>
  )
}
