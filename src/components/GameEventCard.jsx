import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Icon from './Icon'

const fmtTime = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`
const MODE_LABEL = { flags: 'Guess the flag', map: 'Find on the map', airports: 'Airport codes' }

// An inline game-event card inside a chat message: shows the challenge, a
// "Play" button, and the live top-3 for the event. (Mirrors PollCard.)
export default function GameEventCard({ eventId }) {
  const [event, setEvent] = useState(null)
  const [top, setTop] = useState([])

  const load = useCallback(async () => {
    const [{ data: ev }, { data: scores }] = await Promise.all([
      supabase.from('game_events').select('*').eq('id', eventId).single(),
      supabase.from('game_scores').select('*, profiles:player_id(name)').eq('event_id', eventId),
    ])
    setEvent(ev)
    // best run per player
    const best = {}
    for (const s of scores ?? []) {
      const cur = best[s.player_id]
      if (!cur || s.correct > cur.correct || (s.correct === cur.correct && s.time_ms < cur.time_ms)) best[s.player_id] = s
    }
    setTop(Object.values(best).sort((a, b) => b.correct - a.correct || a.time_ms - b.time_ms).slice(0, 3))
  }, [eventId])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const sub = supabase.channel(`gevent-${eventId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_scores', filter: `event_id=eq.${eventId}` }, load)
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [eventId, load])

  if (!event) return null

  return (
    <div className="mt-1 w-72 max-w-full overflow-hidden rounded-2xl border border-brand/20 bg-white sm:w-80">
      <div className="bg-gradient-to-br from-brand to-brand-light px-4 py-3 text-white">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/80"><Icon name="plane" className="h-3.5 w-3.5" /> Game challenge</p>
        <p className="text-sm font-bold leading-snug">{event.title}</p>
        <p className="text-xs text-white/85">{MODE_LABEL[event.mode] || event.mode} · {event.region}</p>
      </div>
      <div className="p-3">
        {top.length > 0 ? (
          <ol className="mb-3 space-y-1">
            {top.map((s, i) => (
              <li key={s.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate">{['🥇', '🥈', '🥉'][i]} {s.profiles?.name}</span>
                <span className="shrink-0 font-semibold tabular-nums">{s.correct}/{s.total} · {fmtTime(s.time_ms)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mb-3 text-xs text-smoke">No scores yet — be first on the board!</p>
        )}
        <Link to={`/game?event=${eventId}`} className="btn-primary w-full !py-2 text-xs">Play now →</Link>
      </div>
    </div>
  )
}
