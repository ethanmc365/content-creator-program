import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import CountdownTimer from '../CountdownTimer'
import Icon from '../Icon'
import TrypPlane from './TrypPlane'
import ParticipationBar from './ParticipationBar'
import { scoringMode } from '../../lib/scoring'
import { SOFT_SPRING } from '../../lib/motion'
import { cx } from '../../lib/utils'

// The live challenge, wherever it is shown inside a market.
//
// One component rather than the three near-copies this replaces. The card had
// drifted apart across the market home, the market challenge board and the
// network hub, and the differences were all accidental: a countdown missing
// here, a market name missing there, which is exactly the confusion that made a
// Spanish challenge indistinguishable from a UK one at a glance.
//
// The market's flags and name are NOT optional. A creator who is in two markets
// sees two live cards, and the only thing distinguishing them is this.

function Pulse() {
  return (
    <span className="relative flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/80" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
    </span>
  )
}

export default function LiveChallengeCard({
  challenge,
  market,
  flags = '',
  entries = null,
  participation = null,
  compact = false,
  // A challenge scoped to the network rather than a market. Reads differently
  // because it IS different: nobody has to be in the right country, so the
  // label must not imply a place.
  global: isGlobal = false,
}) {
  if (!challenge) return null
  const mode = scoringMode(challenge.scoring)
  const pct = participation && participation.total > 0
    ? Math.round((participation.posted / participation.total) * 100)
    : null

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SOFT_SPRING}
        className={cx(
          'relative overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light text-white shadow-lift',
          compact ? 'p-5 sm:p-6' : 'p-6 sm:p-10',
        )}
      >
        <div className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-black/5 blur-2xl" />
        {/* Top right: the badges are top LEFT and the buttons are bottom right
            on desktop, so this is the only corner that is genuinely free. */}
        {!compact && <TrypPlane variant="hero" anchor="top" id={`live-${challenge.id}`} />}

        {/* THE HEADING RESERVES THE PLANE'S SPACE. The whole column used to,
            which is the bug that made this card look broken: a 24rem reservation
            left 752px for a row holding a 576px countdown and two buttons, so
            the clock squeezed to 88px tiles and the buttons stacked on top of
            each other in a 176px gutter.
            The plane only ever occupies the top right. Padding the block it
            actually overlaps, and letting the countdown row have the full card,
            fixes both at once. */}
        <div className="relative">
          <div className={cx('flex flex-wrap items-center gap-x-3 gap-y-2', !compact && 'lg:pr-[15rem] xl:pr-[17rem]')}>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider">
              <Pulse />
              {isGlobal
                ? <><Icon name="globe" className="h-3.5 w-3.5" /> Live worldwide</>
                : <>{flags && <span aria-hidden>{flags}</span>}{market ? `Live in ${market}` : 'Live now'}</>}
            </span>
            {isGlobal && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-brand">
                Open to everyone
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold">
              <Icon name={mode.icon} className="h-3.5 w-3.5" />
              {mode.creatorLine}
            </span>
          </div>

          {/* Magnify, never underline. An underline reads as a link inside a
              sentence; a heading that swells reads as "the card is the target",
              which it is. origin-left keeps it anchored to the first letter. */}
          <Link
            to={`/challenges/${challenge.id}`}
            className={cx('group mt-4 block', !compact && 'lg:pr-[15rem] xl:pr-[17rem]')}
          >
            <h2
              className={cx(
                'inline-block origin-left font-bold leading-tight transition-transform duration-200 ease-out group-hover:scale-[1.03]',
                compact ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl',
              )}
            >
              {challenge.title}
            </h2>
            {challenge.description && (
              <p className="mt-2 max-w-2xl text-white/85 line-clamp-2">{challenge.description}</p>
            )}
          </Link>

          {/* The clock takes the room it needs and the buttons take what is
              left, rather than both being squeezed into halves of a column that
              was already short. `min-w-0` on the clock and `shrink-0` on the
              buttons is what stops a long market name or a three-digit day
              count from folding the row. */}
          <div className={cx(
            'flex flex-col gap-6',
            compact ? 'mt-5' : 'mt-8 lg:flex-row lg:items-end lg:justify-between lg:gap-8',
          )}>
            <div className="min-w-0 flex-1">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/75">Closes in</p>
              <CountdownTimer endDate={challenge.end_date} hero={!compact} />
            </div>
            <div className="flex flex-col gap-2.5 lg:shrink-0 lg:items-end">
              <div className="flex flex-wrap gap-3">
                <Link to={`/challenges/${challenge.id}`} className="btn whitespace-nowrap border border-white/40 text-white hover:bg-white/10">
                  Read the brief →
                </Link>
                <Link to={`/challenges/${challenge.id}?submit=1`} className="btn whitespace-nowrap bg-white !text-brand hover:bg-white/90">
                  Submit your video
                </Link>
              </div>
              {entries != null && (
                <p className="text-sm text-white/80">
                  {entries} {entries === 1 ? 'entry' : 'entries'} so far
                </p>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {pct != null && (
        <ParticipationBar
          className="mt-4"
          participation={participation}
          where={isGlobal ? 'across the network' : `in ${market || 'this market'}`}
        />
      )}
    </div>
  )
}

// What a market shows when nothing is running. Deliberately not an apology: an
// empty board is the normal state between challenges, so it points at what the
// creator can do meanwhile instead of just saying "none".
export function NoLiveChallenge({ market, canCreate = false, slug, hint }) {
  return (
    <div className="relative overflow-hidden rounded-card border border-dashed border-brand/25 bg-brand-tint/25 px-6 py-10 text-center">
      <div className="flex justify-center">
        <TrypPlane variant="inline" id={`empty-${slug || "market"}`} />
      </div>
      <p className="mt-2 text-base font-semibold text-ink">
        No challenge running in {market || 'this market'} right now
      </p>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-smoke">
        {hint || 'The next brief lands here. Keep posting in the meantime, and your rooms stay open.'}
      </p>
      {canCreate && (
        <Link to={`/admin/challenges/new?market=${slug || ''}`} className="btn-primary mt-5 !py-2.5">
          + Create a challenge
        </Link>
      )}
    </div>
  )
}
