import { useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Avatar, Badge, PageHeader, Confetti } from '../components/ui'
import {
  CONTINENTS, countriesForRegion, flagEmoji, countryMatches, shuffle,
} from '../lib/countries'
import { cx } from '../lib/utils'

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'
const BRAND = '#d94407'
const BRAND_LIGHT = '#f5853f'
const GREEN = '#16a34a'
const RED = '#dc2626'
const UNSELECTED = '#ECECEE'
const QUESTIONS = 10 // per round (or fewer if the region has fewer countries)
const REGIONS = ['World', ...CONTINENTS]

const fmtTime = (ms) => {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function Game() {
  const [params] = useSearchParams()
  const eventId = params.get('event')
  const { user } = useAuth()

  const [event, setEvent] = useState(null) // game_events row if launched from chat
  const [screen, setScreen] = useState('menu') // menu | play | results
  const [mode, setMode] = useState('flags') // flags | map
  const [region, setRegion] = useState('World')
  const [questions, setQuestions] = useState([])
  const [savedScore, setSavedScore] = useState(null)

  // Load the event (if any) and jump straight into its settings.
  useEffect(() => {
    if (!eventId) return
    supabase.from('game_events').select('*').eq('id', eventId).single().then(({ data }) => {
      if (data) { setEvent(data); setMode(data.mode); setRegion(data.region) }
    })
  }, [eventId])

  function start(m, r) {
    const pool = countriesForRegion(r)
    setMode(m)
    setRegion(r)
    setQuestions(shuffle(pool).slice(0, Math.min(QUESTIONS, pool.length)))
    setSavedScore(null)
    setScreen('play')
  }

  function finish(result) {
    setSavedScore(result)
    setScreen('results')
  }

  return (
    <div className="page">
      <PageHeader
        title="Geography Game 🌍"
        subtitle={event ? `Event: ${event.title}` : 'Test your travel knowledge. Flags and find-on-the-map, by continent or the whole world.'}
      />

      {screen === 'menu' && (
        <Menu onStart={start} presetMode={event ? mode : null} presetRegion={event ? region : null} eventTitle={event?.title} />
      )}
      {screen === 'play' && (
        <Round
          mode={mode} region={region} questions={questions}
          onQuit={() => setScreen('menu')} onFinish={finish}
        />
      )}
      {screen === 'results' && (
        <Results
          result={savedScore} mode={mode} region={region} eventId={eventId} userId={user.id}
          onPlayAgain={() => start(mode, region)} onMenu={() => setScreen('menu')}
        />
      )}

      {/* Leaderboard always visible below */}
      <div className="mt-12">
        <Leaderboard mode={mode} region={region} eventId={eventId} highlightUser={user.id} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Menu
function Menu({ onStart, presetMode, presetRegion, eventTitle }) {
  const [mode, setMode] = useState(presetMode || 'flags')
  const [region, setRegion] = useState(presetRegion || 'World')

  return (
    <div className="space-y-8">
      {eventTitle && (
        <div className="rounded-card bg-brand-tint/60 px-5 py-4 text-sm font-medium text-brand">
          🎮 You're joining the "{eventTitle}" challenge. Beat the leaderboard!
        </div>
      )}

      {/* Mode */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Choose a mode</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { key: 'flags', emoji: '🚩', title: 'Guess the flag', text: 'See a flag, type the country.' },
            { key: 'map', emoji: '📍', title: 'Find on the map', text: 'See a country, click it on the map.' },
          ].map((m) => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={cx('card flex items-start gap-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-lift', mode === m.key && 'ring-2 ring-brand')}
            >
              <span className="text-3xl" aria-hidden>{m.emoji}</span>
              <span>
                <span className="block font-semibold">{m.title}</span>
                <span className="mt-1 block text-sm text-smoke">{m.text}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Region */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Choose a region</h2>
        <div className="flex flex-wrap gap-2">
          {REGIONS.map((r) => (
            <button
              key={r}
              onClick={() => setRegion(r)}
              className={cx(
                'rounded-full px-4 py-2 text-sm font-medium transition-colors',
                region === r ? 'bg-brand text-white' : 'border border-gray-200 text-smoke hover:border-brand hover:text-brand'
              )}
            >
              {r === 'World' ? '🌍 World' : r}
            </button>
          ))}
        </div>
      </section>

      <button onClick={() => onStart(mode, region)} className="btn-primary !px-10 !py-4 !text-base">
        Start game →
      </button>
    </div>
  )
}

// ---------------------------------------------------------------- Round
function Round({ mode, region, questions, onQuit, onFinish }) {
  const [i, setI] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [answered, setAnswered] = useState(null) // { right, picked }
  const [typed, setTyped] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef(0)
  const inputRef = useRef(null)

  const current = questions[i]
  const last = i === questions.length - 1

  // Live stopwatch (start time recorded on mount).
  useEffect(() => {
    startRef.current = Date.now()
    const t = setInterval(() => setElapsed(Date.now() - startRef.current), 200)
    return () => clearInterval(t)
  }, [])

  useEffect(() => { if (mode === 'flags' && !answered) inputRef.current?.focus() }, [i, answered, mode])

  function submitFlag(e) {
    e.preventDefault()
    if (answered) return
    const right = countryMatches(current, typed)
    if (right) setCorrect((c) => c + 1)
    setAnswered({ right })
  }

  function pickOnMap(geoName) {
    if (answered) return
    const right = countryMatches(current, geoName)
    if (right) setCorrect((c) => c + 1)
    setAnswered({ right, picked: geoName })
  }

  function next() {
    if (last) {
      onFinish({ correct, total: questions.length, time_ms: Date.now() - startRef.current })
      return
    }
    setI((x) => x + 1)
    setAnswered(null)
    setTyped('')
  }

  return (
    <div className="space-y-6">
      {/* Progress + timer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-sm">
          <Badge tone="light">{mode === 'flags' ? '🚩 Flags' : '📍 Map'} · {region}</Badge>
          <span className="font-medium text-smoke">Question {i + 1} / {questions.length}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono text-sm font-semibold tabular-nums text-ink">⏱ {fmtTime(elapsed)}</span>
          <span className="text-sm font-semibold text-brand">{correct} correct</span>
          <button onClick={onQuit} className="text-xs font-medium text-smoke hover:text-brand">Quit</button>
        </div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-cloud">
        <div className="h-full rounded-full bg-brand transition-all duration-300" style={{ width: `${(i / questions.length) * 100}%` }} />
      </div>

      {/* ---- Flags mode ---- */}
      {mode === 'flags' && (
        <div className="card flex flex-col items-center gap-6 !py-10 text-center">
          <div className="text-[7rem] leading-none sm:text-[9rem]" aria-label="flag">{flagEmoji(current.iso2)}</div>
          <form onSubmit={submitFlag} className="flex w-full max-w-sm flex-col items-center gap-3">
            <input
              ref={inputRef} type="text" value={typed} disabled={!!answered}
              onChange={(e) => setTyped(e.target.value)} placeholder="Type the country…"
              className="input text-center text-lg" autoComplete="off" autoCorrect="off" autoCapitalize="words"
            />
            {!answered && <button type="submit" className="btn-primary w-full">Check</button>}
          </form>
          {answered && <Feedback answered={answered} answer={current.name} last={last} onNext={next} />}
        </div>
      )}

      {/* ---- Map mode ---- */}
      {mode === 'map' && (
        <div className="card !p-4 sm:!p-6">
          <p className="mb-3 text-center text-lg font-semibold">
            Find: <span className="text-brand">{current.name}</span> {flagEmoji(current.iso2)}
          </p>
          <GameMap target={current} answered={answered} onPick={pickOnMap} />
          {answered && <div className="mt-4"><Feedback answered={answered} answer={current.name} last={last} onNext={next} /></div>}
        </div>
      )}
    </div>
  )
}

function Feedback({ answered, answer, last, onNext }) {
  return (
    <div className="flex flex-col items-center gap-3 animate-fade-up">
      {answered.right ? (
        <p className="text-lg font-bold text-green-600">✓ Correct!</p>
      ) : (
        <p className="text-lg font-bold text-red-600">✗ Not quite — it's <span className="underline">{answer}</span></p>
      )}
      <button onClick={onNext} className="btn-primary">{last ? 'See results →' : 'Next →'}</button>
    </div>
  )
}

// ---------------------------------------------------------------- Game map
function GameMap({ target, answered, onPick }) {
  return (
    <div className="overflow-hidden rounded-card bg-cloud/60">
      <ComposableMap width={880} height={440} projectionConfig={{ scale: 160, center: [12, 8] }} style={{ width: '100%', height: 'auto', display: 'block' }}>
        <ZoomableGroup minZoom={1} maxZoom={5}>
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies
                .filter((geo) => geo.properties.name !== 'Antarctica')
                .map((geo) => {
                  const name = geo.properties.name
                  const isTarget = countryMatches(target, name)
                  const isPicked = answered?.picked === name
                  let fill = UNSELECTED
                  if (answered) {
                    if (isTarget) fill = GREEN // always reveal the correct country
                    else if (isPicked) fill = RED // your wrong pick
                  }
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      onClick={!answered ? () => onPick(name) : undefined}
                      style={{
                        default: { fill, stroke: '#fff', strokeWidth: 0.4, outline: 'none', transition: 'fill 0.25s' },
                        hover: { fill: answered ? fill : BRAND_LIGHT, stroke: '#fff', strokeWidth: 0.4, outline: 'none', cursor: answered ? 'default' : 'pointer' },
                        pressed: { fill: BRAND, outline: 'none' },
                      }}
                    />
                  )
                })
            }
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>
      <p className="px-3 pb-2 text-center text-[11px] text-smoke">Tap the country · pinch/scroll to zoom</p>
    </div>
  )
}

// ---------------------------------------------------------------- Results
function Results({ result, mode, region, eventId, userId, onPlayAgain, onMenu }) {
  const [saving, setSaving] = useState(true)
  const pct = Math.round((result.correct / result.total) * 100)
  const great = pct >= 80

  useEffect(() => {
    async function save() {
      await supabase.from('game_scores').insert({
        player_id: userId, mode, region, correct: result.correct, total: result.total,
        time_ms: result.time_ms, event_id: eventId || null,
      })
      setSaving(false)
    }
    save()
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
  const [rows, setRows] = useState(null)

  const load = useCallback(async () => {
    let q = supabase
      .from('game_scores')
      .select('*, profiles:player_id(id, name, photo_url)')
      .eq('mode', mode)
      .eq('region', region)
    q = eventId ? q.eq('event_id', eventId) : q.is('event_id', null)
    const { data } = await q
    // Best run per player: highest correct, then fastest time.
    const best = {}
    for (const s of data ?? []) {
      const cur = best[s.player_id]
      if (!cur || s.correct > cur.correct || (s.correct === cur.correct && s.time_ms < cur.time_ms)) best[s.player_id] = s
    }
    setRows(
      Object.values(best).sort((a, b) => b.correct - a.correct || a.time_ms - b.time_ms).slice(0, 25)
    )
  }, [mode, region, eventId])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const sub = supabase.channel(`gs-${mode}-${region}-${eventId || 'all'}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_scores' }, load)
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [load, mode, region, eventId])

  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold">🏅 Leaderboard</h2>
      <p className="mb-4 text-sm text-smoke">
        {mode === 'flags' ? 'Flags' : 'Find on map'} · {region}{eventId ? ' · this event' : ' · all-time'}. Ranked by score, then speed.
      </p>
      {rows === null ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-cloud" />)}</div>
      ) : rows.length === 0 ? (
        <p className="rounded-card border border-dashed border-gray-200 px-5 py-10 text-center text-sm text-smoke">No scores yet — be the first to set one!</p>
      ) : (
        <div className="overflow-hidden rounded-card border border-gray-100 shadow-card">
          {rows.map((r, idx) => {
            const mine = r.player_id === highlightUser
            return (
              <div key={r.id} className={cx('flex items-center gap-4 border-b border-gray-50 px-5 py-3 last:border-0 sm:px-7', mine && 'bg-brand-tint/60')}>
                <span className="w-8 text-center text-lg font-bold">{{ 0: '🥇', 1: '🥈', 2: '🥉' }[idx] || idx + 1}</span>
                <Link to={`/profile/${r.profiles?.id}`} className="flex min-w-0 flex-1 items-center gap-3">
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
