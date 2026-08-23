import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import BackLink from '../components/BackLink'
import MilestoneLadder, { fractionOf, remainingLine, requirementLine } from '../components/network/MilestoneLadder'
import Icon from '../components/Icon'
import { Avatar, EmptyState, Skeleton } from '../components/ui'
import { cx, formatViews } from '../lib/utils'
import { pageFade } from '../lib/motion'

// MILESTONES.
//
// IT IS NOT CALLED "MY ROUTE" ANY MORE, AND THAT IS NOT A COSMETIC CHANGE.
//
// Ethan: "the myroute page needs a big revamp - rename it to milestones.
// Currently it seems inaccurate, hard to understand, and both the desktop and
// especially the mobile UI look bad."
//
// "Route" was a name invented for a drawing. Nothing else in the product called
// it that: the admin editor is "Milestones", the table is `milestones`, the RPC
// is `milestone_progress`, and every creator who has ever asked about it has
// asked about "the milestones". A page named after its own illustration is a
// page whose name has to be learned.
//
// WHAT REPLACES THE ROUTE ITSELF is in MilestoneLadder - a vertical ladder that
// is the same shape at 375px and at 1600px, and whose arithmetic is right. The
// notes there are worth reading; the short version is that the drawing was
// putting the aeroplane past stops nobody had reached.
//
// WHAT THIS PAGE ADDS AROUND IT
//
//   ONE ANSWER AT THE TOP. "Where you are" used to be a small card in a rail,
//   four hundred pixels below the fold on a phone, saying "0 / 11". The first
//   thing on the page is now the only question anybody opens it to ask: how far
//   in am I, what is next, and how far off is it.
//
//   THE FOUR NUMBERS SAY WHAT THEY ARE. They were four tiles with a label each
//   - "Total videos", "Total views" - which is the number without the
//   definition, and the definition is the whole difference between a page that
//   reads as accurate and one that does not.
//
//   NOTHING IS IN A RAIL ON A PHONE. The old layout was a two-column grid where
//   the second column carried everything explanatory, so on a phone the reading
//   arrived after a drawing over two thousand pixels tall. Everything that
//   matters is above the ladder now, in one column, at every width.

const SUMMARY = [
  { key: 'videos', label: 'Videos posted', icon: 'video', what: 'Entries submitted to a challenge' },
  { key: 'views', label: 'Views earned', icon: 'eye', fmt: formatViews, what: 'Logged across every entry' },
  { key: 'referrals', label: 'Creators brought in', icon: 'share', what: 'Who went on to post something' },
  { key: 'days', label: 'Days in the programme', icon: 'clock', fmt: (v) => Math.floor(v), what: 'Since the team accepted you' },
]

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

  const summary = useMemo(() => {
    const list = rows || []
    const reached = list.filter((r) => r.reached)
    // THE FIRST UNREACHED ONE. Not `list[reached.length]`: the ladder is
    // ordered by sort_order and measured on five metrics that move at five
    // speeds, so the milestones you have are not the first n in the list.
    const next = list.find((r) => !r.reached) || null
    return {
      total: list.length,
      reached: reached.length,
      last: [...reached].pop() || null,
      next,
      pct: list.length ? Math.round((reached.length / list.length) * 100) : 0,
    }
  }, [rows])

  if (!rows) {
    return (
      <div className="page max-w-5xl space-y-5">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-40 w-full rounded-card" />
        <Skeleton className="h-24 w-full rounded-card" />
        <Skeleton className="h-[520px] w-full rounded-card" />
      </div>
    )
  }

  return (
    <div className="page max-w-5xl">
      <BackLink />
      <motion.div {...pageFade}>
        <header className="mb-6">
          <h1 className="flex items-center gap-2.5 text-3xl font-bold tracking-tight sm:text-4xl">
            <Icon name="flag" className="h-7 w-7 shrink-0 text-brand sm:h-8 sm:w-8" />
            Milestones
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-smoke sm:text-base">
            Thresholds on things you were doing anyway - videos, views, people you bring in, time served -
            with something real behind each one. Nobody is competing with you for them.
          </p>
        </header>

        {rows.length === 0 ? (
          <EmptyState
            icon={<Icon name="flag" className="h-7 w-7" />}
            title="No milestones yet"
            hint="The team is still setting these up. They will appear here the moment they do."
          />
        ) : (
          <div className="space-y-6">
            <Standing summary={summary} />

            {metrics && (
              <section>
                <h2 className="ms-section-head">What the ladder is counting</h2>
                <div className="ms-metrics">
                  {SUMMARY.map((s, i) => (
                    <div key={s.key} className="ms-metric" style={{ '--i': i }}>
                      <span className="ms-metric-icon"><Icon name={s.icon} className="h-4 w-4" /></span>
                      <p className="ms-metric-value">
                        {s.fmt ? s.fmt(Number(metrics[s.key] || 0)) : Math.floor(Number(metrics[s.key] || 0))}
                      </p>
                      <p className="ms-metric-label">{s.label}</p>
                      <p className="ms-metric-what">{s.what}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="ms-section-head !mb-0">Every milestone</h2>
                <p className="text-xs text-smoke">{summary.reached} of {summary.total} reached</p>
              </div>
              {/* NO ADMIN PREVIEW MODE ON THIS PAGE.
                  It used to draw the whole ladder as reached for an admin, so
                  they could check the animation end to end - which put "2 of 6
                  reached" at the top of a page where all six rungs had ticks on
                  them. An admin is also a creator and this is their own page.
                  The end-to-end preview lives in the editor, where it belongs
                  and where it is a better preview than this ever was. */}
              <MilestoneLadder milestones={rows} standings={standings} />
            </section>

            <Company standings={standings} total={rows.length} />

            {/* THE WAY IN. There was no route from this page to the editor at
                all, so the person who decides what the milestones ARE had to
                know /admin/milestones existed and type it. */}
            {isAdmin && (
              <div className="rounded-card border border-brand/25 bg-brand-tint/20 p-5">
                <p className="flex items-center gap-2 text-sm font-semibold text-brand">
                  <Icon name="shield" className="h-4 w-4" /> Running the ladder
                </p>
                <p className="mt-1 text-xs text-smoke">
                  Add, retitle, reorder or retire a milestone, and set what each one is worth.
                </p>
                <Link to="/admin/milestones" className="btn-primary mt-3 inline-flex !px-4 !py-2 text-xs">
                  Edit the milestones
                </Link>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  )
}

/**
 * WHERE YOU ARE, AS THE FIRST THING ON THE PAGE.
 *
 * A ring rather than a bar, and the ring is not decoration: the question is
 * "how much of this whole thing have I done", which is a proportion of a fixed
 * total, and a ring says proportion-of-a-whole in a way a bar has to be read to
 * say. The bar underneath it is a different question - how close the NEXT one
 * is - and putting the two side by side is what stops somebody reading "18%"
 * and thinking it is the answer to both.
 */
function Standing({ summary }) {
  const { reached, total, pct, next, last } = summary
  const nextFrac = next ? fractionOf(next) : 1
  const C = 2 * Math.PI * 52

  return (
    <section className="ms-standing">
      <div className="ms-ring-wrap">
        <svg viewBox="0 0 120 120" className="ms-ring" aria-hidden>
          <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" className="text-gray-100" strokeWidth="10" />
          <circle
            cx="60" cy="60" r="52" fill="none" stroke="url(#ms-ring-grad)" strokeWidth="10" strokeLinecap="round"
            strokeDasharray={C}
            style={{ strokeDashoffset: C * (1 - pct / 100) }}
            className="ms-ring-arc"
          />
          <defs>
            <linearGradient id="ms-ring-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#d94407" />
              <stop offset="100%" stopColor="#f5853f" />
            </linearGradient>
          </defs>
        </svg>
        <div className="ms-ring-mid">
          <p className="ms-ring-num">{reached}<span className="ms-ring-of">/{total}</span></p>
          <p className="ms-ring-cap">reached</p>
        </div>
      </div>

      <div className="min-w-0 flex-1">
        {next ? (
          <>
            <p className="ms-standing-kicker">Next milestone</p>
            <h2 className="ms-standing-title">{next.title}</h2>
            {next.reward && <span className="ms-standing-reward">{next.reward}</span>}
            <div className="ms-standing-bar">
              <div className="ms-standing-fill" style={{ width: `${Math.round(nextFrac * 100)}%` }} />
            </div>
            <p className="ms-standing-line">
              <span className="font-semibold text-ink">{requirementLine(next.metric, next.value, next.threshold)}</span>
              {' · '}{remainingLine(next)}
            </p>
          </>
        ) : (
          <>
            <p className="ms-standing-kicker">All of them</p>
            <h2 className="ms-standing-title">You have reached every milestone.</h2>
            <p className="ms-standing-line">
              There is nothing left on the ladder. The team adds new ones as the programme grows, and you
              will be told when they do.
            </p>
          </>
        )}
        {last && (
          <p className="ms-standing-last">
            <Icon name="check" className="h-3.5 w-3.5 shrink-0 text-green-600" />
            Last one reached: <span className="font-medium text-ink">{last.title}</span>
          </p>
        )}
      </div>
    </section>
  )
}

/**
 * WHO ELSE IS ON THE LADDER.
 *
 * Not a leaderboard - no ranks, no scores, nothing to win. It answers one
 * question, which is "am I out here on my own", and the honest answer to that
 * is a count and a row of faces rather than an ordering.
 */
function Company({ standings, total }) {
  const moving = standings.filter((s) => Number(s.reached) > 0)
  if (moving.length === 0) return null
  return (
    <section className="ms-company">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="ms-section-head !mb-0">Everyone else on the ladder</h2>
        <p className="text-xs text-smoke">
          {moving.length} {moving.length === 1 ? 'creator has' : 'creators have'} reached at least one of the {total}.
        </p>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {moving.slice(0, 48).map((s) => (
          <Link
            key={s.id}
            to={`/profile/${s.id}`}
            title={`${s.name} · ${s.reached} ${Number(s.reached) === 1 ? 'milestone' : 'milestones'}`}
            className={cx(
              'flex items-center gap-1.5 rounded-full border border-gray-200 bg-white py-0.5 pl-0.5 pr-2',
              'transition-all duration-200 hover:-translate-y-0.5 hover:border-brand hover:shadow-card',
            )}
          >
            <Avatar src={s.photo_url} name={s.name} size="xs" />
            <span className="text-[11px] font-medium">{(s.name || '').split(' ')[0]}</span>
            <span className="rounded-full bg-brand-tint px-1.5 text-[10px] font-bold tabular-nums text-brand">{s.reached}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
