import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { supabase } from '../../lib/supabase'
import { Avatar, PageHeader, Skeleton, StatCard } from '../../components/ui'
import PlatformBadges from '../../components/PlatformBadges'
import { formatViews, formatMoney, formatDate, formatDateTimeTz, downloadCsv } from '../../lib/utils'
import { compareBoards, prizeForGroup } from '../../lib/challengeGroups'
import Icon from '../../components/Icon'
import HistoryForm from '../../components/admin/HistoryForm'
import { historyMetrics } from '../../lib/challengeHistory'
import { useAuth } from '../../context/AuthContext'
import { loadMarkets } from '../../lib/markets'

// Deep-dive analytics for ONE challenge (admin only).
// Reached by tapping a bar/row on the main Analytics page.
const BRAND = '#d94407'
const BRAND_LIGHT = '#f5853f'
const tooltipStyle = {
  borderRadius: 12, border: '1px solid #F1F1F2', fontFamily: 'Poppins',
  fontSize: 12, boxShadow: '0 4px 16px rgba(26,26,26,0.08)',
}
const PLATFORM_COLORS = { Instagram: '#d94407', TikTok: '#1A1A1A', YouTube: '#f5853f', Other: '#9CA3AF' }

// A CHALLENGE ANALYTICS PAGE THAT IS OPENED FOR THINGS THAT ARE NOT CHALLENGES
// (8 Sep 2026).
//
// Ethan: "if I click Challenge performance, scroll down and click on a
// challenge like the Spain Monthly one, clicking it - the thing crashes, I get
// the Mayday screen, which is very frustrating. And the ability to fill in the
// other ones, because currently clicking on them just doesn't do anything."
//
// Reproduced exactly: `Cannot read properties of null (reading 'title')`.
//
// The Challenge performance tab lists FORTY-NINE rows and forty-eight of them
// are `challenge_history` - the programme's pre-platform record, imported by
// migration 198 - while ONE is a live `challenges` row. Every card links to
// `/admin/analytics/<id>` regardless, this page asked `challenges` for that id
// with `.single()`, got `{ data: null }`, and read `.title` off it. So the tab
// that exists to let somebody study the programme's history crashed on
// forty-eight of its own forty-nine entries, and on the only one it did open
// there was nothing to click through to.
//
// The page now asks BOTH tables and renders whichever answered. A logged
// challenge has no submissions, no leaderboard and no prize engine - it is four
// numbers and what they mean - so it gets its own, much smaller view, with the
// editor attached: which is the second half of what Ethan asked for, "clicking
// on the old challenge, I should be able to fix it out of there".
export default function AdminChallengeAnalytics() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [raw, setRaw] = useState(null)
  const [markets, setMarkets] = useState([])
  const [editing, setEditing] = useState(false)
  // Bumped after an edit so the loader re-runs. The derived metrics below are
  // computed FROM the row, so patching state in place would leave the old CPM
  // beside the new view count.
  const [refresh, setRefresh] = useState(0)

  useEffect(() => { loadMarkets().then((m) => setMarkets(m || [])) }, [])

  useEffect(() => {
    async function load() {
      const [{ data: challenge }, { data: logged }, { data: siblings }, { data: subs }, { data: results }, { data: rewards }, { count: totalCreators },
        { data: groups }, { data: groupMembers }] =
        await Promise.all([
          // `maybeSingle`, NOT `single`. `single()` treats "no row" as an error
          // and hands back a null `data` either way, which is precisely how a
          // missing challenge became an unhandled null two lines later.
          supabase.from('challenges').select('*').eq('id', id).maybeSingle(),
          supabase.from('challenge_history').select('*').eq('id', id).maybeSingle(),
          // The rest of the log, so a logged challenge can be shown AGAINST the
          // programme rather than as four numbers on their own. See the note on
          // `Compare` below - this is the whole of "I want a much better view,
          // we want graphs".
          supabase.from('challenge_history').select('id, community_id, title, starts_at, prize_total, total_views, creators, posts'),
          supabase.from('submissions').select('*, profiles:creator_id(id, name, photo_url, instagram_url, tiktok_url, youtube_url, facebook_url)').eq('challenge_id', id).order('logged_views', { ascending: false, nullsFirst: false }),
          supabase.from('results').select('*, profiles:creator_id(id, name, photo_url)').eq('challenge_id', id).order('rank'),
          supabase.from('rewards').select('*').eq('challenge_id', id),
          supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'active').eq('is_admin', false).is('deletion_requested_at', null),
          supabase.from('challenge_groups').select('*').eq('challenge_id', id).order('position'),
          supabase.from('challenge_group_members').select('group_id, creator_id').eq('challenge_id', id),
        ])
      setRaw({
        challenge, logged, siblings: siblings ?? [], subs: subs ?? [], results: results ?? [], rewards: rewards ?? [],
        totalCreators: totalCreators ?? 0,
        groups: groups ?? [], groupMembers: groupMembers ?? [],
      })
    }
    load()
  }, [id, refresh])

  const d = useMemo(() => {
    if (!raw) return null
    const { subs, rewards, totalCreators } = raw
    const viewed = subs.filter((s) => s.logged_views != null).map((s) => s.logged_views).sort((a, b) => a - b)
    const totalViews = viewed.reduce((a, b) => a + b, 0)
    const uniqueCreators = new Set(subs.map((s) => s.creator_id)).size

    // Per-platform breakdown.
    const platforms = ['Instagram', 'TikTok', 'YouTube', 'Other'].map((p) => {
      const ps = subs.filter((s) => s.platform === p)
      return {
        name: p,
        entries: ps.length,
        views: ps.reduce((sum, s) => sum + (s.logged_views || 0), 0),
      }
    }).filter((p) => p.entries > 0)

    const median = viewed.length ? viewed[Math.floor(viewed.length / 2)] : 0

    return {
      submissions: subs.length,
      uniqueCreators,
      participation: totalCreators ? Math.round((uniqueCreators / totalCreators) * 100) : 0,
      totalViews,
      avgViews: viewed.length ? Math.round(totalViews / viewed.length) : 0,
      medianViews: median,
      topViews: viewed.length ? viewed[viewed.length - 1] : 0,
      platforms,
      prizesPaid: rewards.filter((r) => r.status === 'distributed').reduce((s, r) => s + Number(r.amount), 0),
      prizesPending: rewards.filter((r) => r.status === 'pending').reduce((s, r) => s + Number(r.amount), 0),
    }
  }, [raw])

  if (!raw || !d) {
    return <div className="page space-y-6"><Skeleton className="h-10 w-72" /><div className="grid grid-cols-1 gap-4 sm:grid-cols-4"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div><Skeleton className="h-72 w-full" /></div>
  }

  const { challenge, logged, siblings, subs, results, groups, groupMembers } = raw

  // A LOGGED CHALLENGE, OR NOTHING AT ALL. Neither is a crash.
  if (!challenge) {
    return (
      <LoggedChallenge
        row={logged}
        siblings={siblings}
        markets={markets}
        userId={profile?.id}
        editing={editing}
        onEdit={() => setEditing(true)}
        onClose={() => setEditing(false)}
        onSaved={() => { setEditing(false); setRefresh((n) => n + 1) }}
        onDeleted={() => navigate('/admin/analytics?tab=programme')}
      />
    )
  }

  // THE COMBINED FIGURE IS THE ONE ON THE TILES; THE GROUPS ARE UNDERNEATH.
  //
  // Ethan: "the analytics page should combine the data as just the one
  // challenge, but clicking in on the challenge data should reveal more data
  // and analytics from the different groups and comparing each."
  //
  // This page IS the click-in - the main analytics page lists challenges and
  // this is what opens - so the split belongs here rather than in a third
  // screen. The tiles above stay exactly as they are, because a challenge run
  // in two halves produced one challenge's worth of reach and that is the
  // number the programme is measured on. `compareBoards` derives both from the
  // same rows, so they cannot disagree. */
  const { rows: boardRows } = compareBoards(groups, groupMembers, subs)
  const memberCount = new Map()
  for (const m of groupMembers) memberCount.set(m.group_id, (memberCount.get(m.group_id) || 0) + 1)

  // The saved results, split the same way. `results.group_id` is written by
  // `rebuild_challenge_results`, so this reads the board a row was actually
  // ranked on rather than re-deriving it from the membership - a creator moved
  // between groups after the board was built belongs where they were ranked.
  const resultBoards = groups.length > 0
    ? [...groups, { id: null, name: 'Not in a group' }]
      .map((g) => ({ group: g, rows: results.filter((r) => (r.group_id ?? null) === g.id) }))
      .filter((b) => b.rows.length > 0)
    : [{ group: null, rows: results }]

  function exportSubs() {
    downloadCsv(`${challenge.title}-submissions.csv`, subs.map((s) => ({
      creator: s.profiles?.name ?? '', platform: s.platform, logged_views: s.logged_views ?? '',
      video_url: s.video_url, submitted: formatDateTimeTz(s.submitted_at),
    })))
  }

  return (
    <div className="page">
      <Link to="/admin/analytics" className="mb-6 inline-block text-sm font-medium text-smoke hover:text-brand">← Back to analytics</Link>

      <PageHeader
        back={{ to: '/admin/analytics', label: 'Analytics' }}
        title={challenge.title}
        subtitle={`${formatDate(challenge.start_date)} → ${formatDate(challenge.end_date)} · ${challenge.status}`}
        action={
          <div className="flex gap-2">
            <Link to={`/challenges/${id}`} className="btn-secondary !py-2 text-xs">Challenge page</Link>
            <button onClick={exportSubs} className="btn-secondary !py-2 text-xs">Export CSV ↓</button>
          </div>
        }
      />

      {/* ---------- Headline stats ---------- */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Entries" value={d.submissions} hint={`${d.uniqueCreators} creators`} />
        <StatCard label="Participation" value={`${d.participation}%`} hint="of all creators" />
        <StatCard label="Total views" value={formatViews(d.totalViews)} accent />
        <StatCard label="Prize money paid" value={formatMoney(d.prizesPaid)} hint={d.prizesPending ? `${formatMoney(d.prizesPending)} pending` : 'all settled'} />
      </div>
      <div className="mb-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Avg views / entry" value={formatViews(d.avgViews)} />
        <StatCard label="Median views" value={formatViews(d.medianViews)} />
        <StatCard label="Top entry" value={formatViews(d.topViews)} />
        <StatCard label="Reviewed" value={`${subs.filter((s) => s.logged_views != null).length}/${d.submissions}`} hint="views logged" />
      </div>

      {/* ---------- The groups, compared ---------- */}
      {boardRows.length > 0 && (
        <section className="card mb-10">
          <h2 className="mb-1 font-semibold">The {boardRows.length} leaderboards, compared</h2>
          <p className="mb-5 text-sm text-smoke">
            Every figure above is this challenge as a whole. These are the same numbers
            split by group, and they add back up to it.
          </p>
          <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[44rem] text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-[11px] font-semibold uppercase tracking-wide text-smoke">
                  <th className="py-2 pr-4">Group</th>
                  <th className="py-2 pr-4 text-right">In the group</th>
                  <th className="py-2 pr-4 text-right">Entered</th>
                  <th className="py-2 pr-4 text-right">Entries</th>
                  <th className="py-2 pr-4 text-right">Views</th>
                  <th className="py-2 pr-4 text-right">Per entry</th>
                  <th className="py-2 pr-4 text-right">Best video</th>
                  <th className="py-2 text-right">Share</th>
                </tr>
              </thead>
              <tbody>
                {boardRows.map((r) => {
                  const g = groups.find((x) => x.id === r.id)
                  const inGroup = memberCount.get(r.id) || 0
                  const prize = g ? prizeForGroup(g, challenge) : null
                  return (
                    <tr key={r.id ?? 'ungrouped'} className="border-b border-gray-50 last:border-0">
                      <td className="py-3 pr-4">
                        <span className="font-semibold">{r.name}</span>
                        {prize?.prize_amount != null && (
                          <span className="ml-2 text-xs text-smoke">
                            {formatMoney(prize.prize_amount, prize.prize_currency)}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums text-smoke">{inGroup || '-'}</td>
                      {/* ENTERED, NOT PARTICIPATION - the percentage is the one
                          number worth comparing between two groups of different
                          sizes, and it is meaningless without the denominator
                          beside it, which is why both columns are here. */}
                      <td className="py-3 pr-4 text-right tabular-nums">
                        {r.creators}
                        {inGroup > 0 && (
                          <span className="ml-1 text-xs text-smoke">({Math.round((r.creators / inGroup) * 100)}%)</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums">{r.entries}</td>
                      <td className="py-3 pr-4 text-right font-semibold tabular-nums text-brand">{formatViews(r.views)}</td>
                      <td className="py-3 pr-4 text-right tabular-nums">{formatViews(r.perEntry)}</td>
                      <td className="py-3 pr-4 text-right tabular-nums">{formatViews(r.best)}</td>
                      <td className="py-3 text-right">
                        <span className="inline-flex items-center gap-2">
                          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-cloud">
                            <span className="block h-full rounded-full bg-brand" style={{ width: `${r.share}%` }} />
                          </span>
                          <span className="w-9 text-right tabular-nums text-smoke">{r.share}%</span>
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ---------- Platform breakdown ---------- */}
        <section className="card">
          <h2 className="mb-6 font-semibold">Entries by platform</h2>
          <div className="h-56">
            {d.platforms.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-smoke">No entries yet.</p>
            ) : (
              <ResponsiveContainer>
                <BarChart data={d.platforms} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F1F2" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6B7280' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(217,68,7,0.06)' }} />
                  <Bar dataKey="entries" radius={[8, 8, 0, 0]} maxBarSize={56}>
                    {d.platforms.map((p) => <Cell key={p.name} fill={PLATFORM_COLORS[p.name] || BRAND} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        {/* ---------- Views by platform ---------- */}
        <section className="card">
          <h2 className="mb-6 font-semibold">Views by platform</h2>
          <div className="h-56">
            {d.platforms.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-smoke">No views logged yet.</p>
            ) : (
              <ResponsiveContainer>
                <BarChart data={d.platforms} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F1F2" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6B7280' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} tickFormatter={formatViews} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(217,68,7,0.06)' }} formatter={(v) => formatViews(v)} />
                  <Bar dataKey="views" fill={BRAND_LIGHT} radius={[8, 8, 0, 0]} maxBarSize={56} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      </div>

      {/* ---------- Leaderboard ---------- */}
      {results.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-lg font-semibold">
            {resultBoards.length > 1 ? 'Final leaderboards' : 'Final leaderboard'}
          </h2>
          {/* ONE LIST PER BOARD.
              Ranks are stored per group (migration 154), so a flat list of a
              two-group challenge's results reads 1, 1, 2 - three rows with two
              gold medals and no explanation. They are separate contests and
              they have to be drawn as separate lists. A challenge with no
              groups produces exactly one list, which is what was here. */}
          <div className="space-y-6">
            {resultBoards.map(({ group, rows }) => (
              <div key={group?.id ?? 'all'}>
                {group && (
                  <p className="mb-2 text-sm font-semibold text-brand">{group.name}</p>
                )}
                <div className="overflow-hidden rounded-card border border-gray-100 shadow-card">
                  {rows.map((r) => (
                    <Link key={r.id} to={`/profile/${r.profiles?.id}`} className="flex items-center gap-4 border-b border-gray-50 px-5 py-3 transition-colors last:border-0 hover:bg-cloud/60 sm:px-7">
                      <span className="w-8 text-center text-lg font-bold">{{ 1: '🥇', 2: '🥈', 3: '🥉' }[r.rank] || r.rank}</span>
                      <Avatar src={r.profiles?.photo_url} name={r.profiles?.name} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{r.profiles?.name}</span>
                      <span className="text-sm font-bold tabular-nums">{formatViews(r.final_views)}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---------- All submissions ---------- */}
      <section className="mt-10">
        <h2 className="mb-4 text-lg font-semibold">All entries ({subs.length})</h2>
        {subs.length === 0 ? (
          <p className="rounded-card border border-dashed border-gray-200 px-5 py-10 text-center text-sm text-smoke">No entries for this challenge.</p>
        ) : (
          <div className="overflow-hidden rounded-card border border-gray-100 shadow-card">
            {subs.map((s) => (
              <div key={s.id} className="flex items-center gap-4 border-b border-gray-50 px-5 py-3 last:border-0 sm:px-7">
                <Avatar src={s.profiles?.photo_url} name={s.profiles?.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{s.profiles?.name}</p>
                  <p className="text-xs text-smoke">{formatDateTimeTz(s.submitted_at)}</p>
                </div>
                <PlatformBadges platforms={[s.platform]} className="hidden sm:flex" />
                <span className="w-20 text-right text-sm tabular-nums">{s.logged_views != null ? formatViews(s.logged_views) : '-'}</span>
                <a href={s.video_url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-brand hover:underline">Watch ↗</a>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// ONE ROW OF THE PROGRAMME'S RECORD, AND THE FORM THAT CORRECTS IT.
//
// This is what opens for forty-eight of the forty-nine entries on the Challenge
// performance tab: a challenge that ran before this platform existed, or beside
// it on WhatsApp. There are no submissions to list and no leaderboard to draw -
// see migration 197 for why that is deliberate rather than missing - so the
// page is the four numbers it was recorded with, the six ratios they imply, and
// a button to fix any of them.
//
// EVERY RATIO IS COMPUTED, NEVER STORED. `historyMetrics` is the same function
// the log page and the form's live preview use, so a corrected view count moves
// the CPM here, on the log, and in the programme blend, with no second copy to
// forget.
function LoggedChallenge({ row, siblings, markets, userId, editing, onEdit, onClose, onSaved, onDeleted }) {
  // Not a challenge and not in the log either: a stale link, or a row somebody
  // deleted while this tab was open. It says so instead of crashing, which is
  // the entire reason this component exists.
  if (!row) {
    return (
      <div className="page">
        <PageHeader back={{ to: '/admin/analytics', label: 'Analytics' }} title="Not found" />
        <div className="card !p-8 text-center">
          <Icon name="magnifier" className="mx-auto h-7 w-7 text-gray-300" />
          <p className="mt-3 font-semibold">No challenge with that id</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-smoke">
            It is neither a challenge on the platform nor a row in the challenge log. It may
            have been deleted since this link was made.
          </p>
          <Link to="/admin/analytics?tab=programme" className="btn-secondary mt-5 !py-2 text-xs">
            Back to challenge performance
          </Link>
        </div>
      </div>
    )
  }

  const m = historyMetrics(row)
  const market = markets.find((x) => x.id === row.community_id)
  const marketName = market?.name || row.country_code || 'its market'
  const dash = (v, fn) => (v == null ? '—' : fn(v))

  // THE AVERAGES ARE BLENDED, NOT AVERAGED. Summing the parts and dividing once
  // is the same rule the programme blend follows: a mean of per-challenge CPMs
  // gives a €40 pilot the same weight as a €900 flagship, which is how a page
  // ends up disagreeing with the tab that linked to it.
  const others = (siblings || []).filter((r) => r.id !== row.id && r.total_views != null)
  const blend = (list) => {
    if (!list.length) return null
    const sum = (k) => list.reduce((n, r) => n + (Number(r[k]) || 0), 0)
    const views = sum('total_views')
    const posts = sum('posts')
    const creators = sum('creators')
    return {
      cpm: views > 0 ? sum('prize_total') / (views / 1000) : null,
      viewsPerPost: posts > 0 ? views / posts : null,
      postsPerCreator: creators > 0 ? posts / creators : null,
    }
  }
  const sameMarket = row.community_id ? others.filter((r) => r.community_id === row.community_id) : []
  const compareCounts = { market: sameMarket.length, all: others.length }
  const marketBlend = blend(sameMarket)
  const allBlend = blend(others)

  const eur = (v) => (v == null ? '-' : formatMoney(v, 'EUR'))
  const round = (v) => (v == null ? '-' : Math.round(v).toLocaleString())
  const oneDp = (v) => (v == null ? '-' : v.toFixed(1))
  const series = [
    { key: 'cpm', label: 'Cost per 1,000 views', mine: m.cpm, format: eur },
    { key: 'vpp', label: 'Views per post', mine: m.viewsPerPost, format: round },
    { key: 'ppc', label: 'Posts per creator', mine: m.postsPerCreator, format: oneDp },
  ]
  const pick = { cpm: 'cpm', vpp: 'viewsPerPost', ppc: 'postsPerCreator' }
  // A chart with one bar on it is not a comparison, so a challenge with nothing
  // to compare against simply does not draw this section.
  const comparisons = allBlend && m.cpm != null
    ? series.map((sr) => ({
      ...sr,
      bars: [
        { name: 'This one', value: sr.mine ?? 0, self: true },
        ...(marketBlend && sameMarket.length ? [{ name: marketName, value: marketBlend[pick[sr.key]] ?? 0 }] : []),
        { name: 'Programme', value: allBlend[pick[sr.key]] ?? 0 },
      ],
    })).filter((c) => c.bars.some((b) => b.value > 0))
    : []

  return (
    <div className="page">
      <PageHeader
        back={{ to: '/admin/analytics?tab=programme', label: 'Analytics' }}
        title={row.title || `${row.country_code} challenge`}
        subtitle={[
          market?.name || row.country_code,
          row.starts_at && row.ends_at ? `${formatDate(row.starts_at)} → ${formatDate(row.ends_at)}` : null,
          m.days ? `${m.days} days` : null,
          row.cadence,
        ].filter(Boolean).join(' · ')}
        action={
          <button onClick={onEdit} className="btn-primary !py-2 text-xs">
            <Icon name="pencil" className="h-4 w-4" /> Edit the numbers
          </button>
        }
      />

      {/* WHERE THIS ROW CAME FROM, SAID PLAINLY. Somebody landing here from the
          programme table needs to know within a second why there is no
          leaderboard on it - and "run before this platform" is the answer, not
          "the data is missing". */}
      <div className="mb-6 flex items-start gap-3 rounded-card border border-gray-100 bg-cloud/50 px-4 py-3">
        <Icon name="bulb" className="mt-0.5 h-4 w-4 shrink-0 text-smoke" />
        <p className="text-xs leading-relaxed text-smoke">
          This challenge was run off the platform, so it is held as a recorded total rather
          than as entries. There are no submissions, leaderboard or payouts attached to it -
          only the figures below, which every programme average is built from.
          {row.source === 'manual' ? ' Added by hand.' : ' Imported from the challenge tracker.'}
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Prize money" value={dash(row.prize_total, (v) => formatMoney(v, row.prize_currency || 'EUR'))} hint={row.prize_type || undefined} />
        <StatCard label="Total views" value={dash(row.total_views, formatViews)} accent />
        <StatCard label="Creators" value={dash(row.creators, (v) => v.toLocaleString())} />
        <StatCard label="Posts" value={dash(row.posts, (v) => v.toLocaleString())} />
      </div>

      <div className="mb-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="CPM" value={dash(m.cpm, (v) => formatMoney(v, 'EUR'))} hint="per 1,000 views" accent />
        <StatCard label="Cost / post" value={dash(m.costPerPost, (v) => formatMoney(v, 'EUR'))} />
        <StatCard label="Cost / creator" value={dash(m.costPerCreator, (v) => formatMoney(v, 'EUR'))} />
        <StatCard label="Posts / creator" value={dash(m.postsPerCreator, (v) => v.toFixed(1))} />
      </div>
      {/* STATUS IS NOT A TILE ANY MORE. Every row in this table is finished -
          the form does not offer any other answer - so a tile reading "done" on
          every page was a constant printed as a measurement. Winners moved down
          to "How it was run", beside the prize type it belongs with. */}
      <div className="mb-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Views / post" value={dash(m.viewsPerPost, (v) => formatViews(Math.round(v)))} />
        <StatCard label="Views / creator" value={dash(m.viewsPerCreator, (v) => formatViews(Math.round(v)))} />
      </div>

      {/* A DASH IS A FACT, AND IT IS WORTH ONE SENTENCE. Fourteen imported rows
          have no view count because nobody ever logged one. Treating that as
          zero would drag every programme average down with a number that was
          never recorded, so the blend leaves them out - and somebody looking at
          a page of dashes should be told that rather than assume a bug. */}
      {row.total_views == null && (
        <p className="mb-8 flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-xs text-amber-700">
          <Icon name="clock" className="h-4 w-4 shrink-0" />
          The views for this challenge were never measured, so it is left out of every blended
          figure on the programme. Add them here and it joins the averages.
        </p>
      )}

      {/* ---- HOW IT COMPARES ----
          Ethan: "on the actual [page], whenever clicking on a challenge, I want
          a much better view - we want graphs etc."

          A logged challenge has no time series to draw. It is four totals, and
          a bar chart of four totals against nothing is decoration. What it DOES
          have is fifty siblings, and that is the shape the question actually
          takes: was this one good? So every chart here is comparative - this
          challenge against its own market, and against the whole programme, on
          the three ratios the tiles above report. The bar for this challenge is
          solid brand; the comparisons are the pale one, because one of the four
          bars is the subject and three are context. */}
      {comparisons.length > 0 && (
        <section className="card mb-6">
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">How it compares</h2>
            <p className="text-xs text-smoke">
              Against {compareCounts.market > 0 ? `${compareCounts.market} in ${marketName}, and ` : ''}
              {compareCounts.all} across the programme
            </p>
          </div>
          <p className="mb-6 text-xs text-smoke">Only challenges with a logged view count are averaged in.</p>
          <div className="grid gap-6 lg:grid-cols-3">
            {comparisons.map((c) => (
              <div key={c.key}>
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-smoke">{c.label}</p>
                <div className="h-44">
                  <ResponsiveContainer>
                    <BarChart data={c.bars} layout="vertical" margin={{ top: 0, right: 44, left: 0, bottom: 0 }}>
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v) => c.format(v)} cursor={{ fill: 'rgba(217,68,7,0.06)' }} />
                      <Bar dataKey="value" radius={[0, 8, 8, 0]} maxBarSize={26} label={{ position: 'right', fontSize: 11, fill: '#6B7280', formatter: c.format }}>
                        {c.bars.map((b) => (
                          <Cell key={b.name} fill={b.self ? BRAND : BRAND_LIGHT} fillOpacity={b.self ? 1 : 0.45} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {(row.prize_type || row.notes) && (
        <section className="card">
          <h2 className="mb-4 font-semibold">How it was run</h2>
          <dl className="grid gap-4 sm:grid-cols-3">
            <Detail label="Prize type" value={row.prize_type} />
            <Detail label="Winners" value={row.winners == null ? null : String(row.winners)} />
            <Detail label="Length" value={m.days ? `${m.days} days` : null} />
          </dl>
          {row.notes && (
            <p className="mt-5 whitespace-pre-wrap border-t border-gray-100 pt-4 text-sm leading-relaxed text-smoke">
              {row.notes}
            </p>
          )}
        </section>
      )}

      {editing && (
        <HistoryForm
          row={row}
          markets={markets}
          userId={userId}
          onClose={onClose}
          onSaved={onSaved}
          onDelete={onDeleted}
        />
      )}
    </div>
  )
}

function Detail({ label, value }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{value || '—'}</dd>
    </div>
  )
}
