import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Icon from '../Icon'
import { cx } from '../../lib/utils'
import { rankInk, ordinalFor } from '../../lib/podiumTiers'

// THE REST OF THE PLATFORM, ON THE PROFILE.
//
// Ethan: "I mentioned the aircraft collection, that's something cool you could
// put in. Flight stats maybe something cool to have somewhere. Streaks and
// puzzle records could go in, but we need to make sure we can structure this
// correctly, that it looks clean and nothing's crowded."
//
// THE STRUCTURE IS THE WHOLE ASK, so these are RAIL cards and not sections.
// Everything the profile used to hold was a full-width band, which is why the
// page read as a scroll of unrelated stripes - and adding three more bands
// would have made the exact problem worse. A rail card is small, it is quiet,
// and it earns its place by being a number you can glance at with a way in
// behind it.
//
// EACH ONE RENDERS NOTHING WHEN THERE IS NOTHING. A creator who has never
// logged a flight should not see an aircraft card explaining that it is empty;
// an empty state is only worth showing on your OWN profile, where it is an
// invitation rather than a fact about somebody else.

function RailCard({ icon, title, to, linkLabel, children }) {
  return (
    <section className="rounded-card border border-gray-100 bg-white p-4 shadow-card">
      {/* `items-center`. The heading carries an icon, so baseline alignment
          lines the link up with a text baseline inside a taller box and the
          link sits visibly low. */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Icon name={icon} className="h-4 w-4 shrink-0 text-brand" />
          {title}
        </h2>
        {to && (
          <Link to={to} className="shrink-0 text-xs font-medium text-brand transition-transform duration-200 hover:scale-105">
            {linkLabel || 'See all'}
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

// THE AIRCRAFT CARD IS GONE. It drew the four types somebody had flown as
// photographs, which was the right idea in the wrong place: ProfileFlights now
// carries the same aeroplanes inside the Flight Log rail card, alongside the
// distance and the airports they belong to. Two cards on one rail drawing the
// same photographs at two different sizes was the duplication, not the idea.
// The collection page itself (/flights/aircraft) is unchanged.

// -------------------------------------------------------------- the puzzles
//
// PLAYED, ON A RUN, AND THE BEST RUN THEY HAVE EVER HAD.
//
// This used to show "puzzles played", "days turned up" and a best ROUND -
// the best correct/total ratio somebody had ever scored. That last one was the
// weakest number on the card: a 1/1 on a one-question mode reads as a perfect
// record, it is not comparable between modes, and nobody plays for it. Ethan
// asked for the streaks instead, which are the numbers the games themselves are
// built around.
//
// THE STREAK COMES FROM THE DATABASE, NOT FROM HERE. `profile_game_stats`
// (migration 145) is a pure STABLE read that counts a day as played OR frozen,
// exactly as the games page and the streak leaderboard do. Computing it in the
// browser from `game_scores` would have been two lines and would have quietly
// ignored freezes, so a profile would say 4 while the games page said 9.
//
// It is also the reason this cannot call `my_game_streak`: that one WRITES. It
// spends freezes as a side effect, so drawing somebody's profile with it would
// burn their freezes because a stranger looked at them.
export function PuzzleCard({ creatorId, isMe, firstName }) {
  const [stats, setStats] = useState(null)

  useEffect(() => {
    let alive = true
    supabase.rpc('profile_game_stats', { p_profile: creatorId })
      .then(({ data }) => {
        if (!alive) return
        // The RPC returns a one-row table, so supabase-js hands back an array.
        setStats(Array.isArray(data) ? data[0] ?? null : data ?? null)
      })
    return () => { alive = false }
  }, [creatorId])

  if (!stats || !stats.plays) return null

  return (
    <RailCard icon="joystick" title="Travel games" to="/game" linkLabel="Play">
      <div className="grid grid-cols-3 gap-1.5">
        {[
          { v: stats.plays, label: 'played' },
          { v: stats.current_streak, label: 'day streak', live: stats.current_streak > 0 },
          { v: stats.best_streak, label: 'best ever' },
        ].map((s) => (
          <div
            key={s.label}
            className={cx(
              'rounded-xl px-2.5 py-2.5',
              s.live ? 'bg-brand-tint' : 'bg-cloud/60',
            )}
          >
            <p className={cx('text-lg font-bold leading-none tabular-nums', s.live && 'text-brand')}>{s.v}</p>
            <p className="mt-1 text-[11px] leading-tight text-smoke">{s.label}</p>
          </div>
        ))}
      </div>
      {/* One line of plain English under three bare numbers, because "12 / 4 /
          9" on its own is a scoreboard with no subject. */}
      <p className="mt-2.5 text-xs text-smoke">
        {stats.current_streak > 0
          ? `${isMe ? 'You have' : `${firstName} has`} played ${stats.current_streak} ${stats.current_streak === 1 ? 'day' : 'days'} in a row.`
          : `${isMe ? 'Your' : `${firstName}'s`} longest run is ${stats.best_streak} ${stats.best_streak === 1 ? 'day' : 'days'}.`}
      </p>
    </RailCard>
  )
}

// ------------------------------------------------------- the challenge wall
//
// ONLY PUBLISHED RESULTS, and this is the same rule the winners podium follows
// for the same reason. A `results` row exists from the first time anybody looks
// at a leaderboard, INCLUDING the interim mid-challenge standings - so keying
// off "is there a result" would put a half-finished position on somebody's
// profile as a trophy. `winners_published_at` is an admin saying it is final.
export function ChallengeHistoryCard({ creatorId, isMe, firstName }) {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    let alive = true
    supabase.from('results')
      .select('rank, challenges!inner(id, title, winners_published_at)')
      .eq('creator_id', creatorId)
      .not('challenges.winners_published_at', 'is', null)
      .lte('rank', 3)
      .order('rank')
      .limit(6)
      .then(({ data }) => { if (alive) setRows(data || []) })
    return () => { alive = false }
  }, [creatorId])

  if (!rows?.length) return null
  const wins = rows.filter((r) => r.rank === 1).length


  return (
    <RailCard icon="trophy" title="On the podium" to="/challenges" linkLabel="Challenges">
      {wins > 0 && (
        <p className="mb-2.5 text-xs text-smoke">
          <span className="font-semibold text-ink">{wins}</span>
          {` ${wins === 1 ? 'win' : 'wins'} ${isMe ? 'so far' : `for ${firstName}`}`}
        </p>
      )}
      <ul className="space-y-1.5">
        {rows.map((r, i) => (
          <li key={`${r.challenges?.id}-${i}`} className="flex items-center gap-2">
            {/* Brand ladder, not gold/silver/bronze - lib/podiumTiers is the
                one definition of what a place looks like here. */}
            <Icon name="trophy" className={cx('h-3.5 w-3.5 shrink-0', rankInk(r.rank))} />
            <span className="min-w-0 flex-1 truncate text-xs text-ink">{r.challenges?.title}</span>
            <span className="shrink-0 text-[11px] font-bold tabular-nums text-smoke">
              {ordinalFor(r.rank)}
            </span>
          </li>
        ))}
      </ul>
    </RailCard>
  )
}

export { RailCard }
