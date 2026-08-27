import { useMemo } from 'react'
import {
  Area, AreaChart, Bar, CartesianGrid, ComposedChart, Legend, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { growthByMonth, monthLabel } from '../../../lib/analyticsScope'
import { downloadCsv, formatViews } from '../../../lib/utils'

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

const BRAND = '#d94407'
const BRAND_LIGHT = '#f5853f'

const tooltipStyle = {
  borderRadius: 12, border: '1px solid #F1F1F2', fontFamily: 'Poppins',
  fontSize: 12, boxShadow: '0 4px 16px rgba(26,26,26,0.08)',
}

function Card({ title, subtitle, onExport, onDrill, children, tall = false }) {
  return (
    <section className="card">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {subtitle && <p className="mt-1 text-xs text-smoke">{subtitle}</p>}
        </div>
        <span className="flex items-center gap-1.5">
          {/* A CHART ANSWERS "WHEN". The next question is always "who", and
              until now there was nowhere to go and ask it. */}
          {onDrill && (
            <button onClick={onDrill} className="btn-ghost !py-1.5 !px-3 text-xs">
              See the creators →
            </button>
          )}
          {onExport && <button onClick={onExport} className="btn-ghost !py-1.5 !px-3 text-xs">CSV ↓</button>}
        </span>
      </div>
      <div className={tall ? 'h-80' : 'h-64'}>{children}</div>
    </section>
  )
}

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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

      <Card
        onDrill={onDrill && (() => onDrill('creators'))}
        title="How the community grew"
        subtitle="The running total is the size of the programme. The bars are each month's intake — a community can be growing and still have stopped recruiting."
        tall
        onExport={() => downloadCsv('creator-growth.csv',
          months.map((m) => ({ month: m.month, joined: m.joined, left: m.left, net: m.net, total: m.total })))}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chart} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F1F2" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#8A8A8F" />
            <YAxis tick={{ fontSize: 11 }} stroke="#8A8A8F" allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="joined" name="Joined" fill={BRAND_LIGHT} radius={[4, 4, 0, 0]} maxBarSize={38} />
            <Line
              type="monotone" dataKey="total" name="Total creators"
              stroke={BRAND} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      {output.length > 0 && (
        <>
          <Card
            onDrill={onDrill && (() => onDrill('creators'))}
            title="Views delivered each month"
            subtitle="Read this against the chart above. More creators and flat views is a different problem from fewer creators and flat views."
            onExport={() => downloadCsv('views-by-month.csv',
              output.map((m) => ({ month: m.month, videos: m.videos, views: m.views, creators_posting: m.creators })))}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={output} margin={{ top: 4, right: 8, left: 6, bottom: 0 }}>
                <defs>
                  <linearGradient id="growthViews" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={BRAND} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={BRAND} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F1F2" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#8A8A8F" />
                <YAxis tick={{ fontSize: 11 }} stroke="#8A8A8F" tickFormatter={formatViews} width={52} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatViews(Number(v))} />
                <Area type="monotone" dataKey="views" name="Views" stroke={BRAND} strokeWidth={2.5} fill="url(#growthViews)" />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          <Card
            onDrill={onDrill && (() => onDrill('creators'))}
            title="Who was actually posting"
            subtitle="Distinct creators who put up at least one video that month, against the videos themselves."
            onExport={() => downloadCsv('active-creators-by-month.csv',
              output.map((m) => ({ month: m.month, creators_posting: m.creators, videos: m.videos })))}
          >
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={output} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F1F2" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#8A8A8F" />
                <YAxis tick={{ fontSize: 11 }} stroke="#8A8A8F" allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="videos" name="Videos" fill="#f9b98a" radius={[4, 4, 0, 0]} maxBarSize={38} />
                <Line type="monotone" dataKey="creators" name="Creators posting" stroke={BRAND} strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>
        </>
      )}
    </div>
  )
}
