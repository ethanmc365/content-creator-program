import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildQuestion, languagesForRegion } from '../../lib/languages'
import { cx } from '../../lib/utils'
import Icon from '../Icon'
import GameChrome, { AnswerFlash } from './GameChrome'
import { playCorrect, playWrong } from '../../lib/gameSounds'

// GUESS THE LANGUAGE: read a phrase, name the language.
//
// Renamed from "Say hello" at Ethan's request, and the new name is the better
// one: the old one described the phrases (they are greetings) rather than the
// task, so a creator scanning the menu could not tell what they were being asked
// to do. It also lost its continent split in the same pass - the bank is 34
// languages and the pleasure of it is meeting one you have never seen, which
// filtering to Europe removes.
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

const ROUNDS = 10

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

export default function LanguageGame({ onFinish, onQuit }) {
  // WORLD, ALWAYS. See the note at the top of the file.
  const pool = useMemo(() => languagesForRegion('World'), [])
  // Questions are built once, up front. Building them per round would call
  // Math.random during a render, which is both a lint error in this repo and a
  // real bug: any re-render would silently reshuffle the answers under you.
  const [questions] = useState(() => {
    const out = []
    const seen = new Set()
    let guard = 0
    while (out.length < ROUNDS && guard++ < ROUNDS * 40) {
      const q = buildQuestion(pool)
      const key = `${q.answer.code}:${q.phrase.text}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(q)
    }
    return out
  })

  const [i, setI] = useState(0)
  const [picked, setPicked] = useState(null)
  const [correct, setCorrect] = useState(0)
  // The leaderboard ranks by score then speed, so a round has to be timed like
  // every other mode. Stamped in an effect rather than during render: reading
  // the clock in render is impure and this repo's lint rule catches it.
  const [startedAt, setStartedAt] = useState(0)
  useEffect(() => { setStartedAt(Date.now()) }, [])
  const q = questions[i]
  const last = i === questions.length - 1

  const choose = (lang) => {
    if (picked) return
    const isRight = lang.code === q.answer.code
    if (isRight) setCorrect((c) => c + 1)
    setPicked(lang)
    // Fired here rather than in an effect: this is a direct response to a tap,
    // which is exactly the gesture the browser's autoplay policy wants to see.
    if (isRight) playCorrect()
    else playWrong()
  }

  const next = useCallback(() => {
    if (last) {
      onFinish?.({
        correct,
        total: questions.length,
        time_ms: startedAt ? Date.now() - startedAt : 0,
      })
      return
    }
    setI((n) => n + 1)
    setPicked(null)
  }, [last, onFinish, correct, questions.length, startedAt])

  // Enter moves on once you have answered, so a fast player never has to reach
  // for the mouse between rounds.
  useEffect(() => {
    if (!picked) return undefined
    const onKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); next() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [picked, next])

  if (!q) return null

  const right = picked?.code === q.answer.code

  return (
    <div className="space-y-5">
      {/* The same header every other mode now has. This game's own progress bar
          was the one Ethan liked, so it became the shared one rather than
          staying the exception. */}
      <GameChrome
        icon="chat"
        title="Guess the language"
        done={picked ? i + 1 : i}
        total={questions.length}
        correct={correct}
        time={null}
        onQuit={onQuit}
      />

      <AnswerFlash
        key={`l${i}`}
        state={picked ? (right ? 'right' : 'wrong') : null}
        className="card flex flex-col items-center gap-7 !py-10 text-center"
      >
        <div className="w-full">
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-smoke">
            What language is this?
          </p>
          {/* The phrase card. `key` on the animation wrapper so each new phrase
              plays the entrance again rather than swapping in place. */}
          <div
            key={`${i}-${q.phrase.text}`}
            className="mx-auto inline-block max-w-full animate-fade-up rounded-2xl bg-gradient-to-br from-brand to-brand-light px-7 py-6 text-white shadow-lift sm:px-10 sm:py-8"
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

        <div className="grid w-full max-w-lg grid-cols-1 gap-2.5 sm:grid-cols-2">
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
          <div className="w-full max-w-lg animate-fade-up space-y-3 border-t border-gray-100 pt-6">
            <p className={cx('text-sm font-bold', right ? 'text-green-600' : 'text-red-500')}>
              {right ? 'Correct' : `It was ${q.answer.name}`}
            </p>
            <p className="text-lg font-semibold text-ink">
              &ldquo;{q.phrase.meaning}&rdquo;
            </p>
            {q.phrase.roman && (
              <p className="text-sm text-smoke">
                Said like: <span className="font-medium text-ink">{q.phrase.roman}</span>
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
