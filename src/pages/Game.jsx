import { useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Avatar, Badge, PageHeader, Confetti } from '../components/ui'
import Icon from '../components/Icon'
import {
  CONTINENTS, countriesForRegion, airportsForRegion, flagEmoji,
  countryMatches, airportMatches, shuffle,
} from '../lib/countries'
import { cx } from '../lib/utils'

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'
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
]
const MODE_LABEL = { flags: 'Flags', map: 'Find on map', airports: 'Airports' }

const fmtTime = (ms) => {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
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

  function start(m, r) {
    const mm = m || mode, rr = r || region
    const pool = mm === 'airports' ? airportsForRegion(rr) : countriesForRegion(rr)
    setMode(mm)
    setRegion(rr)
    setQuestions(shuffle(pool).slice(0, Math.min(QUESTIONS, pool.length)))
    setSavedScore(null)
    setScreen('play')
  }

  return (
    <div className="page">
      <PageHeader
        title={<span className="flex items-center gap-2"><Icon name="joystick" className="h-7 w-7 text-brand" /> Travel Games</span>}
        subtitle={event ? `Event: ${event.title}` : 'Test your travel knowledge with flags, find-on-the-map and airport codes, by continent or the whole world.'}
      />

      {/* The menu drives the shared mode/region state, so the all-time
          leaderboard below always reflects the mode you currently have selected. */}
      {screen === 'menu' && <Menu mode={mode} setMode={setMode} region={region} setRegion={setRegion} onStart={() => start(mode, region)} eventTitle={event?.title} />}
      {screen === 'play' && <Round mode={mode} region={region} questions={questions} onQuit={() => setScreen('menu')} onFinish={(r) => { setSavedScore(r); setScreen('results') }} />}
      {screen === 'results' && (
        <Results result={savedScore} mode={mode} region={region} eventId={eventId} userId={user.id}
          onPlayAgain={() => start(mode, region)} onMenu={() => setScreen('menu')} />
      )}

      <div className="mt-12"><Leaderboard mode={mode} region={region} eventId={eventId} highlightUser={user.id} /></div>
    </div>
  )
}

// ---------------------------------------------------------------- Menu
function Menu({ mode, setMode, region, setRegion, onStart, eventTitle }) {
  return (
    <div className="space-y-8">
      {eventTitle && (
        <div className="rounded-card bg-brand-tint/60 px-5 py-4 text-sm font-medium text-brand">
          You're joining the "{eventTitle}" challenge. Beat the leaderboard!
        </div>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Choose a mode</h2>
        <div className="grid gap-4 sm:grid-cols-3">
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
      <p className="text-5xl" aria-hidden>{great ? '🏆' : pct >= 50 ? '🎉' : '🌍'}</p>
      <h2 className="text-2xl font-bold">{result.correct} / {result.total} correct</h2>
      <div className="flex gap-3">
        <Badge tone="brand">{pct}%</Badge>
        <Badge tone="light">⏱ {fmtTime(result.time_ms)}</Badge>
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
function Leaderboard({ mode, region, eventId, highlightUser }) {
  const { isAdmin } = useAuth()
  const [rows, setRows] = useState(null)
  const pressTimer = useRef(null)

  const load = useCallback(async () => {
    let q = supabase.from('game_scores').select('*, profiles:player_id(id, name, photo_url)').eq('mode', mode).eq('region', region)
    q = eventId ? q.eq('event_id', eventId) : q.is('event_id', null)
    const { data } = await q
    const best = {}
    for (const s of data ?? []) {
      const cur = best[s.player_id]
      if (!cur || s.correct > cur.correct || (s.correct === cur.correct && s.time_ms < cur.time_ms)) best[s.player_id] = s
    }
    setRows(Object.values(best).sort((a, b) => b.correct - a.correct || a.time_ms - b.time_ms).slice(0, 25))
  }, [mode, region, eventId])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const sub = supabase.channel(`gs-${mode}-${region}-${eventId || 'all'}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_scores' }, load)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'game_scores' }, load)
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [load, mode, region, eventId])

  // Admins long-press a score to delete it from the leaderboard.
  const longPressedRef = useRef(false)
  async function deleteScore(r) {
    if (!isAdmin) return
    if (!confirm(`Delete ${r.profiles?.name}'s score (${r.correct}/${r.total})?`)) return
    setRows((prev) => (prev ? prev.filter((x) => x.id !== r.id) : prev))
    await supabase.from('game_scores').delete().eq('id', r.id)
  }
  const startPress = (r) => { if (isAdmin) pressTimer.current = setTimeout(() => { longPressedRef.current = true; deleteScore(r) }, 550) }
  const cancelPress = () => clearTimeout(pressTimer.current)

  return (
    <section>
      <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold"><Icon name="trophy" className="h-5 w-5 text-brand" /> Leaderboard</h2>
      <p className="mb-4 text-sm text-smoke">{MODE_LABEL[mode]} · {region}{eventId ? ' · this event' : ' · all-time'}. Ranked by score, then speed.</p>
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
                  <span className="truncate text-sm font-semibold hover:text-brand">{r.profiles?.name}{mine && <span className="ml-1 text-xs text-brand">(you)</span>}</span>
                </Link>
                <span className="text-sm font-bold tabular-nums">{r.correct}/{r.total}</span>
                <span className="w-14 text-right text-xs tabular-nums text-smoke">{fmtTime(r.time_ms)}</span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
