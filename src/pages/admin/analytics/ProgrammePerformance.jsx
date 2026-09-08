import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../context/AuthContext'
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { format, startOfMonth } from 'date-fns'
import { supabase } from '../../../lib/supabase'
import { EmptyState, Skeleton, StatCard, Select } from '../../../components/ui'
import Icon from '../../../components/Icon'
import { downloadCsv, formatViews, cx } from '../../../lib/utils'
import {
  challengeEconomics, blendEconomics, groupBy, label, FALLBACK_RATES, publishFxRates,
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
export default function ProgrammePerformance({ market: scopeMarket = null }) {
  const [rows, setRows] = useState(null)
  const [loadError, setLoadError] = useState('')
  // EUR IS THE DEFAULT. Five of the six open markets price in euro, and the
  // programme is reported to the business in euro; sterling is the exception,
  // not the base. Ethan asked for it explicitly and it is one keystroke back.
  const [currency, setCurrency] = useState('EUR')
  const [rates, setRates] = useState(FALLBACK_RATES)
  const [liveRates, setLiveRates] = useState(false)
  const [marketFilter, setMarketFilter] = useState('all')
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
  // The page-level scope wins; the local dropdown is only reachable when the
  // page is showing everything.
  const effectiveMarket = scopeMarket || marketFilter

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
          setLiveRates(true)
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
      live: scoped.filter((r) => r.status === 'active').length,
    }
  }, [rows, currency, rates, effectiveMarket, year, month])

  if (!data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
    <div className="space-y-10">
      {/* ---- Controls ---- */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-xl border border-gray-200 p-1">
          {['EUR', 'GBP'].map((c) => (
            <button
              key={c}
              onClick={() => setCurrency(c)}
              className={cx('rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                currency === c ? 'bg-brand text-white' : 'text-smoke hover:text-brand')}
            >
              {c}
            </button>
          ))}
        </div>
        {/* HIDDEN WHILE THE PAGE IS SCOPED. Two controls that both mean
            "which market" is how a reader ends up looking at Spain's chart
            under a heading that says Germany. */}
        {!scopeMarket && data.markets.length > 0 && (
          <Select
            value={marketFilter}
            onChange={setMarketFilter}
            variant="chip"
            className="w-40"
            ariaLabel="Filter by market"
            options={[
              { value: 'all', label: 'All markets' },
              ...data.markets.map((m) => ({ value: m, label: m })),
              { value: 'Unspecified', label: 'Unspecified' },
            ]}
          />
        )}
        {/* WHEN. The month select only appears once a year is chosen, because
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
        {(year !== 'all' || (!scopeMarket && marketFilter !== 'all')) && (
          <button
            onClick={() => { setYear('all'); setMonth('all'); setMarketFilter('all') }}
            className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-smoke transition-colors hover:text-brand"
          >
            Clear filters
          </button>
        )}
        <button onClick={() => downloadCsv(`challenge-log-${currency}.csv`, exportRows)} className="btn-secondary !py-2 text-xs">
          Export challenge log
        </button>
        {/* THE WAY TO ADD ONE (8 Sep 2026). Ethan: "there also seems to be no
            way to add challenges... someone still runs a challenge on the
            WhatsApp community, I need to be able to add this data easily rather
            than having to create an Excel and upload it."

            The form has existed since the import; it lived on
            /admin/challenges/history, which nothing on this page linked to. So
            this is a button, not a feature: same component, same table, and it
            reloads the metrics on save so the new challenge is in the blend
            before the dialog has finished closing. */}
        <button onClick={() => setLogging(true)} className="btn-primary !py-2 text-xs">
          <Icon name="plus" className="h-4 w-4" /> Log a challenge
        </button>
        <span className="text-[11px] text-smoke">
          {liveRates ? 'Live FX rate' : 'Offline FX rate'} · money shown in {currency}
        </span>
      </div>

      {/* ---- Headline economics ---- */}
      <div>
        <h2 className="mb-1 text-lg font-semibold">Programme economics</h2>
        <p className="mb-4 text-xs text-smoke">
          Blended across {b.challenges} challenge{b.challenges === 1 ? '' : 's'}: totals divided once, never an
          average of averages. Money is what has actually been awarded, including prizes still to pay.
        </p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {/* TWO CPMs, ANSWERING DIFFERENT QUESTIONS.
              Cash alone is what leaves the business - a Tryp.com voucher is
              redeemed against a booking we make margin on, so it does not cost
              its face value and folding it in makes the programme look about a
              third more expensive than it is. The combined figure is still
              worth having: it is the honest total value handed to creators. */}
          <StatCard label="Cash prizes" value={money(b.cashSpend, currency, 0)} hint="awarded, pending included" />
          <StatCard label="Voucher value" value={money(b.voucherSpend, currency, 0)} hint="face value, not cost" />
          <StatCard
            label="Total views"
            value={formatViews(b.views)}
            hint={b.unmeasuredChallenges
              ? `across ${b.measuredChallenges} challenges`
              : 'as logged'}
          />
          {/* THE PER-VIEW FIGURES SAY WHAT THEY ARE OVER. Fourteen of the
              imported challenges were never measured, so a CPM that silently
              covered all forty-nine would be dividing forty-nine challenges'
              spend by thirty-five challenges' views - which is how this card
              read EUR 0.47 against Ethan's own tracker's EUR 0.38. The
              arithmetic is fixed in lib/programme; the hint is so nobody has to
              take it on trust. */}
          <StatCard
            label="Cash CPM"
            value={money(b.cashCpm, currency, 2)}
            hint={b.unmeasuredChallenges
              ? `cash per 1,000 views · ${b.measuredChallenges} measured, ${b.unmeasuredChallenges} not`
              : 'cash only, per 1,000 views'}
            accent
          />
          <StatCard
            label="Total CPM"
            value={money(b.combinedCpm, currency, 2)}
            hint="cash + vouchers, per 1,000 views"
          />
          <StatCard label="Cost per post" value={money(b.costPerPost, currency, 2)} />
          <StatCard label="Cost per creator" value={money(b.costPerCreator, currency, 2)} hint="per challenge entered" />
          <StatCard label="Posts per creator" value={num(b.postsPerCreator, 1)} hint="target 3 or more" />
          <StatCard label="Views per post" value={b.viewsPerPost ? formatViews(Math.round(b.viewsPerPost)) : '-'} hint="average reach of one video" />
          <StatCard
            label="On target"
            value={b.onTargetPct != null ? `${b.onTargetPct}%` : '-'}
            hint={`${b.onTarget} of ${b.scored} scored challenges`}
          />
        </div>
        {b.missingResults > 0 && (
          <p className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-xs text-amber-700">
            <Icon name="clock" className="h-4 w-4 shrink-0" />
            {b.missingResults} ended challenge{b.missingResults === 1 ? ' has' : 's have'} no views logged, so
            {b.missingResults === 1 ? ' it is' : ' they are'} excluded from every figure above.
          </p>
        )}
      </div>

      {/* ---- Monthly performance ---- */}
      {data.monthly.length > 0 && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <section className="card">
            <div className="mb-6 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">Spend against reach</h2>
                <p className="mt-1 text-xs text-smoke">Prize spend (bars) and views (line) per month</p>
              </div>
              <button onClick={() => downloadCsv('monthly-performance.csv', data.monthly)} className="btn-ghost !px-3 !py-1.5 text-xs">CSV ↓</button>
            </div>
            <div className="h-64">
              <ResponsiveContainer>
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
              </ResponsiveContainer>
            </div>
          </section>

          <section className="card">
            <div className="mb-6">
              <h2 className="font-semibold">CPM against target</h2>
              <p className="mt-1 text-xs text-smoke">Blended cost per 1,000 views each month. Under the line is the goal.</p>
            </div>
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={data.monthly} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F1F2" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6B7280' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} tickFormatter={(v) => money(v, currency, 2)} width={60} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(217,68,7,0.06)' }} formatter={(v) => money(v, currency, 2)} />
                  <ReferenceLine y={0.5} stroke={GOOD} strokeDasharray="4 4" label={{ value: 'target', fontSize: 10, fill: GOOD, position: 'right' }} />
                  <Bar dataKey="cpm" name="Blended CPM" fill={BRAND} radius={[8, 8, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>
      )}

      {/* ---- Breakdowns ---- */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Breakdown title="By market" rows={data.byMarket} currency={currency} />
        <Breakdown title="By format" rows={data.byFormat} currency={currency} />
        <Breakdown title="By prize type" rows={data.byPrize} currency={currency} />
      </div>

      {/* ---- Challenge log ---- */}
      <ChallengeLog rows={data.scoped} currency={currency} />

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

// The month select's options. Named rather than numbered because "08" in a
// dropdown beside a year reads as a day.
const MONTHS = [
  ['01', 'January'], ['02', 'February'], ['03', 'March'], ['04', 'April'],
  ['05', 'May'], ['06', 'June'], ['07', 'July'], ['08', 'August'],
  ['09', 'September'], ['10', 'October'], ['11', 'November'], ['12', 'December'],
].map(([value, labelText]) => ({ value, label: labelText }))

// ---------------------------------------------------------------------------
// THE CHALLENGE LOG.
//
// It was a fourteen-column table 1,100px wide that scrolled sideways - Ethan's
// "an Excel copy", and he is right that it was not a designed thing. The
// trouble with it was not the width, though; it was that fourteen numbers side
// by side have no hierarchy, so a challenge that cost £1.42 per thousand views
// and one that cost £14.20 looked exactly alike until you found the column and
// read the digits.
//
// A challenge is now a card that reads in the order somebody thinks:
//
//   what was it, and did it work         title, market, dates, the band
//   the number it is judged on           CPM, big, in brand orange
//   what produced that number            spend, views, creators, posts
//   the ratios, quietly                  cost per post, per creator, and so on
//
// The same figures, all of them - nothing was dropped, and the CSV export is
// untouched, because a spreadsheet IS the right shape for a spreadsheet.
const SORTS = [
  { value: 'recent', label: 'Most recent' },
  { value: 'cpm', label: 'Cheapest CPM' },
  { value: 'spend', label: 'Biggest spend' },
  { value: 'views', label: 'Most views' },
]

function ChallengeLog({ rows, currency }) {
  const [sort, setSort] = useState('recent')

  const sorted = useMemo(() => {
    const list = [...rows]
    // A challenge with no views has no CPM, and sorting nulls to the top of
    // "cheapest" would put every unfinished challenge above every real answer.
    const last = (v) => (v == null || Number.isNaN(v) ? Infinity : v)
    if (sort === 'cpm') return list.sort((a, b) => last(a.cpm) - last(b.cpm))
    if (sort === 'spend') return list.sort((a, b) => (b.spend || 0) - (a.spend || 0))
    if (sort === 'views') return list.sort((a, b) => (b.views || 0) - (a.views || 0))
    return list.sort((a, b) => String(b.start_date || '').localeCompare(String(a.start_date || '')))
  }, [rows, sort])

  if (rows.length === 0) return null

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-[-0.01em]">Challenge log</h2>
        <Select
          value={sort}
          onChange={setSort}
          ariaLabel="Sort the challenge log"
          options={SORTS}
        />
      </div>

      <div className="space-y-3">
        {sorted.map((r) => <LogCard key={r.id} r={r} currency={currency} />)}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-smoke">
        CPM = prize spend ÷ (views ÷ 1,000). On target is at or under each challenge&rsquo;s own CPM target,
        Watch is up to double it, Over target is above that. Challenges with no views logged are shown
        but never counted in a blended figure.
      </p>
    </section>
  )
}

function LogCard({ r, currency }) {
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
      className="card group block !p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-lift"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[17px] font-semibold leading-snug tracking-[-0.01em] transition-colors group-hover:text-brand">
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
