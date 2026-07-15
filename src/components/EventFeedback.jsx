import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { confirm, notice } from '../lib/confirm'
import { Avatar, Badge, Modal, Spinner } from './ui'
import Icon from './Icon'
import { cx, timeAgo } from '../lib/utils'

// Two small "close the loop" features for events:
//  * SuggestEvent  - creators propose sessions they'd like; admins get
//    notified (DB trigger) and triage the list right on the calendar page.
//  * EventRatingPrompt - after an event you RSVP'd "going" to has finished,
//    a one-off popup asks you to rate it 1-10 with tappable stars.
//  * EventRatingsAdmin - admins see each event's average + who said what.

const SUGGESTION_TONE = { new: 'brand', planned: 'green', done: 'grey', declined: 'red' }

export function SuggestEvent() {
  const { user, isAdmin } = useAuth()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [saving, setSaving] = useState(false)
  const [suggestions, setSuggestions] = useState([])

  const load = useCallback(async () => {
    const { data } = await supabase.from('event_suggestions')
      .select('*, profiles:creator_id(id, name, photo_url)')
      .order('created_at', { ascending: false })
      .limit(isAdmin ? 20 : 5)
    setSuggestions(data ?? [])
  }, [isAdmin])

  useEffect(() => { load() }, [load])

  async function submit(e) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    const { error } = await supabase.from('event_suggestions')
      .insert({ creator_id: user.id, title: title.trim(), details: details.trim() || null })
    setSaving(false)
    if (error) { notice(`Could not send your suggestion: ${error.message}`); return }
    setTitle(''); setDetails(''); setOpen(false)
    notice("Thanks! The team has been notified and will look into it.")
    load()
  }

  async function setStatus(s, status) {
    await supabase.from('event_suggestions').update({ status }).eq('id', s.id)
    load()
  }
  async function remove(s) {
    if (!await confirm(`Delete the suggestion "${s.title}"?`)) return
    await supabase.from('event_suggestions').delete().eq('id', s.id)
    load()
  }

  return (
    <section className="mt-10">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Icon name="pencil" className="h-5 w-5 text-brand" /> Event ideas</h2>
        <button onClick={() => setOpen(true)} className="btn-secondary !py-2 text-xs">+ Suggest an event</button>
      </div>
      <p className="mb-4 text-sm text-smoke">
        Want a workshop, Q&A or meet-up on something specific? Suggest it and the team will try to make it happen.
      </p>

      {suggestions.length > 0 && (
        <div className="space-y-2">
          {suggestions.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-card border border-gray-100 bg-white px-4 py-3">
              <Avatar src={s.profiles?.photo_url} name={s.profiles?.name} size="xs" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{s.title}</p>
                {s.details && <p className="text-xs text-smoke line-clamp-2">{s.details}</p>}
                <p className="text-[11px] text-smoke">{s.profiles?.name} · {timeAgo(s.created_at)}</p>
              </div>
              <Badge tone={SUGGESTION_TONE[s.status] || 'grey'}>{s.status}</Badge>
              {isAdmin && (
                <span className="flex gap-2 text-xs font-medium">
                  {s.status === 'new' && <button onClick={() => setStatus(s, 'planned')} className="text-green-600 hover:underline">Plan it</button>}
                  {s.status === 'planned' && <button onClick={() => setStatus(s, 'done')} className="text-smoke hover:underline">Done</button>}
                  {s.status === 'new' && <button onClick={() => setStatus(s, 'declined')} className="text-smoke hover:underline">Decline</button>}
                  <button onClick={() => remove(s)} className="text-red-500 hover:underline">Delete</button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Suggest an event">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="sug-title" className="label">What would you like to see?</label>
            <input id="sug-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Editing workshop for Reels" />
          </div>
          <div>
            <label htmlFor="sug-details" className="label">Any details? (optional)</label>
            <textarea id="sug-details" rows="3" className="input" value={details} onChange={(e) => setDetails(e.target.value)} placeholder="What you'd want covered, ideal timing…" />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setOpen(false)} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={saving || !title.trim()} className="btn-primary">{saving ? <Spinner /> : 'Send suggestion'}</button>
          </div>
        </form>
      </Modal>
    </section>
  )
}

// ---------------------------------------------------------------- rating
const DISMISS_KEY = 'tryp_rating_dismissed'

export function EventRatingPrompt() {
  const { user, profile } = useAuth()
  const [target, setTarget] = useState(null) // event awaiting my rating
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user || !profile) return
    let alive = true
    ;(async () => {
      const now = Date.now()
      const from = new Date(now - 14 * 86_400_000).toISOString()
      const to = new Date(now - 60 * 60_000).toISOString() // ended at least an hour ago
      const { data: past } = await supabase.from('events')
        .select('id, title, date')
        .eq('rsvp_enabled', true)
        .gte('date', from).lte('date', to)
        .order('date', { ascending: false })
      if (!alive || !past?.length) return
      const ids = past.map((e) => e.id)
      const [{ data: rsvps }, { data: ratings }] = await Promise.all([
        supabase.from('event_rsvps').select('event_id').eq('user_id', user.id).eq('status', 'going').in('event_id', ids),
        supabase.from('event_ratings').select('event_id').eq('creator_id', user.id).in('event_id', ids),
      ])
      if (!alive) return
      const went = new Set((rsvps ?? []).map((r) => r.event_id))
      const rated = new Set((ratings ?? []).map((r) => r.event_id))
      let dismissed = []
      try { dismissed = JSON.parse(sessionStorage.getItem(DISMISS_KEY) || '[]') } catch { /* ignore */ }
      const candidate = past.find((e) => went.has(e.id) && !rated.has(e.id) && !dismissed.includes(e.id))
      if (candidate) setTarget(candidate)
    })()
    return () => { alive = false }
  }, [user, profile])

  if (!target) return null

  function dismiss() {
    try {
      const d = JSON.parse(sessionStorage.getItem(DISMISS_KEY) || '[]')
      sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...d, target.id]))
    } catch { /* ignore */ }
    setTarget(null)
  }

  async function submit() {
    if (!rating) return
    setSaving(true)
    await supabase.from('event_ratings').insert({ event_id: target.id, creator_id: user.id, rating })
    setSaving(false)
    setTarget(null)
  }

  const shown = hover || rating

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-label="Rate the event">
      <div className="w-full max-w-md rounded-card bg-white p-6 shadow-lift animate-pop-in sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-smoke">How was it?</p>
        <h2 className="mt-1 text-xl font-bold text-ink">{target.title}</h2>
        <p className="mt-1 text-sm text-smoke">Tap a star to rate it from 1 to 10. Your rating helps shape future events.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-1" onMouseLeave={() => setHover(0)}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              aria-label={`${n} out of 10`}
              className="p-0.5 transition-transform hover:scale-110"
            >
              <svg viewBox="0 0 24 24" className={cx('h-7 w-7 transition-colors', n <= shown ? 'text-brand' : 'text-gray-200')} fill="currentColor">
                <path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.05 1.1-6.5-4.7-4.6 6.5-.95z" />
              </svg>
            </button>
          ))}
        </div>
        <p className="mt-2 text-center text-sm font-semibold tabular-nums text-brand">{rating ? `${rating} / 10` : ' '}</p>
        <div className="mt-4 flex justify-center gap-3">
          <button onClick={dismiss} className="btn-ghost text-sm">Not now</button>
          <button onClick={submit} disabled={!rating || saving} className="btn-primary disabled:opacity-50">
            {saving ? <Spinner /> : 'Submit rating'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- admin view
export function EventRatingsAdmin() {
  const { isAdmin } = useAuth()
  const [rows, setRows] = useState([])

  useEffect(() => {
    if (!isAdmin) return
    let alive = true
    ;(async () => {
      const { data: ratings } = await supabase.from('event_ratings')
        .select('event_id, rating, created_at, profiles:creator_id(id, name, photo_url), events:event_id(id, title, date)')
        .order('created_at', { ascending: false })
      if (!alive || !ratings?.length) return
      const byEvent = new Map()
      for (const r of ratings) {
        if (!byEvent.has(r.event_id)) byEvent.set(r.event_id, { event: r.events, ratings: [] })
        byEvent.get(r.event_id).ratings.push(r)
      }
      setRows([...byEvent.values()].sort((a, b) => new Date(b.event?.date) - new Date(a.event?.date)))
    })()
    return () => { alive = false }
  }, [isAdmin])

  if (!isAdmin || rows.length === 0) return null

  return (
    <section className="mt-10">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><Icon name="star" className="h-5 w-5 text-brand" /> Event feedback</h2>
      <p className="mb-4 text-sm text-smoke">Post-event ratings from attendees (1-10). Only admins see this.</p>
      <div className="space-y-3">
        {rows.map(({ event, ratings }) => {
          const avg = ratings.reduce((s, r) => s + r.rating, 0) / ratings.length
          return (
            <details key={event?.id} className="rounded-card border border-gray-100 bg-white px-5 py-4">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3">
                <span className="min-w-0 flex-1 text-sm font-semibold text-ink">{event?.title}</span>
                <span className="rounded-full bg-brand-tint px-3 py-1 text-xs font-bold text-brand">{avg.toFixed(1)} / 10</span>
                <span className="text-xs text-smoke">{ratings.length} rating{ratings.length === 1 ? '' : 's'}</span>
              </summary>
              <div className="mt-3 space-y-1.5 border-t border-gray-50 pt-3">
                {ratings.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-smoke">
                    <Avatar src={r.profiles?.photo_url} name={r.profiles?.name} size="xs" />
                    <span className="font-medium text-ink">{r.profiles?.name}</span>
                    <span className="ml-auto font-bold tabular-nums text-brand">{r.rating}/10</span>
                  </div>
                ))}
              </div>
            </details>
          )
        })}
      </div>
    </section>
  )
}
