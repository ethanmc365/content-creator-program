import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Badge, StreakChip } from '../ui'
import Icon from '../Icon'
import { flagEmoji } from '../../lib/countries'
import { pinpointForDay, pinpointMatches } from '../../lib/pinpoint'
import { ukDayIndex, ukDayStartIso, untilNextUkMidnight, dailyStreak } from '../../lib/daily'
import { cx } from '../../lib/utils'

// Guess the Country: five travel clues revealed one at a time; you get one
// guess per clue, so guessing early scores more. A new puzzle lands at
// midnight UK time, the same for everyone. The score row in game_scores is
// the source of truth for "played today" (so laptop + phone stay in sync);
// localStorage is only a fast-path cache for the guess list.
const MAX_CLUES = 5
const STORE_KEY = 'tryp_pinpoint'

const fmtTime = (ms) => {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function loadStored(day) {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null')
    return s && s.day === day ? s : null
  } catch { return null }
}

export default function PinpointGame({ onExit }) {
  const { user } = useAuth()
  const [day] = useState(() => ukDayIndex())
  const [nextIn] = useState(() => untilNextUkMidnight(Date.now()))
  const country = pinpointForDay(day)

  const stored = useState(() => loadStored(day))[0]
  const [clues, setClues] = useState(stored ? MAX_CLUES : 1) // revealed count
  const [guesses, setGuesses] = useState(stored?.guesses ?? [])
  const [typed, setTyped] = useState('')
  const [outcome, setOutcome] = useState(stored?.outcome ?? null) // 'won' | 'lost'
  const [wonOnClue, setWonOnClue] = useState(stored?.wonOnClue ?? null)
  const [checking, setChecking] = useState(!stored) // true while we ask the server
  const [shake, setShake] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [streakDays, setStreakDays] = useState([]) // my past day_keys for this game
  const startRef = useRef(0)
  const elapsedRef = useRef(0) // precise copy for handlers (purity-lint safe)
  const savedRef = useRef(!!stored)

  // Server check: did this account already play today on ANY device? The
  // day_key unique index also blocks a second insert server-side.
  useEffect(() => {
    if (stored) return
    let alive = true
    supabase.from('game_scores')
      .select('correct, total, time_ms')
      .eq('player_id', user.id).eq('mode', 'pinpoint').eq('day_key', day)
      .gte('created_at', ukDayStartIso())
      .limit(1)
      .then(({ data }) => {
        if (!alive) return
        const row = data?.[0]
        if (row) {
          savedRef.current = true
          if (row.correct > 0) {
            setOutcome('won')
            setWonOnClue(MAX_CLUES + 1 - row.correct)
          } else {
            setOutcome('lost')
          }
          setClues(MAX_CLUES)
        }
        setChecking(false)
      })
    return () => { alive = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (outcome || checking) return
    startRef.current = Date.now()
    const tick = () => {
      elapsedRef.current = Date.now() - startRef.current
      setElapsed(elapsedRef.current)
    }
    const t = setInterval(tick, 250)
    return () => clearInterval(t)
  }, [outcome, checking])

  // My daily streak for this game (consecutive UK days played).
  useEffect(() => {
    supabase.from('game_scores')
      .select('day_key')
      .eq('player_id', user.id).eq('mode', 'pinpoint').not('day_key', 'is', null)
      .then(({ data }) => setStreakDays((data ?? []).map((r) => r.day_key)))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const streak = dailyStreak(outcome ? [...streakDays, day] : streakDays, day)

  function finish(result, guessed, wrongGuesses, time_ms) {
    setOutcome(result)
    setWonOnClue(guessed)
    localStorage.setItem(STORE_KEY, JSON.stringify({ day, outcome: result, wonOnClue: guessed, guesses: wrongGuesses }))
    if (savedRef.current) return
    savedRef.current = true
    // Score: 5 points for a first-clue solve down to 1 on the last, 0 for a miss.
    supabase.from('game_scores').insert({
      player_id: user.id, mode: 'pinpoint', region: 'Daily', day_key: day,
      correct: result === 'won' ? MAX_CLUES + 1 - guessed : 0, total: MAX_CLUES, time_ms,
    }).then(() => {})
  }

  function submit(e) {
    e.preventDefault()
    const guess = typed.trim()
    if (!guess || outcome || checking) return
    const time_ms = elapsedRef.current
    if (pinpointMatches(country, guess)) {
      finish('won', clues, guesses, time_ms)
    } else {
      const next = [...guesses, guess]
      setGuesses(next)
      setTyped('')
      setShake(true)
      setTimeout(() => setShake(false), 450)
      if (clues >= MAX_CLUES) finish('lost', null, next, time_ms)
      else setClues((c) => c + 1)
    }
  }

  const done = !!outcome

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex flex-wrap items-center gap-2">
          <Badge tone="light"><Icon name="question" className="h-3.5 w-3.5" /> Guess the Country · Daily puzzle</Badge>
          <StreakChip n={streak} title={`${streak}-day daily streak`} />
        </span>
        <div className="flex items-center gap-5">
          <div className="text-center leading-tight">
            <span className="block text-[10px] font-medium uppercase tracking-wide text-smoke">Clue</span>
            <span className="block text-sm font-semibold tabular-nums text-ink">{Math.min(clues, MAX_CLUES)} / {MAX_CLUES}</span>
          </div>
          {!done && (
            <div className="text-center leading-tight">
              <span className="block text-[10px] font-medium uppercase tracking-wide text-smoke">Time</span>
              <span className="block font-mono text-sm font-semibold tabular-nums text-ink">{fmtTime(elapsed)}</span>
            </div>
          )}
          <button onClick={onExit} className="text-xs font-medium text-smoke hover:text-brand">Back to games</button>
        </div>
      </div>

      <div className="card flex flex-col items-center gap-6 !py-10 text-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-smoke">Guess the country</p>
          <p className="mt-1 text-sm text-smoke">Five clues, one guess per clue. The earlier you get it, the more points.</p>
        </div>

        {/* Clue words: revealed ones pop in, the rest wait as locked slots. */}
        <div className="flex w-full max-w-md flex-col gap-2.5">
          {country.words.map((w, i) => {
            const revealed = i < clues || done
            return revealed ? (
              <div key={w} className="animate-pop-in rounded-2xl bg-brand-tint px-5 py-3 text-lg font-semibold text-brand">
                {w}
              </div>
            ) : (
              <div key={w} className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-200 px-5 py-3 text-sm font-medium text-gray-300">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
                Clue {i + 1}
              </div>
            )
          })}
        </div>

        {!done && !checking && (
          <form onSubmit={submit} className={cx('flex w-full max-w-sm flex-col items-center gap-3', shake && 'animate-shake')}>
            <input
              type="search" inputMode="text" enterKeyHint="go" value={typed} onChange={(e) => setTyped(e.target.value)}
              placeholder="Type a country…" className="input text-center text-lg"
              name="country-guess" autoComplete="off" autoCorrect="off" autoCapitalize="words" spellCheck="false"
              aria-label="Your country guess"
            />
            <button type="submit" className="btn-primary w-full">Guess</button>
          </form>
        )}
        {checking && <p className="text-sm text-smoke">Checking today's puzzle…</p>}

        {guesses.length > 0 && !done && (
          <div className="flex flex-wrap justify-center gap-2">
            {guesses.map((g, i) => (
              <span key={i} className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-500 line-through">{g}</span>
            ))}
          </div>
        )}

        {done && (
          <div className="flex flex-col items-center gap-3 animate-fade-up">
            <span className="text-6xl leading-none" aria-hidden>{flagEmoji(country.iso2)}</span>
            {outcome === 'won' ? (
              <>
                <p className="text-xl font-bold text-green-600">It's {country.name}!</p>
                {wonOnClue != null && (
                  <p className="text-sm text-smoke">
                    Guessed in {wonOnClue} word{wonOnClue === 1 ? '' : 's'}
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-xl font-bold text-red-600">It was {country.name}</p>
                <p className="text-sm text-smoke">Better luck tomorrow!</p>
              </>
            )}
            <p className="text-xs text-smoke">New puzzle at midnight UK time · {nextIn}</p>
            <button onClick={onExit} className="btn-secondary mt-1">Back to games</button>
          </div>
        )}
      </div>
    </div>
  )
}
