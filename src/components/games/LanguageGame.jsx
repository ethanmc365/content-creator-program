import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { dailyLanguageRound, DAILY_LANGUAGE_ROUNDS } from '../../lib/languages'
import { ukDayIndex, ukDayStartIso, untilNextUkMidnight, dailyStreak } from '../../lib/daily'
import { cx } from '../../lib/utils'
import Icon from '../Icon'
import { Badge, Confetti, StreakChip } from '../ui'
import GameChrome, { AnswerFlash } from './GameChrome'
import { playCorrect, playWrong, playCelebrate, playCommiserate } from '../../lib/gameSounds'
import { useT } from '../../lib/i18n'

// GUESS THE LANGUAGE: read a phrase, name the language. NOW A DAILY PUZZLE.
//
// Renamed from "Say hello" at Ethan's request, and the new name is the better
// one: the old one described the phrases (they are greetings) rather than the
// task, so a creator scanning the menu could not tell what they were being
// asked to do.
//
// WHY IT MOVED TO THE DAILY SHELF. It was a practice mode you could replay all
// evening, which is the format that makes a bank of 34 languages feel finite
// fast. As one of three puzzles a day it is the opposite: ten phrases, once,
// the same ten everybody else got, and a leaderboard that means something
// because everyone answered the same questions. That is Ethan's call and it is
// the right one - this game was always more of a shared thing to talk about
// than a score to grind.
//
// The shape is deliberately the opposite way round from the rest of the games
// here. Flags, airports and currencies all start from a COUNTRY and ask you to
// recall a fact about it. This starts from something a person would actually
// say, and the country only turns up afterwards as context - because a language
// is not a country, and a quiz that pairs one flag with one language would be
// quietly teaching something untrue about Spanish, Portuguese, Arabic and
// French all at once.
//
// Answering reveals the translation, the script, and where it is spoken, so a
// wrong guess is still worth something. That is the whole design goal: this is a
// travel community, and "what does that say" is a more useful thing to learn
// than "which flag was that".

const STORE_KEY = 'tryp_languages'

// A phrase in a script most readers cannot size by eye needs a bigger type size
// to be legible, and Latin text at that size looks like shouting. Set per
// script rather than per language so a new language inherits the right one.
const SCRIPT_SIZE = {
  Latin: 'text-3xl sm:text-4xl',
  Greek: 'text-3xl sm:text-4xl',
  Cyrillic: 'text-3xl sm:text-4xl',
  Hebrew: 'text-4xl sm:text-5xl',
  Arabic: 'text-4xl sm:text-5xl',
  Devanagari: 'text-4xl sm:text-5xl',
  Thai: 'text-4xl sm:text-5xl',
  Japanese: 'text-4xl sm:text-5xl',
  Hangul: 'text-4xl sm:text-5xl',
  Chinese: 'text-5xl sm:text-6xl',
}
// Arabic and Hebrew are written right to left. Getting this wrong does not
// merely look wrong, it renders punctuation on the wrong end of the line.
const RTL = new Set(['Arabic', 'Hebrew'])

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

// A LINE THAT REACTS TO WHAT ACTUALLY HAPPENED, the same ladder the quiz modes
// use, so ten out of ten reads the same way whichever game you got it in.
function verdict(pct) {
  if (pct === 100) return { title: 'Every single one', line: 'Ten scripts, ten languages, no mistakes.' }
  if (pct >= 90) return { title: 'One away', line: 'That is a very good ear.' }
  if (pct >= 70) return { title: 'Strong round', line: 'Comfortably above the middle on a hard set.' }
  if (pct >= 50) return { title: 'Halfway there', line: 'More right than wrong, on ten alphabets.' }
  if (pct >= 25) return { title: 'A tricky set', line: 'Some of these look nothing like they sound.' }
  return { title: 'A rough one', line: 'Everybody has these. Tomorrow is ten new phrases.' }
}

export default function LanguageGame({ onExit }) {
  const tr = useT()
  const { user } = useAuth()
  const [day] = useState(() => ukDayIndex())
  const [nextIn] = useState(() => untilNextUkMidnight(Date.now()))
  // THE SAME TEN FOR EVERYBODY. Built once, from the date, so a re-render
  // cannot reshuffle the answers under a player mid-round.
  const [questions] = useState(() => dailyLanguageRound(day))

  const stored = useState(() => loadStored(day))[0]
  const [i, setI] = useState(0)
  const [picked, setPicked] = useState(null)
  // Open on the puzzle, and bring the explanation into view when it appears -
  // it is what you answered FOR, and it lands below the fold otherwise.
  const cardRef = useRef(null)
  const answerRef = useRef(null)
  useEffect(() => {
    if (!picked || !answerRef.current) return
    const t = setTimeout(
      () => answerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }),
      160,
    )
    return () => clearTimeout(t)
  }, [picked])
  const [correct, setCorrect] = useState(0)
  const [done, setDone] = useState(stored ? { correct: stored.correct, total: stored.total, timeMs: stored.timeMs } : null)
  const [checking, setChecking] = useState(!stored)
  // NOBODY SCROLLS THE CARD INTO VIEW ANY MORE, AND THAT IS THE FIX.
  //
  // Ethan: "when clicking on the language game it immediately opens [part way
  // down] - it should have been at the top, so I could view the time, the
  // number of questions, and then still be able to click the phrase."
  //
  // There were TWO mechanisms trying to place this page and they disagreed.
  // Game.jsx scrolls the WINDOW to zero whenever the screen changes, which is
  // right and cannot be wrong: when a game is up the menu is unmounted, so the
  // game IS the top of the page. `useOpenOnGame` then smooth-scrolled the
  // card's own top to the top of the viewport, which is a different place -
  // past the page heading and the round header - and it ran late enough (two
  // frames, then a 300ms animation) to win. It also had to fight the two
  // leaderboards loading in underneath and Chrome's scroll anchoring. Measured
  // at 375px: the round header ended up 332px ABOVE the top of the screen.
  //
  // The hook is gone from all three daily puzzles. Game.jsx's `scrollTo(0)` was
  // always the one that could not be wrong; the note there says as much.
  const [streakDays, setStreakDays] = useState([])
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef(0)
  const elapsedRef = useRef(0)
  const savedRef = useRef(!!stored)
  // How many right in a row, for the rising answer tone. See `choose`.
  const runRef = useRef(0)

  // ONE ROUND A DAY, AND THE SERVER IS THE ONE THAT KNOWS. localStorage answers
  // instantly but is per device; somebody who played on their phone at
  // breakfast must not be handed a fresh round on their laptop at lunch. The
  // partial unique index on (player, mode, day_key) is the real lock.
  useEffect(() => {
    if (stored) return undefined
    let alive = true
    supabase.from('game_scores')
      .select('correct, total, time_ms')
      .eq('player_id', user.id).eq('mode', 'languages').eq('day_key', day)
      .gte('created_at', ukDayStartIso())
      .limit(1)
      .then(({ data }) => {
        if (!alive) return
        const row = data?.[0]
        if (row) {
          savedRef.current = true
          setDone({ correct: row.correct, total: row.total, timeMs: row.time_ms })
        }
        setChecking(false)
      })
    return () => { alive = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (done || checking) return undefined
    startRef.current = Date.now()
    const t = setInterval(() => {
      elapsedRef.current = Date.now() - startRef.current
      setElapsed(elapsedRef.current)
    }, 250)
    return () => clearInterval(t)
  }, [done, checking])

  useEffect(() => {
    supabase.from('game_scores')
      .select('day_key')
      .eq('player_id', user.id).eq('mode', 'languages').not('day_key', 'is', null)
      .then(({ data }) => setStreakDays((data ?? []).map((r) => r.day_key)))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const streak = dailyStreak(done ? [...streakDays, day] : streakDays, day)

  const q = questions[i]
  const last = i === questions.length - 1

  const finish = useCallback((finalCorrect) => {
    const timeMs = elapsedRef.current
    const result = { correct: finalCorrect, total: questions.length, timeMs }
    setDone(result)
    // 60% is the line: below it you got most of them wrong, and celebrating
    // that would be the app not paying attention.
    if ((finalCorrect / questions.length) * 100 >= 60) playCelebrate()
    else playCommiserate()
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ day, ...result }))
    } catch { /* private mode */ }
    if (savedRef.current) return
    savedRef.current = true
    supabase.from('game_scores').insert({
      player_id: user.id, mode: 'languages', region: 'Daily', day_key: day,
      correct: finalCorrect, total: questions.length, time_ms: timeMs,
    }).then(() => {})
  }, [day, questions.length, user.id])

  const choose = (lang) => {
    if (picked || done) return
    const isRight = lang.code === q.answer.code
    if (isRight) setCorrect((c) => c + 1)
    setPicked(lang)
    // Fired here rather than in an effect: this is a direct response to a tap,
    // which is exactly the gesture the browser's autoplay policy wants to see.
    //
    // THE RUN IS AUDIBLE. `playCorrect` transposes itself up a semitone per
    // consecutive hit, so a streak is something you hear climbing rather than
    // six identical beeps. A miss resets it, and the drop back to the root is
    // the "you lost it". Counted in a ref because it is not rendered and must
    // not restart on a re-render. This mode does not use `useAnswerSound` (it
    // answers on the tap rather than off an `answered` object), so it keeps its
    // own counter - same rule, two lines.
    if (isRight) { runRef.current += 1; playCorrect(runRef.current) }
    else { runRef.current = 0; playWrong() }
  }

  const next = useCallback(() => {
    if (last) {
      // `correct` already counts the answer just given: setCorrect ran on the
      // tap, and this button only exists once an answer is in.
      finish(correct)
      return
    }
    setI((n) => n + 1)
    setPicked(null)
  }, [last, correct, finish])

  // Enter moves on once you have answered, so a fast player never has to reach
  // for the mouse between rounds.
  useEffect(() => {
    if (!picked || done) return undefined
    const onKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); next() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [picked, next, done])

  if (checking) {
    return (
      <div className="card !py-16 text-center text-sm text-smoke">{tr("Checking today&rsquo;s puzzle…")}</div>
    )
  }

  if (done) {
    const pct = Math.round((done.correct / done.total) * 100)
    const v = verdict(pct)
    return (
      <div className="card flex flex-col items-center gap-4 !py-10 text-center animate-pop-in">
        {pct >= 80 && <Confetti count={50} />}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Badge tone="light"><Icon name="chat" className="h-3.5 w-3.5" /> {tr("Guess the language")}</Badge>
          {streak > 0 && <StreakChip n={streak} />}
        </div>

        <div className="relative">
          <svg viewBox="0 0 120 120" className="h-28 w-28 -rotate-90" aria-hidden>
            <circle cx="60" cy="60" r="52" fill="none" stroke="#ECECEE" strokeWidth="10" />
            <circle
              cx="60" cy="60" r="52" fill="none" stroke="#d94407" strokeWidth="10" strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 52}
              strokeDashoffset={2 * Math.PI * 52 * (1 - pct / 100)}
              style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)' }}
            />
          </svg>
          <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
            <span className="text-2xl font-bold tabular-nums">{done.correct}<span className="text-smoke">/{done.total}</span></span>
            <span className="mt-1 text-[11px] font-semibold uppercase tracking-widest text-brand">{pct}%</span>
          </span>
        </div>

        <div>
          <h2 className="text-2xl font-bold">{v.title}</h2>
          <p className="mt-1 max-w-sm text-sm text-smoke">{v.line}</p>
        </div>

        {done.timeMs > 0 && <Badge tone="light"><Icon name="clock" className="h-3.5 w-3.5" /> {fmtTime(done.timeMs)}</Badge>}
        <p className="text-xs text-smoke">Ten new phrases in {nextIn}</p>
        <button onClick={onExit} className="btn-secondary mt-2">{tr("Back to games")}</button>
      </div>
    )
  }

  if (!q) return null

  const right = picked?.code === q.answer.code

  return (
    <div ref={cardRef} className="space-y-5">
      {/* The same header every other mode has. This game's own progress bar was
          the one Ethan liked, so it became the shared one rather than staying
          the exception. */}
      <GameChrome
        icon="chat"
        title={tr("Guess the language")}
        tag="Daily"
        done={picked ? i + 1 : i}
        total={questions.length}
        correct={correct}
        time={fmtTime(elapsed)}
        onQuit={onExit}
      />

      <AnswerFlash
        key={`l${i}`}
        state={picked ? (right ? 'right' : 'wrong') : null}
        // TIGHTER ON A PHONE. Ethan: "the languages game, making a phrase and
        // reading it needs a scroll each way." A 40px-padded card holding a
        // large phrase block, four stacked answers and then an explanation is
        // well over one screen at 375px, so playing a single question meant
        // scrolling down to answer and scrolling again to read what it meant.
        className="card flex flex-col items-center gap-5 !py-6 text-center sm:gap-7 sm:!py-10"
      >
        <div className="w-full">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-smoke sm:mb-4">
            {tr("What language is this?")}
          </p>
          {/* The phrase card. `key` on the animation wrapper so each new phrase
              plays the entrance again rather than swapping in place. */}
          <div
            key={`${i}-${q.phrase.text}`}
            className="mx-auto inline-block max-w-full animate-fade-up rounded-2xl bg-gradient-to-br from-brand to-brand-light px-5 py-4 text-white shadow-lift sm:px-10 sm:py-8"
          >
            <p
              dir={RTL.has(q.answer.script) ? 'rtl' : 'ltr'}
              lang={q.answer.code}
              className={cx('font-bold leading-tight', SCRIPT_SIZE[q.answer.script] || SCRIPT_SIZE.Latin)}
            >
              {q.phrase.text}
            </p>
          </div>
        </div>

        {/* ALWAYS FOUR, IN A 2x2. `buildQuestion` guarantees the four; the grid
            is fixed at two columns so the block is the same shape on every
            question and nothing below it moves as you play. */}
        {/* TWO COLUMNS AT EVERY WIDTH. A language name is one short word, so
            four of them stacked in a single column spent four rows saying what
            fits in two - and those two rows are most of the scroll. */}
        <div className="grid w-full max-w-lg grid-cols-2 gap-2.5">
          {q.choices.map((c) => {
            const isAnswer = c.code === q.answer.code
            const isPicked = picked?.code === c.code
            return (
              <button
                key={c.code}
                onClick={() => choose(c)}
                disabled={!!picked}
                className={cx(
                  'flex items-center justify-center gap-2 rounded-2xl border px-4 py-3.5 text-sm font-semibold transition-all duration-200',
                  !picked && 'border-gray-200 hover:-translate-y-0.5 hover:border-brand hover:shadow-card active:translate-y-0',
                  picked && isAnswer && '!border-green-500 bg-green-50 text-green-700',
                  picked && isPicked && !isAnswer && '!border-red-400 bg-red-50 text-red-600',
                  picked && !isAnswer && !isPicked && 'border-gray-100 opacity-45',
                )}
              >
                {picked && isAnswer && <Icon name="check" className="h-4 w-4 shrink-0" />}
                {c.name}
              </button>
            )
          })}
        </div>

        {/* THE ANSWER IS WORTH MORE THAN RIGHT OR WRONG.
            What it means, how to say it, and where it is spoken. A quiz that
            only scores you teaches nothing; this is the part a traveller in a
            community of travellers actually keeps. */}
        {picked && (
          <div ref={answerRef} className="w-full max-w-lg animate-fade-up space-y-3 border-t border-gray-100 pt-5 sm:pt-6">
            <p className={cx('text-sm font-bold', right ? 'text-green-600' : 'text-red-500')}>
              {right ? 'Correct' : `It was ${q.answer.name}`}
            </p>
            <p className="text-lg font-semibold text-ink">
              &ldquo;{q.phrase.meaning}&rdquo;
            </p>
            {q.phrase.roman && (
              <p className="text-sm text-smoke">
                {tr("Said like:")} <span className="font-medium text-ink">{q.phrase.roman}</span>
              </p>
            )}
            <p className="text-xs text-smoke">
              {q.answer.name} is spoken in {q.answer.where}
              {q.answer.script !== 'Latin' ? `, written in ${q.answer.script} script` : ''}.
            </p>
            <button onClick={next} className="btn-primary mt-2 !px-8">
              {last ? 'See your score' : 'Next phrase'} →
            </button>
          </div>
        )}
      </AnswerFlash>
    </div>
  )
}

export { DAILY_LANGUAGE_ROUNDS }
