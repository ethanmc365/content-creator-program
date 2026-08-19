import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Icon from './Icon'
import { cx } from '../lib/utils'

// THE ANSWER CONTROL, AND ONLY THE ANSWER CONTROL.
//
// It used to print the attendee avatars as well, which is why a card carrying
// `RsvpFaces` showed the same seven people twice - once as "Alexandra and 6
// others are going" and again underneath as "Going · 7" with the same faces in
// the same order. Who is going is the CARD's job now (see
// components/calendar/RsvpFaces, which orders faces by who you know and leads
// with a name rather than a number). This is the button pair.
//
// IT IS NOT RED AND GREEN ANY MORE. "Can't make it" was `border-red-400
// bg-red-50 text-red-600`, which is both off-palette and the wrong signal: not
// being able to come is not an error. Going is the platform orange, filled,
// because it is the answer the page is asking for; not going is a quiet
// outline. The count of people who cannot come is a number in words, not a
// second stack of faces - it is the least interesting fact on the card.
export default function EventRsvp({ eventId }) {
  const { user } = useAuth()
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(false)

  async function load() {
    const { data } = await supabase
      .from('event_rsvps')
      .select('user_id, status')
      .eq('event_id', eventId)
    setRows(data ?? [])
  }
  useEffect(() => { load() }, [eventId]) // eslint-disable-line react-hooks/exhaustive-deps

  const mine = rows.find((r) => r.user_id === user.id)?.status || null
  const cant = rows.filter((r) => r.status === 'cant').length

  async function choose(status) {
    if (busy) return
    setBusy(true)
    // Optimistic: reflect my choice immediately, then reconcile from the server.
    setRows((prev) => {
      const rest = prev.filter((r) => r.user_id !== user.id)
      return mine === status ? rest : [...rest, { user_id: user.id, status }]
    })
    if (mine === status) {
      await supabase.from('event_rsvps').delete().eq('event_id', eventId).eq('user_id', user.id)
    } else {
      await supabase.from('event_rsvps').upsert({ event_id: eventId, user_id: user.id, status }, { onConflict: 'event_id,user_id' })
    }
    await load()
    setBusy(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button" onClick={() => choose('going')} disabled={busy}
        className={cx(
          'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-95',
          mine === 'going'
            ? 'border-brand bg-brand text-white shadow-card'
            : 'border-gray-200 bg-white text-smoke hover:-translate-y-0.5 hover:border-brand hover:text-brand',
        )}
      >
        {mine === 'going' && <Icon name="check" className="h-3.5 w-3.5" />}
        I&rsquo;m going
      </button>
      <button
        type="button" onClick={() => choose('cant')} disabled={busy}
        className={cx(
          'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-95',
          mine === 'cant'
            ? 'border-ink bg-ink text-white'
            : 'border-gray-200 bg-white text-smoke hover:-translate-y-0.5 hover:border-ink hover:text-ink',
        )}
      >
        {mine === 'cant' && <Icon name="check" className="h-3.5 w-3.5" />}
        Can&rsquo;t make it
      </button>
      {cant > 0 && (
        <span className="text-[11px] text-smoke">{cant} can&rsquo;t make it</span>
      )}
    </div>
  )
}
