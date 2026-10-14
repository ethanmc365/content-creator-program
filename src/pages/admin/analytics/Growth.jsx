import { useMemo } from 'react'
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, Tooltip, XAxis, YAxis,
} from 'recharts'
import { growthByMonth, monthLabel } from '../../../lib/analyticsScope'
import { formatViews } from '../../../lib/utils'
import { FILL, CHART, barProps, gridProps, lineProps, tooltipStyle, xAxisProps, yAxisProps } from '../../../components/charts/chartTheme'
import ChartPanel from '../../../components/charts/ChartPanel'

// HOW BIG IS THIS, AND IS IT STILL GETTING BIGGER.
//
// The page could tell you the programme had 51 creators and could not tell you
// whether that was 51 last month or 51 since March, which is the difference
// between a thing that is working and a thing that has stopped. Two shapes,
// because they are two questions and one chart answers them badly:
//
//   THE RUNNING TOTAL is the size of the community. It only ever goes down when
//   somebody leaves, so a flat stretch is visible as a flat stretch.
//   THE BARS are the month's intake. A programme can be growing steadily and
//   still have stopped recruiting, and the total alone hides that.
//
// Counted from ACCEPTANCE, not signup - see growthByMonth. An application in
// the queue is not a member.

function Stat({ label, value, hint, tone }) {
  return (
    <div className="rounded-card border border-gray-100 bg-white px-5 py-4 shadow-card">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-smoke">{label}</p>
      <p className={`mt-1.5 text-2xl font-bold tabular-nums ${tone || ''}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-smoke">{hint}</p>}
    </div>
  )
}

export default function Growth({ raw, scopeLabel, onDrill }) {
  const months = useMemo(() => growthByMonth(raw?.profiles || []), [raw])

  const chart = useMemo(
    () => months.map((m) => ({ ...m, label: monthLabel(m.month) })),
    [months],
  )

  // Views delivered per month, so growth in PEOPLE can be read against growth
  // in OUTPUT. More creators and flat views is a different problem from fewer
  // creators and flat views, and only one chart of each can tell them apart.
  const output = useMemo(() => {
    const buckets = new Map()
    for (const s of raw?.submissions || []) {
      if (!s.submitted_at) continue
      const d = new Date(s.submitted_at)
      if (Number.isNaN(d.getTime())) continue
      const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
      if (!buckets.has(k)) buckets.set(k, { month: k, videos: 0, views: 0, creators: new Set() })
      const b = buckets.get(k)
      b.videos += 1
      b.views += Number(s.logged_views || 0)
      b.creators.add(s.creator_id)
    }
    return [...buckets.values()]
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((b) => ({ ...b, creators: b.creators.size, label: monthLabel(b.month) }))
  }, [raw])

  const latest = months.at(-1)
  const prev = months.at(-2)
  const total = latest?.total ?? 0
  const joinedThisMonth = latest?.joined ?? 0
  const trend = prev ? joinedThisMonth - prev.joined : null

  // Of the people who have ever joined, how many have posted anything at all.
  const activated = useMemo(() => {
    const posted = new Set((raw?.submissions || []).map((s) => s.creator_id))
    const real = (raw?.profiles || []).filter((p) => !p.is_test && !p.is_admin)
    if (!real.length) return { pct: 0, n: 0, of: 0 }
    const n = real.filter((p) => posted.has(p.id)).length
    return { pct: Math.round((n / real.length) * 100), n, of: real.length }
  }, [raw])

  if (!months.length) {
    return (
      <p className="card text-sm text-smoke">
        No dated members in {scopeLabel || 'this view'} yet, so there is no growth to draw.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Creators now" value={total} hint={scopeLabel} />
        <Stat
          label="Joined this month"
          value={joinedThisMonth}
          hint={trend === null ? 'first month on record'
            : trend === 0 ? 'same as last month'
              : `${trend > 0 ? '+' : ''}${trend} vs last month`}
          tone={trend > 0 ? 'text-green-600' : trend < 0 ? 'text-amber-600' : ''}
        />
        <Stat
          label="Have posted"
          value={`${activated.pct}%`}
          hint={`${activated.n} of ${activated.of} ever posted a video`}
          tone={activated.pct < 40 ? 'text-amber-600' : ''}
        />
        <Stat
          label="Best month"
          value={Math.max(...months.map((m) => m.joined))}
          hint={`joined in ${monthLabel(months.reduce((a, b) => (b.joined > a.joined ? b : a)).month)}`}
        />
      </div>

      {/* THE GROWTH TAB ON THE SHARED CHART CARD (15 Oct 2026): the title opens the full history, CSV on each, the
          platform's bars and lines, and the bar under the pointer magnifies. */}
      <ChartPanel
        title="How the community grew"
        subtitle="Bars: each month's intake. Line: creators in total. A community can be growing and still have stopped recruiting."
        data={chart} height={300} minPoint={44} delay={40}
        csv={{ name: 'creator-growth.csv', rows: months.map((m) => ({ month: m.month, joined: m.joined, left: m.left, net: m.net, total: m.total })) }}
        actions={onDrill && <button type="button" onClick={() => onDrill('creators')} className="rounded-lg px-2 py-1 text-[11px] font-semibold text-smoke transition-colors hover:bg-cloud hover:text-brand">Creators</button>}
        render={(rows) => (
          <ComposedChart data={rows} margin={{ top: 16, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" {...xAxisProps} />
            <YAxis yAxisId="l" {...yAxisProps} allowDecimals={false} />
            <YAxis yAxisId="r" orientation="right" {...yAxisProps} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} cursor={false} />
            <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
            <Bar yAxisId="l" dataKey="joined" name="Joined" fill={FILL.light} {...barProps} />
            <Line yAxisId="r" dataKey="total" name="Creators in total" stroke={CHART.brand} {...lineProps} />
          </ComposedChart>
        )}
      />

      {output.length > 0 && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {/* VIEWS DELIVERED, AS BARS (15 Oct 2026: "it's just a big line"). Each month's views on the videos posted in it,
              with the average per video as the line, so a month of many weak videos and one of a few strong ones differ. */}
          <ChartPanel
            title="Views delivered each month"
            subtitle="Bars: views on that month's videos. Line: average views per video."
            data={output.map((m) => ({ ...m, perVideo: m.videos ? Math.round(m.views / m.videos) : 0 }))} height={280} minPoint={44} delay={80}
            csv={{ name: 'views-by-month.csv', rows: output.map((m) => ({ month: m.month, videos: m.videos, views: m.views, creators_posting: m.creators })) }}
            actions={onDrill && <button type="button" onClick={() => onDrill('creators')} className="rounded-lg px-2 py-1 text-[11px] font-semibold text-smoke transition-colors hover:bg-cloud hover:text-brand">Creators</button>}
            render={(rows) => (
              <ComposedChart data={rows} margin={{ top: 16, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...xAxisProps} />
                <YAxis yAxisId="l" {...yAxisProps} tickFormatter={formatViews} width={52} />
                <YAxis yAxisId="r" orientation="right" {...yAxisProps} tickFormatter={formatViews} />
                <Tooltip contentStyle={tooltipStyle} cursor={false} formatter={(v) => formatViews(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                <Bar yAxisId="l" dataKey="views" name="Views" fill={FILL.brand} {...barProps} />
                <Line yAxisId="r" dataKey="perVideo" name="Per video" stroke={CHART.ink} {...lineProps} dot={{ r: 3, fill: CHART.ink, strokeWidth: 0 }} />
              </ComposedChart>
            )}
          />
          <ChartPanel
            title="Who was actually posting"
            subtitle="Bars: videos posted. Line: distinct creators who posted at least one."
            data={output} height={280} minPoint={44} delay={120}
            csv={{ name: 'active-creators-by-month.csv', rows: output.map((m) => ({ month: m.month, creators_posting: m.creators, videos: m.videos })) }}
            actions={onDrill && <button type="button" onClick={() => onDrill('creators')} className="rounded-lg px-2 py-1 text-[11px] font-semibold text-smoke transition-colors hover:bg-cloud hover:text-brand">Creators</button>}
            render={(rows) => (
              <ComposedChart data={rows} margin={{ top: 16, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...xAxisProps} />
                <YAxis {...yAxisProps} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={false} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                <Bar dataKey="videos" name="Videos" fill={FILL.light} {...barProps} />
                <Line dataKey="creators" name="Creators posting" stroke={CHART.brand} {...lineProps} />
              </ComposedChart>
            )}
          />
        </div>
      )}
    </div>
  )
}
