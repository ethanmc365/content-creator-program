import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import BackLink from '../components/BackLink'
import MilestonePath from '../components/network/MilestonePath'
import Icon from '../components/Icon'
import { Avatar, EmptyState, PageHeader, Skeleton } from '../components/ui'
import { cx } from '../lib/utils'
import { pageFade } from '../lib/motion'
import { METRICS, criterionLabel, humanDays, routeState } from '../lib/milestones'

// Where a creator has got to, and what is next.
//
// THIS REPLACES THE ACHIEVEMENT BADGES
//
// The old profile badges were effort tiers that nobody could name a reason to
// want: they appeared, they were grey, and reaching one changed nothing. A
// milestone is the same idea with the two missing halves attached - a threshold
// you can see coming, and something real on the other side of it.
//
// AND IT IS A ROUTE NOW, NOT A CHECKLIST
//
// Every stop used to test one number, so eleven stops tested eleven unrelated
// things and a creator could clear the fourth without the second. Drawn on a
// line that was nonsense. Each stop now carries a SET of requirements and the
// stops are gated in order, which is what makes the picture mean something: the
// lit part of the line is always the part behind you.

const SUMMARY = ['views', 'videos', 'referrals', 'challenges', 'podiums', 'days']

export default function Milestones() {
  const { profile } = useAuth()
  const isAdmin = !!profile?.is_admin
  const [rows, setRows] = useState(null)
  const [standings, setStandings] = useState([])
  const [metrics, setMetrics] = useState(null)

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

  const { reached, total, next, blocked } = routeState(rows)

  return (
    <div className="page max-w-6xl">
      <BackLink />
      <motion.div {...pageFade}>
        <PageHeader
          title="Milestones"
          subtitle="One route, flown in order. Every stop asks for a few things at once — here is what you have, and what is left."
        />

        {/* The numbers the whole ladder is computed from. Showing them makes the
            thresholds checkable rather than magic. */}
        {metrics && (
          <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {SUMMARY.map((key) => {
              const m = METRICS.find((x) => x.value === key)
              const raw = Number(metrics[key] || 0)
              return (
                <div key={key} className="rounded-card border border-gray-100 bg-white px-4 py-3">
                  <Icon name={m.icon} className="h-4 w-4 text-brand" />
                  <p className="mt-1.5 text-lg font-bold tabular-nums">
                    {key === 'days' ? humanDays(raw) : m.fmt(raw)}
                  </p>
                  <p className="text-[11px] text-smoke">{m.label}</p>
                </div>
              )
            })}
          </div>
        )}

        {rows.length === 0 ? (
          <EmptyState icon={<Icon name="flag" className="h-7 w-7" />} title="No milestones yet"
            hint="The team is still setting these up." />
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-lg font-semibold">The route</h2>
              {isAdmin && (
                <p className="text-xs text-smoke">
                  Showing the whole route as flown, so you can check it end to end.
                </p>
              )}
            </div>

            {/* NO CARD ROUND THE ROUTE.
                A white panel inside a white page is a border drawn for its own
                sake. The route sits on the page. The reading beside it keeps
                its card, because that one IS a distinct object. */}
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
              <div className="px-1 py-2">
                <MilestonePath
                  milestones={rows}
                  standings={standings}
                  preview={isAdmin}
                />
              </div>

              <aside className="space-y-4 lg:sticky lg:top-24">
                <div className="rounded-card border border-gray-100 bg-white p-5 shadow-card">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-smoke">Where you are</p>
                  <p className="mt-2 text-3xl font-bold text-brand">
                    {reached}<span className="text-lg text-smoke"> / {total}</span>
                  </p>
                  <p className="text-xs text-smoke">stops reached</p>
                  {next && (
                    <div className="mt-4 border-t border-gray-100 pt-4">
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-smoke">Next stop</p>
                      <p className="mt-1 text-sm font-semibold">{next.title}</p>
                      {/* EVERY REQUIREMENT, TICKED OR NOT.
                          This was one line reading "3 of 10" - the stop's
                          single metric. A stop can ask for three things now,
                          and the whole reason for that change was so a creator
                          can see which of them they are short on. */}
                      <ul className="mt-2 space-y-1.5">
                        {(next.criteria || []).map((c) => (
                          <li key={c.metric} className="flex items-start gap-1.5 text-xs">
                            <Icon
                              name={c.done ? 'check' : 'clock'}
                              className={cx('mt-0.5 h-3.5 w-3.5 shrink-0', c.done ? 'text-green-600' : 'text-gray-300')}
                            />
                            <span className={c.done ? 'text-smoke line-through decoration-green-600/40' : 'text-ink'}>
                              {criterionLabel(c)}
                            </span>
                          </li>
                        ))}
                      </ul>
                      {next.reward && (
                        <span className="mt-3 inline-block rounded-full bg-brand-tint px-2.5 py-1 text-[11px] font-semibold text-brand">
                          {next.reward}
                        </span>
                      )}
                    </div>
                  )}

                  {/* WORK ALREADY DONE THAT IS WAITING ON THE ORDER.
                      Somebody past 100,000 views who has never referred anybody
                      has genuinely earned three stops further down and cannot
                      have any of them yet. Silence there reads as the ladder
                      being broken; saying it reads as a reason to go and refer
                      somebody, which is the point of putting it in the way. */}
                  {blocked.length > 0 && (
                    <div className="mt-4 rounded-xl bg-amber-50 px-3 py-2.5">
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                        <Icon name="alert" className="h-3.5 w-3.5" />
                        {blocked.length} {blocked.length === 1 ? 'stop is' : 'stops are'} already earned
                      </p>
                      <p className="mt-1 text-[11px] leading-relaxed text-amber-700">
                        You have the numbers for {blocked.map((b) => b.title).slice(0, 2).join(' and ')}
                        {blocked.length > 2 ? ` and ${blocked.length - 2} more` : ''}. They unlock as soon as you
                        clear {next ? next.title : 'the stop in front of them'}.
                      </p>
                    </div>
                  )}
                </div>

                {/* WHO ELSE IS ON THE ROAD, BESIDE THE ROUTE RATHER THAN UNDER IT.
                    Not a leaderboard - no ranks, no scores, nothing to win. */}
                {standings.filter((s) => s.reached > 0).length > 0 && (
                  <div className="rounded-card border border-gray-100 bg-white p-5 shadow-card">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-smoke">Everyone on the route</p>
                    <p className="mt-1.5 text-xs text-smoke">
                      {standings.filter((s) => s.reached > 0).length} creators have reached at least one stop.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {standings.filter((s) => s.reached > 0).slice(0, 40).map((s) => (
                        <Link
                          key={s.id}
                          to={`/profile/${s.id}`}
                          title={`${s.name} · ${s.reached} ${s.reached === 1 ? 'stop' : 'stops'}`}
                          className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white py-0.5 pl-0.5 pr-2 transition-transform duration-200 hover:scale-105 hover:border-brand"
                        >
                          <Avatar src={s.photo_url} name={s.name} size="xs" />
                          <span className="text-[11px] font-medium">{s.name.split(' ')[0]}</span>
                          <span className="rounded-full bg-brand-tint px-1.5 text-[10px] font-bold text-brand">{s.reached}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {/* THE "RUNNING THE ROUTE" CARD IS GONE.
                    It was an admin-only panel on a creator's page whose whole
                    job was to link to /admin/milestones - a page the admin
                    panel already lists, under the same name, one tap away.
                    Ethan asked for it off, and it was the only thing on this
                    page that existed for somebody other than the person
                    reading it. */}
              </aside>
            </div>
          </>
        )}

      </motion.div>
    </div>
  )
}
