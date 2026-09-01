import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { confirm, notice } from '../lib/confirm'
import { Avatar, Badge, Modal, Spinner } from './ui'
import Icon from './Icon'
import { cx, timeAgo } from '../lib/utils'
import { useMarkets } from '../lib/markets'
import { useMyScopes } from '../lib/scope'
import MarketPicker from './calendar/MarketPicker'

// Two small "close the loop" features for events:
//  * SuggestEvent  - creators propose sessions they'd like; admins get
//    notified (DB trigger) and triage the list right on the calendar page.
//  * EventRatingPrompt - after an event you RSVP'd "going" to has finished,
//    a one-off popup asks you to rate it 1-10 with tappable stars.
//  * EventRatingsAdmin - admins see each event's average + who said what.

const SUGGESTION_TONE = { new: 'brand', planned: 'green', done: 'grey', declined: 'red' }

export function SuggestEvent({ open = false, onClose }) {
  const { user, isAdmin } = useAuth()
  // ONLY THE MARKETS THEY ARE ACTUALLY IN. Ethan: "if theyre just in spanish
  // market then only options that show for them are global and spain." An admin
  // sees the lot, because an admin belongs to every market anyway.
  const allMarkets = useMarkets()
  const { ids: scopeIds } = useMyScopes()
  const myMarkets = isAdmin || !scopeIds
    ? allMarkets
    : allMarkets.filter((c) => scopeIds.has(c.id))
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [markets, setMarkets] = useState([])
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
      .insert({ creator_id: user.id, title: title.trim(), details: details.trim() || null, community_ids: markets })
    setSaving(false)
    if (error) { notice(`Could not send your suggestion: ${error.message}`); return }
    setTitle(''); setDetails(''); setMarkets([]); onClose?.()
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
    // `id` so the admin panel's desk row can link straight to it. See
    // AdminPanel: these used to be visible only by scrolling to the foot of the
    // calendar, which is not somewhere anybody goes looking for work.
    //
    // THE ASK MOVED INTO THE PAGE HEADER (1 Sep 2026). "Suggest an event" is a
    // primary action, so it now sits in the same row as Personal event and
    // Sync; this section is only the list of what has been suggested, and the
    // heading + explanation that used to sit above it are gone with the button.
    // `open` is owned by the page, which is what puts the button up there.
    <section id="suggestions" className="mt-10 scroll-mt-24">
      {suggestions.length > 0 && (
        <div className="space-y-2">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <Icon name="pencil" className="h-5 w-5 text-brand" /> Suggested by creators
          </h2>
          {suggestions.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-card border border-gray-100 bg-white px-4 py-3">
              <Avatar src={s.profiles?.photo_url} name={s.profiles?.name} size="xs" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{s.title}</p>
                {s.details && <p className="text-xs text-smoke line-clamp-2">{s.details}</p>}
                <p className="text-[11px] text-smoke">
                  {s.profiles?.name} · {timeAgo(s.created_at)}
                  {s.community_ids?.length > 0 && (
                    <span className="ml-1.5 font-semibold text-brand">
                      · {allMarkets.filter((c) => s.community_ids.includes(c.id)).map((c) => c.name).join(', ') || 'a market'}
                    </span>
                  )}
                </p>
              </div>
              <Badge tone={SUGGESTION_TONE[s.status] || 'grey'}>{s.status}</Badge>
              {isAdmin && (
                <span className="flex gap-2 text-xs font-medium">
                  {s.status === 'new' && <button onClick={() => setStatus(s, 'planned')} className="text-green-600 hover:underline">Plan it</button>}
                  {s.status === 'planned' && <button onClick={() => setStatus(s, 'done')} className="text-smoke hover:underline">Done</button>}
                  {s.status === 'new' && <button onClick={() => setStatus(s, 'declined')} className="text-smoke hover:underline">Decline</button>}
                  <button onClick={() => remove(s)} className="text-smoke hover:text-ink hover:underline">Delete</button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => onClose?.()} title="Suggest an event">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="sug-title" className="label">What would you like to see?</label>
            <input id="sug-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Editing workshop for Reels" />
          </div>
          <div>
            <label htmlFor="sug-details" className="label">Any details? (optional)</label>
            <textarea id="sug-details" rows="3" className="input" value={details} onChange={(e) => setDetails(e.target.value)} placeholder="What you'd want covered, ideal timing…" />
          </div>
          {myMarkets.length > 0 && (
            <div>
              <span className="label">Who is it for</span>
              <MarketPicker id="sug-scope" chapters={myMarkets} value={markets} onChange={setMarkets} />
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => onClose?.()} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={saving || !title.trim()} className="btn-primary">{saving ? <Spinner /> : 'Send suggestion'}</button>
          </div>
        </form>
      </Modal>
    </section>
  )
}

// ---------------------------------------------------------------- rating
//
// "HOW WAS IT", ASKED ONCE, OF THE PEOPLE WHO SAID THEY WERE COMING.
//
// Ethan: "if someone RSVP for an event, next time they should get a
// notification asking them to rate the specific event from 1 to 10 (on
// clickable stars) with the option to add a comment and then submit, this
// should open as a popup card on top of the calendar page, ensure it's only for
// people thats rsvp yes, also give them the ability to skip."
//
// THREE THINGS CHANGED FROM THE FIRST VERSION
//
//   IT TAKES WORDS NOW. A 7 with no comment tells you the event was fine and
//   nothing about what to do differently, which is the only reason to ask.
//
//   SKIPPING IS RECORDED, NOT REMEMBERED IN sessionStorage. "Not now" wrote the
//   id into sessionStorage, so closing the tab meant being asked again on the
//   next visit, for ever, by an event nobody wanted to talk about. A skip is a
//   row with `skipped = true`, which also means the admin view can tell "nobody
//   answered" from "nobody was asked".
//
//   IT ONLY APPEARS ON THE CALENDAR. It used to be mounted in AppLayout, so a
//   creator opening their DMs got a modal about last week'"'"'s Q&A on top of the
//   thread they came to read. Ethan asked for it "on top of the calendar page",
//   which is also the only page where the thing being asked about is in view.

export function EventRatingPrompt() {
  const { user, profile } = useAuth()
  const [target, setTarget] = useState(null) // event awaiting my rating
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user || !profile) return undefined
    let alive = true
    ;(async () => {
      const now = Date.now()
      const from = new Date(now - 14 * 86_400_000).toISOString()
      // Ended at least an hour ago. `ends_at` when there is one, otherwise the
      // start plus an hour, which is what the old query assumed silently.
      const to = new Date(now - 60 * 60_000).toISOString()
      const { data: past } = await supabase.from('events')
        .select('id, title, date, ends_at')
        .eq('rsvp_enabled', true)
        .gte('date', from).lte('date', to)
        .order('date', { ascending: false })
      if (!alive || !past?.length) return
      const done = past.filter((e) => new Date(e.ends_at || e.date).getTime() < now - 60 * 60_000)
      if (!done.length) return
      const ids = done.map((e) => e.id)
      const [{ data: rsvps }, { data: ratings }] = await Promise.all([
        // ONLY "GOING". Somebody who said they could not make it has nothing to
        // rate, and asking them reads as the app not having listened.
        supabase.from('event_rsvps').select('event_id').eq('user_id', user.id).eq('status', 'going').in('event_id', ids),
        supabase.from('event_ratings').select('event_id').eq('creator_id', user.id).in('event_id', ids),
      ])
      if (!alive) return
      const went = new Set((rsvps ?? []).map((r) => r.event_id))
      // A skip writes a row too, so "already answered" and "already declined to
      // answer" are the same test.
      const settled = new Set((ratings ?? []).map((r) => r.event_id))
      const candidate = done.find((e) => went.has(e.id) && !settled.has(e.id))
      if (candidate) setTarget(candidate)
    })()
    return () => { alive = false }
  }, [user, profile])

  if (!target) return null

  async function skip() {
    // Fire and forget the write but close immediately: the modal is in the way
    // and waiting on a round trip to dismiss something you declined is the
    // wrong order.
    setTarget(null)
    await supabase.from('event_ratings').insert({
      event_id: target.id, creator_id: user.id, rating: null, skipped: true, asked_at: new Date().toISOString(),
    })
  }

  async function submit() {
    if (!rating) return
    setSaving(true)
    const { error } = await supabase.from('event_ratings').insert({
      event_id: target.id,
      creator_id: user.id,
      rating,
      comment: comment.trim() || null,
      asked_at: new Date().toISOString(),
    })
    setSaving(false)
    if (error) { notice(`Could not save that: ${error.message}`); return }
    setTarget(null)
  }

  const shown = hover || rating

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-label="Rate the event">
      <div className="w-full max-w-md rounded-card bg-white p-6 shadow-lift animate-pop-in sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-smoke">How was it?</p>
        <h2 className="mt-1 text-xl font-bold text-ink">{target.title}</h2>
        <p className="mt-1 text-sm text-smoke">Tap a star to rate it from 1 to 10. It shapes what we run next.</p>

        {/* Ten stars wrap on a phone and must not reflow as you hover, so the
            row is a fixed grid rather than a flex wrap: a star growing on hover
            inside a wrapping row can push the tenth onto its own line. */}
        <div className="mt-5 grid grid-cols-10 gap-0.5" onMouseLeave={() => setHover(0)}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              aria-label={`${n} out of 10`}
              className="flex items-center justify-center p-0.5 transition-transform duration-150 hover:scale-110 active:scale-95"
            >
              <svg viewBox="0 0 24 24" className={cx('h-6 w-6 transition-colors duration-150 sm:h-7 sm:w-7', n <= shown ? 'text-brand' : 'text-gray-200')} fill="currentColor">
                <path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.05 1.1-6.5-4.7-4.6 6.5-.95z" />
              </svg>
            </button>
          ))}
        </div>
        <p className="mt-2 h-5 text-center text-sm font-semibold tabular-nums text-brand">{rating ? `${rating} / 10` : ''}</p>

        {/* THE COMMENT APPEARS ONCE THERE IS A SCORE. An empty box above an
            unanswered question is one more thing to read before the thing being
            asked; once you have tapped a star you have already decided, and the
            box is the natural next move. */}
        <div className={cx(
          'grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none',
          rating ? 'mt-2 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}>
          <div className="overflow-hidden">
            <label htmlFor="rate-comment" className="label">Anything to add? <span className="font-normal text-smoke">(optional)</span></label>
            <textarea
              id="rate-comment" rows={2} className="input" value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="What worked, what you would change"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <button onClick={skip} className="text-xs font-semibold text-smoke transition-colors hover:text-ink">
            Skip
          </button>
          <button onClick={submit} disabled={!rating || saving} className="btn-primary disabled:opacity-50">
            {saving ? <Spinner /> : 'Submit'}
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
        .select('event_id, rating, comment, skipped, created_at, profiles:creator_id(id, name, photo_url), events:event_id(id, title, date)')
        .eq('skipped', false)
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
                  <div key={i} className="text-xs text-smoke">
                    <div className="flex items-center gap-2">
                      <Avatar src={r.profiles?.photo_url} name={r.profiles?.name} size="xs" />
                      <span className="font-medium text-ink">{r.profiles?.name}</span>
                      <span className="ml-auto font-bold tabular-nums text-brand">{r.rating}/10</span>
                    </div>
                    {/* The words are the reason to ask, so they are not hidden
                        behind another disclosure. */}
                    {r.comment && <p className="ml-8 mt-1 italic leading-snug text-ink">&ldquo;{r.comment}&rdquo;</p>}
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
