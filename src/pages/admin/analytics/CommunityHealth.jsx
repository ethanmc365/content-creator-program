import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Area, AreaChart, Bar, CartesianGrid, ComposedChart, Legend, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { format } from 'date-fns'
import { supabase } from '../../../lib/supabase'
import { Avatar, Skeleton, StatCard } from '../../../components/ui'
import Icon from '../../../components/Icon'
import { downloadCsv, formatViews, timeAgo, cx } from '../../../lib/utils'

// Community health: is the place actually being used, and by whom.
//
// The programme tab answers "what did the money buy". This one answers the
// question underneath it: how many of the people we recruited are still here,
// how many ever post, and can we even reach them when something goes live.

const BRAND = '#d94407'
const BRAND_LIGHT = '#f5853f'
const BRAND_PALE = '#f9b98a'

const tooltipStyle = {
  borderRadius: 12, border: '1px solid #F1F1F2', fontFamily: 'Poppins',
  fontSize: 12, boxShadow: '0 4px 16px rgba(26,26,26,0.08)',
}

const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : 0)

export default function CommunityHealth() {
  const navigate = useNavigate()
  const [weekly, setWeekly] = useState(null)
  const [push, setPush] = useState(null)
  const [scorecard, setScorecard] = useState(null)
  const [sort, setSort] = useState('views')

  useEffect(() => {
    Promise.all([
      supabase.rpc('admin_weekly_activity', { p_weeks: 16 }),
      supabase.rpc('admin_push_adoption'),
      supabase.rpc('admin_creator_scorecard'),
    ]).then(([w, p, s]) => {
      setWeekly(w.data ?? [])
      setPush(p.data ?? [])
      setScorecard(s.data ?? [])
    })
  }, [])

  const data = useMemo(() => {
    if (!weekly || !push || !scorecard) return null

    // ---- Reachability. The number that decides whether anything we ship can
    // actually be announced, and the one most likely to be quietly terrible.
    const creators = push.filter((p) => !p.is_admin)
    const withPush = creators.filter((p) => Number(p.devices) > 0)
    const admins = push.filter((p) => p.is_admin)
    const adminsWithPush = admins.filter((p) => Number(p.devices) > 0)
    const chatMuted = creators.filter((p) => p.chat_push_on === false)

    // ---- Participation funnel, on real creators only.
    const posted = scorecard.filter((c) => Number(c.posts) > 0)
    const repeat = scorecard.filter((c) => Number(c.challenges_entered) > 1)
    const multiPost = scorecard.filter((c) => Number(c.posts) > 1)
    const chatted = scorecard.filter((c) => Number(c.chat_messages) > 0)
    const connected = scorecard.filter((c) => Number(c.connections) > 0)
    const lurkers = scorecard.filter(
      (c) => Number(c.posts) === 0 && Number(c.chat_messages) === 0
    )

    // Median rather than mean: a couple of people who joined and posted the same
    // day would drag an average to something no new creator ever experiences.
    const ttf = posted
      .map((c) => Number(c.days_to_first_post))
      .filter((d) => Number.isFinite(d) && d >= 0)
      .sort((a, b) => a - b)
    const medianDaysToPost = ttf.length ? ttf[Math.floor(ttf.length / 2)] : null

    const weeks = weekly.map((w) => ({
      ...w,
      week: format(new Date(w.week_start), 'd MMM'),
      // Share of the community that did anything visible that week. The honest
      // read on engagement, and the one a "we have N members" number hides.
      activePct: pct(w.active_creators, w.members),
    }))
    const recent = weeks.slice(-4)
    const avgActivePct = recent.length
      ? Math.round(recent.reduce((s, w) => s + w.activePct, 0) / recent.length)
      : 0

    const sorted = [...scorecard].sort((a, b) => {
      if (sort === 'views') return Number(b.total_views) - Number(a.total_views)
      if (sort === 'posts') return Number(b.posts) - Number(a.posts)
      if (sort === 'quiet') return Number(a.posts) - Number(b.posts) || Number(a.chat_messages) - Number(b.chat_messages)
      return (a.name || '').localeCompare(b.name || '')
    })

    return {
      weeks,
      avgActivePct,
      reach: {
        creators: creators.length,
        withPush: withPush.length,
        pushPct: pct(withPush.length, creators.length),
        devices: creators.reduce((s, p) => s + Number(p.devices), 0),
        admins: admins.length,
        adminsWithPush: adminsWithPush.length,
        chatMuted: chatMuted.length,
        list: [...creators].sort((a, b) => Number(b.devices) - Number(a.devices) || (a.name || '').localeCompare(b.name || '')),
      },
      funnel: {
        total: scorecard.length,
        posted: posted.length,
        repeat: repeat.length,
        multiPost: multiPost.length,
        chatted: chatted.length,
        connected: connected.length,
        lurkers: lurkers.length,
        medianDaysToPost,
      },
      sorted,
    }
  }, [weekly, push, scorecard, sort])

  if (!data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    )
  }

  const { reach, funnel } = data

  return (
    <div className="space-y-10">
      {/* ---- Reachability ---- */}
      <div>
        <h2 className="mb-1 text-lg font-semibold">Can we reach people?</h2>
        <p className="mb-4 text-xs text-smoke">
          Push has to be switched on per device. Anyone without it only finds out about a new challenge
          by opening the app, which is exactly the behaviour we are trying to create.
        </p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <StatCard
            label="Push enabled"
            value={`${reach.pushPct}%`}
            hint={`${reach.withPush} of ${reach.creators} creators`}
            accent
          />
          <StatCard label="Devices registered" value={reach.devices} hint="some people have two" />
          <StatCard label="Unreachable" value={reach.creators - reach.withPush} hint="no push on any device" />
          <StatCard label="Chat push muted" value={reach.chatMuted} hint="switched it off in Settings" />
        </div>
        {reach.pushPct < 50 && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-700">
            <Icon name="bell" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Only {reach.pushPct}% of creators can be reached when a challenge goes live. Until that number
              moves, announcements reach a fraction of the community, and any drop in entries is as likely to
              be a delivery problem as a motivation one. Prompting for push during onboarding is the single
              highest-leverage fix on this page.
            </span>
          </p>
        )}

        <details className="mt-4 rounded-card border border-gray-100 shadow-card">
          <summary className="cursor-pointer px-5 py-3 text-sm font-semibold">
            Who has notifications on
            <span className="ml-2 text-xs font-normal text-smoke">({reach.withPush} of {reach.creators})</span>
          </summary>
          <div className="max-h-96 overflow-y-auto overscroll-contain border-t border-gray-100">
            {reach.list.map((p) => (
              <div key={p.creator_id} className="flex items-center gap-3 border-b border-gray-50 px-5 py-2.5 text-sm last:border-0">
                <span className={cx('h-2 w-2 shrink-0 rounded-full', Number(p.devices) > 0 ? 'bg-green-500' : 'bg-gray-300')} />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="shrink-0 text-xs text-smoke">
                  {Number(p.devices) > 0
                    ? `${p.devices} device${Number(p.devices) === 1 ? '' : 's'} · on since ${format(new Date(p.first_enabled), 'd MMM')}`
                    : 'not enabled'}
                </span>
              </div>
            ))}
          </div>
        </details>
      </div>

      {/* ---- Participation funnel ---- */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="card">
          <h2 className="mb-1 font-semibold">Who actually takes part</h2>
          <p className="mb-5 text-xs text-smoke">Of {funnel.total} approved creators, all time</p>
          <div className="space-y-3">
            {[
              { label: 'Posted at least one video', n: funnel.posted },
              { label: 'Posted more than one video', n: funnel.multiPost },
              { label: 'Entered more than one challenge', n: funnel.repeat },
              { label: 'Sent a chat message', n: funnel.chatted },
              { label: 'Made a connection', n: funnel.connected },
            ].map((s) => (
              <div key={s.label}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{s.label}</span>
                  <span className="shrink-0 tabular-nums">
                    <span className="font-semibold">{s.n}</span>
                    <span className="ml-2 text-xs text-smoke">{pct(s.n, funnel.total)}%</span>
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-cloud">
                  <div className="h-full rounded-full bg-gradient-to-r from-brand to-brand-light"
                    style={{ width: `${Math.max(2, pct(s.n, funnel.total))}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-gray-50 pt-4">
            <div>
              <p className="text-xs text-smoke">Never posted or chatted</p>
              <p className="text-lg font-bold text-brand">{funnel.lurkers}</p>
              <p className="text-[11px] text-smoke">{pct(funnel.lurkers, funnel.total)}% of the community</p>
            </div>
            <div>
              <p className="text-xs text-smoke">Median time to first post</p>
              <p className="text-lg font-bold text-brand">
                {funnel.medianDaysToPost != null ? `${funnel.medianDaysToPost} days` : '-'}
              </p>
              <p className="text-[11px] text-smoke">from being approved</p>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="mb-6 flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Weekly active share</h2>
              <p className="mt-1 text-xs text-smoke">
                Creators who posted, chatted or DMed that week, as a share of the community
              </p>
            </div>
            <button onClick={() => downloadCsv('weekly-activity.csv', data.weeks)} className="btn-ghost !px-3 !py-1.5 text-xs">CSV ↓</button>
          </div>
          <div className="h-64">
            <ResponsiveContainer>
              <ComposedChart data={data.weeks} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F1F2" />
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#6B7280' }} interval="preserveStartEnd" />
                <YAxis yAxisId="l" tick={{ fontSize: 11, fill: '#6B7280' }} allowDecimals={false} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: '#6B7280' }} unit="%" />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(217,68,7,0.06)' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="l" dataKey="members" name="Members" fill={BRAND_PALE} radius={[8, 8, 0, 0]} maxBarSize={26} />
                <Bar yAxisId="l" dataKey="active_creators" name="Active" fill={BRAND} radius={[8, 8, 0, 0]} maxBarSize={26} />
                <Line yAxisId="r" type="monotone" dataKey="activePct" name="Active %" stroke={BRAND_LIGHT} strokeWidth={2.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 border-t border-gray-50 pt-3 text-xs text-smoke">
            Last 4 weeks averaged <span className="font-semibold text-brand">{data.avgActivePct}%</span> weekly active.
          </p>
        </section>
      </div>

      {/* ---- What people do ---- */}
      <section className="card">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">What people do each week</h2>
            <p className="mt-1 text-xs text-smoke">Posts, chat messages, DMs and new connections</p>
          </div>
        </div>
        <div className="h-64">
          <ResponsiveContainer>
            <AreaChart data={data.weeks} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F1F2" />
              <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#6B7280' }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="chat_messages" name="Chat" stackId="1" stroke={BRAND} fill={BRAND} fillOpacity={0.7} />
              <Area type="monotone" dataKey="dms" name="DMs" stackId="1" stroke={BRAND_LIGHT} fill={BRAND_LIGHT} fillOpacity={0.7} />
              <Area type="monotone" dataKey="posts" name="Posts" stackId="1" stroke={BRAND_PALE} fill={BRAND_PALE} fillOpacity={0.9} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ---- Creator scorecard ---- */}
      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Creator scorecard</h2>
            <p className="mt-1 text-xs text-smoke">
              Every approved creator and what they have contributed. Sort by "Quietest" to find who to re-engage.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {[
              { k: 'views', l: 'Top views' },
              { k: 'posts', l: 'Most posts' },
              { k: 'quiet', l: 'Quietest' },
              { k: 'name', l: 'A-Z' },
            ].map((o) => (
              <button
                key={o.k}
                onClick={() => setSort(o.k)}
                className={cx('rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                  sort === o.k ? 'bg-brand text-white' : 'border border-gray-200 text-smoke hover:border-brand hover:text-brand')}
              >
                {o.l}
              </button>
            ))}
            <button
              onClick={() => downloadCsv('creator-scorecard.csv', data.sorted.map((c) => ({
                name: c.name, country: c.country ?? '',
                joined: c.joined_at?.slice(0, 10) ?? '',
                challenges_entered: c.challenges_entered, posts: c.posts,
                total_views: c.total_views,
                days_to_first_post: c.days_to_first_post ?? '',
                chat_messages: c.chat_messages, connections: c.connections,
                push_enabled: c.has_push ? 'yes' : 'no',
                last_seen: c.last_seen_at?.slice(0, 10) ?? '',
              })))}
              className="btn-secondary !py-1.5 text-xs"
            >
              CSV ↓
            </button>
          </div>
        </div>
        <div className="overflow-x-auto rounded-card border border-gray-100 shadow-card">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-gray-100 bg-cloud/60">
              <tr>
                <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-smoke">Creator</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-smoke">Challenges</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-smoke">Posts</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-smoke">Views</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-smoke">Chat</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-smoke">Connections</th>
                <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-smoke">Push</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-smoke">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {data.sorted.map((c) => (
                <tr
                  key={c.creator_id}
                  onClick={() => navigate(`/profile/${c.creator_id}`)}
                  className="cursor-pointer border-b border-gray-50 transition-colors last:border-0 hover:bg-cloud/40"
                >
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2.5">
                      <Avatar name={c.name} size="xs" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{c.name}</span>
                        {c.country && <span className="block text-[11px] text-smoke">{c.country}</span>}
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{Number(c.challenges_entered) || '-'}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{Number(c.posts) || '-'}</td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-brand">
                    {Number(c.total_views) > 0 ? formatViews(Number(c.total_views)) : '-'}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-smoke">{Number(c.chat_messages) || '-'}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-smoke">{Number(c.connections) || '-'}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={cx('inline-block h-2 w-2 rounded-full', c.has_push ? 'bg-green-500' : 'bg-gray-300')}
                      title={c.has_push ? 'Push enabled' : 'No push'} />
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs text-smoke">
                    {c.last_seen_at ? timeAgo(c.last_seen_at) : 'never'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
