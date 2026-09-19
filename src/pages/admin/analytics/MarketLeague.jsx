import { useMemo, useState } from 'react'
import { flagEmoji } from '../../../lib/countries'
import { downloadCsv, formatViews, formatMoney, cx } from '../../../lib/utils'
import { marketStandings, monthsInRecord, monthLabel, previousRanks } from '../../../lib/marketStandings'
import Icon from '../../../components/Icon'

// THE MARKET LEAGUE.
//
// Ethan: "I think it's good for the community managers to have a bit of
// competition too, this should be built into the analytics page somewhere, like
// a market leaderboard, which shows all time and for current month and past
// months, this is based on views, but should also show numbers of creators,
// prize money paid etc, like a comparison as well as competition."
//
// TWO THINGS ON ONE SCREEN, AND THEY PULL AGAINST EACH OTHER.
//
// A LEAGUE wants one number, ranked, with a winner. A COMPARISON wants every
// number side by side so you can see that the market in fourth is the cheapest
// in the programme. Put them in two cards and the page asks you to hold one in
// your head while you read the other.
//
// So it is ONE list, ranked by a metric you choose, with every other metric on
// the row - and the bar is what makes it a league rather than a table. Change
// the metric and the order re-sorts with the rows moving to their new places,
// because watching Spain drop from first to fourth when you switch from views
// to cost per thousand is the whole argument for having both.
//
// WHY THE METRIC CAN BE COST-PER-THOUSAND, WHERE LOW WINS. It is the one number
// on this page a manager can actually move without a bigger budget, so leaving
// it out would make the league reward spending. `lowerWins` flips the sort and
// the bar, and the column header says which way is good.

const METRICS = [
  { key: 'views', label: 'Views', icon: 'eye', fmt: (r) => formatViews(r.views), value: (r) => r.views },
  { key: 'members', label: 'Creators', icon: 'users', fmt: (r) => String(r.members), value: (r) => r.members },
  { key: 'challenges', label: 'Challenges', icon: 'flag', fmt: (r) => String(r.challenges), value: (r) => r.challenges },
  { key: 'posts', label: 'Videos', icon: 'video', fmt: (r) => String(r.posts), value: (r) => r.posts },
  { key: 'spend', label: 'Prize money', icon: 'money', fmt: (r, ccy) => formatMoney(r.spend, ccy), value: (r) => r.spend },
  {
    key: 'cpm', label: 'Cost / 1k views', icon: 'chart', lowerWins: true,
    fmt: (r, ccy) => (r.cpm == null ? '—' : formatMoney(r.cpm, ccy)),
    value: (r) => r.cpm,
  },
]

function Medal({ rank }) {
  if (rank > 3) {
    return <span className="w-7 shrink-0 text-center text-sm font-bold tabular-nums text-gray-400">{rank}</span>
  }
  return (
    <span className="w-7 shrink-0 text-center text-lg leading-none" aria-label={`Position ${rank}`}>
      {['🥇', '🥈', '🥉'][rank - 1]}
    </span>
  )
}

// WHICH WAY IT MOVED SINCE LAST MONTH. Only ever shown on a month view: "up two
// places since last month" is a sentence about months, and there is nothing it
// could mean on an all-time table.
function Movement({ from, to }) {
  if (from == null) {
    return <span className="rounded-full bg-brand-tint px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand">new</span>
  }
  const d = from - to
  if (d === 0) return <span className="text-[11px] text-gray-300">–</span>
  return (
    <span className={cx('inline-flex items-center text-[11px] font-bold tabular-nums', d > 0 ? 'text-green-600' : 'text-red-500')}>
      <Icon name={d > 0 ? 'chevronUp' : 'chevronDown'} className="h-3 w-3" />
      {Math.abs(d)}
    </span>
  )
}

/** A market's monthly views as a tiny inline bar chart. */
function Spark({ byMonth, months }) {
  const vals = months.map((m) => byMonth[m]?.views || 0)
  const max = Math.max(1, ...vals)
  return (
    <span className="flex h-6 items-end gap-[2px]" aria-hidden="true">
      {vals.map((v, i) => (
        <span
          key={months[i]}
          title={`${monthLabel(months[i])}: ${formatViews(v)}`}
          className={cx('w-[5px] rounded-sm transition-all duration-300', v > 0 ? 'bg-brand/70' : 'bg-gray-200')}
          style={{ height: `${Math.max(2, Math.round((v / max) * 24))}px` }}
        />
      ))}
    </span>
  )
}

/** `YYYY-MM` for today, in the same shape `monthsInRecord` returns. */
function thisMonthKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/**
 * WHICH MONTH THE LEAGUE OPENS ON.
 *
 * Ethan: "rather than being all time, all time should still be an option. It
 * should always start be showing the data from the current month."
 *
 * It cannot be a `useState` initial value, because the months only exist once
 * `raw` has loaded and the first render happens before that. It is DERIVED
 * instead: `null` means "nobody has chosen yet, use the default", and any
 * string - INCLUDING the empty string that means all time - is a real choice
 * that sticks. An effect would work too and would flicker through all-time on
 * the way; this never renders the wrong month at all.
 *
 * Falls back to the newest month on record when the current one has nothing
 * yet, because opening on a provably empty table looks broken on the 1st.
 */
export function openingMonth(chosen, months, now = new Date()) {
  if (chosen !== null && chosen !== undefined) return chosen
  const current = thisMonthKey(now)
  if (months.includes(current)) return current
  return months[0] ?? ''
}

export default function MarketLeague({ raw, currency }) {
  const [chosenMonth, setMonth] = useState(null)   // null = not chosen yet; '' = all time
  const [metricKey, setMetricKey] = useState('views')

  const months = useMemo(() => monthsInRecord(raw), [raw])
  const month = useMemo(() => openingMonth(chosenMonth, months), [chosenMonth, months])
  const rows = useMemo(() => marketStandings(raw, { currency, month }), [raw, currency, month])
  const prev = useMemo(() => previousRanks(raw, month, { currency }), [raw, month, currency])
  // Every month, oldest first, for the sparklines - they read left to right.
  const sparkMonths = useMemo(() => [...months].reverse(), [months])

  const metric = METRICS.find((m) => m.key === metricKey) ?? METRICS[0]

  // A MARKET WITH NOTHING THIS MONTH IS NOT RANKED, IT IS LISTED UNDER THE LINE.
  // Ranking Nordics ninth for a month it ran nothing reads as a judgement on
  // Nordics; saying "no challenges in August" is just the fact.
  const { ranked, quiet } = useMemo(() => {
    const has = (r) => (month ? r.challenges > 0 : r.challenges > 0 || r.members > 0)
    const live = rows.filter(has)
    const rest = rows.filter((r) => !has(r))
    const val = (r) => metric.value(r)
    const sorted = [...live].sort((a, b) => {
      const av = val(a), bv = val(b)
      if (av == null && bv == null) return a.name.localeCompare(b.name)
      if (av == null) return 1
      if (bv == null) return -1
      return metric.lowerWins ? av - bv : bv - av
    })
    return { ranked: sorted, quiet: rest }
  }, [rows, metric, month])

  const top = ranked.length ? metric.value(ranked[0]) : 0
  const barWidth = (r) => {
    const v = metric.value(r)
    if (v == null || !ranked.length) return 0
    if (metric.lowerWins) {
      // Cheapest is the full bar; everything else is shorter in proportion to
      // how much more it costs.
      const best = metric.value(ranked[0]) || 1
      return Math.max(6, Math.round((best / v) * 100))
    }
    return Math.max(2, Math.round((v / (top || 1)) * 100))
  }

  const totals = useMemo(() => rows.reduce((a, r) => ({
    views: a.views + r.views,
    members: a.members + r.members,
    challenges: a.challenges + r.challenges,
    posts: a.posts + r.posts,
    spend: a.spend + r.spend,
  }), { views: 0, members: 0, challenges: 0, posts: 0, spend: 0 }), [rows])

  const exportCsv = () => downloadCsv(
    `market-league-${month || 'all-time'}.csv`,
    ranked.concat(quiet).map((r, i) => ({
      position: i + 1,
      market: r.name,
      views: r.views,
      measured_challenges: r.measured,
      challenges: r.challenges,
      videos: r.posts,
      creator_entries: r.entries,
      creators: r.members,
      prize_money: Math.round(r.spend),
      paid_out: Math.round(r.paid),
      cost_per_1k_views: r.cpm == null ? '' : r.cpm.toFixed(2),
      currency,
    })),
  )

  return (
    <div className="space-y-5">
      <section className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Market league</h2>
            <p className="mt-1 text-xs text-smoke">
              Every challenge counts for the market that ran it. {month ? monthLabel(month) : 'Since the programme began'}.
            </p>
          </div>
          <button onClick={exportCsv} className="btn-ghost !py-1.5 !px-3 text-xs">CSV ↓</button>
        </div>

        {/* THE PERIOD AND THE METRIC SCROLL, THEY DO NOT WRAP.
            Nine months of pills wrapped to FOUR ROWS on a phone - a screen and
            a half of furniture between the heading and the table it controls -
            and the list only grows: twelve by December, twenty-four a year
            after that. One row that scrolls is the shape the tab strip above
            already uses for the same reason. `-mx-*` lets a pill bleed to the
            card's edge so it is obvious there is more. */}
        <div className="-mx-5 mt-5 flex gap-1.5 overflow-x-auto px-5 pb-1 pt-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
          {[['', 'All time'], ...months.map((m) => [m, monthLabel(m)])].map(([key, label]) => {
            const on = month === key
            return (
              <button
                key={key || 'all'}
                type="button"
                onClick={() => setMonth(key)}
                aria-pressed={on}
                className={cx(
                  'shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-200',
                  on
                    ? 'border-brand bg-brand text-white shadow-card'
                    : 'border-gray-200 bg-white text-smoke hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand hoverable:hover:text-brand',
                )}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* ------------------------------------------------------ the metric */}
        <div className="-mx-5 mt-3 flex gap-1.5 overflow-x-auto px-5 pb-1 pt-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
          {METRICS.map((m) => {
            const on = metricKey === m.key
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setMetricKey(m.key)}
                aria-pressed={on}
                className={cx(
                  'inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-200',
                  on
                    ? 'border-brand bg-brand-tint text-brand'
                    : 'border-gray-200 bg-white text-gray-400 hoverable:hover:border-brand hoverable:hover:text-brand',
                )}
              >
                <Icon name={m.icon} className="h-3.5 w-3.5" />
                {m.label}
                {m.lowerWins && on && <span className="text-[9px] font-bold uppercase tracking-wide">low wins</span>}
              </button>
            )
          })}
        </div>

        {/* ------------------------------------------------------- the table */}
        <div className="mt-5 space-y-2">
          {ranked.length === 0 && (
            <p className="py-8 text-center text-sm text-smoke">No market ran a challenge in {monthLabel(month)}.</p>
          )}
          {ranked.map((r, i) => (
            <div
              key={r.id}
              className="group relative overflow-hidden rounded-card border border-gray-100 bg-white px-3 py-3 shadow-card transition-all duration-300 hoverable:hover:-translate-y-0.5 hoverable:hover:shadow-lift sm:px-4"
            >
              {/* THE BAR IS THE BACKGROUND, NOT A COLUMN. A league table where
                  the ranking metric is also the width of the row is readable at
                  a glance from across a desk, which a column of numbers is not. */}
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-brand/[0.14] to-brand/[0.03] transition-all duration-500"
                style={{ width: `${barWidth(r)}%` }}
              />
              {/* TWO LINES, NOT ONE WRAPPING LINE.
                  This was a single `flex-wrap` row holding the name, six facts,
                  a sparkline and the headline number, and on a 375px phone it
                  collapsed: the name squeezed down to "Portu…", every fact took
                  a line of its own, and one market was four hundred pixels
                  tall. The identity and the number it is ranked on belong on
                  one line together - that is what a league table IS - and the
                  supporting figures belong under them where they have the whole
                  width to wrap into. */}
              <div className="relative flex items-center gap-2.5 sm:gap-3">
                <Medal rank={i + 1} />
                <span className="shrink-0 text-lg leading-none" aria-hidden="true">
                  {(r.countries || []).slice(0, 2).map((c) => flagEmoji(c)).join('')}
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="truncate text-sm font-bold">{r.name}</span>
                  {month && <Movement from={prev.get(r.id) ?? null} to={i + 1} />}
                </span>
                {/* The sparkline is a nicety and the first thing to go when
                    there is no room for it. */}
                {!month && <span className="hidden sm:block"><Spark byMonth={r.byMonth} months={sparkMonths} /></span>}
                <span className="shrink-0 text-right">
                  <span className="block text-base font-extrabold tabular-nums leading-tight text-brand sm:text-lg">
                    {metric.fmt(r, currency)}
                  </span>
                  <span className="block text-[10px] uppercase tracking-wide text-gray-400">{metric.label}</span>
                </span>
              </div>

              <div className="relative mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-[38px] text-[11px] text-smoke sm:pl-[52px]">
                <span><b className="text-ink">{r.members}</b> creators</span>
                <span><b className="text-ink">{r.challenges}</b> challenges</span>
                <span><b className="text-ink">{r.posts}</b> videos</span>
                <span><b className="text-ink">{formatMoney(r.spend, currency)}</b> in prizes</span>
                {r.cpm != null && <span><b className="text-ink">{formatMoney(r.cpm, currency)}</b> / 1k views</span>}
                {/* The "views measured on 4 of 6" caveat used to sit here.
                    Ethan: "I wouldn't show up where it says views measured on
                    six of seven and the other places... just show what the
                    current data is for that we have." The incompleteness is
                    still carried in the CSV export as `measured_challenges`,
                    which is where somebody auditing a number will look; it was
                    only ever noise on a league table. */}
              </div>
            </div>
          ))}

          {quiet.length > 0 && (
            <div className="pt-2">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Nothing ran {month ? `in ${monthLabel(month)}` : 'yet'}
              </p>
              <div className="flex flex-wrap gap-2">
                {quiet.map((r) => (
                  <span key={r.id} className="inline-flex items-center gap-2 rounded-full border border-dashed border-gray-200 px-3 py-1.5 text-xs text-gray-400">
                    <span aria-hidden="true">{(r.countries || []).slice(0, 2).map((c) => flagEmoji(c)).join('')}</span>
                    {r.name}
                    <b className="text-smoke">{r.members}</b> creators
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* The programme's own row, so a market's share is readable without
            adding six numbers up. It is not a rank and is drawn as a footer. */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-gray-100 pt-4 text-xs text-smoke">
          <span className="font-semibold uppercase tracking-wide text-gray-400">
            All markets {month ? `· ${monthLabel(month)}` : 'together'}
          </span>
          <span className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <span><b className="text-ink">{formatViews(totals.views)}</b> views</span>
            <span><b className="text-ink">{totals.members}</b> creators</span>
            <span><b className="text-ink">{totals.challenges}</b> challenges</span>
            <span><b className="text-ink">{totals.posts}</b> videos</span>
            <span><b className="text-ink">{formatMoney(totals.spend, currency)}</b> in prizes</span>
          </span>
        </div>
      </section>

      {/* WHY THE MARKETS DO NOT ADD UP TO THE PROGRAMME, said once, here, rather
          than left for somebody to find by subtraction. */}
      <p className="px-1 text-[11px] leading-relaxed text-smoke">
        A challenge counts for the market that ran it, so a worldwide challenge belongs to none of
        them and these totals are smaller than the programme's. Prize money is what the challenges
        were worth; the payouts actually made through the platform are on the Challenges tab.
      </p>
    </div>
  )
}
