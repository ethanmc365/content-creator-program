import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { supabase } from '../lib/supabase'
import BackLink from '../components/BackLink'
import MilestonePath from '../components/network/MilestonePath'
import Icon from '../components/Icon'
import { EmptyState, PageHeader, Skeleton } from '../components/ui'
import { cx } from '../lib/utils'
import { pageFade } from '../lib/motion'
import { METRICS, criterionFraction, criterionLabel, humanDays, routeState } from '../lib/milestones'
import { useViewAs, ViewingAsBanner } from '../components/ViewingAs'

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
  // `?as=<id>` opens one creator's own route. See components/ViewingAs.
  const { id: whose, viewing, person } = useViewAs()
  const [rows, setRows] = useState(null)
  const [standings, setStandings] = useState([])
  const [metrics, setMetrics] = useState(null)

  useEffect(() => {
    let alive = true
    Promise.all([
      supabase.rpc('milestone_progress', { p_profile: whose }),
      supabase.rpc('milestone_standings'),
      supabase.rpc('creator_metrics', { p_profile: whose }),
    ]).then(([{ data: prog }, { data: stand }, { data: mets }]) => {
      if (!alive) return
      setRows(prog || [])
      setStandings(stand || [])
      setMetrics(Array.isArray(mets) ? mets[0] : mets)
    })
    return () => { alive = false }
  }, [whose])

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
        <PageHeader title="Milestones" />

        <ViewingAsBanner viewing={viewing} person={person} />

        {/* THE PHONE READS ROUTE FIRST, THE DESKTOP READS NUMBERS FIRST.
            On a phone the six stat tiles filled the entire first screen, so the
            page opened on a wall of figures and the route - the thing the page
            is about - started below the fold. Ordering only: `flex-col` with an
            explicit order on a phone, plain block flow from `lg` up, where the
            stats are a thin strip above a two-column layout and were never in
            the way. */}
        <div className="flex flex-col lg:block">
        {/* The numbers the whole ladder is computed from. Showing them makes the
            thresholds checkable rather than magic. */}
        {/* THE MARGIN FOLLOWS THE ORDER, and it did not.
            `mb-8` alone is right from `lg` up, where this strip is FIRST and
            the space belongs under it. On a phone `order-2` moves it to the
            BOTTOM, so the only margin it had was on the far side from the card
            it now sits beneath - Ethan: "the views and video posted card is
            really squashed up to the card above it". The space has to move with
            the strip. */}
        {metrics && (
          <div className="order-2 mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:order-none lg:mb-8 lg:mt-0 lg:grid-cols-6">
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
          <div className="order-1 lg:order-none">
            <h2 className="mb-4 text-lg font-semibold">The route</h2>

            {/* NO CARD ROUND THE ROUTE.
                A white panel inside a white page is a border drawn for its own
                sake. The route sits on the page. The reading beside it keeps
                its card, because that one IS a distinct object. */}
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
              <div className="px-1 py-2">
                {/* NO "PREVIEW" MODE.
                    An admin used to see the whole route drawn as flown, so they
                    could check the animation end to end - and the effect was
                    that Ethan opened his own milestones and was congratulated
                    for finishing a ladder he has not started. A page that
                    reports something untrue about you to check a drawing is a
                    bad trade; the admin editor has a preview panel for that. */}
                <MilestonePath milestones={rows} standings={standings} />
              </div>

              <aside className="space-y-4 lg:sticky lg:top-24">
                {/* WHERE YOU ARE.
                    Rebuilt because the reward line was a chip and rewards are
                    sentences: "You are officially a Tryp.com Creator, welcome to
                    the team!" inside a pill three words wide is the squashed
                    text Ethan reported. A reward gets its own block with room to
                    wrap; the progress bar and the count sit above it; the
                    requirement list is the only thing that is a list. */}
                <div className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
                  <div className="border-b border-gray-100 bg-cloud/40 px-5 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-smoke">Where you are</p>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-4xl font-bold leading-none text-brand tabular-nums">{reached}</span>
                      <span className="text-sm text-smoke">of {total} stops reached</span>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white">
                      <div
                        className="h-full rounded-full bg-brand transition-all duration-700"
                        style={{ width: `${total ? Math.round((reached / total) * 100) : 0}%` }}
                      />
                    </div>
                  </div>

                  {next ? (
                    <div className="px-5 py-4">
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-smoke">Next stop</p>
                      <p className="mt-1 text-base font-bold leading-snug">{next.title}</p>
                      {next.description && (
                        <p className="mt-0.5 text-xs leading-snug text-smoke">{next.description}</p>
                      )}

                      <p className="mt-3 text-[11px] font-semibold uppercase tracking-widest text-smoke">What you need</p>
                      <ul className="mt-1.5 space-y-2">
                        {(next.criteria || []).map((c) => {
                          const pct = Math.round(criterionFraction(c) * 100)
                          return (
                            <li key={c.metric}>
                              <div className="flex items-start gap-1.5 text-xs">
                                <Icon
                                  name={c.done ? 'check' : 'clock'}
                                  className={cx('mt-0.5 h-3.5 w-3.5 shrink-0', c.done ? 'text-green-600' : 'text-gray-300')}
                                />
                                <span className={cx('flex-1', c.done ? 'text-smoke line-through decoration-green-600/40' : 'text-ink')}>
                                  {criterionLabel(c)}
                                </span>
                              </div>
                              {/* A BAR PER REQUIREMENT, not one bar for the stop.
                                  "You are 60% of the way there" across three
                                  different things is a number that describes
                                  none of them. */}
                              {!c.done && (
                                <div className="ml-5 mt-1 h-1 overflow-hidden rounded-full bg-cloud">
                                  <div className="h-full rounded-full bg-brand/50" style={{ width: `${pct}%` }} />
                                </div>
                              )}
                            </li>
                          )
                        })}
                      </ul>

                      {next.reward && (
                        <div className="mt-4 rounded-xl border border-brand/20 bg-brand-tint/40 px-3 py-2.5">
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-brand/70">Waiting for you</p>
                          <p className="mt-0.5 text-xs font-semibold leading-snug text-brand">{next.reward}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="px-5 py-4">
                      <p className="text-sm font-semibold">You have flown the whole route.</p>
                      <p className="mt-0.5 text-xs text-smoke">More stops are on the way.</p>
                    </div>
                  )}

                  {/* WORK ALREADY DONE THAT IS WAITING ON THE ORDER.
                      Somebody past 100,000 views who has never referred anybody
                      has genuinely earned stops further down and cannot have any
                      of them yet. Silence there reads as the ladder being
                      broken; saying it reads as a reason to go and do the thing
                      in front of them. */}
                  {blocked.length > 0 && (
                    <div className="border-t border-amber-100 bg-amber-50 px-5 py-3.5">
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                        <Icon name="alert" className="h-3.5 w-3.5 shrink-0" />
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

              </aside>
            </div>
          </div>
        )}
        </div>

      </motion.div>
    </div>
  )
}
