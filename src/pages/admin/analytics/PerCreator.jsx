import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { perCreator } from '../../../lib/analyticsScope'
import { cpmBand } from '../../../lib/programme'
import { Avatar } from '../../../components/ui'
import Icon from '../../../components/Icon'
import Segmented from '../../../components/network/Segmented'
import { cx, downloadCsv, formatMoney, formatViews } from '../../../lib/utils'

// WHO DELIVERS, AND WHAT THEY COST.
//
// The programme has been measured per CHALLENGE since it started, which answers
// "was that campaign worth running" and never "who is worth keeping". Those are
// different decisions and only one of them is about people. A creator who
// delivers 300,000 views for a fifty-euro voucher and a creator who delivers
// 4,000 for the same voucher are the same line in every existing report.
//
// THE TWO CPMs, and why there is no third. Cash is money that leaves the
// business. A Tryp.com voucher is a seat we were flying anyway, so it costs
// something real but not the same something. So: cash CPM on its own, and a
// combined CPM that loads the vouchers on top. A voucher-only CPM would be a
// number nobody makes a decision with.
//
// A CREATOR WITH NO VIEWS HAS NO CPM. Not zero - zero sorts them to the top of
// "most efficient", which is the opposite of true. They show a dash, and the
// "never posted" count above the table is where they are actually accounted
// for.

// cpmBand returns a word; the table used to read `.tone` off it, which does not exist, so every CPM chip was grey.
const TONE = {
  on_target: 'bg-green-50 text-green-700', watch: 'bg-amber-50 text-amber-700', over_target: 'bg-red-50 text-red-600',
  none: 'bg-cloud text-smoke',
}

const COLUMNS = [
  { key: 'views', label: 'Views', fmt: (r) => formatViews(r.views), num: true },
  { key: 'videos', label: 'Videos', fmt: (r) => r.videos, num: true },
  { key: 'avgViews', label: 'Avg / video', fmt: (r) => formatViews(Math.round(r.avgViews)), num: true },
  { key: 'challenges', label: 'Challenges', fmt: (r) => r.challenges, num: true },
]

export default function PerCreator({ raw, currency = 'EUR', scopeLabel, target = 0.5 }) {
  const toneOf = (cpm) => (cpm === null || cpm === undefined ? 'none' : cpmBand(cpm, { target }))
  const [sort, setSort] = useState('views')
  const [plotSort, setPlotSort] = useState('views')
  const [plotMore, setPlotMore] = useState(false)
  const [q, setQ] = useState('')
  const [desc, setDesc] = useState(true)
  const [onlyActive, setOnlyActive] = useState(false)

  const rows = useMemo(() => perCreator(raw, { currency }), [raw, currency])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const base = (onlyActive ? rows.filter((r) => r.videos > 0) : rows).filter((r) => !needle || (r.name || '').toLowerCase().includes(needle))
    const dir = desc ? -1 : 1
    return [...base].sort((a, b) => {
      const av = a[sort]
      const bv = b[sort]
      // Nulls always sink, whichever way the column is pointing. A creator with
      // no CPM is not the best OR the worst value in the programme; they are
      // not in that conversation at all.
      if (av === null && bv === null) return 0
      if (av === null) return 1
      if (bv === null) return -1
      if (typeof av === 'string') return dir * bv.localeCompare(av)
      return dir * (av - bv)
    })
  }, [rows, sort, desc, onlyActive, q])

  const totals = useMemo(() => {
    const views = rows.reduce((s, r) => s + r.views, 0)
    const cash = rows.reduce((s, r) => s + r.cash, 0)
    const vouchers = rows.reduce((s, r) => s + r.vouchers, 0)
    return {
      views,
      cash,
      vouchers,
      posted: rows.filter((r) => r.videos > 0).length,
      silent: rows.filter((r) => r.videos === 0).length,
      cashCpm: views > 0 ? (cash / views) * 1000 : null,
      combinedCpm: views > 0 ? ((cash + vouchers) / views) * 1000 : null,
      costPerCreator: rows.length ? (cash + vouchers) / rows.length : 0,
    }
  }, [rows])

  // WHERE EVERYBODY SITS, at a glance. Spend against views, one dot each.
  // The table answers "tell me about this person"; the plot answers the
  // question you cannot ask a table - who is unusual. A dot far right and low
  // is somebody delivering cheaply; far left and high is the opposite, and
  // neither shows up when you are reading fifty rows in order.
  const plotAll = useMemo(() => {
    const posted = rows.filter((r) => r.views > 0)
    const by = {
      views: (a, b) => b.views - a.views,
      spend: (a, b) => b.spend - a.spend || b.views - a.views,
      // Best value: cheapest per 1,000 views among those who were paid, then the unpaid by views.
      value: (a, b) => (a.spend > 0 ? a.combinedCpm ?? Infinity : Infinity) - (b.spend > 0 ? b.combinedCpm ?? Infinity : Infinity) || b.views - a.views,
    }[plotSort]
    return [...posted].sort(by)
  }, [rows, plotSort])
  const plotRows = plotMore ? plotAll : plotAll.slice(0, 10)
  const maxViews = Math.max(1, ...plotAll.map((r) => r.views))

  function head(key, label, hint) {
    const on = sort === key
    return (
      <th key={key} className={cx('px-3 py-2 text-right font-semibold', on && 'text-brand')}>
        <button
          type="button"
          title={hint}
          onClick={() => { if (on) setDesc((d) => !d); else { setSort(key); setDesc(true) } }}
          className="inline-flex items-center gap-1 hover:text-brand"
        >
          {label}
          {on && <span className="text-[9px]">{desc ? '▼' : '▲'}</span>}
        </button>
      </th>
    )
  }

  if (!rows.length) {
    return <p className="card text-sm text-smoke">No creators in {scopeLabel || 'this view'} yet.</p>
  }

  return (
    <div className="space-y-6">
      <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-card border border-gray-100 bg-white px-5 py-4 shadow-card">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-smoke">Cash CPM</p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums">
            {totals.cashCpm === null ? '—' : formatMoney(totals.cashCpm, currency)}
          </p>
          <p className="mt-0.5 text-[11px] text-smoke">per 1,000 views, cash prizes only</p>
        </div>
        <div className="rounded-card border border-gray-100 bg-white px-5 py-4 shadow-card">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-smoke">Combined CPM</p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums text-brand">
            {totals.combinedCpm === null ? '—' : formatMoney(totals.combinedCpm, currency)}
          </p>
          <p className="mt-0.5 text-[11px] text-smoke">cash and vouchers together</p>
        </div>
        <div className="rounded-card border border-gray-100 bg-white px-5 py-4 shadow-card">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-smoke">Cost per creator</p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums">{formatMoney(totals.costPerCreator, currency)}</p>
          <p className="mt-0.5 text-[11px] text-smoke">everything paid, across everyone</p>
        </div>
        <div className="rounded-card border border-gray-100 bg-white px-5 py-4 shadow-card">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-smoke">Posting</p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums">
            {totals.posted}<span className="text-base text-smoke"> / {rows.length}</span>
          </p>
          <p className={cx('mt-0.5 text-[11px]', totals.silent > 0 ? 'text-amber-600' : 'text-smoke')}>
            {totals.silent} have never posted
          </p>
        </div>
      </div>

      {/* SPEND AGAINST VIEWS, AS A RANKED LIST (11 Oct 2026). Ethan: "the per-creator spend against view graph looks
          really confusing". It was a scatter plot - one unlabelled orange dot per creator on two money/views axes - which
          answers "who is unusual" only for someone who already reads scatter plots, and names nobody. Now each creator
          is a row: what their videos brought (the bar), what they were paid, and what that cost per 1,000 views,
          coloured against the programme target. Sort it by what you are asking. */}
      <section className="card">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Spend against views</h2>
            <p className="mt-1 text-xs text-smoke">What each creator&apos;s videos brought in, against what they were paid. The colour is their cost per 1,000 views against the {formatMoney(target, currency)} target.</p>
          </div>
          <Segmented size="sm" value={plotSort} onChange={setPlotSort} label="Order" options={[
            { value: 'views', label: 'Most views' }, { value: 'value', label: 'Best value' }, { value: 'spend', label: 'Most paid' },
          ]} />
        </div>
        <ul className="space-y-1.5">
          {plotRows.map((r, i) => {
            const paid = r.spend > 0
            const band = paid ? toneOf(r.combinedCpm) : 'none'
            return (
              <li key={r.id} className="grid grid-cols-[1.5rem_minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-1.5 py-1.5 transition-colors hover:bg-cloud/60 sm:grid-cols-[1.5rem_minmax(0,12rem)_minmax(0,1fr)_auto] animate-rise" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
                <span className="text-right text-xs font-bold tabular-nums text-gray-300">{i + 1}</span>
                <span className="flex min-w-0 items-center gap-2">
                  <Avatar src={r.photo_url} name={r.name} size="xs" />
                  <span className="truncate text-[13px] font-semibold text-ink">{r.name}</span>
                </span>
                <span className="min-w-0">
                  <span className="block h-2.5 overflow-hidden rounded-full bg-cloud">
                    <span className="block h-full rounded-full bg-gradient-to-r from-brand to-brand-light transition-[width] duration-700" style={{ width: `${Math.max(2, (r.views / maxViews) * 100)}%` }} />
                  </span>
                  <span className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-smoke">
                    <span className="font-semibold tabular-nums text-ink">{formatViews(r.views)} views</span>
                    <span>{r.videos} {r.videos === 1 ? 'video' : 'videos'}</span>
                    <span className="tabular-nums">paid {formatMoney(r.spend, currency)}</span>
                  </span>
                </span>
                <span className={cx('rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums', TONE[band])} title="Cost per 1,000 views">
                  {!paid || r.combinedCpm === null ? 'Not paid yet' : `${formatMoney(r.combinedCpm, currency)} CPM`}
                </span>
              </li>
            )
          })}
        </ul>
        {plotAll.length > plotRows.length && (
          <button type="button" onClick={() => setPlotMore((v) => !v)} className="mt-3 text-xs font-semibold text-brand hover:underline">
            {plotMore ? 'Show the top 10' : `Show all ${plotAll.length}`}
          </button>
        )}
        <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-smoke">
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green-500" />at or under target</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" />up to twice the target</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" />over twice the target</span>
        </p>
      </section>

      <section className="card !p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-5">
          <div>
            <h2 className="font-semibold">Every creator</h2>
            <p className="mt-1 text-xs text-smoke">
              Sort by any column. Click a name to open their own pages as they see them.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Icon name="magnifier" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-300" />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a creator" aria-label="Find a creator" className="input !w-44 !py-1.5 !pl-8 text-xs" />
            </div>
            <button
              type="button"
              onClick={() => setOnlyActive((v) => !v)}
              aria-pressed={onlyActive}
              className={cx(
                'rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors',
                onlyActive ? 'bg-brand text-white' : 'text-smoke hover:bg-cloud hover:text-ink',
              )}
            >
              Creators that posted
            </button>
            <button
              onClick={() => downloadCsv('per-creator.csv', shown.map((r) => ({
                creator: r.name,
                status: r.status,
                joined: r.joined,
                videos: r.videos,
                views: r.views,
                avg_views_per_video: Math.round(r.avgViews),
                challenges: r.challenges,
                messages: r.messages,
                [`cash_${currency}`]: r.cash.toFixed(2),
                [`vouchers_${currency}`]: r.vouchers.toFixed(2),
                [`pending_${currency}`]: (r.cashPending + r.voucherPending).toFixed(2),
                cash_cpm: r.cashCpm === null ? '' : r.cashCpm.toFixed(3),
                combined_cpm: r.combinedCpm === null ? '' : r.combinedCpm.toFixed(3),
              })))}
              className="btn-secondary !py-1.5 !px-3 text-xs"
            >
              <Icon name="download" className="h-3.5 w-3.5" /> CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-[13px]">
            <thead className="border-y border-gray-100 bg-cloud/50 text-[11px] uppercase tracking-wide text-smoke">
              <tr>
                <th className="px-6 py-2 text-left font-semibold">Creator</th>
                {COLUMNS.map((c) => head(c.key, c.label))}
                {head('cash', `Cash (${currency})`, 'Cash prizes, paid and pending')}
                {head('vouchers', `Vouchers (${currency})`, 'Tryp.com vouchers, paid and pending')}
                {/* ONE CPM PER ROW. The cash/voucher split is right there in
                    the two columns to the left, so a second CPM column was the
                    same split said twice - and per creator the question is
                    "what did this person cost us against what they delivered",
                    which is the fully-loaded number. The cash-only CPM stays on
                    the summary above, where it is a programme-level decision. */}
                {head('combinedCpm', 'CPM', 'Everything paid, per 1,000 views')}
                <th className="px-6 py-2 text-right font-semibold" />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                return (
                  <tr key={r.id} className="border-b border-gray-50 last:border-0 hover:bg-cloud/40">
                    <td className="px-6 py-3">
                      <Link to={`/dashboard?as=${r.id}`} className="flex items-center gap-2 font-medium hover:text-brand">
                        <Avatar src={r.photo_url} name={r.name} size="xs" />
                        <span className="truncate">{r.name}</span>
                      </Link>
                    </td>
                    {COLUMNS.map((c) => (
                      <td key={c.key} className="px-3 py-2.5 text-right tabular-nums">{c.fmt(r)}</td>
                    ))}
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(r.cash, currency)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(r.vouchers, currency)}</td>
                    <td className="px-3 py-2.5 text-right">
                      {r.combinedCpm === null ? (
                        <span className="text-gray-300">—</span>
                      ) : (
                        <span className={cx('inline-block rounded-full px-2 py-0.5 font-semibold tabular-nums', TONE[toneOf(r.combinedCpm)])}>
                          {formatMoney(r.combinedCpm, currency)}
                        </span>
                      )}
                    </td>
                    {/* A BUTTON THAT SAYS WHAT IT DOES.
                        It was a bare chevron, which on a row that is already a
                        link to the dashboard meant two destinations and no way
                        to tell them apart without clicking one. */}
                    <td className="px-6 py-2.5 text-right">
                      <Link
                        to={`/rewards?as=${r.id}`}
                        className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-semibold text-smoke transition-colors hover:border-brand hover:text-brand"
                      >
                        <Icon name="money" className="h-3.5 w-3.5" /> Rewards
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
