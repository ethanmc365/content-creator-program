import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Badge, StreakChip } from '../ui'
import Icon from '../Icon'
import { flagEmoji } from '../../lib/countries'
import { useScrollCardIntoView } from '../../lib/gameFocus'
import PuzzleChrome from './PuzzleChrome'
import { pinpointForDay, pinpointMatches } from '../../lib/pinpoint'
import { ukDayIndex, ukDayStartIso, untilNextUkMidnight, dailyStreak } from '../../lib/daily'
import { cx } from '../../lib/utils'
import { NO_AUTOFILL_SEARCH } from '../../lib/noAutofill'
import { playCelebrate, playCommiserate, playWrong } from '../../lib/gameSounds'
import { useT } from '../../lib/i18n'

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
  const tr = useT()
  const { user } = useAuth()
  const [day] = useState(() => ukDayIndex())
  const [nextIn] = useState(() => untilNextUkMidnight(Date.now()))
  const country = pinpointForDay(day)

  const stored = useState(() => loadStored(day))[0]
  const [clues, setClues] = useState(stored ? MAX_CLUES : 1) // revealed count
  const [guesses, setGuesses] = useState(stored?.guesses ?? [])
  const [typed, setTyped] = useState('')
  const cardRef = useRef(null)
  const formRef = useRef(null)
  // A guess puts the card's HEAD back on screen - the clues, the timer, the
  // Back to games button and the list of what you have already tried. Keeping
  // the FIELD clear of the keyboard is no longer this component's job: it is
  // lib/keyboardFollow, installed once for the whole app, and having both was
  // two mechanisms scrolling one page. See the note in lib/gameFocus.
  const showCard = useScrollCardIntoView(cardRef)
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
    // The same two end-of-round sounds every other game uses, so a daily puzzle
    // does not end in silence while a practice round gets a fanfare.
    if (result === 'won') playCelebrate()
    else playCommiserate()
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
      playWrong()
      const next = [...guesses, guess]
      // The list of wrong guesses grows below the field, so re-centre it - and
      // put the top of the card back on screen first, because a wrong guess is
      // the moment you want to read the clues again.
      showCard()
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
      {/* THE SAME HEADER FLIGHT PATH WEARS (2 Sep 2026).

          Ethan: "the Guess the Country timer bar at the top and the back button
          is different from Flight Path, and I really like the one on Flight
          Path - build it into Guess the Country too."

          What was here was a bare flex row: 14px readouts, no panel, no
          progress, and a Back button that changed its own label at `sm`. Two
          daily puzzles on one page, two headers. `PuzzleChrome` is Flight
          Path's, extracted, and the progress bar finally has something honest
          to show - how far through the five clues you are, which is the one
          number this puzzle had that nothing was drawing. */}
      <PuzzleChrome
        onExit={onExit}
        progress={(Math.min(clues, MAX_CLUES) / MAX_CLUES) * 100}
        chips={(
          <>
            <Badge tone="light" className="!px-2 !py-1 sm:!px-2.5">
              <Icon name="magnifier" className="h-3.5 w-3.5" />
              <span className="sm:hidden">{tr("Daily")}</span>
              <span className="hidden sm:inline">{tr("Guess the Country · Daily puzzle")}</span>
            </Badge>
            <StreakChip n={streak} title={`${streak}-day daily streak`} />
          </>
        )}
        stats={done
          ? [{ label: tr('Clue'), value: `${Math.min(clues, MAX_CLUES)} / ${MAX_CLUES}` }]
          : [
            { label: tr('Clue'), value: `${Math.min(clues, MAX_CLUES)} / ${MAX_CLUES}` },
            { label: tr('Time'), value: fmtTime(elapsed), mono: true },
          ]}
      />

      <div ref={cardRef} className="card flex scroll-mt-2 flex-col items-center gap-4 !py-6 text-center sm:gap-6 sm:!py-10">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-smoke">{tr("Guess the country")}</p>
          <p className="mt-1 text-[13px] text-smoke sm:text-sm">{tr("Five clues, one guess per clue. The earlier you get it, the more points.")}</p>
        </div>

        {/* Clue words: revealed ones pop in, the rest wait as locked slots. */}
        <div className="flex w-full max-w-md flex-col gap-2 sm:gap-2.5">
          {country.words.map((w, i) => {
            const revealed = i < clues || done
            return revealed ? (
              <div key={w} className="animate-pop-in rounded-2xl bg-brand-tint px-5 py-2.5 text-base font-semibold text-brand sm:py-3 sm:text-lg">
                {w}
              </div>
            ) : (
              <div key={w} className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-300 sm:py-3">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
                Clue {i + 1}
              </div>
            )
          })}
        </div>

        {!done && !checking && (
          /* THE BUTTON SITS UNDER THE FIELD, NOT A ROW AWAY FROM IT. Ethan:
             "there's still space where it should be closer to the guess button,
             with just a few millimetres." The other half of that gap was the
             34px of home indicator the keyboard helper used to reserve on every
             device - see lib/gameFocus. */
          <form ref={formRef} onSubmit={submit} className={cx('flex w-full max-w-sm flex-col items-center gap-2', shake && 'animate-shake')}>
            {/* THE HINT IS DRAWN, NOT A `placeholder`, AND THAT IS THE WHOLE
                FIX FOR THE AUTOFILL BAR.
                Ethan: "it automatically shows up autofill contact, which I
                don't want it to. Can you stop Apple from doing that?"
                It can be stopped, but not with `autocomplete="off"` - WebKit
                treats that as advice on any field its own classifier has
                decided is part of an address, and the classifier reads the
                NAME, the LABEL and the PLACEHOLDER. This field was called
                `country-guess`, labelled "Your country guess" and placeheld
                "Type a country…": three separate address tokens on one input,
                which is why `type="search"` alone was not winning. All three
                are gone - the word "country" now appears only in a span the
                classifier cannot read - and the shared NO_AUTOFILL_SEARCH set
                covers the rest. See lib/noAutofill. */}
            <span className="relative w-full">
              <input
                {...NO_AUTOFILL_SEARCH}
                inputMode="text" enterKeyHint="go" value={typed} onChange={(e) => setTyped(e.target.value)}
                // NO BLINKING CARET. Ethan: "I don't want it to show the flashing
                // text bar, I just want the ability to write there without it,
                // because it ruins the aesthetic." `caret-transparent` hides only
                // the insertion bar - focus, typing, selection, autofocus and the
                // mobile keyboard are all untouched, and the centred text still
                // grows visibly as you type, which is what tells you it is taking
                // the letters.
                className="input caret-transparent text-center text-lg"
                name="guess" autoCapitalize="words"
                aria-label={tr("Your guess")}
              />
              {typed === '' && (
                <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center text-lg text-gray-400">
                  {tr("Type a country…")}
                </span>
              )}
            </span>
            <button type="submit" className="btn-primary w-full">{tr("Guess")}</button>
          </form>
        )}
        {checking && <p className="text-sm text-smoke">{tr("Checking today's puzzle…")}</p>}

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
                <p className="text-sm text-smoke">{tr("Better luck tomorrow!")}</p>
              </>
            )}
            <p className="text-xs text-smoke">New puzzle at midnight UK time · {nextIn}</p>
            <button onClick={onExit} className="btn-secondary mt-1">{tr("Back to games")}</button>
          </div>
        )}
      </div>
    </div>
  )
}
