import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import BackLink from '../components/BackLink'
import MilestonePath from '../components/network/MilestonePath'
import Icon from '../components/Icon'
import { Avatar, EmptyState, PageHeader, Skeleton } from '../components/ui'
import { cx, formatViews } from '../lib/utils'
import { pageFade } from '../lib/motion'

// Where a creator has got to, and what is next.
//
// THIS REPLACES THE ACHIEVEMENT BADGES
//
// The old profile badges were effort tiers that nobody could name a reason to
// want: they appeared, they were grey, and reaching one changed nothing. A
// milestone is the same idea with the two missing halves attached - a threshold
// you can see coming, and something real on the other side of it. One page that
// says "four down, the next one is a t-shirt at ten videos" does more for
// retention than nine badges saying "Level 3".

const SUMMARY = [
  { key: 'videos', label: 'Videos published', icon: 'video' },
  { key: 'views', label: 'Views earned', icon: 'eye', fmt: formatViews },
  { key: 'referrals', label: 'Creators brought in', icon: 'share' },
  { key: 'days', label: 'Days in the programme', icon: 'clock', fmt: (v) => Math.floor(v) },
]

export default function Milestones() {
  const { profile } = useAuth()
  const isAdmin = !!profile?.is_admin
  const [rows, setRows] = useState(null)
  const [standings, setStandings] = useState([])
  const [metrics, setMetrics] = useState(null)
  const [showPeople, setShowPeople] = useState(true)
  const [showCrowd, setShowCrowd] = useState(false)

  useEffect(() => {
    let alive = true
    Promise.all([
      supabase.rpc('milestone_progress'),
      supabase.rpc('milestone_standings'),
      supabase.rpc('creator_metrics', { p_profile: profile?.id }),
    ]).then(([{ data: prog }, { data: stand }, { data: mets }]) => {
      if (!alive) return
      setRows(prog || [])
      setStandings(stand || [])
      setMetrics(Array.isArray(mets) ? mets[0] : mets)
    })
    return () => { alive = false }
  }, [profile?.id])

  if (!rows) {
    return (
      <div className="page max-w-4xl space-y-4">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    )
  }

  const reached = rows.filter((r) => r.reached).length
  const next = rows.find((r) => !r.reached) || null

  return (
    <div className="page max-w-6xl">
      <BackLink />
      <motion.div {...pageFade}>
        <PageHeader
          title="Your route"
          subtitle="Every stop on the way, what it takes to get there, and what is waiting when you do."
        />

        {/* Where you are, in one line, before any picture. Somebody who opens
            this on a phone should get the answer before they scroll. */}
        <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-card border border-brand/25 bg-brand-tint/25 px-5 py-4">
          <div>
            <p className="text-2xl font-bold text-brand">{reached}<span className="text-base text-smoke"> / {rows.length}</span></p>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-smoke">Stops reached</p>
          </div>
          {next ? (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">Next up: {next.title}</p>
              <p className="truncate text-xs text-smoke">
                {next.reward ? `${next.reward} · ` : ''}
                {next.metric === 'views'
                  ? `${formatViews(Number(next.value))} of ${formatViews(Number(next.threshold))} views`
                  : `${Math.floor(Number(next.value))} of ${Number(next.threshold)}`}
              </p>
            </div>
          ) : (
            <p className="flex-1 text-sm font-semibold text-brand">
              You have reached every stop. We had better add some more.
            </p>
          )}
        </div>

        {/* The four numbers the whole ladder is computed from. Showing them
            makes the thresholds checkable rather than magic. */}
        {metrics && (
          <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {SUMMARY.map((s) => (
              <div key={s.key} className="rounded-card border border-gray-100 bg-white px-4 py-3">
                <Icon name={s.icon} className="h-4 w-4 text-brand" />
                <p className="mt-1.5 text-lg font-bold tabular-nums">
                  {s.fmt ? s.fmt(Number(metrics[s.key] || 0)) : Math.floor(Number(metrics[s.key] || 0))}
                </p>
                <p className="text-[11px] text-smoke">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {rows.length === 0 ? (
          <EmptyState icon={<Icon name="flag" className="h-7 w-7" />} title="No milestones yet"
            hint="The team is still setting these up." />
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">The route</h2>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setShowPeople((v) => !v)}
                  aria-pressed={showPeople}
                  className={cx(
                    'flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-transform duration-200 hover:scale-105',
                    showPeople ? 'border-brand/30 bg-brand-tint text-brand' : 'border-gray-200 text-smoke',
                  )}
                >
                  <Icon name="users" className="h-3.5 w-3.5" />
                  Faces at each stop
                </button>
                {/* ADMIN-ONLY, DELIBERATELY. Where every individual creator has
                    got to is a picture of the whole community's progress, which
                    is a management view; a creator seeing themselves as a dot
                    behind twelve other dots is a leaderboard nobody entered. */}
                {isAdmin && (
                  <button
                    onClick={() => setShowCrowd((v) => !v)}
                    aria-pressed={showCrowd}
                    className={cx(
                      'flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-transform duration-200 hover:scale-105',
                      showCrowd ? 'border-brand/30 bg-brand-tint text-brand' : 'border-gray-200 text-smoke',
                    )}
                  >
                    <Icon name="pin" className="h-3.5 w-3.5" />
                    Everyone on the road
                  </button>
                )}
              </div>
            </div>

            {/* THE ROUTE IN ITS OWN PANEL, WITH THE READING BESIDE IT.
                The path used to run the full width of the page, which on a
                desktop meant a 1000px-wide picture of a line and a lot of white
                either side of it. It now takes about half, and the column next
                to it carries what the picture cannot say: where you are, what
                is next, and - for the team - the way in to change any of it. */}
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
              <div className="rounded-card border border-gray-100 bg-white px-3 py-6 shadow-card sm:px-6">
                <MilestonePath
                  milestones={rows}
                  standings={standings}
                  showPeople={showPeople}
                  showCrowd={isAdmin && showCrowd}
                />
              </div>

              <aside className="space-y-4 lg:sticky lg:top-24">
                <div className="rounded-card border border-gray-100 bg-white p-5 shadow-card">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-smoke">Where you are</p>
                  <p className="mt-2 text-3xl font-bold text-brand">
                    {reached}<span className="text-lg text-smoke"> / {rows.length}</span>
                  </p>
                  <p className="text-xs text-smoke">stops reached</p>
                  {next && (
                    <div className="mt-4 border-t border-gray-100 pt-4">
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-smoke">Next stop</p>
                      <p className="mt-1 text-sm font-semibold">{next.title}</p>
                      <p className="mt-0.5 text-xs text-smoke">
                        {next.metric === 'views'
                          ? `${formatViews(Number(next.value))} of ${formatViews(Number(next.threshold))} views`
                          : `${Math.floor(Number(next.value))} of ${Number(next.threshold)}`}
                      </p>
                      {next.reward && (
                        <span className="mt-2 inline-block rounded-full bg-brand-tint px-2.5 py-1 text-[11px] font-semibold text-brand">
                          {next.reward}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* THE WAY IN. There was no route from this page to the editor
                    at all, so the person who decides what the stops ARE had to
                    know /admin/milestones existed and type it. */}
                {isAdmin && (
                  <div className="rounded-card border border-brand/25 bg-brand-tint/20 p-5">
                    <p className="flex items-center gap-2 text-sm font-semibold text-brand">
                      <Icon name="shield" className="h-4 w-4" /> Running the route
                    </p>
                    <p className="mt-1 text-xs text-smoke">
                      Add, retitle, reorder or retire a stop, and set what each one is worth.
                    </p>
                    <Link to="/admin/milestones" className="btn-primary mt-3 inline-flex !py-2 !px-4 text-xs">
                      Edit the milestones
                    </Link>
                  </div>
                )}
              </aside>
            </div>
          </>
        )}

        {/* Who else is on the road. Not a leaderboard: no ranks, no scores, and
            it is sorted by how far along people are rather than by who is
            "winning", because there is nothing here to win. */}
        {standings.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-1 text-lg font-semibold">Everyone on the route</h2>
            <p className="mb-4 text-sm text-smoke">
              {standings.filter((s) => s.reached > 0).length} creators have reached at least one stop.
            </p>
            <div className="flex flex-wrap gap-2">
              {standings.filter((s) => s.reached > 0).slice(0, 40).map((s) => (
                <Link
                  key={s.id}
                  to={`/profile/${s.id}`}
                  title={`${s.name} · ${s.reached} ${s.reached === 1 ? 'stop' : 'stops'}`}
                  className="flex items-center gap-2 rounded-full border border-gray-200 bg-white py-1 pl-1 pr-3 transition-transform duration-200 hover:scale-105 hover:border-brand"
                >
                  <Avatar src={s.photo_url} name={s.name} size="xs" />
                  <span className="text-xs font-medium">{s.name.split(' ')[0]}</span>
                  <span className="rounded-full bg-brand-tint px-1.5 text-[10px] font-bold text-brand">{s.reached}</span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </motion.div>
    </div>
  )
}
