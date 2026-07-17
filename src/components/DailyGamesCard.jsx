import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Icon from './Icon'
import { StreakChip } from './ui'
import { ukDayIndex, ukDayStartIso, dailyStreak, untilNextUkMidnight } from '../lib/daily'

// Home page teaser for the two daily puzzles: quick-play buttons, each
// creator's daily streak, and a live "N played today" counter (updates in
// realtime as scores land) to feed a little friendly FOMO.
const GAMES = [
  { mode: 'pinpoint', icon: 'country', title: 'Guess the Country', tag: 'Five clue words' },
  { mode: 'zip', icon: 'plane-tryp', title: 'Flight Path', tag: "Fill today's sky" },
]

export default function DailyGamesCard() {
  const { user } = useAuth()
  const [day] = useState(() => ukDayIndex())
  const [nextIn] = useState(() => untilNextUkMidnight(Date.now()))
  const [playersToday, setPlayersToday] = useState(null)
  const [mine, setMine] = useState(null) // mode -> { played, streak }

  const load = useCallback(async () => {
    const [{ data: todays }, { data: mineRows }] = await Promise.all([
      supabase.from('game_scores')
        .select('player_id, profiles:player_id(is_test)')
        .in('mode', ['pinpoint', 'zip'])
        .gte('created_at', ukDayStartIso()),
      supabase.from('game_scores')
        .select('mode, day_key')
        .eq('player_id', user.id)
        .in('mode', ['pinpoint', 'zip'])
        .not('day_key', 'is', null),
    ])
    const players = new Set((todays ?? []).filter((r) => !r.profiles?.is_test).map((r) => r.player_id))
    setPlayersToday(players.size)
    const byMode = {}
    for (const r of mineRows ?? []) (byMode[r.mode] ||= []).push(r.day_key)
    setMine(Object.fromEntries(GAMES.map((g) => {
      const keys = byMode[g.mode] || []
      return [g.mode, { played: keys.includes(day), streak: dailyStreak(keys, day) }]
    })))
  }, [user.id, day])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const sub = supabase.channel('daily-games-home')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_scores' }, load)
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [load])

  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Icon name="joystick" className="h-5 w-5 text-brand" /> Today's puzzles
        </h2>
        <Link to="/game" className="text-sm font-medium text-brand hover:underline">All games →</Link>
      </div>
      <div className="card !p-0">
        {/* the two dailies sit side by side on anything wider than a phone */}
        <div className="grid grid-cols-1 sm:grid-cols-2">
          {GAMES.map((g, i) => {
            const m = mine?.[g.mode]
            return (
              <div key={g.mode} className={`flex items-center gap-3 px-5 py-4 ${i > 0 ? 'border-t border-gray-50 sm:border-l sm:border-t-0' : ''}`}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white">
                  <Icon name={g.icon} className="h-6 w-6" strokeWidth={2.2} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    {g.title}
                    {m?.streak > 0 && <StreakChip n={m.streak} title={`${m.streak}-day daily streak`} />}
                  </p>
                  <p className="text-xs text-smoke">{g.tag}</p>
                </div>
                {m?.played ? (
                  <Link
                    to={`/game?daily=${g.mode}`}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-green-100 px-3.5 py-1.5 text-xs font-semibold text-green-700 transition-transform hover:scale-105"
                  >
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 12l5 5L20 6" /></svg>
                    Played
                  </Link>
                ) : (
                  <Link to={`/game?daily=${g.mode}`} className="btn-primary shrink-0 !px-4 !py-1.5 text-xs">
                    Play
                  </Link>
                )}
              </div>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-50 bg-cloud/40 px-5 py-2.5">
          <p className="flex items-center gap-2 text-xs text-smoke">
            <span className="relative flex h-2 w-2" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
            {playersToday == null
              ? 'Checking who has played today…'
              : playersToday === 0
                ? 'No one has played yet today. Set the time to beat!'
                : `${playersToday} creator${playersToday === 1 ? ' has' : 's have'} played today`}
          </p>
          <p className="text-[11px] text-smoke">New puzzles in {nextIn}</p>
        </div>
      </div>
    </section>
  )
}
