// Daily puzzles and quiz games: the Supabase tables and functions this area owns. Pages call these instead of naming
// tables, so a schema rename or a backend move is a change in this folder. Each accessor returns the same query
// builder / `{ data, error }` as before.
import { supabase } from '../lib/supabase'

export const makeGamesApi = (db = supabase) => ({
  gameEvents: () => db.from('game_events'),
  gameScores: () => db.from('game_scores'),
  gameModeLeaderboard: (args, opts) => db.rpc('game_mode_leaderboard', args, opts),
  myGameStreak: (args, opts) => db.rpc('my_game_streak', args, opts),
  /** A function in this area chosen at run time. */
  call: (fn, args, opts) => db.rpc(fn, args, opts),
})

export const gamesApi = makeGamesApi()
