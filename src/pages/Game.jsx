import { useEffect, useRef, useState, useCallback } from 'react'
import { confirm } from '../lib/confirm'
import { useSearchParams, Link } from 'react-router-dom'
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps'
import { GEO_URL } from '../lib/mapCountries'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Avatar, Badge, PageHeader, Confetti } from '../components/ui'
import Icon from '../components/Icon'
import {
  CONTINENTS, countriesForRegion, airportsForRegion, flagEmoji,
  countryMatches, airportMatches, shuffle,
  currencyCountriesForRegion, currencyOptions,
} from '../lib/countries'
import { ukDayIndex, ukDayStartIso } from '../lib/daily'
import PinpointGame from '../components/games/PinpointGame'
import ZipGame from '../components/games/ZipGame'
import { cx } from '../lib/utils'

const BRAND = '#d94407'
const BRAND_LIGHT = '#f5853f'
const GREEN = '#16a34a'
const RED = '#dc2626'
const UNSELECTED = '#ECECEE'
const QUESTIONS = 10
const REGIONS = ['World', ...CONTINENTS]
const MODES = [
  { key: 'flags', icon: 'flag', title: 'Guess the flag', text: 'See a flag, type the country.' },
  { key: 'map', icon: 'pin', title: 'Find on the map', text: 'See a country, click it on the map.' },
  { key: 'airports', icon: 'plane', title: 'Airport codes', text: 'See an IATA code, name the city.' },
  { key: 'currencies', icon: 'cash', title: 'Currencies', text: 'See a country, pick the currency it uses.' },
]
const MODE_LABEL = { flags: 'Flags', map: 'Find on map', airports: 'Airports', currencies: 'Currencies', pinpoint: 'Guess the Country', zip: 'Flight Path' }

// The two daily puzzles that sit above "choose a mode". Same puzzle for
// everyone each day, refreshing at midnight UK time.
const DAILIES = [
  { key: 'pinpoint', icon: 'country', title: 'Guess the Country', text: 'Five clue words, guess the country. Fewer clues, more points.', store: 'tryp_pinpoint' },
  { key: 'zip', icon: 'plane-tryp', title: 'Flight Path', text: 'Drag your plane through every stop in order, filling the whole sky.', store: 'tryp_zip' },
]

const fmtTime = (ms) => {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Current weekly streak from a list of play timestamps: the run of consecutive
// 7-day buckets ending this week (or last week — a one-week grace so a streak
// isn't lost the instant a new week starts). Used per game mode.
const WEEK_MS = 7 * 24 * 60 * 60 * 1000
function weeklyStreak(timestamps) {
  if (!timestamps?.length) return 0
  const weeks = new Set(timestamps.map((t) => Math.floor(new Date(t).getTime() / WEEK_MS)))
  const now = Math.floor(Date.now() / WEEK_MS)
  let w = weeks.has(now) ? now : weeks.has(now - 1) ? now - 1 : null
  if (w == null) return 0
  let streak = 0
  while (weeks.has(w)) { streak++; w-- }
  return streak
}

// A custom flame chip (replaces the native 🔥 emoji) with the streak count.
function FlameStreak({ n }) {
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full bg-brand-tint px-1.5 py-0.5 text-[11px] font-bold leading-none text-brand"
      title={`${n}-week streak`}
      aria-label={`${n} week streak`}
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden>
        <path d="M13.5 2C14 5 11.5 6 10 8.2 8.9 9.8 8 11.4 8 13.3a6 6 0 0 0 12 .2c0-2.6-1.4-4.6-2.9-6.3-.9 1.2-2.2 1.3-2-.2.15-1.6-.4-3.6-1.6-5Z" fill="#d94407" />
        <path d="M13 12c.4 1-.4 1.7-1 2.5-.4.5-.7 1.1-.7 1.8a2.4 2.4 0 0 0 4.8.1c0-1.2-.7-2-1.5-2.8-.6.7-1.3.4-1.1-.5.1-.5-.1-.8-.5-1.1Z" fill="#fbbf24" />
      </svg>
      {n}
    </span>
  )
}

export default function Game() {
  const [params] = useSearchParams()
  const eventId = params.get('event')
  const { user } = useAuth()

  const [event, setEvent] = useState(null)
  const [screen, setScreen] = useState('menu')
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

  // Deep link straight into a daily puzzle (/game?daily=zip) from the Home teaser.
  useEffect(() => {
    const d = params.get('daily')
    if (d === 'pinpoint' || d === 'zip') setScreen(d)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
  }

  return (
    <div className="page">
      <PageHeader
        title={<span className="flex items-center gap-2"><Icon name="joystick" className="h-7 w-7 text-brand" /> Travel Games</span>}
        subtitle={event ? `Event: ${event.title}` : 'Daily puzzles, plus flags, find-on-the-map, airport codes and currencies, by continent or the whole world.'}
      />

      {/* The menu drives the shared mode/region state, so the all-time
          leaderboard below always reflects the mode you currently have selected. */}
      {screen === 'menu' && <Menu mode={mode} setMode={setMode} region={region} setRegion={setRegion} onStart={() => start(mode, region)} onDaily={setScreen} eventTitle={event?.title} />}
      {screen === 'play' && <Round mode={mode} region={region} questions={questions} onQuit={() => setScreen('menu')} onFinish={(r) => { setSavedScore(r); setScreen('results') }} />}
      {screen === 'results' && (
        <Results result={savedScore} mode={mode} region={region} eventId={eventId} userId={user.id}
          onPlayAgain={() => start(mode, region)} onMenu={() => setScreen('menu')} />
      )}
      {screen === 'pinpoint' && <PinpointGame onExit={() => setScreen('menu')} />}
      {screen === 'zip' && <ZipGame onExit={() => setScreen('menu')} />}

      <div className="mt-12">
        {screen === 'pinpoint' || screen === 'zip' ? (
          // Daily puzzles get two boards: today's race on the left, the
          // all-time best scores on the right.
          <div className="grid gap-10 lg:grid-cols-2">
            <Leaderboard mode={screen} region="Daily" daily highlightUser={user.id}
              heading="Today's leaderboard"
              blurb={screen === 'zip' ? 'Everyone flies the same route today. Ranked by fastest landing.' : 'Everyone plays the same puzzle today. Ranked by fewest words, then speed.'} />
            <Leaderboard mode={screen} region="Daily" highlightUser={user.id}
              heading="All-time leaderboard"
              blurb={screen === 'zip' ? "Each creator's best-ever daily flight. Ranked by fastest landing." : "Each creator's best-ever daily result. Ranked by fewest words, then speed."} />
          </div>
        ) : (
          <Leaderboard mode={mode} region={region} eventId={eventId} highlightUser={user.id} />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Menu
function Menu({ mode, setMode, region, setRegion, onStart, onDaily, eventTitle }) {
  // Ticks on the daily cards when today's puzzle is already done.
  const [today] = useState(() => ukDayIndex())
  const playedToday = (storeKey) => {
    try { return JSON.parse(localStorage.getItem(storeKey) || 'null')?.day === today } catch { return false }
  }
  return (
    <div className="space-y-8">
      {eventTitle && (
        <div className="rounded-card bg-brand-tint/60 px-5 py-4 text-sm font-medium text-brand">
          You're joining the "{eventTitle}" challenge. Beat the leaderboard!
        </div>
      )}

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Daily puzzles</h2>
          <span className="text-xs text-smoke">New every day, same for everyone</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {DAILIES.map((d) => {
            const done = playedToday(d.store)
            return (
              <button
                key={d.key}
                onClick={() => onDaily(d.key)}
                className="card relative flex items-start gap-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-lift"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand text-white">
                  <Icon name={d.icon} className="h-6 w-6" />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2 font-semibold">
                    {d.title}
                    <Badge tone="brand" className="!px-2 !py-0.5 text-[10px]">Daily</Badge>
                  </span>
                  <span className="mt-1 block text-sm text-smoke">{d.text}</span>
                </span>
                {done && (
                  <span className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-green-600" title="Played today">
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6"/></svg>
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Choose a mode</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={cx('card flex items-start gap-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-lift', mode === m.key && 'ring-2 ring-brand')}
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand">
                <Icon name={m.icon} className="h-6 w-6" />
              </span>
              <span>
                <span className="block font-semibold">{m.title}</span>
                <span className="mt-1 block text-sm text-smoke">{m.text}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Choose a region</h2>
        <div className="flex flex-wrap gap-2">
          {REGIONS.map((r) => (
            <button
              key={r}
              onClick={() => setRegion(r)}
              className={cx('flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors',
                region === r ? 'bg-brand text-white' : 'border border-gray-200 text-smoke hover:border-brand hover:text-brand')}
            >
              {r === 'World' && <Icon name="globe" className="h-4 w-4" />}{r}
            </button>
          ))}
        </div>
      </section>

      <button onClick={() => onStart(mode, region)} className="btn-primary !px-10 !py-4 !text-base">Start game →</button>
    </div>
  )
}

// ---------------------------------------------------------------- Round
function Round({ mode, region, questions, onQuit, onFinish }) {
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

  return (
    <div className="space-y-6">
      {/* Header. On mobile each stat stacks its label above its value so
          nothing is crammed onto one line; it wraps to a second row if needed. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <Badge tone="light"><Icon name={MODES.find((m) => m.key === mode).icon} className="h-3.5 w-3.5" /> {MODE_LABEL[mode]} · {region}</Badge>
        <div className="flex items-center gap-5 sm:gap-7">
          <div className="text-center leading-tight">
            <span className="block text-[10px] font-medium uppercase tracking-wide text-smoke">Question</span>
            <span className="block text-sm font-semibold tabular-nums text-ink">{i + 1} / {questions.length}</span>
          </div>
          <div className="text-center leading-tight">
            <span className="block text-[10px] font-medium uppercase tracking-wide text-smoke">Time</span>
            <span className="block font-mono text-sm font-semibold tabular-nums text-ink">{fmtTime(elapsed)}</span>
          </div>
          <div className="text-center leading-tight">
            <span className="block text-[10px] font-medium uppercase tracking-wide text-smoke">Correct</span>
            <span className="block text-sm font-semibold tabular-nums text-brand">{correct}</span>
          </div>
          <button onClick={onQuit} className="self-center text-xs font-medium text-smoke hover:text-brand">Quit</button>
        </div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-cloud">
        <div className="h-full rounded-full bg-brand transition-all duration-300" style={{ width: `${(i / questions.length) * 100}%` }} />
      </div>

      {/* ---- Flags ---- */}
      {mode === 'flags' && (
        <div className="card flex flex-col items-center gap-6 !py-10 text-center">
          <div className="text-[7rem] leading-none sm:text-[9rem]" aria-label="flag">{flagEmoji(current.iso2)}</div>
          <TypeForm typed={typed} setTyped={setTyped} answered={answered} onSubmit={submitType} inputRef={inputRef} placeholder="Type the country…" />
          {answered && <Feedback answered={answered} answer={current.name} reveal last={last} onNext={next} />}
        </div>
      )}

      {/* ---- Airports ---- */}
      {mode === 'airports' && (
        <div className="card flex flex-col items-center gap-5 !py-10 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-smoke">Which city?</p>
          <div className="rounded-2xl bg-brand px-8 py-5 font-mono text-5xl font-extrabold tracking-widest text-white shadow-lift sm:text-6xl">{current.code}</div>
          <TypeForm typed={typed} setTyped={setTyped} answered={answered} onSubmit={submitType} inputRef={inputRef} placeholder="Type the city…" />
          {answered && <Feedback answered={answered} answer={current.city} reveal last={last} onNext={next} />}
        </div>
      )}

      {/* ---- Currencies: show the country, pick the currency ---- */}
      {mode === 'currencies' && (
        <div className="card flex flex-col items-center gap-6 !py-10 text-center">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-smoke">Which currency does this country use?</p>
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
        </div>
      )}

      {/* ---- Map ---- */}
      {mode === 'map' && (
        <div className="card !p-4 sm:!p-6">
          <p className="mb-3 text-center text-lg font-semibold">Find: <span className="text-brand">{current.name}</span> {flagEmoji(current.iso2)}</p>
          <GameMap placed={placed} revealed={revealed} flashWrong={flashWrong} answered={answered} onPick={pickOnMap} />
          {answered && <div className="mt-4"><Feedback answered={answered} reveal={false} last={last} onNext={next} /></div>}
        </div>
      )}
    </div>
  )
}

function TypeForm({ typed, setTyped, answered, onSubmit, inputRef, placeholder }) {
  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col items-center gap-3">
      <input ref={inputRef} type="text" value={typed} disabled={!!answered} onChange={(e) => setTyped(e.target.value)}
        placeholder={placeholder} className="input text-center text-lg" autoComplete="off" autoCorrect="off" autoCapitalize="words" />
      {!answered && <button type="submit" className="btn-primary w-full">Check</button>}
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
function GameMap({ placed, revealed, flashWrong, answered, onPick }) {
  // Controlled zoom so we can offer on-screen +/- buttons (much friendlier than
  // pinch on a phone) and zoom deep enough to click small countries.
  const [pos, setPos] = useState(MAP_HOME)
  const clampZoom = (z) => Math.max(1, Math.min(16, z))
  const zoomBy = (factor) => setPos((p) => ({ ...p, zoom: clampZoom(p.zoom * factor) }))
  return (
    <div className="relative overflow-hidden rounded-card bg-cloud/60">
      <ComposableMap width={880} height={440} projectionConfig={{ scale: 160, center: [12, 8] }} style={{ width: '100%', height: 'auto', display: 'block' }}>
        <ZoomableGroup minZoom={1} maxZoom={16} zoom={pos.zoom} center={pos.coordinates} onMoveEnd={setPos}>
          <Geographies geography={GEO_URL}>
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
        <button type="button" onClick={() => zoomBy(1.6)} aria-label="Zoom in" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-lg font-bold text-ink shadow-card transition-transform hover:scale-105 active:scale-95">+</button>
        <button type="button" onClick={() => zoomBy(1 / 1.6)} aria-label="Zoom out" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-lg font-bold text-ink shadow-card transition-transform hover:scale-105 active:scale-95">−</button>
        <button type="button" onClick={() => setPos(MAP_HOME)} aria-label="Reset zoom" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-ink shadow-card transition-transform hover:scale-105 active:scale-95"><Icon name="globe" className="h-4 w-4" /></button>
      </div>
      <p className="px-3 pb-2 text-center text-[11px] text-smoke">Tap the country · pinch, scroll or use +/- to zoom · drag to pan · correct stays green, the answer shows in orange</p>
    </div>
  )
}

// ---------------------------------------------------------------- Results
function Results({ result, mode, region, eventId, userId, onPlayAgain, onMenu }) {
  const [saving, setSaving] = useState(true)
  const pct = Math.round((result.correct / result.total) * 100)
  const great = pct >= 80

  useEffect(() => {
    supabase.from('game_scores').insert({
      player_id: userId, mode, region, correct: result.correct, total: result.total,
      time_ms: result.time_ms, event_id: eventId || null,
    }).then(() => setSaving(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="card flex flex-col items-center gap-4 !py-10 text-center animate-pop-in">
      {great && <Confetti count={50} />}
      {pct >= 50 ? (
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand text-white shadow-lift">
          <Icon name="trophy" className="h-8 w-8" />
        </span>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-tint text-brand">
            <Icon name="globe" className="h-8 w-8" />
          </span>
          <p className="text-xs font-medium text-smoke">Keep exploring, give it another go!</p>
        </div>
      )}
      <h2 className="text-2xl font-bold">{result.correct} / {result.total} correct</h2>
      <div className="flex gap-3">
        <Badge tone="brand">{pct}%</Badge>
        <Badge tone="light"><Icon name="clock" className="h-3.5 w-3.5" /> {fmtTime(result.time_ms)}</Badge>
      </div>
      <p className="text-sm text-smoke">{saving ? 'Saving your score…' : 'Score saved to the leaderboard!'}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        <button onClick={onPlayAgain} className="btn-primary">Play again</button>
        <button onClick={onMenu} className="btn-secondary">Change mode</button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Leaderboard
function Leaderboard({ mode, region, eventId, highlightUser, daily = false, heading = 'Leaderboard', blurb = null }) {
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

    // Weekly play streak per creator for this mode (across all regions). Only on
    // the all-time board — a single event doesn't have a weekly cadence.
    const ids = ranked.map((r) => r.player_id)
    if (!eventId && ids.length) {
      const { data: hist } = await supabase
        .from('game_scores').select('player_id, created_at').eq('mode', mode).in('player_id', ids)
      const byPlayer = {}
      for (const h of hist ?? []) (byPlayer[h.player_id] ||= []).push(h.created_at)
      const s = {}
      for (const id of ids) s[id] = weeklyStreak(byPlayer[id])
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
          ?? `${MODE_LABEL[mode]} · ${region}${eventId ? ' · this event' : ' · all-time'}. Ranked by score, then speed.${!eventId ? " The flame shows a creator's weekly play streak in this mode." : ''}`}
      </p>
      {rows === null ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-cloud" />)}</div>
      ) : rows.length === 0 ? (
        <p className="rounded-card border border-dashed border-gray-200 px-5 py-10 text-center text-sm text-smoke">No scores yet. Be the first to set one!</p>
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
                className={cx('flex items-center gap-4 border-b border-gray-50 px-5 py-3 last:border-0 sm:px-7', mine && 'bg-brand-tint/60', isAdmin && 'select-none')}
              >
                <span className="w-8 text-center text-lg font-bold">{{ 0: '🥇', 1: '🥈', 2: '🥉' }[idx] || idx + 1}</span>
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
                  <span className="text-right text-xs font-semibold text-ink sm:text-sm">
                    Plane safely landed in <span className="tabular-nums text-brand">{fmtTime(r.time_ms)}</span>
                  </span>
                ) : mode === 'pinpoint' ? (
                  <>
                    <span className="text-right text-xs font-semibold text-ink sm:text-sm">
                      {r.correct > 0 ? `Guessed in ${r.total + 1 - r.correct} word${r.total + 1 - r.correct === 1 ? '' : 's'}` : 'Not guessed'}
                    </span>
                    <span className="w-14 text-right text-xs tabular-nums text-smoke">{fmtTime(r.time_ms)}</span>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-bold tabular-nums">{r.correct}/{r.total}</span>
                    <span className="w-14 text-right text-xs tabular-nums text-smoke">{fmtTime(r.time_ms)}</span>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
