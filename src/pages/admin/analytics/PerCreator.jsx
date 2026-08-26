import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from 'recharts'
import { perCreator } from '../../../lib/analyticsScope'
import { cpmBand } from '../../../lib/programme'
import { Avatar } from '../../../components/ui'
import Icon from '../../../components/Icon'
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

const BRAND = '#d94407'

const tooltipStyle = {
  borderRadius: 12, border: '1px solid #F1F1F2', fontFamily: 'Poppins',
  fontSize: 12, boxShadow: '0 4px 16px rgba(26,26,26,0.08)',
}

const COLUMNS = [
  { key: 'views', label: 'Views', fmt: (r) => formatViews(r.views), num: true },
  { key: 'videos', label: 'Videos', fmt: (r) => r.videos, num: true },
  { key: 'avgViews', label: 'Avg / video', fmt: (r) => formatViews(Math.round(r.avgViews)), num: true },
  { key: 'challenges', label: 'Challenges', fmt: (r) => r.challenges, num: true },
]

export default function PerCreator({ raw, currency = 'EUR', scopeLabel }) {
  const [sort, setSort] = useState('views')
  const [desc, setDesc] = useState(true)
  const [onlyActive, setOnlyActive] = useState(false)

  const rows = useMemo(() => perCreator(raw, { currency }), [raw, currency])

  const shown = useMemo(() => {
    const base = onlyActive ? rows.filter((r) => r.videos > 0) : rows
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
  }, [rows, sort, desc, onlyActive])

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
  const plot = useMemo(
    () => rows.filter((r) => r.views > 0).map((r) => ({
      x: r.views, y: r.spend, z: r.videos, name: r.name, id: r.id,
    })),
    [rows],
  )

  function head(key, label, hint) {
    const on = sort === key
    return (
      <th className={cx('px-3 py-2 text-right font-semibold', on && 'text-brand')}>
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

      <section className="card">
        <div className="mb-6">
          <h2 className="font-semibold">Spend against views</h2>
          <p className="mt-1 text-xs text-smoke">
            One dot per creator who has posted. Far right and low is somebody delivering cheaply; the
            table below never shows you that, because you read a table in order.
          </p>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F1F2" />
              <XAxis
                type="number" dataKey="x" name="Views"
                tick={{ fontSize: 11 }} stroke="#8A8A8F" tickFormatter={formatViews} width={60}
              />
              <YAxis
                type="number" dataKey="y" name="Spend"
                tick={{ fontSize: 11 }} stroke="#8A8A8F"
                tickFormatter={(v) => formatMoney(v, currency)} width={64}
              />
              <ZAxis type="number" dataKey="z" range={[50, 320]} name="Videos" />
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={{ strokeDasharray: '3 3' }}
                formatter={(v, n) => (n === 'Views' ? formatViews(Number(v))
                  : n === 'Spend' ? formatMoney(Number(v), currency) : v)}
                labelFormatter={() => ''}
                content={({ payload }) => {
                  const p = payload?.[0]?.payload
                  if (!p) return null
                  return (
                    <div style={tooltipStyle} className="bg-white px-3 py-2">
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-smoke">{formatViews(p.x)} views · {formatMoney(p.y, currency)} · {p.z} videos</p>
                    </div>
                  )
                }}
              />
              <Scatter data={plot} fill={BRAND} fillOpacity={0.62} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="card !p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-5">
          <div>
            <h2 className="font-semibold">Every creator</h2>
            <p className="mt-1 text-xs text-smoke">
              Sort by any column. Click a name to open their own pages as they see them.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOnlyActive((v) => !v)}
              aria-pressed={onlyActive}
              className={cx(
                'rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors',
                onlyActive ? 'bg-brand text-white' : 'text-smoke hover:bg-cloud hover:text-ink',
              )}
            >
              Posted only
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
              className="btn-ghost !py-1.5 !px-3 text-xs"
            >
              CSV ↓
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-xs">
            <thead className="border-y border-gray-100 bg-cloud/50 text-smoke">
              <tr>
                <th className="px-6 py-2 text-left font-semibold">Creator</th>
                {COLUMNS.map((c) => head(c.key, c.label))}
                {head('cash', `Cash (${currency})`, 'Cash prizes, paid and pending')}
                {head('vouchers', `Vouchers (${currency})`, 'Tryp.com vouchers, paid and pending')}
                {head('cashCpm', 'Cash CPM', 'Cash per 1,000 views')}
                {head('combinedCpm', 'Combined CPM', 'Cash and vouchers per 1,000 views')}
                <th className="px-6 py-2 text-right font-semibold" />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const band = r.combinedCpm === null ? null : cpmBand(r.combinedCpm)
                return (
                  <tr key={r.id} className="border-b border-gray-50 last:border-0 hover:bg-cloud/40">
                    <td className="px-6 py-2.5">
                      <Link to={`/dashboard?as=${r.id}`} className="flex items-center gap-2 font-medium hover:text-brand">
                        <Avatar name={r.name} size="xs" />
                        <span className="truncate">{r.name}</span>
                      </Link>
                    </td>
                    {COLUMNS.map((c) => (
                      <td key={c.key} className="px-3 py-2.5 text-right tabular-nums">{c.fmt(r)}</td>
                    ))}
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(r.cash, currency)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(r.vouchers, currency)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {r.cashCpm === null ? <span className="text-gray-300">—</span> : formatMoney(r.cashCpm, currency)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {r.combinedCpm === null ? (
                        <span className="text-gray-300">—</span>
                      ) : (
                        <span className={cx(
                          'inline-block rounded-full px-2 py-0.5 font-semibold tabular-nums',
                          band?.tone === 'green' ? 'bg-green-50 text-green-700'
                            : band?.tone === 'amber' ? 'bg-amber-50 text-amber-700'
                              : band?.tone === 'red' ? 'bg-red-50 text-red-600'
                                : 'bg-cloud text-smoke',
                        )}>
                          {formatMoney(r.combinedCpm, currency)}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-2.5 text-right">
                      <Link
                        to={`/rewards?as=${r.id}`}
                        title={`${r.name}'s rewards`}
                        className="inline-flex text-smoke hover:text-brand"
                      >
                        <Icon name="chevronRight" className="h-4 w-4" />
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
