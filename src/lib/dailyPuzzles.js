import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { ukDayIndex, ukDayStartIso } from './daily'

// THE THREE DAILY PUZZLES, IN ONE PLACE.
//
// The games menu and the worldwide hub's "Daily puzzles" section both need the
// same list, the same "have I played this" answer and the same "how many
// creators played it today" count. They used to have two of each: the hub's
// callout carried its own two-entry array and its own tally query, and the menu
// read localStorage only. So the hub could offer a puzzle the menu had already
// ticked, and adding a third puzzle meant remembering both.
//
// Living in lib rather than in Game.jsx matters: the hub must not import the
// games page to find out what a daily puzzle is. Game.jsx pulls in the world
// atlas and every quiz mode with it.

export const DAILY_PUZZLES = [
  {
    key: 'pinpoint',
    icon: 'magnifier',
    title: 'Guess the Country',
    text: 'Five clues, one country. Ask for fewer and score more.',
    short: 'Five clues, one country.',
    store: 'tryp_pinpoint',
  },
  {
    key: 'zip',
    icon: 'plane-tryp',
    title: 'Flight Path',
    text: 'Fly through every stop in order and fill the whole sky.',
    short: 'Fly through every stop in order.',
    store: 'tryp_zip',
  },
  {
    key: 'languages',
    icon: 'chat',
    title: 'Guess the language',
    text: 'Ten phrases in their own scripts. Name the language behind each.',
    short: 'Ten phrases, ten scripts.',
    store: 'tryp_languages',
  },
]

export const DAILY_KEYS = DAILY_PUZZLES.map((p) => p.key)

/**
 * Which of today's puzzles this creator has played, and how many creators have
 * played each one today.
 *
 * TWO SOURCES, IN THIS ORDER, AND BOTH ARE NEEDED.
 *
 *   localStorage  answers instantly, with no round trip, so the ticks are on
 *                 the cards in the first paint rather than a beat later.
 *   the server    is the TRUTH. localStorage is per device, and somebody who
 *                 solved a puzzle on their phone at breakfast must not be
 *                 invited to solve it again on a laptop at lunch.
 *
 * The two are unioned rather than one overriding the other: a play recorded
 * either place is a play.
 *
 * @returns {{ today: number, played: Set<string>, counts: Record<string, number>|null, streakDays: number[] }}
 */
export function useDailyPuzzles(userId) {
  const [today] = useState(() => ukDayIndex())
  const [played, setPlayed] = useState(() => new Set())
  const [counts, setCounts] = useState(null)
  const [streakDays, setStreakDays] = useState([])

  useEffect(() => {
    const done = new Set()
    for (const p of DAILY_PUZZLES) {
      try {
        if (JSON.parse(localStorage.getItem(p.store) || 'null')?.day === today) done.add(p.key)
      } catch { /* private mode */ }
    }
    if (done.size) setPlayed((cur) => new Set([...cur, ...done]))
  }, [today])

  useEffect(() => {
    let alive = true
    Promise.all([
      // Everyone's plays today, per puzzle. `is_test` is filtered exactly the
      // way the leaderboards filter it, so the number on a card and the number
      // of rows on the board can never disagree.
      // `day_key` not null is what makes a row a DAILY play. Guess the language
      // spent a while as a practice mode you could replay, and those old rows
      // carry the same `mode`; without this filter a practice round somebody
      // played this morning would be counted as today's puzzle and would tick
      // their card green for a puzzle they have not opened.
      supabase.from('game_scores')
        .select('mode, player_id, profiles:player_id(is_test)')
        .in('mode', DAILY_KEYS)
        .eq('day_key', ukDayIndex())
        .gte('created_at', ukDayStartIso()),
      userId
        ? supabase.from('game_scores').select('day_key').eq('player_id', userId).not('day_key', 'is', null)
        : Promise.resolve({ data: [] }),
    ]).then(([{ data: rows }, { data: mine }]) => {
      if (!alive) return
      const tally = {}
      const seen = new Set()
      const done = new Set()
      for (const r of rows || []) {
        if (r.player_id === userId) done.add(r.mode)
        if (r.profiles?.is_test) continue
        // One person is one play, however many times they opened it.
        const k = `${r.mode}:${r.player_id}`
        if (seen.has(k)) continue
        seen.add(k)
        tally[r.mode] = (tally[r.mode] || 0) + 1
      }
      setCounts(tally)
      if (done.size) setPlayed((cur) => new Set([...cur, ...done]))
      setStreakDays([...new Set((mine || []).map((m) => m.day_key))])
    })
    return () => { alive = false }
  }, [userId, today])

  return { today, played, counts, streakDays }
}
