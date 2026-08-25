import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
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
  challengeEconomics, blendEconomics, groupBy, label, FALLBACK_RATES,
} from '../../../lib/programme'

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

function Th({ children, right, className }) {
  return (
    <th className={cx('whitespace-nowrap px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-smoke', right && 'text-right', className)}>
      {children}
    </th>
  )
}
function Td({ children, right, className }) {
  return <td className={cx('whitespace-nowrap px-3 py-2.5', right && 'text-right tabular-nums', className)}>{children}</td>
}

export default function ProgrammePerformance() {
  const [rows, setRows] = useState(null)
  const [loadError, setLoadError] = useState('')
  // EUR IS THE DEFAULT. Five of the six open markets price in euro, and the
  // programme is reported to the business in euro; sterling is the exception,
  // not the base. Ethan asked for it explicitly and it is one keystroke back.
  const [currency, setCurrency] = useState('EUR')
  const [rates, setRates] = useState(FALLBACK_RATES)
  const [liveRates, setLiveRates] = useState(false)
  const [marketFilter, setMarketFilter] = useState('all')

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
        if (j?.rates?.EUR) { setRates({ GBP: 1, ...j.rates }); setLiveRates(true) }
      })
      .catch(() => {})
  }, [])

  const data = useMemo(() => {
    if (!rows) return null
    const all = rows.map((r) => challengeEconomics(r, { currency, rates }))
    const markets = [...new Set(all.map((r) => r.market).filter(Boolean))].sort()
    const scoped = marketFilter === 'all' ? all : all.filter((r) => (r.market ?? 'Unspecified') === marketFilter)

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
      byMarket: groupBy(all, (r) => r.market, { currency }),
      byFormat: groupBy(scoped, (r) => label('format', r.format), { currency }),
      byContent: groupBy(scoped, (r) => label('content_type', r.content_type), { currency }),
      monthly,
      live: scoped.filter((r) => r.status === 'active').length,
    }
  }, [rows, currency, rates, marketFilter])

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
        {data.markets.length > 0 && (
          <Select
            value={marketFilter}
            onChange={setMarketFilter}
            className="w-44"
            ariaLabel="Filter by market"
            options={[
              { value: 'all', label: 'All markets' },
              ...data.markets.map((m) => ({ value: m, label: m })),
              { value: 'Unspecified', label: 'Unspecified' },
            ]}
          />
        )}
        <button onClick={() => downloadCsv(`challenge-log-${currency}.csv`, exportRows)} className="btn-secondary !py-2 text-xs">
          Export challenge log
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
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {/* TWO CPMs, ANSWERING DIFFERENT QUESTIONS.
              Cash alone is what leaves the business - a Tryp.com voucher is
              redeemed against a booking we make margin on, so it does not cost
              its face value and folding it in makes the programme look about a
              third more expensive than it is. The combined figure is still
              worth having: it is the honest total value handed to creators. */}
          <StatCard label="Cash prizes" value={money(b.cashSpend, currency, 0)} hint="awarded, pending included" />
          <StatCard label="Voucher value" value={money(b.voucherSpend, currency, 0)} hint="face value, not cost" />
          <StatCard label="Total views" value={formatViews(b.views)} hint="as logged" />
          <StatCard
            label="Cash CPM"
            value={money(b.cashCpm, currency, 2)}
            hint="cash only, per 1,000 views"
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
        <Breakdown title="By content type" rows={data.byContent} currency={currency} />
      </div>

      {/* ---- Challenge log ---- */}
      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Challenge log</h2>
            <p className="mt-1 text-xs text-smoke">
              Every published challenge with its full economics. Tap a row for the deep dive.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto rounded-card border border-gray-100 shadow-card">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b border-gray-100 bg-cloud/60">
              <tr>
                <Th>Challenge</Th>
                <Th>Market</Th>
                <Th>Format</Th>
                <Th>Status</Th>
                <Th right>Prize</Th>
                <Th right>Views</Th>
                <Th right>Creators</Th>
                <Th right>Posts</Th>
                <Th right>CPM</Th>
                <Th right>Cost / post</Th>
                <Th right>Cost / creator</Th>
                <Th right>Posts / creator</Th>
                <Th right>Views / post</Th>
                <Th>Flag</Th>
              </tr>
            </thead>
            <tbody>
              {data.scoped.map((r) => (
                <tr key={r.id} className="border-b border-gray-50 transition-colors last:border-0 hover:bg-cloud/40">
                  <Td className="max-w-[220px] !whitespace-normal">
                    <Link to={`/admin/analytics/${r.id}`} className="font-medium hover:text-brand">{r.title}</Link>
                    <span className="block text-[11px] text-smoke">
                      {r.start_date?.slice(0, 10)} · {r.days} days
                    </span>
                  </Td>
                  <Td>{r.market || '-'}</Td>
                  <Td className="text-smoke">{label('format', r.format)}</Td>
                  <Td className="text-smoke">{label('status', r.status)}</Td>
                  <Td right>{money(r.spend, currency, 0)}</Td>
                  <Td right>{r.views > 0 ? r.views.toLocaleString() : '-'}</Td>
                  <Td right>{r.creators || '-'}</Td>
                  <Td right>{r.posts || '-'}</Td>
                  <Td right className="font-semibold">{money(r.cpm, currency, 2)}</Td>
                  <Td right>{money(r.costPerPost, currency, 2)}</Td>
                  <Td right>{money(r.costPerCreator, currency, 2)}</Td>
                  <Td right>{num(r.postsPerCreator, 1)}</Td>
                  <Td right>{r.viewsPerPost ? Math.round(r.viewsPerPost).toLocaleString() : '-'}</Td>
                  <Td>
                    <span className={cx('inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold', BAND_STYLE[r.band])}>
                      {BAND_LABEL[r.band]}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-smoke">
          CPM = prize spend ÷ (views ÷ 1,000). On target is at or under each challenge's own CPM target,
          Watch is up to double it, Over target is above that. Challenges with no views logged are shown
          but never counted in a blended figure.
        </p>
      </section>
    </div>
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
