import { useCallback, useEffect, useState } from 'react'
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
 * TWO KINDS OF STREAK, AND BOTH ARE REAL.
 *
 * Ethan: "streak should be counted separate for each daily puzzle but
 * accumulated, as in if I play just 1 game from the games every day, the streak
 * on the card at the top will be counted."
 *
 *   `streakDays`      every day you played ANYTHING. This is the accumulated
 *                     one, the number on the big card, and one puzzle a day
 *                     keeps it - which is the promise the card has to make or
 *                     nobody would start.
 *   `daysByPuzzle`    the same thing per puzzle, so Flight Path can say "9 days
 *                     in a row" about itself. A per-puzzle run is a different
 *                     and harder thing than the overall one, which is exactly
 *                     why it is worth showing separately rather than folding
 *                     into a single number that hides it.
 *
 * @returns {{ today: number, played: Set<string>, counts: Record<string, number>|null,
 *             streakDays: number[], daysByPuzzle: Record<string, number[]> }}
 */
export function useDailyPuzzles(userId) {
  const [today] = useState(() => ukDayIndex())
  const [played, setPlayed] = useState(() => new Set())
  const [counts, setCounts] = useState(null)
  const [streakDays, setStreakDays] = useState([])
  const [daysByPuzzle, setDaysByPuzzle] = useState({})
  // Bumped by `markPlayed`. It is what re-runs the server query below, so a
  // puzzle finished in this session updates the counts other people can see
  // ("11 creators played it today") as well as your own tick.
  const [nudge, setNudge] = useState(0)

  // Read this device's record of today, whatever is in it right now.
  const readLocal = useCallback(() => {
    const done = new Set()
    for (const p of DAILY_PUZZLES) {
      try {
        if (JSON.parse(localStorage.getItem(p.store) || 'null')?.day === today) done.add(p.key)
      } catch { /* private mode */ }
    }
    return done
  }, [today])

  useEffect(() => {
    const done = readLocal()
    if (done.size) setPlayed((cur) => new Set([...cur, ...done]))
  }, [readLocal])

  /**
   * A PUZZLE JUST FINISHED. TICK IT NOW.
   *
   * THE BUG THIS FIXES. Both effects here run on mount and never again, which
   * is correct for a page you arrive at and wrong for the games menu, where the
   * puzzle is played WITHOUT leaving the page: the board is a screen swap, not
   * a navigation, so the hook kept the set it built when the menu first opened.
   * Play Flight Path, come back, and the card still says "Play today's puzzle".
   * Ethan: "after I played for example flight path, it didn't immediately
   * update and show that I played it."
   *
   * Optimistic and then verified, in that order and for the usual reason: the
   * tick has to be on the card in the frame the menu comes back, and the truth
   * still has to come from the server (the counts, and a play made on another
   * device). The local read is folded in too, so calling this with no key at
   * all - on a window regaining focus, say - is a full refresh.
   */
  const markPlayed = useCallback((key) => {
    setPlayed((cur) => {
      const next = new Set([...cur, ...readLocal()])
      if (key) next.add(key)
      return next
    })
    setNudge((n) => n + 1)
  }, [readLocal])

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
      // `mode` travels with the day now, so the same one query answers both the
      // accumulated streak and the per-puzzle ones. It was `select('day_key')`,
      // which threw away the only thing that distinguishes them.
      userId
        ? supabase.from('game_scores').select('mode, day_key').eq('player_id', userId).not('day_key', 'is', null)
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
      const perPuzzle = {}
      for (const k of DAILY_KEYS) perPuzzle[k] = new Set()
      for (const m of mine || []) if (perPuzzle[m.mode]) perPuzzle[m.mode].add(m.day_key)
      setDaysByPuzzle(Object.fromEntries(DAILY_KEYS.map((k) => [k, [...perPuzzle[k]]])))
    })
    return () => { alive = false }
  }, [userId, today, nudge])

  // COMING BACK TO THE TAB IS ALSO A REASON TO LOOK AGAIN. Somebody who solved
  // this morning's puzzle on their phone and then switched back to the laptop
  // tab they left open should not be invited to solve it a second time.
  useEffect(() => {
    const onWake = () => { if (document.visibilityState === 'visible') markPlayed() }
    document.addEventListener('visibilitychange', onWake)
    return () => document.removeEventListener('visibilitychange', onWake)
  }, [markPlayed])

  return { today, played, counts, streakDays, daysByPuzzle, markPlayed }
}
