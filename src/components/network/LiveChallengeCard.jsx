import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { supabase } from '../../lib/supabase'
import CountdownTimer from '../CountdownTimer'
import Icon from '../Icon'
import { Avatar } from '../ui'
import TrypPlane from './TrypPlane'
import ParticipationBar from './ParticipationBar'
import { scoringMode } from '../../lib/scoring'
import { placeNumber, rankInk, ordinalFor } from '../../lib/podiumTiers'
import { SOFT_SPRING } from '../../lib/motion'
import { cx, formatViews } from '../../lib/utils'
import { useT } from '../../lib/i18n'
import { isHiddenTestRow } from '../../lib/testData'

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

// WHO IS WINNING, IN THE CORNER THE PLANE USED TO PARK IN (2 Sep 2026).
//
// Ethan: "when there's a live challenge for Spain, remove the animated Tryp.com
// plane from the top right and instead add the top three or top six - there's
// more space here - showing who's there, who's got them, or just that no one's
// got them yet, and show the prize along with it. That would encourage creators
// more than the Tryp.com plane."
//
// The plane was decoration in the one place on the card with room for a fact.
// This is the same never-empty board the challenge page and the /challenges
// card draw: every paid place is a row from the first minute, taken or open,
// carrying what it is worth. SIX rather than three because this card is wider
// than the one on /challenges and a market's brief usually pays deeper than the
// podium - but never deeper than the prize structure actually goes, and never
// fewer than three, so a challenge with one prize still reads as a contest.
//
// IT FETCHES ITS OWN LEADERS. Both callers (the market hub and the worldwide
// hub) already run half a dozen queries of their own and neither had this one;
// threading it through two big pages to save one indexed read on a single
// challenge id is the kind of plumbing that goes stale. The card owns the fact
// it draws.
const MAX_PLACES = 6

function useLeaders(challengeId) {
  const [leaders, setLeaders] = useState([])
  useEffect(() => {
    if (!challengeId) return undefined
    let cancelled = false
    supabase.from('submissions')
      .select('creator_id, logged_views, profiles:creator_id(id, name, photo_url, is_test)')
      .eq('challenge_id', challengeId)
      .then(({ data }) => {
        if (cancelled) return
        // Summed PER CREATOR: somebody can post more than one entry and the
        // board ranks people, not videos. Test profiles are dropped - a sandbox
        // account at the top of a live leaderboard is a bug report, not a
        // standing.
        const byCreator = new Map()
        for (const row of data || []) {
          if (isHiddenTestRow(row.profiles)) continue
          const cur = byCreator.get(row.creator_id) || {
            id: row.profiles?.id ?? row.creator_id,
            name: row.profiles?.name,
            photo_url: row.profiles?.photo_url,
            views: 0,
          }
          cur.views += Number(row.logged_views) || 0
          byCreator.set(row.creator_id, cur)
        }
        setLeaders([...byCreator.values()].filter((x) => x.views > 0).sort((a, b) => b.views - a.views))
      })
    return () => { cancelled = true }
  }, [challengeId])
  return leaders
}

function LiveBoard({ challenge, className }) {
  const tr = useT()
  const leaders = useLeaders(challenge.id)

  const prizeAt = new Map(
    (Array.isArray(challenge.prize_structure) ? challenge.prize_structure : [])
      .map((p, i) => [placeNumber(p?.place) ?? i + 1, p?.prize])
      .filter(([n, prize]) => n != null && prize),
  )
  const deepest = Math.min(
    MAX_PLACES,
    Math.max(3, leaders.length, ...[...prizeAt.keys()]),
  )
  const rows = Array.from({ length: deepest }, (_, i) => ({
    place: i + 1,
    leader: leaders[i] || null,
    prize: prizeAt.get(i + 1) || '',
  }))

  return (
    <div className={cx('rounded-2xl bg-white p-4 shadow-[0_12px_34px_rgba(0,0,0,0.20)]', className)}>
      <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-brand">
        <Icon name="trophy" className="h-3.5 w-3.5" />
        {tr('Leaderboard')}
      </p>
      <div className="space-y-1">
        {rows.map(({ place, leader, prize }) => (
          <div
            key={place}
            className={cx(
              'flex items-center gap-2.5 rounded-xl px-2 py-1.5',
              // First place carries a tint. Two and below are plain, or the
              // panel is six highlights and no hierarchy.
              place === 1 && 'bg-brand-tint/70',
            )}
          >
            <span className={cx('w-7 shrink-0 text-[11px] font-bold tabular-nums', rankInk(place))}>
              {ordinalFor(place)}
            </span>
            {leader ? (
              <Avatar src={leader.photo_url} name={leader.name} size="xs" />
            ) : (
              // A DASHED RING, NOT A GREY DISC. An empty place has to read as
              // "nobody has taken this", not as "somebody whose photo failed to
              // load", and an outline says vacant in a way a fill cannot.
              <span
                aria-hidden
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-dashed border-gray-300 text-gray-400"
              >
                <Icon name="user" className="h-3.5 w-3.5" />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className={cx('block truncate text-sm font-semibold', leader ? 'text-ink' : 'text-gray-400')}>
                {/* A name is theirs and never translated; the empty state is
                    ours. */}
                {leader ? leader.name?.split(' ')[0] : tr('Up for grabs')}
              </span>
              {prize && <span className="block truncate text-[11px] text-smoke">{prize}</span>}
            </span>
            {leader && (
              <span className="shrink-0 text-sm font-bold tabular-nums text-ink">{formatViews(leader.views)}</span>
            )}
          </div>
        ))}
      </div>
    </div>
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
  const tr = useT()
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
        {/* TWO COLUMNS FROM `lg`, ONE STACK BELOW IT - the same shape the
            /challenges card uses, and for the same reason: the words and the
            clock down the left, who is winning and how to join down the right.
            A GRID rather than a padded column plus an absolute panel, because
            the board's height depends on how many places the brief pays, and a
            reservation in `rem` cannot know that - six rows would have landed on
            the countdown. A grid row cannot be overlapped.
            On a phone none of it applies: the parts fall back into source order,
            which is the order the phone's card already had. */}
        <div className={cx('relative', !compact && 'lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-x-8')}>
          <div className={cx('flex flex-wrap items-center gap-x-3 gap-y-2', !compact && 'lg:col-start-1 lg:row-start-1')}>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider">
              <Pulse />
              {isGlobal
                ? <><Icon name="globe" className="h-3.5 w-3.5" /> {tr("Live worldwide")}</>
                : <>{flags && <span aria-hidden>{flags}</span>}{market ? `Live in ${market}` : 'Live now'}</>}
            </span>
            {isGlobal && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-brand">
                {tr("Open to everyone")}
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
            className={cx('group mt-4 block', !compact && 'lg:col-start-1 lg:row-start-2')}
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

          {/* WHO IS WINNING, top right, where the animated plane used to park.
              Desktop only: the phone card is deliberately a title, a clock and
              a button, and a six-place board would put a screen back on it. */}
          {!compact && (
            <LiveBoard
              challenge={challenge}
              className="hidden lg:col-start-2 lg:row-start-1 lg:row-end-3 lg:block lg:self-start"
            />
          )}

          {/* The clock takes the room it needs and the buttons take what is
              left, rather than both being squeezed into halves of a column that
              was already short. `min-w-0` on the clock and `shrink-0` on the
              buttons is what stops a long market name or a three-digit day
              count from folding the row. */}
          {/* The clock and the buttons are SIBLINGS in the grid, sharing the
              bottom row across both columns, rather than two halves of one
              flex row. That is what keeps them on a baseline when the board
              beside them grows a place: `items-end` on two separate columns
              cannot, because they are not the same row. */}
          <div className={cx('min-w-0', compact ? 'mt-5' : 'mt-8 lg:col-start-1 lg:row-start-3 lg:mt-7 lg:self-end')}>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/75">{tr("Closes in")}</p>
            <CountdownTimer endDate={challenge.end_date} hero={!compact} />
          </div>

          <div className={cx(
            'mt-6 flex flex-col gap-2.5',
            !compact && 'lg:col-start-2 lg:row-start-3 lg:mt-7 lg:items-end lg:self-end',
          )}>
            <div className="flex flex-wrap gap-3 lg:justify-end">
              <Link to={`/challenges/${challenge.id}`} className="btn whitespace-nowrap border border-white/40 text-white hover:bg-white/10">
                {tr("Read the brief →")}
              </Link>
              <Link to={`/challenges/${challenge.id}?submit=1`} className="btn whitespace-nowrap bg-white !text-brand hover:bg-white/90">
                {tr("Submit your video")}
              </Link>
            </div>
            {entries != null && (
              <p className="text-sm text-white/80">
                {entries === 1 ? tr('1 entry so far') : tr('{n} entries so far', { n: entries })}
              </p>
            )}
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
// `title` OVERRIDES THE MARKET SENTENCE, because the same panel is now used on
// the platform-wide board (pages/Challenges) where there is no market to name.
// Ethan: "use that same copy, but obviously say just no challenge - you don't
// say the market name."
//
// AND THE PLANE IS BIGGER HERE THAN IT WAS. It is the only thing on the panel
// and it is the brand mark: at 224px on a phone it read as an illustration
// tucked into a notice, which is the opposite of what an empty board wants to
// feel like. Ethan: "that nice Tryp.com animated plane, you can have nice and
// big there."
export function NoLiveChallenge({ market, canCreate = false, slug, hint, title }) {
  return (
    <div className="relative overflow-hidden rounded-card border border-dashed border-brand/25 bg-brand-tint/25 px-6 py-12 text-center sm:py-16">
      <div className="flex justify-center">
        <TrypPlane
          variant="inline"
          id={`empty-${slug || 'market'}`}
          className="h-36 w-72 sm:h-52 sm:w-[26rem]"
        />
      </div>
      <p className="mt-3 text-lg font-semibold text-ink sm:text-xl">
        {title || `No challenge running in ${market || 'this market'} right now`}
      </p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-smoke">
        {hint || 'The next challenge is landing here soon.'}
      </p>
      {canCreate && (
        <Link to={`/admin/challenges/new${slug ? `?market=${slug}` : ''}`} className="btn-primary mt-6 !py-2.5">
          + Create a challenge
        </Link>
      )}
    </div>
  )
}
