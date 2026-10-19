import { useEffect, useMemo, useState } from 'react'
import { challengeSpend } from '../../../lib/challengeSpend'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../context/AuthContext'
import {
  Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line,
  ReferenceLine, Tooltip, XAxis, YAxis,
} from 'recharts'
import { format, startOfMonth } from 'date-fns'
import { supabase } from '../../../lib/supabase'
import { EmptyState, Skeleton, Select } from '../../../components/ui'
import Icon from '../../../components/Icon'
import { downloadCsv, formatViewsTotal, cx } from '../../../lib/utils'
import {
  challengeEconomics, blendEconomics, label, filterChallenges,
  runningChallenges, FALLBACK_RATES, publishFxRates,
} from '../../../lib/programme'
import HistoryForm from '../../../components/admin/HistoryForm'
import { deleteHistory } from '../../../lib/challengeHistory'
import { confirm, notice } from '../../../lib/confirm'
import { loadMarkets } from '../../../lib/markets'
import { flagFromIso } from '../../../lib/flags'
import { FILL, CHART, gridProps, xAxisProps, yAxisProps, lineProps, barProps, cursorFill, tooltipStyle as chartTooltip } from '../../../components/charts/chartTheme'
import ChartPanel from '../../../components/charts/ChartPanel'
import { useNavigate } from 'react-router-dom'
import { overlaps } from '../../../lib/analyticsPeriod'
import { challengesApi } from '../../../api/challenges'
import { teamApi } from '../../../api/team'

// Programme performance: what the prize money actually bought.
//
// This is the half of the analytics a pitch runs on. Everything here answers one
// question in different cuts: for £X of prize pot, how many creators posted how
// many videos, and what did a thousand views cost.

const GOOD = '#16a34a'


const BAND_STYLE = {
  on_target: 'bg-green-50 text-green-700',
  watch: 'bg-amber-50 text-amber-700',
  over_target: 'bg-red-50 text-red-600',
  awaiting: 'bg-cloud text-smoke',
  no_views: 'bg-cloud text-smoke',
}
const BAND_LABEL = {
  on_target: 'On target', watch: 'Watch', over_target: 'Over target',
  awaiting: 'Awaiting results', no_views: 'No views logged',
}

// Money, in the chosen reporting currency, at the precision the number deserves:
// a CPM of £0.14 needs cents, a £1,130 spend does not.
function money(n, currency, dp) {
  if (n == null) return '-'
  const digits = dp ?? (Math.abs(n) < 10 ? 2 : 0)
  return new Intl.NumberFormat('en-GB', {
    style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits,
  }).format(n)
}
const num = (n, dp = 1) => (n == null ? '-' : n.toLocaleString('en-GB', { maximumFractionDigits: dp }))


// `market` is the market NAME from the page's shared scope picker, or null for worldwide. It used to have its own
// dropdown, which meant this tab remembered a different market from the one every other tab was showing - see the note
// on the picker in AdminAnalytics. One control, at the top, for all six tabs. `currency` IS THE PAGE'S, NOT THIS TAB'S.
// It was a second EUR/GBP toggle with its own state, so the Overview could be reading euros while the Challenges tab
// beside it read pounds - two controls answering one question, which is half of "there's way too many buttons at the
// top". The shell owns it now and hands it down; see the filter bar in AdminAnalytics.
// TWO MODES, ONE DATA LOAD.
//   mode 'summary' - the economics (ratios, month charts, breakdowns), drawn on
//                    the OVERVIEW tab under its own headline tiles.
//   mode 'list'    - the Challenges tab: every challenge, and nothing else.
export default function ProgrammePerformance({ market: scopeMarket = null, currency = 'EUR', mode = 'list', range = null }) {
  const [rows, setRows] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [rates, setRates] = useState(FALLBACK_RATES)
  // WHICH OF THE TWO DOCUMENTS THIS TAB HOLDS IS ON SCREEN. See the note on the
  // segmented control below: the report and the list of challenges are read at
  // different times, and stacking them meant scrolling past whichever you did
  // not come for.
  const view = mode
  // A CLOCK THE COMPONENT OWNS, BECAUSE "RUNNING NOW" IS A CLAIM ABOUT NOW.
  //
  // Reading `Date.now()` inside the memo would make it impure and would also
  // freeze: nothing invalidates a memo because time passed, so a challenge that
  // ends while the tab is open would go on being pinned until a reload. A tick
  // a minute is far finer than the day-level boundary it is deciding, and it is
  // the same shape LiveNowRow uses on the creator side.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])
  // THE PAGE OWNS THE SCOPE, AND THERE IS NO LONGER A SECOND CONTROL FOR IT.
  // This tab had its own "Where" dropdown, hidden whenever the page was scoped
  // - so on the worldwide view there were two market pickers on screen, one of
  // which the other five tabs did not have. `'all'` is the worldwide value the
  // memo below already understood.
  const effectiveMarket = scopeMarket || 'all'

  // Logging a challenge that ran off the platform. See components/admin/
  // HistoryForm: the form already existed on /admin/challenges/history, which
  // nothing linked to from here - so the answer to "there's no way to add
  // challenges" is one button, not a new form.
  const { profile } = useAuth()
  const [markets, setMarkets] = useState([])
  const [logging, setLogging] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  useEffect(() => { loadMarkets().then((m) => setMarkets(m || [])) }, [])

  useEffect(() => {
    // Surface a failed load rather than falling through to the empty state: an RPC that errors and a programme with no
    // challenges look identical otherwise, and the first one is a bug worth seeing. A RUNNING CHALLENGE'S COST IS WORKED
    // OUT THE SAME WAY HERE AS ON ITS OWN PAGE. The team: the list said "Running now" with one CPM and clicking in
    // showed 23. The list priced a live challenge at its planned cash pot; the page prices it at the pot PLUS the awards
    // and taking-part vouchers earned so far (lib/challengeSpend). They are now the one figure: each running challenge's
    // standings are read here and its spend replaced by the same `challengeSpend`.
    teamApi.adminChallengeMetrics().then(async ({ data, error }) => {
      if (error) setLoadError(error.message)
      const list = data ?? []
      const live = list.filter((r) => r.status === 'active')
      const spends = await Promise.all(live.map((r) =>
        challengesApi.challengePrizeStandings({ p_challenge: r.id })
          .then(({ data: st }) => [r.id, challengeSpend({ prize_amount: r.prize_amount, participation_amount: r.participation_amount }, st || [], r.total_views)])
          .catch(() => [r.id, null])))
      const byId = new Map(spends)
      setRows(list.map((r) => (byId.get(r.id) ? { ...r, live_spend: byId.get(r.id).spend } : r)))
    })
    // Live FX where the network allows; the fallback table keeps the page
    // rendering if it doesn't (same source the invoice tool uses).
    fetch('https://api.frankfurter.dev/v1/latest?base=GBP&symbols=EUR,USD')
      .then((r) => r.json())
      .then((j) => {
        if (j?.rates?.EUR) {
          setRates({ GBP: 1, ...j.rates })
          // Hand it to the database, which denominates invoices in the currency
          // a creator actually banks in and cannot fetch a rate itself.
          publishFxRates(supabase, j.rates)
        }
      })
      .catch(() => {})
  }, [reloadKey])

  const data = useMemo(() => {
    if (!rows) return null
    const all = rows.map((r) => challengeEconomics(r, { currency, rates }))
    const markets = [...new Set(all.map((r) => r.market).filter(Boolean))].sort()
    // Every year the programme has run in, newest first. Derived from the rows
    // rather than hard-coded, so 2027 appears on 1 January without a deploy.
    const years = [...new Set(all.map((r) => (r.start_date ? String(new Date(r.start_date).getFullYear()) : null)).filter(Boolean))]
      .sort().reverse()

    // THE MARKET AND THE DATE ARE ONE FILTER, APPLIED ONCE.
    //
    // `scoped` feeds the headline blend, every breakdown, the monthly chart and
    // the challenge log, so filtering here is what makes the whole tab agree
    // with the controls at the top of it. A second filter applied further down
    // is how a page comes to show "Spain, August" over a total for the year.
    // THE OVERVIEW'S PERIOD WINS when it is handed one: a challenge belongs to every period it was open in, the same
    // rule as the tiles above it (lib/analyticsPeriod.overlaps).
    // ONE PERIOD: the page's picker (14 Oct 2026; the tab's own year and month selects are gone).
    const inRange = (r) => (range ? overlaps(r.start_date, r.end_date || r.start_date, range) : true)
    const scoped = all
      .filter((r) => (effectiveMarket === 'all' ? true : (r.market ?? 'Unspecified') === effectiveMarket))
      .filter(inRange)

    // Monthly roll-up, keyed on the month a challenge STARTED.
    const byMonth = new Map()
    for (const r of scoped) {
      const key = format(startOfMonth(new Date(r.start_date)), 'yyyy-MM')
      if (!byMonth.has(key)) byMonth.set(key, [])
      byMonth.get(key).push(r)
    }
    const monthly = [...byMonth.entries()].sort().map(([key, group]) => {
      const b = blendEconomics(group, { currency })
      return {
        key,
        month: format(new Date(key + '-01'), 'MMM yy'),
        challenges: b.challenges,
        spend: Math.round(b.spend),
        views: b.views,
        posts: b.posts,
        creators: b.creatorSlots,
        cpm: b.cpm != null ? Number(b.cpm.toFixed(2)) : null,
        target: 0.5,
      }
    })

    return {
      all,
      scoped,
      markets,
      blended: blendEconomics(scoped, { currency }),
      years,
      monthly,
      // WHAT THE PROGRAMME HAS ADDED UP TO, NOT WHAT IT DID THAT MONTH.
      //
      // The two charts above are both per-month, and a per-month chart answers
      // "was August good" while hiding the thing a pitch actually rests on:
      // that this has been compounding since January. A running total is the
      // one shape that shows it - each month's bar is the whole programme to
      // date - and it is the chart somebody screenshots.
      cumulative: (() => {
        let spend = 0
        let views = 0
        let challenges = 0
        return monthly.map((m) => {
          spend += m.spend
          views += m.views
          challenges += m.challenges
          return { month: m.month, spend: Math.round(spend), views, challenges }
        })
      })(),
      // Live and about-to-start challenges get pinned to the top of the list.
      //
      // THE DATES DECIDE, NOT THE STORED STATUS. See `runningChallenges` in
      // lib/programme for what this used to do and why three finished imports
      // were sitting under a heading that said "Running now".
      running: runningChallenges(scoped, now),
    }
  }, [rows, currency, rates, effectiveMarket, now, range])

  if (!data) {
    return (
      <div className="space-y-6">
        <div className="grid auto-rows-fr grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="rounded-card border border-red-100 bg-red-50/50 p-6">
        <p className="text-sm font-semibold text-red-600">Couldn't load the programme figures</p>
        <p className="mt-1 text-xs leading-relaxed text-smoke">{loadError}</p>
      </div>
    )
  }

  if (data.all.length === 0) {
    return (
      <EmptyState
        icon={<Icon name="chart" className="h-7 w-7" />}
        title="No challenges to measure yet"
        hint="Once a challenge is published and its views are logged, its cost per thousand views appears here."
      />
    )
  }

  const b = data.blended
  const exportRows = data.scoped.map((r) => ({
    challenge: r.title,
    market: r.market ?? '',
    format: label('format', r.format),
    audience: label('audience', r.audience),
    start: r.start_date?.slice(0, 10) ?? '',
    end: r.end_date?.slice(0, 10) ?? '',
    days: r.days,
    status: label('status', r.status),
    objective: label('objective', r.objective),
    content_type: label('content_type', r.content_type),
    prize_type: label('prize_type', r.prize_type),
    [`prize_${currency}`]: r.spend != null ? r.spend.toFixed(2) : '',
    winners: r.winners_count ?? '',
    [`per_winner_${currency}`]: r.perWinner != null ? r.perWinner.toFixed(2) : '',
    total_views: r.views,
    creators: r.creators,
    posts: r.posts,
    [`cpm_${currency}`]: r.cpm != null ? r.cpm.toFixed(2) : '',
    [`cost_per_post_${currency}`]: r.costPerPost != null ? r.costPerPost.toFixed(2) : '',
    [`cost_per_creator_${currency}`]: r.costPerCreator != null ? r.costPerCreator.toFixed(2) : '',
    posts_per_creator: r.postsPerCreator != null ? r.postsPerCreator.toFixed(1) : '',
    views_per_post: r.viewsPerPost != null ? Math.round(r.viewsPerPost) : '',
    views_per_creator: r.viewsPerCreator != null ? Math.round(r.viewsPerCreator) : '',
    median_views: r.medianViews ?? '',
    best_video_views: r.best_views || '',
    cpm_flag: BAND_LABEL[r.band],
  }))

  return (
    <div className="space-y-8">
      {/* ---------------------------------------------------------------
          ONE ROW: WHAT YOU ARE LOOKING AT, WHEN, AND THE TWO THINGS YOU CAN DO.

          It was three named groups - Money, Where, When - plus a clear, an export and a log button, in a band of its
          own, sitting under the page's own market chips and the page's own currency toggle. Two of the three groups were
          duplicates of a control one row above them, which is the fault the team actually described: not that any single
          control is wrong, but that the same question is asked twice in two shapes before you reach a number.

          Money is gone (the page owns it). Where is gone (the page's chips own
          it). What is left is genuinely this tab's: WHICH of the two documents
          you want, over WHAT period, and the two actions that operate on the
          rows in front of you. They fit on one line, and the line sits directly
          above the thing it changes rather than in a toolbar at the top of the
          page. -------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">
            {view === 'summary' ? 'Economics' : 'Every challenge'}
          </h2>
          <p className="mt-0.5 text-xs text-smoke">
            {view === 'summary'
              ? `Blended across ${b.challenges} challenge${b.challenges === 1 ? '' : 's'}: totals divided once, never an average of averages.`
              : 'Live ones first. Press any challenge for its full breakdown.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* The month select only appears once a year is chosen, because
              "August" across every year the programme has run is not a period
              anybody means. */}
          {view === 'list' && <>
          <span className="mx-1 hidden h-6 w-px bg-gray-100 sm:block" />
          <button onClick={() => downloadCsv(`challenge-log-${currency}.csv`, exportRows)} className="btn-secondary !py-2 text-xs">
            <Icon name="download" className="h-4 w-4" /> Export
          </button>
          {/* The form has existed since the import; it lived on a page nothing
              linked to. Same component, same table, and it reloads the metrics
              on save so a new challenge is in the blend before the dialog has
              finished closing. */}
          <button onClick={() => setLogging(true)} className="btn-primary !py-2 text-xs">
            <Icon name="plus" className="h-4 w-4" /> Log a challenge
          </button>
          </>}
        </div>
      </div>

      {view === 'summary' ? (
        <SummaryView data={data} b={b} currency={currency} />
      ) : (
        <ChallengeList rows={data.scoped} running={data.running} currency={currency} onChanged={() => { setRows(null); setReloadKey((n) => n + 1) }} />
      )}

      {logging && (
        <HistoryForm
          row={{}}
          markets={markets}
          userId={profile?.id}
          onClose={() => setLogging(false)}
          onSaved={() => { setLogging(false); setRows(null); setReloadKey((n) => n + 1) }}
          onDelete={null}
        />
      )}
    </div>
  )
}

// One of the quiet ratios under the headline four.
function Ratio({ label: text, value }) {
  return (
    <span className="block">
      <span className="block text-base font-bold tabular-nums">{value}</span>
      <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">{text}</span>
    </span>
  )
}



// EVERY CHALLENGE, AS A THING YOU CAN SEARCH: by title, market or country, a status filter derived from the rows, and a
// sort. What is running is pinned above what is finished.
const SORTS = [
  { value: 'recent', label: 'Most recent' },
  { value: 'cpm', label: 'Cheapest CPM' },
  { value: 'spend', label: 'Biggest spend' },
  { value: 'views', label: 'Most views' },
]

function ChallengeList({ rows, running, currency, onChanged }) {
  const [sort, setSort] = useState('recent')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')

  const runningIds = useMemo(() => new Set((running ?? []).map((r) => r.id)), [running])

  // THE PINNED BLOCK OBEYS THE SEARCH TOO.
  //
  // It did not, and the result read as a bug: searching for something with no
  // matches left two unrelated live challenges sitting above a "Nothing matches
  // that" panel, which says both "here are your results" and "there are none"
  // on one screen. Pinning is about ORDER - live first - not about exemption
  // from the controls above it.
  const runningShown = useMemo(
    () => filterChallenges(running ?? [], { query, status }),
    [running, query, status],
  )

  // The statuses actually present, so the filter can never empty the list.
  const statuses = useMemo(
    () => [...new Set(rows.map((r) => r.status).filter(Boolean))].sort(),
    [rows],
  )

  // The arithmetic is in lib/programme so it can be tested. See
  // `filterChallenges` - three decisions in here look obviously right and are
  // each one line from being wrong.
  const shown = useMemo(
    () => filterChallenges(rows, { query, status, sort, exclude: runningIds }),
    [rows, sort, query, status, runningIds],
  )

  return (
    <div className="space-y-6">
      {/* ---- Running now, pinned ---- TRYP.COM ORANGE, NOT A WASH OF IT. The weird orange was `bg-brand-tint/20` -
           brand orange at a fifth of its strength over white, which lands on a pale peach that belongs to no palette and
           reads as a card that has gone slightly wrong rather than one that is lit up. The colour is now the real
           `#d94407`, and it is carried by the things that should be loud (the heading, the live pill, the rule down the
           left edge) rather than smeared across the whole card at an opacity chosen to keep the text readable. That is
           the same rule this platform uses everywhere else for a picked thing: solid brand with white on it, never a
           tint. */}
      {runningShown.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand" />
            </span>
            <h2 className="text-sm font-bold uppercase tracking-widest text-brand">Running now</h2>
            <span className="text-xs text-smoke">
              {runningShown.length} challenge{runningShown.length === 1 ? '' : 's'} open across the community
            </span>
          </div>
          <div className="space-y-3">
            {runningShown.map((r) => <LogCard key={r.id} r={r} currency={currency} live phase={r.phase} />)}
          </div>
        </section>
      )}

      {/* ---- Find one ---- */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Icon name="magnifier" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, market or country"
            aria-label="Search the challenges"
            className="input !py-2 !pl-10 text-sm"
          />
        </div>
        {statuses.length > 1 && (
          <Select
            value={status}
            onChange={setStatus}
            variant="chip"
            className="w-40"
            ariaLabel="Filter by status"
            options={[{ value: 'all', label: 'Any status' }, ...statuses.map((st) => ({ value: st, label: label('status', st) }))]}
          />
        )}
        <Select value={sort} onChange={setSort} variant="chip" className="w-44" ariaLabel="Sort the challenges" options={SORTS} />
      </div>

      {/* THE COUNT IS SHOWN WHENEVER IT IS NOT THE WHOLE LIST. A filter that
          silently removes forty rows and says nothing is how somebody comes to
          believe the programme has run four challenges. */}
      {(query || status !== 'all') && (
        <p className="-mt-2 text-xs text-smoke">
          {shown.length} of {rows.length - runningIds.size} challenge{rows.length - runningIds.size === 1 ? '' : 's'}
          {query && <> matching &ldquo;{query}&rdquo;</>}
        </p>
      )}

      {shown.length === 0 ? (
        <EmptyState
          icon={<Icon name="magnifier" className="h-7 w-7" />}
          title="Nothing matches that"
          hint="Try a shorter search, or clear the status filter."
          action={
            <button onClick={() => { setQuery(''); setStatus('all') }} className="btn-secondary">
              Clear the filters
            </button>
          }
        />
      ) : (
        /*
         * CARDS AGAIN, BUT MID-SIZED AND OPENABLE. The one-line rows cut titles and markets off at a column edge. Each
         * challenge is a card in a two-up grid now, with its headline figures on it; pressing it opens the rest in
         * place.
         */
        <div className="grid items-start gap-3 lg:grid-cols-2">
          {shown.map((r, i) => <ChallengeCard key={r.id} r={r} currency={currency} i={i} onChanged={onChanged} />)}
        </div>      )}

      <p className="text-[11px] leading-relaxed text-smoke">
        CPM = prize spend &divide; (views &divide; 1,000). On target is at or under each challenge&rsquo;s own CPM target,
        Watch is up to double it, Over target is above that. Challenges with no views logged are shown
        but never counted in a blended figure.
      </p>
    </div>
  )
}

function LogCard({ r, currency, live = false, phase = 'live' }) {
  const figures = [
    { label: 'Spend', value: money(r.spend, currency, 0) },
    // `formatViews` shortens: 4,200,000 -> 4.2m. A challenge with real reach
    // prints eight digits otherwise, which is the number nobody can read at a
    // glance and the one most worth reading.
    { label: 'Views', value: r.views > 0 ? formatViewsTotal(r.views) : '-' },
    { label: 'Creators', value: r.creators ? r.creators.toLocaleString() : '-' },
    { label: 'Posts', value: r.posts ? r.posts.toLocaleString() : '-' },
  ]
  // The derived ratios. They matter, and they are the fourth thing you look at,
  // so they get one quiet line rather than seven columns of their own.
  const ratios = [
    r.costPerPost != null && `${money(r.costPerPost, currency, 2)} per post`,
    r.costPerCreator != null && `${money(r.costPerCreator, currency, 2)} per creator`,
    r.postsPerCreator ? `${num(r.postsPerCreator, 1)} posts each` : null,
    r.viewsPerPost ? `${Math.round(r.viewsPerPost).toLocaleString()} views per post` : null,
  ].filter(Boolean)

  return (
    <Link
      to={`/admin/analytics/${r.id}`}
      className={cx(
        'card group relative block overflow-hidden !p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-lift',
        // A live challenge is the one row on this page that is still changing,
        // so it is the one row drawn in the colour that means "now" - as a
        // solid brand edge and a white-on-orange pill, not as a tint over the
        // whole card. See the note on the section heading above.
        live && '!border-brand/50 pl-6 shadow-lift',
      )}
    >
      {/* THE SOLID BRAND EDGE. A 6px rule of real #d94407 down the side of the
          card says "this one is different" at a glance and costs the card
          nothing: the white ground, the type colours and the contrast of every
          figure on it are unchanged, which a tint over the whole card cannot
          claim. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-[17px] font-semibold leading-snug tracking-[-0.01em] transition-colors group-hover:text-brand">
            {live && (
              <span className={cx(
                'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest',
                // SOLID BRAND WITH WHITE ON IT for the one that is open right
                // now; the outline for one that has not started, because "opens
                // Friday" is information and not an alarm.
                phase === 'live' ? 'bg-brand text-white' : 'border border-brand/50 text-brand',
              )}>
                {phase === 'live' ? 'Live' : 'Starts soon'}
              </span>
            )}
            {r.title}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-smoke">
            <MarketMark name={r.market} />
            <span aria-hidden>·</span>
            <span>{r.start_date?.slice(0, 10)}</span>
            <span aria-hidden>·</span>
            <span>{r.days} days</span>
            <span aria-hidden>·</span>
            <span>{label('format', r.format)}</span>
            <span aria-hidden>·</span>
            <span>{label('status', r.status)}</span>
          </p>
        </div>
        <span className={cx('shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold', BAND_STYLE[r.band])}>
          {BAND_LABEL[r.band]}
        </span>
      </div>

      {/* THE NUMBERS GET ROOM, AND A COLUMN EACH.
          They were a flex row that bunched against the left edge with the CPM
          jammed into the four figures beside it, and at eight digits - which a
          real challenge reaches, 4.2m views is not unusual - they ran together.
          A five-column grid gives each one a lane it keeps at any width, the
          CPM is separated by a rule rather than by a gap, and every figure is
          tabular so the columns line up down a list of challenges. */}
      <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
        <span className="block border-l-2 border-brand pl-3.5">
          <span className="block whitespace-nowrap text-[26px] font-bold leading-none tracking-[-0.03em] text-brand tabular-nums">
            {money(r.cpm, currency, 2)}
          </span>
          <span className="mt-1.5 block text-[11px] font-semibold uppercase tracking-wide text-smoke">
            per 1,000 views
          </span>
        </span>

        {figures.map((f) => (
          <span key={f.label} className="block">
            <span className="block whitespace-nowrap text-xl font-semibold leading-none tabular-nums">{f.value}</span>
            <span className="mt-1.5 block text-[11px] font-semibold uppercase tracking-wide text-smoke">{f.label}</span>
          </span>
        ))}
      </div>

      {ratios.length > 0 && (
        <p className="mt-5 flex flex-wrap gap-x-5 gap-y-1 border-t border-gray-50 pt-3.5 text-xs text-smoke">
          {ratios.map((t) => <span key={t} className="tabular-nums">{t}</span>)}
        </p>
      )}
    </Link>
  )
}

// A finished challenge as a card that opens. Headline figures on the face; everything else - the ratios, the target, the
// payout split - in a panel that grows open underneath, the same 0fr -> 1fr motion the rest of the admin uses. A
// challenge that ran ON the platform also links to its full analytics page; an imported one from the log has only what
// the sheet held.
function ChallengeCard({ r, currency, i = 0, onChanged }) {
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // DELETING A CHALLENGE FROM THE LIST. The team: an old Romanian one with no data was logged a second time WITH data,
  // and "admins should be able to delete challenge data". The button used to live several screens deep inside the edit
  // form, so nobody found it. It is here, on the card, and says what goes with it.
  async function remove() {
    const platform = r.source !== 'history'
    const ok = await confirm(
      platform
        ? `Permanently delete "${r.title}"? This also deletes ${r.posts ? `its ${r.posts} entries` : 'every entry in it'} and all of its results. Prizes already given stay on the creators' Rewards. There is no undo.`
        : `Delete "${r.title}" from the challenge log? It is removed from every programme average that counted it. There is no undo.`,
      { danger: true, confirmLabel: 'Delete it' },
    )
    if (!ok) return
    setDeleting(true)
    const { error } = platform
      ? await teamApi.adminDeleteChallenge({ target: r.id })
      : await deleteHistory(r.id)
    setDeleting(false)
    if (error) { notice(typeof error === 'string' ? error : error.message); return }
    onChanged?.()
  }
  const onPlatform = r.source !== 'history'
  const ratio = r.cpm != null && r.target ? r.cpm / r.target : null
  const cpmVsTarget = ratio != null ? Math.min(2, ratio) : null
  const facts = [
    ['Spend', money(r.spend, currency, 0), r.voucherSpend > 0 ? `incl. ${money(r.voucherSpend, currency, 0)} vouchers` : null],
    ['Views', r.views > 0 ? formatViewsTotal(r.views) : '-'],
    ['Creators', r.creators ? r.creators.toLocaleString() : '-'],
    ['Posts', r.posts ? r.posts.toLocaleString() : '-'],
  ]
  const more = [
    ['Target CPM', money(r.target, currency, 2)],
    r.combinedCpm != null && ['Total CPM (cash + vouchers)', money(r.combinedCpm, currency, 2)],
    r.cashCpm != null && ['Cash-only CPM', money(r.cashCpm, currency, 2)],
    r.voucherSpend > 0 && ['Voucher spend', money(r.voucherSpend, currency, 0)],
    r.cashSpend > 0 && ['Cash spend', money(r.cashSpend, currency, 0)],
    r.costPerPost != null && ['Cost per post', money(r.costPerPost, currency, 2)],
    r.costPerCreator != null && ['Cost per creator', money(r.costPerCreator, currency, 2)],
    r.postsPerCreator && ['Posts per creator', num(r.postsPerCreator, 1)],
    r.viewsPerPost && ['Views per post', Math.round(r.viewsPerPost).toLocaleString()],
    r.medianViews != null && ['Median video', formatViewsTotal(r.medianViews)],
    r.topVideoShare != null && ['Best video share', `${Math.round(r.topVideoShare * 100)}%`],
    r.winners_count && ['Winners', String(r.winners_count)],
  ].filter(Boolean)
  return (
    <div
      className="animate-fade-up overflow-hidden rounded-card border border-gray-100 bg-white shadow-card transition-shadow duration-200 hover:shadow-lift"
      style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}
    >
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="group block w-full p-4 text-left sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold leading-snug transition-colors group-hover:text-brand [overflow-wrap:anywhere]">{r.title}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-smoke">
              <MarketMark name={r.market} />
              <span>· {[r.start_date?.slice(0, 10), `${r.days} days`, label('format', r.format)].filter(Boolean).join(' · ')}</span>
            </p>
          </div>
          <span className={cx('shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold', BAND_STYLE[r.band])}>{BAND_LABEL[r.band]}</span>
        </div>
        <div className="mt-4 flex items-end gap-4">
          <span className="shrink-0">
            <span className="block text-2xl font-bold leading-none tracking-[-0.02em] text-brand tabular-nums">{money(r.cpm, currency, 2)}</span>
            <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wide text-smoke">CPM</span>
          </span>
          <span className="grid min-w-0 flex-1 grid-cols-4 gap-2">
            {facts.map(([k, v, sub]) => (
              <span key={k} className="min-w-0">
                <span className="block truncate text-sm font-semibold tabular-nums">{v}</span>
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-smoke">{k}</span>
                {sub && <span className="block truncate text-[10px] font-medium text-smoke" title={sub}>{sub}</span>}
              </span>
            ))}
          </span>
        </div>
        {cpmVsTarget != null && (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-cloud" title={`CPM against its ${money(r.target, currency, 2)} target`}>
            <div
              className={cx('h-full rounded-full transition-[width] duration-700', ratio <= 1 ? 'bg-green-600' : ratio <= 2 ? 'bg-amber-400' : 'bg-red-500')}
              style={{ width: `${Math.max(4, (cpmVsTarget / 2) * 100)}%` }}
            />
          </div>
        )}
        <span className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-smoke">
          {open ? 'Less' : 'More detail'}
          <Icon name="chevronDown" className={cx('h-3.5 w-3.5 transition-transform duration-300', open && 'rotate-180')} />
        </span>
      </button>
      <div className={cx('grid transition-[grid-template-rows] duration-300 ease-out', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className="overflow-hidden">
          <div className="border-t border-gray-100 bg-cloud/30 px-4 py-4 sm:px-5">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              {more.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-smoke">{k}</dt>
                  <dd className="text-sm font-semibold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
            {onPlatform ? (
              <Link to={`/admin/analytics/${r.id}`} className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-brand px-3.5 py-1.5 text-xs font-semibold text-white transition-transform duration-200 hover:-translate-y-0.5">
                Full analytics <Icon name="chevronRight" className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <p className="mt-3 text-[11px] text-smoke">Imported from the challenge log, so only the sheet&rsquo;s figures are known.</p>
            )}
            {/* ONLY WHAT WAS LOGGED BY HAND CAN BE DELETED HERE. A platform challenge is deleted from its own edit
                screen, on purpose, not from a list of figures. */}
            {!onPlatform && (
              <button
                type="button"
                onClick={remove}
                disabled={deleting}
                className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-red-200 px-3.5 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
              >
                <Icon name="trash" className="h-3.5 w-3.5" />
                {deleting ? 'Deleting…' : 'Delete this log entry'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}


// THE OVERVIEW'S ECONOMICS, REBUILT (14 Oct 2026). Every chart is a ChartPanel (one look, the title opens the whole
// history with a zoom and the downloads). "Who took part each month" and the three breakdown cards (by market, by format,
// by prize type) are gone: format and prize type are mixed on every challenge now, and the Market league tab is the
// better by-market view. In their place: what a post is worth and costs month by month, and ONE per-challenge chart with a
// measure switch that scrolls through every challenge the programme has run instead of squeezing the latest eight.
const MEASURES = [
  { key: 'views', label: 'Views', fmt: (v) => formatViewsTotal(v) },
  { key: 'posts', label: 'Posts', fmt: (v) => Number(v).toLocaleString() },
  { key: 'creators', label: 'Creators', fmt: (v) => Number(v).toLocaleString() },
  { key: 'cpm', label: 'CPM', money: 2 },
  { key: 'spend', label: 'Prize money', money: 0 },
]

function SummaryView({ data, b, currency }) {
  const navigate = useNavigate()
  const [measure, setMeasure] = useState('views')
  const m = MEASURES.find((x) => x.key === measure)
  const fmt = (v) => (v == null ? '-' : m.money != null ? money(v, currency, m.money) : m.fmt(v))
  const perChallenge = [...data.scoped]
    .filter((r) => r.start_date)
    .sort((x, y) => String(x.start_date).localeCompare(String(y.start_date)))
    .map((r) => ({
      id: r.id, name: r.title.length > 16 ? `${r.title.slice(0, 15)}…` : r.title, title: r.title, market: r.market || 'Global',
      when: format(new Date(r.start_date), 'MMM yy'), running: r.status === 'active',
      views: r.views ?? 0, posts: r.posts ?? 0, creators: r.creators ?? 0,
      cpm: r.cpm != null ? Number(r.cpm.toFixed(2)) : null, spend: r.spend != null ? Math.round(r.spend) : 0,
    }))
  const monthlyValue = data.monthly.map((x) => ({
    ...x,
    perPost: x.posts ? Math.round(x.views / x.posts) : 0,
    costPerPost: x.posts && x.spend ? Number((x.spend / x.posts).toFixed(2)) : null,
  }))
  const sym = currency === 'GBP' ? '£' : '€'
  const tip = (fmtV) => <Tooltip contentStyle={chartTooltip} cursor={cursorFill} formatter={fmtV} />

  return (
    <>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-card border border-gray-100 bg-white px-5 py-4 shadow-card animate-rise sm:grid-cols-3 lg:grid-cols-6">
        <Ratio label="Cash CPM" value={money(b.cashCpm, currency, 2)} />
        <Ratio label="Total CPM" value={money(b.combinedCpm, currency, 2)} />
        <Ratio label="Cost / post" value={money(b.costPerPost, currency, 2)} />
        <Ratio label="Cost / creator" value={money(b.costPerCreator, currency, 2)} />
        <Ratio label="Posts / creator" value={num(b.postsPerCreator, 1)} />
        <Ratio label="Views / post" value={b.viewsPerPost ? formatViewsTotal(Math.round(b.viewsPerPost)) : '-'} />
      </div>

      {data.monthly.length > 0 && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <ChartPanel
            title="Spend against reach"
            subtitle={`Prize spend (${currency}) as bars, views as the line, per month`}
            data={data.monthly} recent={12} minPoint={30} delay={40}
            csv={{ name: 'spend-against-reach.csv', rows: data.monthly.map(({ month: mo, spend, views, cpm }) => ({ month: mo, [`spend_${currency.toLowerCase()}`]: spend, views, cpm })) }}
            render={(rows) => (
              <ComposedChart data={rows} margin={{ top: 12, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="month" {...xAxisProps} />
                <YAxis yAxisId="l" {...yAxisProps} tickFormatter={(v) => `${sym}${formatViewsTotal(v)}`} />
                <YAxis yAxisId="r" orientation="right" {...yAxisProps} tickFormatter={formatViewsTotal} />
                {tip((v, name) => (name === 'Views' ? formatViewsTotal(v) : money(v, currency, 0)))}
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                <Bar yAxisId="l" dataKey="spend" name="Prize spend" fill={FILL.light} {...barProps} />
                <Area yAxisId="r" dataKey="views" name="Views" stroke={CHART.brand} fill={FILL.area} {...lineProps} />
              </ComposedChart>
            )}
          />
          <ChartPanel
            title="CPM against target"
            subtitle="Blended cost per 1,000 views each month · green is under the 0.50 target"
            data={data.monthly} recent={12} minPoint={30} delay={80}
            csv={{ name: 'cpm-by-month.csv', rows: data.monthly.map(({ month: mo, cpm }) => ({ month: mo, cpm })) }}
            render={(rows) => (
              <BarChart data={rows} margin={{ top: 18, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="month" {...xAxisProps} />
                <YAxis {...yAxisProps} tickFormatter={(v) => money(v, currency, 2)} width={56} domain={[0, (mx) => Math.max(0.6, Math.ceil(mx * 1.15 * 100) / 100)]} />
                {tip((v) => money(v, currency, 2))}
                <ReferenceLine y={0.5} stroke={GOOD} strokeDasharray="4 4" label={{ value: 'target', fontSize: 10, fill: GOOD, position: 'insideTopRight' }} />
                <Bar dataKey="cpm" name="Blended CPM" {...barProps}>
                  {rows.map((r) => <Cell key={r.key} fill={r.cpm != null && r.cpm <= 0.5 ? FILL.green : FILL.brand} />)}
                </Bar>
              </BarChart>
            )}
          />
        </div>
      )}

      {data.monthly.length > 1 && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <ChartPanel
            title="The programme, adding up"
            subtitle="Views and spend to date, month by month"
            data={data.cumulative} minPoint={30} delay={120}
            csv={{ name: 'programme-to-date.csv' }}
            render={(rows) => (
              <ComposedChart data={rows} margin={{ top: 12, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="month" {...xAxisProps} interval="preserveStartEnd" />
                <YAxis yAxisId="l" {...yAxisProps} tickFormatter={formatViewsTotal} />
                <YAxis yAxisId="r" orientation="right" {...yAxisProps} tickFormatter={(v) => `${sym}${formatViewsTotal(v)}`} />
                {tip((v, name) => (name === 'Views to date' ? formatViewsTotal(v) : money(v, currency, 0)))}
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                <Area yAxisId="l" dataKey="views" name="Views to date" stroke={CHART.brand} fill={FILL.area} {...lineProps} dot={false} />
                <Line yAxisId="r" dataKey="spend" name="Spend to date" stroke={CHART.light} {...lineProps} dot={false} />
              </ComposedChart>
            )}
          />
          <ChartPanel
            title="What a post is worth"
            subtitle={`Average views per post (bars) and what each post cost (line), per month`}
            data={monthlyValue} recent={12} minPoint={30} delay={160}
            csv={{ name: 'value-per-post.csv', rows: monthlyValue.map(({ month: mo, perPost, costPerPost, posts }) => ({ month: mo, posts, views_per_post: perPost, [`cost_per_post_${currency.toLowerCase()}`]: costPerPost })) }}
            render={(rows) => (
              <ComposedChart data={rows} margin={{ top: 12, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="month" {...xAxisProps} />
                <YAxis yAxisId="l" {...yAxisProps} tickFormatter={formatViewsTotal} />
                <YAxis yAxisId="r" orientation="right" {...yAxisProps} tickFormatter={(v) => money(v, currency, 0)} />
                {tip((v, name) => (name === 'Views per post' ? formatViewsTotal(v) : money(v, currency, 2)))}
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                <Bar yAxisId="l" dataKey="perPost" name="Views per post" fill={FILL.brand} {...barProps} />
                <Line yAxisId="r" dataKey="costPerPost" name="Cost per post" stroke={CHART.ink} {...lineProps} dot={{ r: 3, fill: CHART.ink, strokeWidth: 0 }} connectNulls />
              </ComposedChart>
            )}
          />
        </div>
      )}

      <EveryChallenge rows={perChallenge} measure={measure} m={m} fmt={fmt} onMeasure={setMeasure}
        onOpen={(id) => navigate(`/admin/analytics/${id}`)} currency={currency} />
    </>
  )
}

// EVERY CHALLENGE, AS A RANKED LIST (15 Oct 2026). It was a bar chart with fifty slanted labels cut to fifteen letters
// ("you cannot just see the name of the challenges"). Now one row per challenge: the market's flag, the whole title, when it
// ran, and a bar in the market's colour sized against the biggest, with the number at its end. Sort by newest or by the
// measure; the list scrolls inside the card; a row opens the challenge. Hovering a row lifts and magnifies its bar.
function EveryChallenge({ rows, measure, m, fmt, onMeasure, onOpen, currency }) {
  const [sort, setSort] = useState('value')
  const list = useMemo(() => {
    const out = [...rows]
    if (sort === 'value') out.sort((x, y) => (Number(y[measure]) || 0) - (Number(x[measure]) || 0))
    else out.reverse()
    return out
  }, [rows, sort, measure])
  const max = Math.max(1, ...rows.map((r) => Number(r[measure]) || 0))
  return (
    <section className="card animate-rise" style={{ animationDelay: '200ms' }}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold">Every challenge</h2>
          <p className="mt-1 text-xs text-smoke">Compare the numbers · press a challenge to open it</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-0.5 rounded-full bg-cloud p-0.5">
            {MEASURES.map((x) => (
              <button key={x.key} type="button" onClick={() => onMeasure(x.key)} aria-pressed={measure === x.key}
                className={cx('rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors', measure === x.key ? 'bg-brand text-white' : 'text-smoke hover:text-ink')}>
                {x.label}
              </button>
            ))}
          </div>
          <div className="flex gap-0.5 rounded-full bg-cloud p-0.5">
            {[['value', 'Top'], ['date', 'Newest']].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setSort(k)} aria-pressed={sort === k}
                className={cx('rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors', sort === k ? 'bg-ink text-white' : 'text-smoke hover:text-ink')}>
                {l}
              </button>
            ))}
          </div>
          <button type="button" title="Download CSV" className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-cloud hover:text-brand"
            onClick={() => downloadCsv(`every-challenge-${measure}.csv`, rows.map((r) => ({ challenge: r.title, market: r.market, started: r.when, views: r.views, posts: r.posts, creators: r.creators, cpm: r.cpm, [`prize_${currency.toLowerCase()}`]: r.spend })))}>
            <Icon name="download" className="h-4 w-4" />
          </button>
        </div>
      </div>
      {list.length === 0 ? (
        <p className="rounded-xl bg-cloud/50 px-4 py-10 text-center text-sm text-smoke">Nothing to show yet</p>
      ) : (
        <ol key={`${measure}-${sort}`} className="-mx-2 max-h-[460px] space-y-0.5 overflow-y-auto px-2 py-1">
          {list.map((r, i) => {
            const v = Number(r[measure]) || 0
            const pct = Math.max(2, (v / max) * 100)
            return (
              <li key={r.id} className="animate-rise" style={{ animationDelay: `${Math.min(i, 14) * 30}ms` }}>
                <button type="button" onClick={() => onOpen(r.id)}
                  className="group grid w-full grid-cols-[minmax(0,1fr)] items-center gap-x-4 gap-y-1.5 rounded-xl px-3 py-2.5 text-left transition-all duration-200 hover:bg-cloud/60 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold leading-snug text-ink transition-colors group-hover:text-brand">{r.title}</span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-smoke">
                      <MarketMark name={r.market === 'Global' ? null : r.market} />
                      <span aria-hidden>·</span>{r.when}
                      {r.running && <span className="rounded-full bg-brand px-1.5 py-px text-[10px] font-bold text-white">Running</span>}
                    </span>
                  </span>
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="relative h-3 min-w-0 flex-1 rounded-full bg-cloud transition-transform duration-200 ease-out group-hover:scale-y-[1.5]">
                      <span className="absolute inset-y-0 left-0 origin-left rounded-full animate-bar-grow transition-shadow duration-200 group-hover:shadow-[0_3px_8px_rgba(217,68,7,0.3)]"
                        style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #d94407, #f5853f)', opacity: r.running ? 0.7 : 1, animationDelay: `${Math.min(i, 14) * 30 + 120}ms` }} />
                    </span>
                    <span className="w-16 shrink-0 text-right text-sm font-bold tabular-nums text-ink">{fmt(r[measure])}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      )}
      <p className="sr-only">{m.label}</p>
    </section>
  )
}

// A MARKET AT A GLANCE (14 Oct 2026): the flag of its country (the first, for a multi-country market), or the globe for
// a global challenge, before the name. Markets are read once for the whole list.
let MARKET_FLAGS = null
function MarketMark({ name }) {
  const [list, setList] = useState(MARKET_FLAGS)
  useEffect(() => {
    if (MARKET_FLAGS) return undefined
    let alive = true
    loadMarkets().then((m) => { MARKET_FLAGS = m || []; if (alive) setList(MARKET_FLAGS) })
    return () => { alive = false }
  }, [])
  const m = (list || []).find((x) => x.name === name)
  const global = !name || /worldwide|global/i.test(name) || m?.kind === 'network'
  const code = m?.country_codes?.[0]
  return (
    <span className="inline-flex items-center gap-1 font-medium text-ink">
      {global
        ? <Icon name="globe" className="h-3.5 w-3.5 text-brand" />
        : <span className="text-[13px] leading-none">{code ? flagFromIso(code) : ''}</span>}
      {global ? (name || 'Global') : name}
    </span>
  )
}
