import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// ONE STREAK, ONE DEFINITION, ONE PLACE IT IS WORKED OUT.
//
// THE BUG THIS FIXES. The hub's pill said "8 days" and the games page said "36"
// on the same afternoon, for the same person. Ethan: "why is it only an 8 day
// streak if I then click in and it says 36 day streak on the games section."
//
// They were not disagreeing about the arithmetic, they were answering two
// different questions:
//
//   THE HUB counted only the three DAILY PUZZLES, client-side, from the
//   viewer's own puzzle history, and applied no freezes.
//   THE GAMES PAGE called `my_game_streak`, which counts EVERY game in
//   `game_scores` - practice modes included - and honours streak freezes.
//
// The rule Ethan wrote is the second one: "you have to play at least one travel
// game every day for your streak to go up, this can be daily puzzle game or
// another travel game." So the server is right and the hub was undercounting,
// which is why the smaller number was the one that looked wrong to him.
//
// Everything reads this now. A number that appears on two screens must not be
// computed twice, whatever the two answers happen to be.
//
// (`dailyStreak` in lib/daily still exists and is still correct - it is what
// each individual puzzle card uses to say "9 days in a row" about ITSELF, which
// is a genuinely per-puzzle question. It is no longer used for the overall one.)

/** @returns {{ streak: number, best: number, freezesLeft: number, frozenDays: number[], loading: boolean }} */
export function useGameStreak() {
  const [state, setState] = useState({ streak: 0, best: 0, freezesLeft: 5, frozenDays: [], loading: true })
  useEffect(() => {
    let alive = true
    supabase.rpc('my_game_streak').then(({ data }) => {
      if (!alive) return
      const row = Array.isArray(data) ? data[0] : data
      setState({
        streak: row?.current_streak || 0,
        best: row?.best_streak || 0,
        freezesLeft: row?.freezes_left ?? 5,
        frozenDays: row?.frozen_days || [],
        loading: false,
      })
    })
    return () => { alive = false }
  }, [])
  return state
}

/** How many freezes a creator gets each calendar month. Matches my_game_streak. */
export const FREEZES_PER_MONTH = 5
