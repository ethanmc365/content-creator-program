import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import Icon from '../Icon'
import { dailyStreak, ukDayIndex, ukDayStartIso } from '../../lib/daily'
import { cx } from '../../lib/utils'

// TODAY'S PUZZLE, ON THE PAGE PEOPLE ACTUALLY OPEN.
//
// The games live behind a link in a menu, which means the daily puzzle - the one
// piece of this product designed to be a habit - is only ever found by somebody
// who already has the habit. A slim strip on the hub, between the announcement
// and the map, is the whole intervention: it costs one line of the page and it
// is the difference between a daily game and a page with games on it.
//
// THREE FACTS, AND NO MORE.
//
//   what it is        the puzzle's name, so it is a specific thing and not "a game"
//   who else played   the count today. This is the social proof, and it is the
//                     reason the strip works: 11 people played this morning is a
//                     different invitation from "play a game".
//   your streak       only if you have one. A "0 day streak" is a scolding.
//
// It is a Link and not a card with a button in it, because the whole strip
// should be the target on a phone.
//
// WHICH PUZZLE IT OFFERS. The one you have NOT played today, so somebody who has
// done Guess the Country is invited to Flight Path rather than told to go and do
// the thing they have done. If both are done it says so and stops selling.

const PUZZLES = [
  { key: 'pinpoint', store: 'tryp_pinpoint', title: 'Guess the Country', icon: 'magnifier', line: 'Five clues, one country.' },
  { key: 'zip', store: 'tryp_zip', title: 'Flight Path', icon: 'plane-tryp', line: 'Fly through every stop in order.' },
]

export default function DailyPuzzleCallout({ className }) {
  const { user } = useAuth()
  const [today] = useState(() => ukDayIndex())
  const [playedToday, setPlayedToday] = useState(() => new Set())
  const [counts, setCounts] = useState(null) // key -> how many played today
  const [streak, setStreak] = useState(0)

  // localStorage first, because it answers "have I played" without a round trip
  // and the answer decides which puzzle this card offers.
  useEffect(() => {
    const done = new Set()
    for (const p of PUZZLES) {
      try {
        if (JSON.parse(localStorage.getItem(p.store) || 'null')?.day === today) done.add(p.key)
      } catch { /* private mode */ }
    }
    setPlayedToday(done)
  }, [today])

  useEffect(() => {
    let alive = true
    const since = ukDayStartIso()
    Promise.all([
      // Everyone's plays today, per puzzle. `is_test` accounts are filtered the
      // same way the leaderboards filter them, so the number on the card and the
      // number of rows on the board can never disagree.
      supabase.from('game_scores')
        .select('mode, player_id, profiles:player_id(is_test)')
        .in('mode', ['pinpoint', 'zip']).gte('created_at', since),
      user?.id
        ? supabase.from('game_scores').select('day_key').eq('player_id', user.id).not('day_key', 'is', null)
        : Promise.resolve({ data: [] }),
    ]).then(([{ data: rows }, { data: mine }]) => {
      if (!alive) return
      const tally = {}
      const seen = new Set()
      for (const r of rows || []) {
        if (r.profiles?.is_test) continue
        // One person is one play, however many times they opened it.
        const k = `${r.mode}:${r.player_id}`
        if (seen.has(k)) continue
        seen.add(k)
        tally[r.mode] = (tally[r.mode] || 0) + 1
      }
      setCounts(tally)
      setStreak(dailyStreak([...new Set((mine || []).map((m) => m.day_key))]))
      // The server is the truth about whether you have played: localStorage is
      // per device, and a creator who solved it on their phone must not be
      // invited to solve it again on a laptop.
      const done = new Set()
      for (const r of rows || []) if (r.player_id === user?.id) done.add(r.mode)
      if (done.size) setPlayedToday((cur) => new Set([...cur, ...done]))
    })
    return () => { alive = false }
  }, [user?.id, today])

  const next = PUZZLES.find((p) => !playedToday.has(p.key))
  const allDone = !next
  const shown = next || PUZZLES[0]
  const count = counts?.[shown.key] ?? null

  return (
    <Link
      to={allDone ? '/game' : `/game?daily=${shown.key}`}
      className={cx(
        'group flex items-center gap-4 rounded-card border border-brand/25 bg-gradient-to-r from-brand-tint/50 to-brand-tint/20 px-4 py-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-lift sm:px-5',
        className,
      )}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand text-white shadow-card transition-transform duration-200 group-hover:scale-110">
        <Icon name={allDone ? 'check' : shown.icon} className="h-5 w-5" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-brand">
            {allDone ? 'Done for today' : "Today's puzzle"}
          </span>
          {streak > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold text-white">
              <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="currentColor" aria-hidden>
                <path d="M12 2.5c.5 2.6-.8 4-2 5.2-1.4 1.4-2.6 2.6-2.6 5A6.6 6.6 0 0 0 12 21.5a6.6 6.6 0 0 0 6.6-6.6c0-4-2.6-6-4-8.4-.5 1.3-1.3 2.1-2.2 2.6.4-2.3-.2-4.6-.4-6.6Z" />
              </svg>
              {streak} day{streak === 1 ? '' : 's'}
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-sm font-semibold text-ink">
          {allDone ? 'Both puzzles played. New ones at midnight.' : shown.title}
        </span>
        <span className="block truncate text-xs text-smoke">
          {allDone
            ? 'Five more games are open any time'
            : count == null
              ? shown.line
              : count === 0
                ? `${shown.line} Nobody has played it yet today.`
                : `${count} ${count === 1 ? 'creator has' : 'creators have'} played it today`}
        </span>
      </span>

      <span className="hidden shrink-0 items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white transition-transform duration-200 group-hover:scale-105 sm:inline-flex">
        {allDone ? 'Open games' : 'Play'}
        <Icon name="chevronRight" className="h-3.5 w-3.5" />
      </span>
      <Icon name="chevronRight" className="h-5 w-5 shrink-0 text-brand sm:hidden" />
    </Link>
  )
}
