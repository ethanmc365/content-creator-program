import { useEffect, useRef, useState, useCallback } from 'react'
import { confirm } from '../lib/confirm'
import { useSearchParams, Link } from 'react-router-dom'
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps'
import { loadMapFeatures } from '../lib/mapCountries'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Avatar, Badge, PageHeader, Confetti } from '../components/ui'
import StreakCard from '../components/games/StreakCard'
import Flame from '../components/games/Flame'
import LanguageGame from '../components/games/LanguageGame'
import Reveal from '../components/network/Reveal'
import GameChrome, { AnswerFlash, useAnswerSound } from '../components/games/GameChrome'
import { playCorrect, playWrong, playCelebrate, playCommiserate } from '../lib/gameSounds'
import Icon from '../components/Icon'
import {
  CONTINENTS, countriesForRegion, airportsForRegion, flagEmoji,
  countryMatches, airportMatches, shuffle,
  currencyCountriesForRegion, currencyOptions,
} from '../lib/countries'
import { ukDayIndex, ukDayStartIso, dailyStreak } from '../lib/daily'
import { DAILY_PUZZLES, DAILY_KEYS, useDailyPuzzles } from '../lib/dailyPuzzles'
import PinpointGame from '../components/games/PinpointGame'
import ZipGame from '../components/games/ZipGame'
import { cx } from '../lib/utils'
import { useT } from '../lib/i18n'

const BRAND = '#d94407'
const BRAND_LIGHT = '#f5853f'
const GREEN = '#16a34a'
const RED = '#dc2626'
const UNSELECTED = '#ECECEE'
const QUESTIONS = 10
const REGIONS = ['World', ...CONTINENTS]
// THE COPY IS THE GAME'S FIRST MOVE.
//
// Every one of these used to describe its own mechanics - "See a flag, type the
// country" - which tells you what will happen and gives you no reason to want
// it. A one-line description on a card you are choosing between should say what
// is fun or hard about this one, because that is the question you are actually
// asking. Ten flags is not a challenge; ten flags nobody can tell apart is.
//
// FOUR PRACTICE MODES, AND GUESS THE LANGUAGE IS NOT ONE OF THEM ANY MORE.
// It moved up to the daily shelf (see DAILIES) at Ethan's request, which is
// also what makes this row a clean four.
const MODES = [
  // Plain and factual. The old line ("Some you will know instantly. Some are
  // three stripes and a prayer.") was trying too hard next to three sentences
  // that simply say what the game is, and it read as the odd one out.
  // TWO LINES, like the other three. The box reserves two lines so the cards
  // stay the same height, and a one-line blurb therefore sat in a card with an
  // empty line under it - which is what read as "the Guess the flag card is not
  // the same as the others". It says something true it was not saying anyway:
  // this is the one mode you can narrow to a continent.
  { key: 'flags', icon: 'flag', title: 'Guess the flag', text: 'See the flag, name the country. Pick a continent or take the whole world.', regions: true },
  { key: 'map', icon: 'pin', title: 'Find it on the map', text: 'You know where it is. Now put your finger on it.', regions: true },
  { key: 'airports', icon: 'plane', title: 'Airport codes', text: 'Three letters on a boarding pass. Which city?', regions: true },
  { key: 'currencies', icon: 'cash', title: 'What do they spend?', text: 'Match the country to the money in its tills.', regions: true },
]
const MODE_LABEL = { flags: 'Guess the flag', map: 'Find it on the map', airports: 'Airport codes', currencies: 'What do they spend?', languages: 'Guess the language', pinpoint: 'Guess the Country', zip: 'Flight Path' }
const MODE_BY_KEY = Object.fromEntries(MODES.map((m) => [m.key, m]))

// The three daily puzzles live in lib/dailyPuzzles so the worldwide hub can
// read the same list without importing this page (and the world atlas with it).
const DAILIES = DAILY_PUZZLES

// What each daily board is ranking, said in the terms of that puzzle. A shared
// "ranked by score then speed" line is true of all three and useful about none.
const DAILY_BLURB = {
  pinpoint: {
    today: 'Everyone plays the same puzzle today. Ranked by fewest words, then speed.',
    all: "Each creator's best-ever daily result. Ranked by fewest words, then speed.",
  },
  zip: {
    today: 'Everyone flies the same route today. Ranked by fastest landing.',
    all: "Each creator's best-ever daily flight. Ranked by fastest landing.",
  },
  languages: {
    today: 'Everyone gets the same ten phrases today. Ranked by score, then speed.',
    all: "Each creator's best-ever daily round. Ranked by score, then speed.",
  },
}

const fmtTime = (ms) => {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// A real fire, at the size of a word, with the streak count beside it. Shows a
// creator's DAILY play streak (consecutive UK days) for this game.
//
// THE DRAWING LIVES IN components/games/Flame. It used to be two flat paths
// inlined here - an orange leaf with a yellow dot - and there were two more
// copies of roughly the same idea on two other surfaces. See that file for what
// makes it read as fire rather than as a flame-shaped sticker.
function FlameStreak({ n }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-brand-tint px-1.5 py-0.5 text-[11px] font-bold leading-none text-brand"
      title={`${n}-day streak`}
      aria-label={`${n} day streak`}
    >
      <Flame className="h-4 w-4" />
      {n}
    </span>
  )
}

export default function Game() {
  const tr = useT()
  const [params] = useSearchParams()
  const eventId = params.get('event')
  const { user } = useAuth()

  const [event, setEvent] = useState(null)
  const [screen, setScreen] = useState('menu')
  // The viewer's own daily-puzzle history (the streak card's week strip and the
  // streak badge), plus which of today's three are already done. Shared with the
  // hub's Daily puzzles section, so a tick here and a tick there mean the same
  // query rather than two answers that can disagree.
  const { played: playedToday, streakDays: myDays, daysByPuzzle, markPlayed } = useDailyPuzzles(user?.id)
  const [mode, setMode] = useState('flags')
  const [region, setRegion] = useState('World')
  const [questions, setQuestions] = useState([])
  const [savedScore, setSavedScore] = useState(null)

  useEffect(() => {
    if (!eventId) return
    supabase.from('game_events').select('*').eq('id', eventId).single().then(({ data }) => {
      if (data) { setEvent(data); setMode(data.mode); setRegion(data.region) }
    })
  }, [eventId])

  // Deep link straight into a daily puzzle (/game?daily=zip) from the hub.
  useEffect(() => {
    const d = params.get('daily')
    if (DAILY_KEYS.includes(d)) setScreen(d)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // OPENING A GAME PUTS YOU AT THE TOP OF THE PAGE. ALL OF IT.
  //
  // THE BUG THIS FIXES, TWICE OVER. Screens swap in place and the browser keeps
  // your scroll offset when they do, so tapping a daily card several hundred
  // pixels down a tall menu left you several hundred pixels down a page that
  // had just become much shorter - which is the leaderboard, with the puzzle
  // off the top. Ethan, twice: "on mobile when you click to play a daily game
  // it doesn't immediately show up, it's scrolled further down the screen
  // showing leaderboard", and then "it starts with the page half scrolled down
  // the leaderboard, this is wrong. The page should always open at the top
  // where the actual game is, none of it should be cut off."
  //
  // The first fix scrolled the BOARD to the top of the viewport, which is a
  // different thing and is why it did not hold: it measures an element whose
  // height is still zero on the frame a game mounts (the boards build their
  // layout in an effect), so the offset it computed was too small, and when the
  // board then grew, the leaderboard underneath was what had been scrolled to.
  //
  // AND THEN IT WENT ONE STEP TOO FAR THE OTHER WAY. Scrolling to zero puts
  // "Travel Games" - a heading you have already read, on a page you are already
  // on - at the top of a phone screen, and pushes the puzzle's own card down
  // under it. Ethan, on Guess the Language: "it should only show the little
  // card showing the number of questions and the time, because that just fits
  // perfectly for the UI... it's not fully scrolled up, but it cuts out the
  // heading."
  //
  // So the target is the TOP OF THE GAME, not the top of the document, and the
  // page heading is scrolled away above it.
  //
  // MEASURE THE WRAPPER, NEVER THE BOARD. This is the distinction the first
  // attempt at this got wrong and the reason it was replaced by a blunt zero:
  // a board's own height is still zero on the frame it mounts (they build their
  // layout in an effect), so anything derived from it is too small and the
  // page ends up parked on the leaderboard underneath. The WRAPPER's document
  // offset does not depend on the board's height at all - only on what is above
  // it, which is the page heading and nothing else, and which is settled before
  // this ever runs.
  //
  // MINUS THE APP HEADER, which is `sticky top-0`: scrolling the card to y=0
  // slides it under the header rather than to the top of what you can see.
  // Measured rather than hard-coded - it is a different height at different
  // widths, and it is the kind of number that goes stale silently.
  //
  // The menu still goes to zero: there the streak card IS the top of the page
  // and it should not be cropped.
  //
  // It is re-asserted on the next frame as well as immediately, because the
  // boards settle their own height a frame later and Chrome's scroll anchoring
  // will happily push the document down to "keep" content that was never in
  // view. Two cheap calls beat one that a layout pass can undo.
  const [screenSeq, setScreenSeq] = useState(0)
  const gameRef = useRef(null)
  useEffect(() => {
    const settle = () => {
      const el = screen === 'menu' ? null : gameRef.current
      // A DESKTOP GOES TO THE VERY TOP, FULL STOP (2 Sep 2026).
      //
      // Scrolling the page heading away is a PHONE answer to a phone problem:
      // there, the heading plus the app header is a third of the screen and the
      // puzzle needs all of it. On a desktop there is room for both, and
      // parking the document 90-odd pixels down means the page opens looking
      // like somebody already scrolled it. Ethan, on Flight Path: "on desktop
      // it still scrolled on a bit. It should always be at the top." Same
      // instruction he gave for Guess the Country.
      //
      // `matchMedia` rather than the `useIsMobile` hook because this runs
      // inside an effect and on a raf after it; a hook value captured in the
      // closure would be a frame stale on a resize.
      const phone = window.matchMedia('(max-width: 1023.98px)').matches
      if (!el || !phone) { window.scrollTo({ top: 0, left: 0, behavior: 'auto' }); return }
      const header = document.querySelector('header')?.getBoundingClientRect().height || 0
      const y = el.getBoundingClientRect().top + window.scrollY - header - 8
      window.scrollTo({ top: Math.max(0, y), left: 0, behavior: 'auto' })
    }
    settle()
    const raf = requestAnimationFrame(settle)
    return () => cancelAnimationFrame(raf)
  }, [screen, screenSeq])

  // Closing a daily board: back to the menu, with that puzzle's tick, streak
  // chip and "N of 3 done" line all brought up to date before the menu paints.
  const leaveDaily = useCallback((key) => {
    markPlayed(key)
    setScreen('menu')
  }, [markPlayed])

  function start(m, r) {
    const mm = m || mode, rr = r || region
    const pool = mm === 'airports' ? airportsForRegion(rr)
      : mm === 'currencies' ? currencyCountriesForRegion(rr)
      : countriesForRegion(rr)
    let qs = shuffle(pool).slice(0, Math.min(QUESTIONS, pool.length))
    // Currencies is multiple choice: fix each question's six options up front
    // (the right currency + five distinct currencies the country doesn't use).
    if (mm === 'currencies') qs = qs.map((t) => ({ ...t, choices: currencyOptions(t, rr) }))
    setMode(mm)
    setRegion(rr)
    setQuestions(qs)
    setSavedScore(null)
    setScreen('play')
    // "Play again" goes results -> play -> play, so `screen` alone would not
    // change on the second press and the page would stay where it was.
    setScreenSeq((n) => n + 1)
  }

  return (
    <div className="page">
      {/* No standing subtitle. It said "Three puzzles a day for everyone, and
          four more you can play as often as you like", which is a description
          of the two section headings directly underneath it. */}
      <PageHeader
        /* "Travel games", not "Games", and the same words the nav uses for it.
           Ethan: "rename the auto heading to travel games, capital T, capital
           G, rather than just games, for both mobile and desktop." */
        title={<span className="flex items-center gap-2"><Icon name="joystick" className="h-7 w-7 text-brand" /> {tr("Travel Games")}</span>}
        subtitle={event ? `Event: ${event.title}` : undefined}
      />

      {/* THE STREAK LEADS. It is the reason somebody opens this page on a day
          they were not planning to, so it sits above the games rather than
          beside them.
          Its own Reveal so it RISES IN rather than simply being there: this is
          the first thing on the page and it was the one big element with no
          entrance at all. Every section below carries its own, with a small
          ladder of head starts, so the page assembles top to bottom instead of
          flashing in as one block. */}
      {!event && screen === 'menu' && (
        <Reveal className="mb-8" from="down">
          <StreakCard days={myDays} today={ukDayIndex()} myId={user?.id} />
        </Reveal>
      )}

      {/* The menu drives the shared mode/region state, so the all-time
          leaderboard below always reflects the mode you currently have selected. */}
      {screen === 'menu' && (
        <Menu
          mode={mode} setMode={setMode} region={region} setRegion={setRegion}
          onStart={() => start(mode, region)} onDaily={setScreen} eventTitle={event?.title}
          // PER PUZZLE, not the overall run. The badge on the Flight Path card
          // used to read the accumulated streak, so all three cards said the
          // same number - which quietly claimed a 30-day Flight Path run to
          // somebody who had played it twice. A badge on a card is a statement
          // about that card.
          daysByPuzzle={daysByPuzzle} playedToday={playedToday}
        />
      )}
      {/* LEAVING A DAILY PUZZLE TICKS IT OFF, ON THE SPOT.
          Every daily board writes its result to localStorage the moment it
          finishes, so by the time `onExit` runs the answer is already on this
          device - `markPlayed` just tells the hook to look, and re-checks the
          server behind it. Without this the menu kept whatever set it built on
          mount, so you could play Flight Path, come straight back, and be
          invited to play it again. Ethan: "after I played for example flight
          path, it didn't immediately update and show that I played it." */}
      <div ref={gameRef}>
        {screen === 'play' && <Round mode={mode} region={region} questions={questions} onQuit={() => setScreen('menu')} onFinish={(r) => { setSavedScore(r); setScreen('results') }} />}
        {screen === 'results' && (
          <Results result={savedScore} mode={mode} region={region} eventId={eventId} userId={user.id}
            onPlayAgain={() => start(mode, region)} onMenu={() => setScreen('menu')} />
        )}
        {screen === 'pinpoint' && <PinpointGame onExit={() => leaveDaily('pinpoint')} />}
        {screen === 'zip' && <ZipGame onExit={() => leaveDaily('zip')} />}
        {screen === 'languages' && <LanguageGame onExit={() => leaveDaily('languages')} />}
      </div>

      <div className="mt-12">
        {DAILY_KEYS.includes(screen) ? (
          // Daily puzzles get two boards: today's race on the left, the
          // all-time best scores on the right.
          <div className="grid gap-10 lg:grid-cols-2">
            <Leaderboard mode={screen} region="Daily" daily highlightUser={user.id}
              heading={tr("Today's leaderboard")}
              blurb={tr(DAILY_BLURB[screen].today)} />
            <Leaderboard mode={screen} region="Daily" highlightUser={user.id}
              heading={tr("All-time leaderboard")}
              blurb={tr(DAILY_BLURB[screen].all)} />
          </div>
        ) : (
          <Leaderboard mode={mode} region={region} eventId={eventId} highlightUser={user.id} />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Menu
//
// THE HUB, REBUILT.
//
// The old one was three headings and a stack of near-identical white cards -
// two daily puzzles, five modes, seven region pills and a Start button - all the
// same weight, so nothing on the page said what to do first. Ethan: "it doesn't
// look good and doesn't look fun".
//
// The order is now the order of the decision. Your streak is what brings you
// back, so it leads. TODAY is the thing that expires, so the two daily puzzles
// come next and are big, coloured and obviously today's - with a tick when you
// have played and a nudge when you have not. Everything else is "and if you want
// more", so the five modes are a tighter grid underneath, and the region choice
// belongs to the mode you picked rather than floating as its own section.
//
// The Start button moved to sit WITH the mode you selected. A primary action
// two sections away from the choice it acts on is a button people press before
// they have chosen.

// THE THREE CARDS ARE THE SAME SIZE, WHATEVER IS WRITTEN ON THEM.
//
// THE BUG THIS FIXES. The button had no `h-full`, so each card was as tall as
// its own contents - and the contents differ: "Guess the Country" is long
// enough to push its three pills onto a second line where "Flight Path" is not.
// So Flight Path came out visibly shorter than the two beside it, which reads
// as the odd one out rather than as one of a set. Ethan: "the daily puzzle cards
// are different sizes, the flight path should be the same size as the other
// two." Reveal's wrapper is already `height: 100%` (index.css), so the card
// only has to agree to fill it.
//
// The pills row is also fixed height now, for the same reason from the other
// direction: a card whose height comes from a badge appearing is a card that
// changes size the day somebody starts a streak.
//
// AND `h-full` IS NOT ENOUGH ON A PHONE, which is what was still wrong. It
// makes a card fill its GRID ROW, and a grid row is as tall as its tallest cell
// - so on a desktop, where three cards share one row, they equalise for free.
// At `grid-cols-1` every card is alone in its own row, there is nothing to
// equalise against, and each one is exactly as tall as its own description:
// "Guess the Country" runs to two lines at 375px where "Flight Path" runs to
// one, so the stack came out uneven. Ethan: "on mobile on the travel games page
// the cards are not all the same size."
// The description is an exact two-line box, so the card is the same height at
// every width whatever is written on it. `leading-5` is 20px and `h-10` is
// 40px exactly - an inexact pair leaves a sliver of a third line showing under
// the clamp, which is the trap CreatorCard's bio fell into.
function DailyCard({ daily, done, onPlay, streak }) {
  const tr = useT()
  return (
    <button
      onClick={onPlay}
      className="group relative flex h-full flex-col overflow-hidden rounded-card border border-brand/25 bg-white p-5 text-left shadow-card transition-all duration-200 hover:-translate-y-1 hover:border-brand/50 hover:shadow-lift"
    >
      {/* A wash that leans in on hover. Colour is what stops these two reading
          as the same white card as everything below them. */}
      <span className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-brand-tint/70 blur-2xl transition-opacity duration-300 group-hover:opacity-80" />
      <span className="relative flex flex-1 items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand text-white shadow-card transition-transform duration-200 group-hover:scale-110">
          <Icon name={daily.icon} className="h-6 w-6" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="block font-semibold leading-snug">{tr(daily.title)}</span>
          {/* The badges sit on their OWN line at a fixed height. Beside the
              title they wrapped or did not depending on how long the title was,
              which is where the difference in card heights came from. */}
          <span className="mt-1.5 flex h-5 flex-wrap items-center gap-2 overflow-hidden">
            <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">{tr("Today")}</span>
            {streak > 0 && (
              <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[10px] font-bold text-brand">{streak} day streak</span>
            )}
          </span>
          <span className="mt-1.5 line-clamp-2 block h-10 overflow-hidden text-sm leading-5 text-smoke">{daily.text}</span>
          <span className="mt-auto inline-flex items-center gap-1.5 pt-3 text-sm font-semibold text-brand">
            {done ? 'See how you did' : 'Play today\u2019s puzzle'}
            <Icon name="chevronRight" className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
          </span>
        </span>
        {done && (
          <span className="absolute right-0 top-0 flex h-7 w-7 items-center justify-center rounded-full bg-green-100 text-green-600" title={tr("Played today")}>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6"/></svg>
          </span>
        )}
      </span>
    </button>
  )
}

function Menu({ mode, setMode, region, setRegion, onStart, onDaily, eventTitle, daysByPuzzle, playedToday }) {
  const tr = useT()
  const chosen = MODE_BY_KEY[mode]
  const allDone = DAILIES.every((d) => playedToday.has(d.key))
  const doneCount = DAILIES.filter((d) => playedToday.has(d.key)).length

  return (
    <div className="space-y-10">
      {eventTitle && (
        <div className="rounded-card bg-brand-tint/60 px-5 py-4 text-sm font-medium text-brand">
          You are joining the &ldquo;{eventTitle}&rdquo; challenge. Beat the leaderboard.
        </div>
      )}

      <Reveal as="section" from="down" delay={0.06}>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">{tr("Today’s puzzles")}</h2>
          {/* HOW FAR THROUGH TODAY YOU ARE, AND NOTHING ELSE (2 Sep 2026).
              Ethan: "remove this copy from above the today's puzzle section -
              'Everyone gets the same three, until midnight.'"
              It was the line for somebody who had played none of them, and it
              explained the rules of a section whose three cards say the same
              thing by existing. What is left is the only version of this line
              that tells the reader something they did not know: how many of
              today's three they still have. Nothing at all once they are done -
              the green ticks say that. */}
          {!allDone && doneCount > 0 && (
            <span className="text-xs text-smoke">
              {tr('{n} of 3 done. The rest expire at midnight.', { n: doneCount })}
            </span>
          )}
        </div>
        {/* THREE ACROSS ON A WIDE SCREEN, ONE ABOVE THE OTHER ON A PHONE. Two
            columns would leave the third puzzle alone on its own row looking
            like an afterthought, which is precisely what it is not. */}
        <Reveal className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" stagger={0.07}>
          {DAILIES.map((d) => (
            <DailyCard key={d.key} daily={d} done={playedToday.has(d.key)}
              streak={dailyStreak(daysByPuzzle?.[d.key] || [])} onPlay={() => onDaily(d.key)} />
          ))}
        </Reveal>
      </Reveal>

      <Reveal as="section" from="down" delay={0.12}>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">{tr("Other Travel Games")}</h2>
        </div>
        {/* Four modes, so two rows of two on a phone and a clean row of four on
            a desktop. A three-column grid left one card orphaned. */}
        <Reveal className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" stagger={0.05}>
          {MODES.map((m) => {
            const on = mode === m.key
            return (
              <button
                key={m.key}
                onClick={() => {
                  setMode(m.key)
                  // A mode with no continent split must not carry a stale region
                  // into a round that is going to ignore it.
                  if (!m.regions) setRegion('World')
                }}
                aria-pressed={on}
                className={cx(
                  // `items-center`, so a blurb shorter than its reserved box
                  // reads as centred rather than as a card with a hole in it.
                  'group flex h-full items-center gap-3.5 rounded-card border bg-white p-4 text-left transition-all duration-200 active:scale-[0.99] hover:-translate-y-1 hover:shadow-lift',
                  on ? 'border-brand ring-2 ring-brand/25' : 'border-gray-100 shadow-card hover:border-brand/40',
                )}
              >
                <span className={cx(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all duration-200 group-hover:scale-110',
                  on ? 'bg-brand text-white' : 'bg-brand-tint text-brand',
                )}>
                  <Icon name={m.icon} className="h-5 w-5" />
                </span>
                {/* Two exact lines, for the reason spelled out on DailyCard:
                    at `grid-cols-2` on a phone the taller card sets the row and
                    the shorter one floats inside it, and a mode whose blurb
                    runs to three lines pushed its whole row taller than the
                    one under it. `leading-[1.15rem]` is 18.4px and the box is
                    two of them exactly. */}
                <span className="min-w-0">
                  {/* THROUGH `tr`: the modes are a TABLE, and a table's
                      strings are variables at the call site, which is why the
                      i18n report cannot see them and why they were still
                      English. Ethan: "the travel games aren't translated, and
                      the descriptions for them." */}
                  <span className="block font-semibold leading-snug">{tr(m.title)}</span>
                  <span className="mt-1 line-clamp-2 block h-[2.3rem] overflow-hidden text-[13px] leading-[1.15rem] text-smoke">{tr(m.text)}</span>
                </span>
              </button>
            )
          })}
        </Reveal>
      </Reveal>

      {/* THE REGION BELONGS TO THE MODE, AND SO DOES THE START BUTTON.
          Both used to be their own sections below a grid, which meant choosing
          a mode and starting it were three scroll-lengths apart and the region
          pills were offered for modes that have no regions. */}
      <Reveal as="section" from="down" delay={0.18} className="rounded-card border border-gray-100 bg-cloud/50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-smoke">{tr("Ready to play")}</p>
            <p className="mt-0.5 flex items-center gap-2 text-lg font-semibold">
              <Icon name={chosen.icon} className="h-5 w-5 shrink-0 text-brand" />
              {chosen.title}
            </p>
          </div>
          <button
            onClick={() => onStart(mode, region)}
            className="btn-primary !px-8 !py-3.5 !text-base transition-transform duration-200 hover:scale-105"
          >
            Start
          </button>
        </div>

        {chosen.regions && (
          <div className="mt-4 border-t border-gray-200/70 pt-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-smoke">{tr("Where in the world")}</p>
            <div className="flex flex-wrap gap-2">
              {REGIONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setRegion(r)}
                  aria-pressed={region === r}
                  className={cx(
                    'flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all duration-200',
                    region === r
                      ? 'bg-brand text-white'
                      : 'border border-gray-200 bg-white text-smoke hover:-translate-y-0.5 hover:border-brand hover:text-brand',
                  )}
                >
                  {r === 'World' && <Icon name="globe" className="h-4 w-4" />}{r}
                </button>
              ))}
            </div>
          </div>
        )}
      </Reveal>
    </div>
  )
}

// ---------------------------------------------------------------- Round
function Round({ mode, region, questions, onQuit, onFinish }) {
  const tr = useT()
  const [i, setI] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [answered, setAnswered] = useState(null) // { right, picked? }
  const [typed, setTyped] = useState('')
  const [elapsed, setElapsed] = useState(0)
  // Map mode persistent state, kept for the whole game:
  //  placed   - geoName -> 'correct' (a country you found, stays green)
  //  revealed - target countries you missed (the answer, stays Tryp orange)
  //  flashWrong - the country you just mis-clicked (flashes red ~1s, then clears)
  const [placed, setPlaced] = useState({})
  const [revealed, setRevealed] = useState([])
  const [flashWrong, setFlashWrong] = useState(null)
  const startRef = useRef(0)
  const inputRef = useRef(null)

  const current = questions[i]
  const last = i === questions.length - 1
  const isType = mode === 'flags' || mode === 'airports'

  function pickChoice(choice) {
    if (answered) return
    const right = choice.currency === current.currency
    if (right) setCorrect((c) => c + 1)
    setAnswered({ right, picked: choice.currency })
  }

  useEffect(() => {
    startRef.current = Date.now()
    const t = setInterval(() => setElapsed(Date.now() - startRef.current), 200)
    return () => clearInterval(t)
  }, [])

  useEffect(() => { if (isType && !answered) inputRef.current?.focus() }, [i, answered, isType])

  function submitType(e) {
    e.preventDefault()
    if (answered) return
    const right = mode === 'flags' ? countryMatches(current, typed) : airportMatches(current, typed)
    if (right) setCorrect((c) => c + 1)
    setAnswered({ right })
  }

  function pickOnMap(geoName) {
    if (answered) return
    const right = countryMatches(current, geoName)
    if (right) {
      setCorrect((c) => c + 1)
      setPlaced((p) => ({ ...p, [geoName]: 'correct' })) // stays green
      setAnswered({ right: true, picked: geoName })
    } else {
      // Flash the wrong pick red for a moment, then let it fade back to normal.
      setFlashWrong(geoName)
      setTimeout(() => setFlashWrong((cur) => (cur === geoName ? null : cur)), 1100)
      // Reveal the real answer in Tryp orange - it persists for the rest of the game.
      setRevealed((r) => [...r, current])
      setAnswered({ right: false, picked: geoName })
    }
  }

  function next() {
    if (last) { onFinish({ correct, total: questions.length, time_ms: Date.now() - startRef.current }); return }
    setI((x) => x + 1)
    setAnswered(null)
    setTyped('')
  }

  // Once an answer is in, pressing Enter again jumps to the next question
  // (the Next button stays as a visible option).
  useEffect(() => {
    if (!answered) return
    function onKey(e) {
      if (e.key === 'Enter') { e.preventDefault(); next() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // re-bind every render so `next` has fresh state

  // The sound and the colour, once per answer, for every mode below.
  useAnswerSound(answered, playCorrect, playWrong)
  const flash = answered ? (answered.right ? 'right' : 'wrong') : null

  return (
    <div className="space-y-5">
      {/* ONE HEADER FOR EVERY MODE. See GameChrome - the bar Ethan liked on
          Say hello is now the bar on all five. */}
      <GameChrome
        icon={MODE_BY_KEY[mode].icon}
        title={MODE_BY_KEY[mode].regions ? `${tr(MODE_LABEL[mode])} · ${tr(region)}` : tr(MODE_LABEL[mode])}
        done={answered ? i + 1 : i}
        total={questions.length}
        correct={correct}
        time={fmtTime(elapsed)}
        onQuit={onQuit}
      />

      {/* ---- Flags ---- */}
      {mode === 'flags' && (
        <AnswerFlash key={`f${i}`} state={flash} className="card flex flex-col items-center gap-6 !py-10 text-center">
          <div className="text-[7rem] leading-none sm:text-[9rem]" aria-label="flag">{flagEmoji(current.iso2)}</div>
          <TypeForm typed={typed} setTyped={setTyped} answered={answered} onSubmit={submitType} inputRef={inputRef} placeholder={tr("Type the country…")} />
          {answered && <Feedback answered={answered} answer={current.name} reveal last={last} onNext={next} />}
        </AnswerFlash>
      )}

      {/* ---- Airports ---- */}
      {mode === 'airports' && (
        <AnswerFlash key={`a${i}`} state={flash} className="card flex flex-col items-center gap-5 !py-10 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-smoke">{tr("Which city?")}</p>
          <div className="rounded-2xl bg-brand px-8 py-5 font-mono text-5xl font-extrabold tracking-widest text-white shadow-lift sm:text-6xl">{current.code}</div>
          <TypeForm typed={typed} setTyped={setTyped} answered={answered} onSubmit={submitType} inputRef={inputRef} placeholder={tr("Type the city…")} />
          {answered && <Feedback answered={answered} answer={current.city} reveal last={last} onNext={next} />}
        </AnswerFlash>
      )}

      {/* ---- Currencies: show the country, pick the currency ---- */}
      {mode === 'currencies' && (
        <AnswerFlash key={`c${i}`} state={flash} className="card flex flex-col items-center gap-6 !py-10 text-center">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-smoke">{tr("Which currency does this country use?")}</p>
            <div className="inline-flex items-center gap-3 rounded-2xl bg-brand px-8 py-5 text-white shadow-lift">
              <span className="text-4xl leading-none sm:text-5xl" aria-hidden>{flagEmoji(current.iso2)}</span>
              <span className="text-2xl font-bold sm:text-3xl">{current.name} uses?</span>
            </div>
          </div>
          <div className="grid w-full max-w-lg grid-cols-1 gap-2.5 sm:grid-cols-2">
            {current.choices.map((c) => {
              const isAnswer = c.currency === current.currency
              const isPicked = answered?.picked === c.currency
              return (
                <button
                  key={c.currency}
                  onClick={() => pickChoice(c)}
                  disabled={!!answered}
                  className={cx(
                    'flex items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition-all',
                    !answered && 'border-gray-200 hover:-translate-y-0.5 hover:border-brand hover:shadow-card',
                    answered && isAnswer && '!border-green-500 bg-green-50 text-green-700',
                    answered && isPicked && !isAnswer && '!border-red-400 bg-red-50 text-red-600',
                    answered && !isAnswer && !isPicked && 'border-gray-100 opacity-50'
                  )}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-sm font-extrabold text-brand" aria-hidden>{c.symbol}</span>
                  <span className="min-w-0 truncate">{c.currency}</span>
                </button>
              )
            })}
          </div>
          {answered && <Feedback answered={answered} answer={`${current.currency} (${current.symbol})`} reveal last={last} onNext={next} />}
        </AnswerFlash>
      )}

      {/* ---- Map ---- */}
      {mode === 'map' && (
        <AnswerFlash key={`m${i}`} state={flash} className="card !p-4 sm:!p-6">
          <p className="mb-3 text-center text-lg font-semibold">{tr("Find:")} <span className="text-brand">{current.name}</span> {flagEmoji(current.iso2)}</p>
          <GameMap placed={placed} revealed={revealed} flashWrong={flashWrong} answered={answered} onPick={pickOnMap} />
          {answered && <div className="mt-4"><Feedback answered={answered} reveal={false} last={last} onNext={next} /></div>}
        </AnswerFlash>
      )}
    </div>
  )
}

function TypeForm({ typed, setTyped, answered, onSubmit, inputRef, placeholder }) {
  const tr = useT()
  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col items-center gap-3">
      <input ref={inputRef} type="text" value={typed} disabled={!!answered} onChange={(e) => setTyped(e.target.value)}
        placeholder={placeholder} className="input text-center text-lg" autoComplete="off" autoCorrect="off" autoCapitalize="words" />
      {!answered && <button type="submit" className="btn-primary w-full">{tr("Check")}</button>}
    </form>
  )
}

// reveal=true → show the correct answer text on a wrong guess (flags/airports).
// reveal=false → just "Not quite" (map mode, where the location is shown instead).
function Feedback({ answered, answer, reveal, last, onNext }) {
  return (
    <div className="flex flex-col items-center gap-3 animate-fade-up">
      {answered.right ? (
        <p className="text-lg font-bold text-green-600">✓ Correct!</p>
      ) : reveal ? (
        <p className="text-lg font-bold text-red-600">✗ Not quite. It's <span className="underline">{answer}</span></p>
      ) : (
        <p className="text-lg font-bold text-red-600">✗ Not quite. Here's where it is.</p>
      )}
      <button onClick={onNext} className="btn-primary">{last ? 'See results →' : 'Next →'}</button>
    </div>
  )
}

// ---------------------------------------------------------------- Game map
const MAP_HOME = { coordinates: [12, 8], zoom: 1 }
// Same object every render, or `<Geographies>` treats it as a new source.
const EMPTY_GEO = { type: 'FeatureCollection', features: [] }
function GameMap({ placed, revealed, flashWrong, answered, onPick }) {
  const tr = useT()
  // Controlled zoom so we can offer on-screen +/- buttons (much friendlier than
  // pinch on a phone) and zoom deep enough to click small countries.
  const [pos, setPos] = useState(MAP_HOME)
  // The atlas comes from the one shared parse (lib/mapCountries) rather than a
  // URL, so the board never decodes the TopoJSON for itself.
  const [features, setFeatures] = useState(null)
  useEffect(() => {
    let cancelled = false
    loadMapFeatures().then((fc) => { if (!cancelled) setFeatures(fc) })
    return () => { cancelled = true }
  }, [])
  const clampZoom = (z) => Math.max(1, Math.min(16, z))
  const zoomBy = (factor) => setPos((p) => ({ ...p, zoom: clampZoom(p.zoom * factor) }))
  return (
    <div className="relative overflow-hidden rounded-card bg-cloud/60">
      <ComposableMap width={880} height={440} projectionConfig={{ scale: 160, center: [12, 8] }} style={{ width: '100%', height: 'auto', display: 'block' }}>
        <ZoomableGroup minZoom={1} maxZoom={16} zoom={pos.zoom} center={pos.coordinates} onMoveEnd={setPos}>
          <Geographies geography={features || EMPTY_GEO}>
            {({ geographies }) =>
              geographies
                .filter((geo) => geo.properties.name !== 'Antarctica')
                .map((geo) => {
                  const name = geo.properties.name
                  const isCorrect = placed[name] === 'correct'                  // green, persists
                  const isRevealed = revealed.some((t) => countryMatches(t, name)) // orange, persists
                  const isFlash = flashWrong === name                           // red, ~1s
                  // Priority: a momentary red flash sits on top of everything,
                  // then a found country (green), then a revealed answer (orange).
                  let fill = UNSELECTED
                  if (isRevealed) fill = BRAND
                  if (isCorrect) fill = GREEN
                  if (isFlash) fill = RED
                  const emphasised = isRevealed || isCorrect || isFlash
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      onClick={!answered ? () => onPick(name) : undefined}
                      style={{
                        default: { fill, stroke: '#fff', strokeWidth: emphasised ? 0.9 : 0.4, outline: 'none', transition: 'fill 0.3s' },
                        hover: { fill: answered ? fill : (emphasised ? fill : BRAND_LIGHT), stroke: '#fff', strokeWidth: 0.4, outline: 'none', cursor: answered ? 'default' : 'pointer' },
                        pressed: { fill: BRAND, outline: 'none' },
                      }}
                    />
                  )
                })
            }
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>
      {/* On-screen zoom controls (drag the map to pan when zoomed in). */}
      <div className="absolute right-2 top-2 flex flex-col gap-1.5">
        <button type="button" onClick={() => zoomBy(1.6)} aria-label={tr("Zoom in")} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-lg font-bold text-ink shadow-card transition-transform hover:scale-105 active:scale-95">+</button>
        <button type="button" onClick={() => zoomBy(1 / 1.6)} aria-label={tr("Zoom out")} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-lg font-bold text-ink shadow-card transition-transform hover:scale-105 active:scale-95">−</button>
        <button type="button" onClick={() => setPos(MAP_HOME)} aria-label={tr("Reset zoom")} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-ink shadow-card transition-transform hover:scale-105 active:scale-95"><Icon name="globe" className="h-4 w-4" /></button>
      </div>
      <p className="px-3 pb-2 text-center text-[11px] text-smoke">{tr("Tap the country · pinch, scroll or use +/- to zoom · drag to pan · correct stays green, the answer shows in orange")}</p>
    </div>
  )
}

// ---------------------------------------------------------------- Results
// A LINE THAT REACTS TO WHAT ACTUALLY HAPPENED.
//
// "Keep exploring, give it another go!" was the only thing this screen ever
// said, and it said it whether you got 1 or 9 out of 10. A result screen that
// cannot tell the difference between a near-miss and a disaster is a result
// screen nobody reads twice.
function verdict(pct) {
  if (pct === 100) return { title: 'Perfect round', line: 'Every single one. Go and put that on the leaderboard.' }
  if (pct >= 90) return { title: 'Very close to perfect', line: 'One away. You know this.' }
  if (pct >= 70) return { title: 'Strong round', line: 'Comfortably above the middle. Another go and you have it.' }
  if (pct >= 50) return { title: 'Halfway there', line: 'You got more right than wrong. That is where it starts.' }
  if (pct >= 25) return { title: 'A tricky one', line: 'This set was not kind. The next one is a different set.' }
  return { title: 'Rough round', line: 'Everybody has these. Go again, it is ten questions.' }
}

function Results({ result, mode, region, eventId, userId, onPlayAgain, onMenu }) {
  const tr = useT()
  const [saving, setSaving] = useState(true)
  const pct = Math.round((result.correct / result.total) * 100)
  const great = pct >= 80
  const v = verdict(pct)

  // NO `day_key` HERE, DELIBERATELY - see migration 182.
  //
  // Every quiz round is saved, and a quiz is replayable, so these rows are
  // many-per-day by design. `day_key` carries a UNIQUE (player_id, mode,
  // day_key) constraint that enforces the DAILY PUZZLES' one-go-a-day rule, and
  // stamping it here would turn "Play again" into a failed insert.
  //
  // The streak still counts these rounds: `my_game_streak` derives the day from
  // `created_at` when `day_key` is null, so playing any travel game holds the
  // run up without this table having to pretend a quiz is a daily puzzle.
  useEffect(() => {
    supabase.from('game_scores').insert({
      player_id: userId, mode, region, correct: result.correct, total: result.total,
      time_ms: result.time_ms, event_id: eventId || null,
    }).then(() => setSaving(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // THE END-OF-ROUND SOUND, ONCE. A fanfare for a good round and something
  // sympathetic for a bad one - never a buzzer, which is a punishment for
  // having played. 60% is the line: below it you got most of them wrong, and
  // celebrating that would be the app not paying attention.
  useEffect(() => {
    const t = setTimeout(() => { if (pct >= 60) playCelebrate(); else playCommiserate() }, 180)
    return () => clearTimeout(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="card flex flex-col items-center gap-4 !py-10 text-center animate-pop-in">
      {great && <Confetti count={50} />}
      {/* NO BADGE ABOVE THE RING. There was a trophy for a good round and a
          globe for a poor one, sitting directly over a score ring that already
          says the same thing more precisely - and the globe in particular read
          as a consolation sticker. Ethan: "get rid of that logo above with the
          globe, it's not necessary for any of them even if you do good". The
          ring is the result; the verdict underneath is the reaction. */}

      {/* THE SCORE AS A RING, not as a line of text. A round result is a
          proportion, and a proportion drawn is read in one glance. */}
      <div className="relative">
        <svg viewBox="0 0 120 120" className="h-28 w-28 -rotate-90" aria-hidden>
          <circle cx="60" cy="60" r="52" fill="none" stroke="#ECECEE" strokeWidth="10" />
          <circle
            cx="60" cy="60" r="52" fill="none" stroke={BRAND} strokeWidth="10" strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 52}
            strokeDashoffset={2 * Math.PI * 52 * (1 - pct / 100)}
            style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)' }}
          />
        </svg>
        <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
          <span className="text-2xl font-bold tabular-nums">{result.correct}<span className="text-smoke">/{result.total}</span></span>
          <span className="mt-1 text-[11px] font-semibold uppercase tracking-widest text-brand">{pct}%</span>
        </span>
      </div>

      <div>
        <h2 className="text-2xl font-bold">{v.title}</h2>
        <p className="mt-1 max-w-sm text-sm text-smoke">{v.line}</p>
      </div>

      <Badge tone="light"><Icon name="clock" className="h-3.5 w-3.5" /> {fmtTime(result.time_ms)}</Badge>
      <p className="text-xs text-smoke">{saving ? 'Saving your score…' : 'Saved to the leaderboard'}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        <button onClick={onPlayAgain} className="btn-primary transition-transform duration-200 hover:scale-105">{tr("Play again")}</button>
        <button onClick={onMenu} className="btn-secondary">{tr("Pick another game")}</button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Leaderboard
function Leaderboard({ mode, region, eventId, highlightUser, daily = false, heading = 'Leaderboard', blurb = null }) {
  const tr = useT()
  const { isAdmin } = useAuth()
  const [rows, setRows] = useState(null)
  const [streaks, setStreaks] = useState({}) // player_id -> weekly streak for this mode
  const pressTimer = useRef(null)

  const load = useCallback(async () => {
    let q = supabase.from('game_scores').select('*, profiles:player_id(id, name, photo_url, is_test)').eq('mode', mode).eq('region', region)
    q = eventId ? q.eq('event_id', eventId) : q.is('event_id', null)
    // Daily puzzles rank today's solves only (everyone has the same puzzle,
    // refreshing at midnight UK time).
    if (daily) q = q.gte('created_at', ukDayStartIso())
    const { data } = await q
    const best = {}
    for (const s of data ?? []) {
      if (s.profiles?.is_test) continue // QA accounts never rank
      const cur = best[s.player_id]
      if (!cur || s.correct > cur.correct || (s.correct === cur.correct && s.time_ms < cur.time_ms)) best[s.player_id] = s
    }
    const ranked = Object.values(best).sort((a, b) => b.correct - a.correct || a.time_ms - b.time_ms).slice(0, 25)
    setRows(ranked)

    // Daily play streak per creator for this mode (consecutive UK days). Only on
    // the all-time board - a single event doesn't have a daily cadence. Uses the
    // daily puzzle rows (day_key set), so it reflects exactly the days played.
    const ids = ranked.map((r) => r.player_id)
    if (!eventId && ids.length) {
      const { data: hist } = await supabase
        .from('game_scores').select('player_id, day_key').eq('mode', mode).in('player_id', ids).not('day_key', 'is', null)
      const byPlayer = {}
      for (const h of hist ?? []) (byPlayer[h.player_id] ||= []).push(h.day_key)
      const s = {}
      for (const id of ids) s[id] = dailyStreak(byPlayer[id] || [])
      setStreaks(s)
    } else {
      setStreaks({})
    }
  }, [mode, region, eventId, daily])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    // Channel topic must be unique per mounted board - the daily screens mount
    // TWO leaderboards for the same mode (today + all-time), and duplicate
    // topics make realtime subscribe throw.
    const sub = supabase.channel(`gs-${mode}-${region}-${eventId || 'all'}-${daily ? 'today' : 'alltime'}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_scores' }, load)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'game_scores' }, load)
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [load, mode, region, eventId, daily])

  // Admins long-press a score to delete it from the leaderboard.
  const longPressedRef = useRef(false)
  async function deleteScore(r) {
    if (!isAdmin) return
    if (!await confirm(`Delete ${r.profiles?.name}'s score (${r.correct}/${r.total})?`)) return
    setRows((prev) => (prev ? prev.filter((x) => x.id !== r.id) : prev))
    await supabase.from('game_scores').delete().eq('id', r.id)
  }
  const startPress = (r) => { if (isAdmin) pressTimer.current = setTimeout(() => { longPressedRef.current = true; deleteScore(r) }, 550) }
  const cancelPress = () => clearTimeout(pressTimer.current)

  return (
    <section>
      <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold"><Icon name="trophy" className="h-5 w-5 text-brand" /> {heading}</h2>
      <p className="mb-4 text-sm text-smoke">
        {blurb
          ?? `${tr(MODE_LABEL[mode])} · ${tr(region)}${eventId ? ' · this event' : ' · all-time'}. ${tr('Ranked by score, then speed.')}${!eventId ? ` ${tr("The flame shows a creator's daily play streak in this mode.")}` : ''}`}
      </p>
      {rows === null ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-cloud" />)}</div>
      ) : rows.length === 0 ? (
        <p className="rounded-card border border-dashed border-gray-200 px-5 py-10 text-center text-sm text-smoke">{tr("No scores yet. Be the first to set one!")}</p>
      ) : (
        <div className="overflow-hidden rounded-card border border-gray-100 shadow-card">
          {rows.map((r, idx) => {
            const mine = r.player_id === highlightUser
            return (
              <div
                key={r.id}
                onTouchStart={() => startPress(r)} onTouchEnd={cancelPress} onTouchMove={cancelPress}
                onMouseDown={() => startPress(r)} onMouseUp={cancelPress} onMouseLeave={cancelPress}
                onContextMenu={(e) => { if (isAdmin) { e.preventDefault(); deleteScore(r) } }}
                className={cx('flex items-center gap-3 border-b border-gray-50 px-4 py-3 last:border-0 sm:gap-4 sm:px-7', mine && 'bg-brand-tint/60', isAdmin && 'select-none')}
              >
                <span className="w-7 shrink-0 text-center text-lg font-bold sm:w-8">{{ 0: '🥇', 1: '🥈', 2: '🥉' }[idx] || idx + 1}</span>
                <Link to={`/profile/${r.profiles?.id}`} onClick={(e) => { if (longPressedRef.current) { e.preventDefault(); longPressedRef.current = false } }} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar src={r.profiles?.photo_url} name={r.profiles?.name} size="sm" />
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-sm font-semibold hover:text-brand">{r.profiles?.name}{mine && <span className="ml-1 text-xs text-brand">(you)</span>}</span>
                    {streaks[r.player_id] >= 1 && <FlameStreak n={streaks[r.player_id]} />}
                  </span>
                </Link>
                {/* Daily puzzles get human results instead of a raw score:
                    Flight Path is all about the landing time, Guess the
                    Country about how few clue words you needed. */}
                {mode === 'zip' ? (
                  <span className="shrink-0 text-right text-xs font-semibold text-ink sm:text-sm">
                    <span className="hidden sm:inline">{tr("Plane safely landed in")} </span>
                    <span className="sm:hidden">{tr("Landed in")} </span>
                    <span className="tabular-nums text-brand">{fmtTime(r.time_ms)}</span>
                  </span>
                ) : mode === 'pinpoint' ? (
                  // Label + time stacked on the right so the row never overflows
                  // a narrow phone (side-by-side used to clip the time off-screen).
                  <div className="flex shrink-0 flex-col items-end leading-tight">
                    <span className="text-xs font-semibold text-ink sm:text-sm">
                      {r.correct > 0 ? `Guessed in ${r.total + 1 - r.correct} word${r.total + 1 - r.correct === 1 ? '' : 's'}` : 'Not guessed'}
                    </span>
                    <span className="text-[11px] tabular-nums text-smoke">{fmtTime(r.time_ms)}</span>
                  </div>
                ) : (
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm font-bold tabular-nums">{r.correct}/{r.total}</span>
                    <span className="w-12 text-right text-xs tabular-nums text-smoke sm:w-14">{fmtTime(r.time_ms)}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
