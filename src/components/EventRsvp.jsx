import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Avatar } from './ui'
import { cx } from '../lib/utils'

// RSVP controls for an event that has it enabled: going / can't buttons plus the
// attendee avatars (green ring for going, red cross for can't). Hover shows the
// name; clicking opens the profile.
function AvatarRow({ rows, ring, cross }) {
  return (
    <div className="flex -space-x-2">
      {rows.slice(0, 8).map((r) => (
        <Link key={r.user_id} to={`/profile/${r.user_id}`} title={r.profiles?.name} className="relative">
          <Avatar src={r.profiles?.photo_url} name={r.profiles?.name} size="xs" className={cx('!h-7 !w-7 ring-2', ring)} />
          {cross && (
            <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-red-500 text-[7px] font-bold text-white ring-1 ring-white">✕</span>
          )}
        </Link>
      ))}
      {rows.length > 8 && <span className="ml-3 self-center text-[11px] text-smoke">+{rows.length - 8}</span>}
    </div>
  )
}

export default function EventRsvp({ eventId }) {
  const { user } = useAuth()
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(false)

  async function load() {
    const { data } = await supabase
      .from('event_rsvps')
      .select('user_id, status, profiles:user_id(id, name, photo_url)')
      .eq('event_id', eventId)
    setRows(data ?? [])
  }
  useEffect(() => { load() }, [eventId]) // eslint-disable-line react-hooks/exhaustive-deps

  const mine = rows.find((r) => r.user_id === user.id)?.status || null
  const going = rows.filter((r) => r.status === 'going')
  const cant = rows.filter((r) => r.status === 'cant')

  async function choose(status) {
    if (busy) return
    setBusy(true)
    // Optimistic: reflect my choice immediately, then reconcile from the server.
    setRows((prev) => {
      const rest = prev.filter((r) => r.user_id !== user.id)
      return mine === status ? rest : [...rest, { user_id: user.id, status, profiles: { id: user.id } }]
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
    <div className="mt-3 rounded-xl border border-gray-100 bg-white p-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button" onClick={() => choose('going')}
          className={cx('rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
            mine === 'going' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-smoke hover:border-green-400 hover:text-green-600')}
        >
          {mine === 'going' ? "✓ I'm going" : "I'm going"}
        </button>
        <button
          type="button" onClick={() => choose('cant')}
          className={cx('rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
            mine === 'cant' ? 'border-red-400 bg-red-50 text-red-600' : 'border-gray-200 text-smoke hover:border-red-300 hover:text-red-500')}
        >
          {mine === 'cant' ? "✓ Can't make it" : "Can't make it"}
        </button>
      </div>
      {(going.length > 0 || cant.length > 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
          {going.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-green-600">Going · {going.length}</span>
              <AvatarRow rows={going} ring="ring-green-400" />
            </div>
          )}
          {cant.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-red-500">Can't · {cant.length}</span>
              <AvatarRow rows={cant} ring="ring-red-300" cross />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
