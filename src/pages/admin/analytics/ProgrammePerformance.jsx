import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../context/AuthContext'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { format, startOfMonth } from 'date-fns'
import { supabase } from '../../../lib/supabase'
import { EmptyState, Skeleton, StatCard, Select } from '../../../components/ui'
import Icon from '../../../components/Icon'
import { downloadCsv, formatViews, cx } from '../../../lib/utils'
import {
  challengeEconomics, blendEconomics, groupBy, label, filterChallenges,
  runningChallenges, FALLBACK_RATES, publishFxRates,
} from '../../../lib/programme'
import HistoryForm from '../../../components/admin/HistoryForm'
import { loadMarkets } from '../../../lib/markets'

// Programme performance: what the prize money actually bought.
//
// This is the half of the analytics a pitch runs on. Everything here answers one
// question in different cuts: for £X of prize pot, how many creators posted how
// many videos, and what did a thousand views cost.

const BRAND = '#d94407'
const BRAND_LIGHT = '#f5853f'
const BRAND_PALE = '#f9b98a'
const GOOD = '#16a34a'

const tooltipStyle = {
  borderRadius: 12, border: '1px solid #F1F1F2', fontFamily: 'Poppins',
  fontSize: 12, boxShadow: '0 4px 16px rgba(26,26,26,0.08)',
}

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


// `market` is the market NAME from the page's shared scope picker, or null for
// worldwide. It used to have its own dropdown, which meant this tab remembered
// a different market from the one every other tab was showing - see the note on
// the picker in AdminAnalytics. One control, at the top, for all six tabs.
// `currency` IS THE PAGE'S, NOT THIS TAB'S (9 Sep 2026). It was a second
// EUR/GBP toggle with its own state, so the Overview could be reading euros
// while the Challenges tab beside it read pounds - two controls answering one
// question, which is half of "there's way too many buttons at the top". The
// shell owns it now and hands it down; see the filter bar in AdminAnalytics.
export default function ProgrammePerformance({ market: scopeMarket = null, currency = 'EUR' }) {
  const [rows, setRows] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [rates, setRates] = useState(FALLBACK_RATES)
  // WHEN, AS WELL AS WHERE (8 Sep 2026).
  //
  // Ethan: "because we have a lot of analytics now, I want to be able to filter
  // by month or by year and see the growth that way. Especially for the
  // challenge performance page."
  //
  // Forty-nine challenges over nine months is past the point where a single
  // list answers a question: "what did Spain cost us in Q2" was a thing you had
  // to work out by reading. Two selects - a year, and a month within it - are
  // enough, because the programme is nine months old and both cuts people
  // actually ask for ("this year", "August") are one press.
  //
  // 'all' IS A VALUE, NOT AN ABSENCE, so the filter can be reasoned about
  // without null checks scattered through the memo below.
  const [year, setYear] = useState('all')
  const [month, setMonth] = useState('all')
  // WHICH OF THE TWO DOCUMENTS THIS TAB HOLDS IS ON SCREEN. See the note on the
  // segmented control below: the report and the list of challenges are read at
  // different times, and stacking them meant scrolling past whichever you did
  // not come for.
  const [view, setView] = useState('summary')
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
    // Surface a failed load rather than falling through to the empty state: an
    // RPC that errors and a programme with no challenges look identical
    // otherwise, and the first one is a bug worth seeing.
    supabase.rpc('admin_challenge_metrics').then(({ data, error }) => {
      if (error) setLoadError(error.message)
      setRows(data ?? [])
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
    const inRange = (r) => {
      if (year === 'all') return true
      if (!r.start_date) return false
      const d = new Date(r.start_date)
      if (String(d.getFullYear()) !== year) return false
      return month === 'all' || String(d.getMonth() + 1).padStart(2, '0') === month
    }
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
      // `byMarket` is over `all` deliberately - comparing markets is the whole
      // point of that card, and scoping it to one market leaves it with a
      // single row. It DOES honour the date filter, because "which market did
      // best in August" is a real question and "which market did best, ever,
      // while the rest of the page shows August" is not.
      byMarket: groupBy(all.filter(inRange), (r) => r.market, { currency }),
      byFormat: groupBy(scoped, (r) => label('format', r.format), { currency }),
      // BY CONTENT TYPE IS GONE (8 Sep 2026). Ethan: "I would actually remove
      // the by content type because we're not really gonna track that any more.
      // I think it's better to remove that, and you can add a new card in there
      // if you want."
      //
      // Prize type takes the slot because it is the one cut of the same money
      // that changes what the money COSTS: a travel voucher is redeemed against
      // a booking we make margin on, so it does not cost its face value, and
      // the headline tiles already separate cash from vouchers for exactly that
      // reason. This card is that split per challenge shape rather than in
      // total.
      byPrize: groupBy(scoped, (r) => label('prize_type', r.prize_type), { currency }),
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
      // Ethan: "I think the challenges [should] show there as soon as they're
      // active, or even when they're planned, just to show the challenges."
      //
      // THE DATES DECIDE, NOT THE STORED STATUS. See `runningChallenges` in
      // lib/programme for what this used to do and why three finished imports
      // were sitting under a heading that said "Running now".
      running: runningChallenges(scoped, now),
    }
  }, [rows, currency, rates, effectiveMarket, year, month, now])

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

          It was three named groups - Money, Where, When - plus a clear, an
          export and a log button, in a band of its own, sitting under the
          page's own market chips and the page's own currency toggle. Two of the
          three groups were duplicates of a control one row above them, which is
          the fault Ethan actually described: not that any single control is
          wrong, but that the same question is asked twice in two shapes before
          you reach a number.

          Money is gone (the page owns it). Where is gone (the page's chips own
          it). What is left is genuinely this tab's: WHICH of the two documents
          you want, over WHAT period, and the two actions that operate on the
          rows in front of you. They fit on one line, and the line sits directly
          above the thing it changes rather than in a toolbar at the top of the
          page. -------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex w-full gap-1 rounded-xl border border-gray-200 bg-white p-1 sm:w-fit">
          {[
            { key: 'summary', label: 'Summary', icon: 'chart' },
            { key: 'list', label: `Challenges (${data.scoped.length})`, icon: 'reorder' },
          ].map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => setView(v.key)}
              aria-pressed={view === v.key}
              className={cx(
                'flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors sm:flex-none',
                view === v.key ? 'bg-brand text-white' : 'text-smoke hover:text-brand',
              )}
            >
              <Icon name={v.icon} className="h-4 w-4" />
              {v.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* The month select only appears once a year is chosen, because
              "August" across every year the programme has run is not a period
              anybody means. */}
          <Select
            value={year}
            onChange={(v) => { setYear(v); if (v === 'all') setMonth('all') }}
            variant="chip"
            className="w-32"
            ariaLabel="Filter by year"
            options={[{ value: 'all', label: 'All time' }, ...data.years.map((y) => ({ value: y, label: y }))]}
          />
          {year !== 'all' && (
            <Select
              value={month}
              onChange={setMonth}
              variant="chip"
              className="w-36"
              ariaLabel="Filter by month"
              options={[{ value: 'all', label: 'Whole year' }, ...MONTHS]}
            />
          )}
          {year !== 'all' && (
            <button
              onClick={() => { setYear('all'); setMonth('all') }}
              className="rounded-lg px-2 py-1.5 text-xs font-semibold text-smoke transition-colors hover:text-brand"
            >
              Clear
            </button>
          )}
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
        </div>
      </div>

      {view === 'summary' ? (
        <>
          {/* ---- The four numbers, then the ratios ----
              It was ten StatCards in one grid, every one the same size, so the
              spend and "posts per creator" carried identical weight. Four
              headline figures at full size and the rest as a quiet strip is the
              same information with a hierarchy on it. */}
          <div>
            <div className="mb-4">
              <h2 className="text-lg font-semibold">Programme economics</h2>
              <p className="mt-1 text-xs text-smoke">
                Blended across {b.challenges} challenge{b.challenges === 1 ? '' : 's'}: totals divided once, never an
                average of averages. Money is what has actually been awarded, including prizes still to pay.
              </p>
            </div>
            <div className="grid auto-rows-fr grid-cols-2 gap-4 lg:grid-cols-4">
              {/* TWO CPMs, ANSWERING DIFFERENT QUESTIONS. Cash alone is what
                  leaves the business - a Tryp.com voucher is redeemed against a
                  booking we make margin on, so it does not cost its face value
                  and folding it in makes the programme look about a third more
                  expensive than it is. */}
              <StatCard
                label="Cash CPM"
                value={money(b.cashCpm, currency, 2)}
                hint={b.unmeasuredChallenges
                  ? `per 1,000 views · ${b.measuredChallenges} of ${b.challenges} measured`
                  : 'cash only, per 1,000 views'}
                accent
              />
              <StatCard label="Total views" value={formatViews(b.views)} hint="as logged" />
              <StatCard label="Cash prizes" value={money(b.cashSpend, currency, 0)} hint="awarded, pending included" />
              <StatCard label="Voucher value" value={money(b.voucherSpend, currency, 0)} hint="face value, not cost" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 rounded-card border border-gray-100 bg-cloud/40 px-5 py-4 sm:grid-cols-3 lg:grid-cols-6">
              <Ratio label="Total CPM" value={money(b.combinedCpm, currency, 2)} />
              <Ratio label="Cost / post" value={money(b.costPerPost, currency, 2)} />
              <Ratio label="Cost / creator" value={money(b.costPerCreator, currency, 2)} />
              <Ratio label="Posts / creator" value={num(b.postsPerCreator, 1)} />
              <Ratio label="Views / post" value={b.viewsPerPost ? formatViews(Math.round(b.viewsPerPost)) : '-'} />
              <Ratio label="On target" value={b.onTargetPct != null ? `${b.onTargetPct}%` : '-'} />
            </div>
          </div>

          {/* ---- Month by month ---- */}
          {data.monthly.length > 0 && (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <Card
                title="Spend against reach"
                sub={`Prize spend (bars) and views (line) per month`}
                onExport={() => downloadCsv('monthly-performance.csv', data.monthly)}
              >
                <ComposedChart data={data.monthly} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F1F2" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6B7280' }} />
                  <YAxis yAxisId="l" tick={{ fontSize: 11, fill: '#6B7280' }} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: '#6B7280' }} tickFormatter={formatViews} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(217,68,7,0.06)' }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="l" dataKey="spend" name={`Prize spend (${currency})`} fill={BRAND_LIGHT} radius={[8, 8, 0, 0]} maxBarSize={32} />
                  <Line yAxisId="r" type="monotone" dataKey="views" name="Views" stroke={BRAND} strokeWidth={2.5} dot={{ fill: BRAND, r: 3 }} />
                </ComposedChart>
              </Card>

              <Card title="CPM against target" sub="Blended cost per 1,000 views each month. Under the line is the goal.">
                <BarChart data={data.monthly} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F1F2" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6B7280' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} tickFormatter={(v) => money(v, currency, 2)} width={60} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(217,68,7,0.06)' }} formatter={(v) => money(v, currency, 2)} />
                  <ReferenceLine y={0.5} stroke={GOOD} strokeDasharray="4 4" label={{ value: 'target', fontSize: 10, fill: GOOD, position: 'right' }} />
                  <Bar dataKey="cpm" name="Blended CPM" fill={BRAND} radius={[8, 8, 0, 0]} maxBarSize={32} />
                </BarChart>
              </Card>
            </div>
          )}

          {/* ---- What it has added up to, and who took part ---- */}
          {data.monthly.length > 1 && (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <Card
                title="The programme, adding up"
                sub="Every month is the whole programme to date, not that month alone"
                onExport={() => downloadCsv('cumulative-programme.csv', data.cumulative)}
              >
                <ComposedChart data={data.cumulative} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F1F2" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#6B7280' }} interval="preserveStartEnd" />
                  <YAxis yAxisId="l" tick={{ fontSize: 11, fill: '#6B7280' }} tickFormatter={formatViews} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: '#6B7280' }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area yAxisId="l" type="monotone" dataKey="views" name="Views to date" stroke={BRAND} fill={BRAND} fillOpacity={0.16} strokeWidth={2.5} />
                  <Line yAxisId="r" type="monotone" dataKey="spend" name={`Spend to date (${currency})`} stroke={BRAND_LIGHT} strokeWidth={2.5} dot={false} />
                </ComposedChart>
              </Card>

              {/* Same stacked-area shape as Community health's weekly chart, on
                  purpose: two charts that mean "how much of this happened over
                  time" should look alike. */}
              <Card
                title="Who took part each month"
                sub="Creator entries and the posts they made"
                onExport={() => downloadCsv('participation-by-month.csv', data.monthly.map(({ month: m, creators, posts, challenges }) => ({ month: m, creators, posts, challenges })))}
              >
                <AreaChart data={data.monthly} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F1F2" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#6B7280' }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="posts" name="Posts" stroke={BRAND_LIGHT} fill={BRAND_PALE} fillOpacity={0.85} />
                  <Area type="monotone" dataKey="creators" name="Creator entries" stroke={BRAND} fill={BRAND} fillOpacity={0.55} />
                </AreaChart>
              </Card>
            </div>
          )}

          {/* ---- Breakdowns ---- */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Breakdown title="By market" rows={data.byMarket} currency={currency} />
            <Breakdown title="By format" rows={data.byFormat} currency={currency} />
            <Breakdown title="By prize type" rows={data.byPrize} currency={currency} />
          </div>
        </>
      ) : (
        <ChallengeList rows={data.scoped} running={data.running} currency={currency} />
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

// A chart in a card. Every chart on this tab was its own copy of the same
// six lines of wrapper markup, which is how two of them ended up with a CSV
// button and two without.
function Card({ title, sub, onExport, children }) {
  return (
    <section className="card">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {sub && <p className="mt-1 text-xs text-smoke">{sub}</p>}
        </div>
        {onExport && (
          <button onClick={onExport} className="btn-ghost !px-3 !py-1.5 text-xs">CSV ↓</button>
        )}
      </div>
      <div className="h-64">
        <ResponsiveContainer>{children}</ResponsiveContainer>
      </div>
    </section>
  )
}

// The month select's options. Named rather than numbered because "08" in a
// dropdown beside a year reads as a day.
const MONTHS = [
  ['01', 'January'], ['02', 'February'], ['03', 'March'], ['04', 'April'],
  ['05', 'May'], ['06', 'June'], ['07', 'July'], ['08', 'August'],
  ['09', 'September'], ['10', 'October'], ['11', 'November'], ['12', 'December'],
].map(([value, labelText]) => ({ value, label: labelText }))

// ---------------------------------------------------------------------------
// EVERY CHALLENGE, AS A THING YOU CAN ACTUALLY SEARCH.
//
// It began as a fourteen-column table 1,100px wide that scrolled sideways -
// "an Excel copy" - and the trouble was never the width. Fourteen numbers side
// by side have no hierarchy, so a challenge that cost EUR 1.42 per thousand
// views and one that cost EUR 14.20 looked exactly alike until you found the
// column and read the digits. It became a list of cards, which fixed that.
//
// WHAT IT STILL WAS NOT WAS FINDABLE (8 Sep 2026). Fifty cards sorted by date
// is fine for reading down and useless for "open the Spain one from June",
// which is what somebody actually wants from a list. Ethan: "rebuild it now,
// not just a button that brings you to the bottom."
//
// So the list has the three controls a list of fifty needs and had none of:
//
//   SEARCH      by title, market or country. Matching on more than the title
//               matters because half these rows are named "Spain Monthly ·
//               2026-08" and the other half are not named at all.
//   STATUS      derived from the rows present, so it never offers a filter
//               that would empty the list.
//   SORT        which it had, and which was the only way to reorder fifty
//               things.
//
// AND WHAT IS RUNNING IS PINNED ABOVE WHAT IS FINISHED. Ethan: "the challenges
// [should] show there as soon as they're active, or even when they're planned."
// A live challenge is not the fiftieth-most-interesting row in a list sorted by
// date; it is the reason somebody opened the page. It gets its own block at the
// top and is not repeated below.
const SORTS = [
  { value: 'recent', label: 'Most recent' },
  { value: 'cpm', label: 'Cheapest CPM' },
  { value: 'spend', label: 'Biggest spend' },
  { value: 'views', label: 'Most views' },
]

function ChallengeList({ rows, running, currency }) {
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
      {/* ---- Running now, pinned ----
          TRYP.COM ORANGE, NOT A WASH OF IT. Ethan: "I would put these in
          tryp.com orange rather than the weird orange you have." The weird
          orange was `bg-brand-tint/20` - brand orange at a fifth of its
          strength over white, which lands on a pale peach that belongs to no
          palette and reads as a card that has gone slightly wrong rather than
          one that is lit up. The colour is now the real `#d94407`, and it is
          carried by the things that should be loud (the heading, the live pill,
          the rule down the left edge) rather than smeared across the whole card
          at an opacity chosen to keep the text readable. That is the same rule
          this platform uses everywhere else for a picked thing: solid brand
          with white on it, never a tint. */}
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
        <div className="space-y-3">
          {shown.map((r) => <LogCard key={r.id} r={r} currency={currency} />)}
        </div>
      )}

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
    { label: 'Views', value: r.views > 0 ? formatViews(r.views) : '-' },
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
      {live && <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-brand" />}
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
            <span>{r.market || 'Unspecified'}</span>
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

// One breakdown card: a dimension, its spend, and what that spend bought.
function Breakdown({ title, rows, currency }) {
  const visible = rows.filter((g) => g.blended.challenges > 0)
  if (visible.length === 0) return null
  const maxSpend = Math.max(...visible.map((g) => g.blended.spend), 1)
  return (
    <section className="card">
      <h2 className="mb-4 font-semibold">{title}</h2>
      <div className="space-y-4">
        {visible.map((g) => (
          <div key={g.key}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-medium">{g.key}</span>
              <span className="shrink-0 tabular-nums text-xs text-smoke">
                {money(g.blended.spend, currency, 0)} · {formatViews(g.blended.views)} views
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-cloud">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand to-brand-light"
                style={{ width: `${Math.max(3, (g.blended.spend / maxSpend) * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-smoke">
              {g.blended.challenges} challenge{g.blended.challenges === 1 ? '' : 's'}
              {g.blended.cpm != null && ` · CPM ${money(g.blended.cpm, currency, 2)}`}
              {g.blended.postsPerCreator != null && ` · ${num(g.blended.postsPerCreator, 1)} posts/creator`}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
