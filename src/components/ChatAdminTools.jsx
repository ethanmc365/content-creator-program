import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Modal, Skeleton, Spinner } from './ui'
import Icon from './Icon'
import { CONTINENTS } from '../lib/countries'
import { Select } from './ui'
import { confirm } from '../lib/confirm'
import { zonedTimeToUtc, formatInZone, zoneLabel } from '../lib/localTime'
import { COMMON_ZONES } from '../lib/timezones'

// The three things the team can drop into a conversation: a poll, a game
// challenge, a resource from the library.
//
// WHY THEY LIVE HERE AND NOT IN A PAGE. They were built inside the legacy
// Chat.jsx, which meant the market rooms - every room in Spain, Portugal,
// Germany, Romania and the Nordics, and every room opened next year - simply
// did not have them, and the poll was locked to #announcements even in the one
// place it existed. Ethan's rule is that an admin can do all three in ANY chat,
// and the only way that stays true for a room nobody has created yet is if the
// room inherits it rather than reimplements it.
//
// The caller owns posting. `postCard({ poll_id })` is whatever "put a message
// in this room" means where you are - the legacy chat writes a bare `channel`,
// a market room writes a namespaced key plus channel_id and community_id - so
// this component never needs to know which chat it is in.

const EMPTY_POLL = { question: '', options: ['', ''] }
const EMPTY_GAME = { title: '', mode: 'flags', region: 'World' }
const EMPTY_SCHEDULE = { body: '', date: '', time: '09:00' }

export default function ChatAdminTools({ tool, onClose, postCard, roomLabel = 'this room', room = null }) {
  const [poll, setPoll] = useState(EMPTY_POLL)
  const [game, setGame] = useState(EMPTY_GAME)
  const [busy, setBusy] = useState(false)
  const [resources, setResources] = useState(null)
  const [schedule, setSchedule] = useState(EMPTY_SCHEDULE)
  const [zone, setZone] = useState(room?.tz || 'Europe/London')
  const [pending, setPending] = useState(null)
  const [resourceSearch, setResourceSearch] = useState('')
  const [nowTick, setNowTick] = useState(0)

  // The room's own clock is the default, because that is the clock the people
  // reading it are on: 09:00 in the Spanish room means 09:00 in Madrid, whoever
  // is typing it and wherever they are.
  useEffect(() => { setZone(room?.tz || 'Europe/London') }, [room?.tz])

  // The library loads the first time somebody opens the picker, then stays.
  useEffect(() => {
    if (tool !== 'resource' || resources !== null) return
    let alive = true
    supabase.from('resources').select('id, title, category').order('created_at', { ascending: false })
      .then(({ data }) => { if (alive) setResources(data ?? []) })
    return () => { alive = false }
  }, [tool, resources])

  // What is already queued for THIS room. Scheduling something and then having
  // no way to see or stop it is how you end up with a message you have changed
  // your mind about going out anyway.
  const loadPending = useCallback(async () => {
    if (!room?.channel) { setPending([]); return }
    const { data } = await supabase
      .from('scheduled_announcements')
      .select('id, body, scheduled_for, tz, created_by')
      .eq('channel', room.channel)
      .is('posted_at', null)
      .is('cancelled_at', null)
      .order('scheduled_for')
    setPending(data ?? [])
  }, [room?.channel])

  useEffect(() => {
    if (tool !== 'schedule') return
    loadPending()
    setNowTick(Date.now())
    const t = setInterval(() => setNowTick(Date.now()), 20000)
    return () => clearInterval(t)
  }, [tool, loadPending])

  // The instant the message will actually go out, recomputed as you type, so
  // the confirmation line under the fields is never a promise the row does not
  // keep.
  const shownResources = useMemo(() => {
    const q = resourceSearch.trim().toLowerCase()
    if (!q) return resources ?? []
    return (resources ?? []).filter((r) =>
      `${r.title ?? ''} ${r.category ?? ''}`.toLowerCase().includes(q))
  }, [resources, resourceSearch])

  const scheduledAt = useMemo(
    () => zonedTimeToUtc(schedule.date, schedule.time, zone),
    [schedule.date, schedule.time, zone],
  )
  // `nowTick` rather than Date.now(): a render has to be a pure function of
  // state, and this repo's lint enforces it. Ticking every 20s is plenty for
  // "is the time you picked already gone".
  const inThePast = scheduledAt != null && nowTick > 0 && scheduledAt.getTime() <= nowTick

  async function createSchedule(e) {
    e.preventDefault()
    if (!schedule.body.trim() || !scheduledAt || inThePast || busy) return
    setBusy(true)
    const { data: me } = await supabase.auth.getUser()
    const { error } = await supabase.from('scheduled_announcements').insert({
      body: schedule.body.trim(),
      scheduled_for: scheduledAt.toISOString(),
      tz: zone,
      channel: room.channel,
      channel_id: room.channel_id ?? null,
      community_id: room.community_id ?? null,
      created_by: me.user?.id ?? null,
    })
    setBusy(false)
    if (error) return
    setSchedule({ ...EMPTY_SCHEDULE, time: schedule.time })
    loadPending()
  }

  async function cancelSchedule(row) {
    if (!await confirm('Cancel this scheduled message? It will not be posted.')) return
    await supabase.from('scheduled_announcements')
      .update({ cancelled_at: new Date().toISOString() }).eq('id', row.id)
    loadPending()
  }

  function close() {
    setPoll(EMPTY_POLL)
    setGame(EMPTY_GAME)
    setSchedule(EMPTY_SCHEDULE)
    setResourceSearch('')
    setBusy(false)
    onClose()
  }

  async function createPoll(e) {
    e.preventDefault()
    const options = poll.options.map((o) => o.trim()).filter(Boolean)
    if (!poll.question.trim() || options.length < 2 || busy) return
    setBusy(true)
    const { data, error } = await supabase.from('polls')
      .insert({ question: poll.question.trim(), created_by: (await supabase.auth.getUser()).data.user?.id })
      .select('id').single()
    if (!error && data) {
      await supabase.from('poll_options').insert(options.map((label, i) => ({ poll_id: data.id, label, sort_order: i })))
      // The card IS the message - no accompanying sentence, or every poll
      // arrives with an empty bubble above it.
      await postCard({ poll_id: data.id })
    }
    close()
  }

  async function createGame(e) {
    e.preventDefault()
    if (!game.title.trim() || busy) return
    setBusy(true)
    const { data, error } = await supabase.from('game_events')
      .insert({
        title: game.title.trim(),
        mode: game.mode,
        region: game.region,
        created_by: (await supabase.auth.getUser()).data.user?.id,
      })
      .select('id').single()
    if (!error && data) await postCard({ game_event_id: data.id })
    close()
  }

  async function shareResource(id) {
    if (busy) return
    setBusy(true)
    await postCard({ resource_id: id })
    close()
  }

  return (
    <>
      <Modal open={tool === 'poll'} onClose={close} title="Create a poll">
        <form onSubmit={createPoll} className="space-y-5">
          <div>
            <label htmlFor="poll-q" className="label">Question</label>
            <input id="poll-q" type="text" required className="input" value={poll.question}
              onChange={(e) => setPoll((p) => ({ ...p, question: e.target.value }))}
              placeholder="e.g. Where should our next challenge be?" />
          </div>
          <div>
            <p className="label">Options</p>
            <div className="space-y-2">
              {poll.options.map((opt, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text" className="input" placeholder={`Option ${i + 1}`} value={opt}
                    onChange={(e) => setPoll((p) => ({ ...p, options: p.options.map((o, j) => (j === i ? e.target.value : o)) }))}
                  />
                  {poll.options.length > 2 && (
                    <button type="button" aria-label="Remove option" className="btn-ghost !px-3"
                      onClick={() => setPoll((p) => ({ ...p, options: p.options.filter((_, j) => j !== i) }))}>✕</button>
                  )}
                </div>
              ))}
            </div>
            {poll.options.length < 6 && (
              <button type="button" className="btn-secondary mt-2 !py-2 text-xs"
                onClick={() => setPoll((p) => ({ ...p, options: [...p.options, ''] }))}>+ Add option</button>
            )}
          </div>
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? <Spinner /> : `Post poll to ${roomLabel}`}
          </button>
        </form>
      </Modal>

      {/* SCHEDULE A MESSAGE, IN THIS ROOM, ON THIS ROOM'S CLOCK.
          This used to be an admin page that could only ever post to
          #announcements. It is a room tool now, beside the poll, because
          "write this now and send it Monday morning" is a thing you decide
          while you are in the conversation, not somewhere else. */}
      <Modal open={tool === 'schedule'} onClose={close} title={`Schedule a message to ${roomLabel}`}>
        <form onSubmit={createSchedule} className="space-y-5">
          <div>
            <label htmlFor="sched-body" className="label">Message</label>
            <textarea
              id="sched-body" rows={4} required className="input"
              value={schedule.body}
              onChange={(e) => setSchedule((v) => ({ ...v, body: e.target.value }))}
              placeholder={`What should go out to ${roomLabel}?`}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="sched-date" className="label">Date</label>
              <input
                id="sched-date" type="date" required className="input"
                value={schedule.date}
                onChange={(e) => setSchedule((v) => ({ ...v, date: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="sched-time" className="label">Time</label>
              <input
                id="sched-time" type="time" required className="input"
                value={schedule.time}
                onChange={(e) => setSchedule((v) => ({ ...v, time: e.target.value }))}
              />
            </div>
            <div>
              <span className="label">Clock</span>
              <Select
                variant="field"
                ariaLabel="Timezone"
                value={zone}
                onChange={setZone}
                options={COMMON_ZONES}
              />
            </div>
          </div>

          {/* The instant, read back. A time typed in one zone and read in
              another is the single easiest thing to get wrong here, so the
              form says out loud what it is about to do. */}
          {scheduledAt && (
            <p className={inThePast ? 'text-sm font-medium text-red-600' : 'text-sm text-smoke'}>
              {inThePast
                ? 'That time has already passed. Pick a later one.'
                : <>Goes out <span className="font-medium text-ink">{formatInZone(scheduledAt, zone)}</span> {zoneLabel(zone)} time.</>}
            </p>
          )}

          <button type="submit" disabled={busy || !scheduledAt || inThePast || !schedule.body.trim()} className="btn-primary w-full">
            {busy ? <Spinner /> : 'Schedule it'}
          </button>
        </form>

        {pending === null ? (
          <Skeleton className="mt-6 h-16 w-full" />
        ) : pending.length > 0 ? (
          <div className="mt-6 border-t border-gray-100 pt-5">
            <h3 className="mb-3 text-sm font-semibold">
              Waiting to go out ({pending.length})
            </h3>
            <ul className="space-y-2">
              {pending.map((row) => (
                <li key={row.id} className="flex items-start gap-3 rounded-xl border border-gray-100 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{row.body}</span>
                    <span className="mt-0.5 block text-xs text-smoke">
                      {formatInZone(new Date(row.scheduled_for), row.tz || zone)} {zoneLabel(row.tz || zone)} time
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => cancelSchedule(row)}
                    className="shrink-0 text-xs font-medium text-red-500 hover:underline"
                  >
                    Cancel
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Modal>

      <Modal open={tool === 'game'} onClose={close} title="Post a game challenge">
        <form onSubmit={createGame} className="space-y-5">
          <div>
            <label htmlFor="game-title" className="label">Challenge title</label>
            <input id="game-title" type="text" required className="input" value={game.title}
              onChange={(e) => setGame((g) => ({ ...g, title: e.target.value }))}
              placeholder="e.g. Friday Flag Frenzy" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="game-mode" className="label">Mode</label>
              <Select
                id="game-mode" variant="field" ariaLabel="Mode"
                value={game.mode}
                onChange={(v) => setGame((g) => ({ ...g, mode: v }))}
                options={[
                  { value: 'flags', label: 'Guess the flag' },
                  { value: 'map', label: 'Find on the map' },
                  { value: 'airports', label: 'Airport codes' },
                  { value: 'currencies', label: 'Currencies' },
                ]}
              />
            </div>
            <div>
              <label htmlFor="game-region" className="label">Region</label>
              <Select
                id="game-region" variant="field" ariaLabel="Region"
                value={game.region}
                onChange={(v) => setGame((g) => ({ ...g, region: v }))}
                options={[{ value: 'World', label: 'World' }, ...CONTINENTS.map((c) => ({ value: c, label: c }))]}
              />
            </div>
          </div>
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? <Spinner /> : `Post to ${roomLabel}`}
          </button>
        </form>
      </Modal>

      <Modal open={tool === 'resource'} onClose={close} title="Share a resource">
        <p className="mb-4 text-sm text-smoke">Pick a library resource to post as a card in {roomLabel}.</p>
        {resources === null ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : resources.length === 0 ? (
          <p className="rounded-xl bg-cloud px-4 py-6 text-center text-sm text-smoke">
            No resources yet. Add some in <Link to="/admin/resources" className="font-medium text-brand hover:underline">Manage resources</Link> first.
          </p>
        ) : (
          <>
            {/* A search box appears once the library is big enough to scroll.
                Below that it is a control in the way of a list you can already
                see all of. */}
            {resources.length > 6 && (
              <input
                type="search"
                className="input mb-3"
                placeholder="Search the library…"
                value={resourceSearch}
                onChange={(e) => setResourceSearch(e.target.value)}
                aria-label="Search resources"
              />
            )}
          <div className="max-h-[60vh] space-y-2 overflow-y-auto overscroll-contain">
            {shownResources.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-smoke">Nothing matches that.</p>
            )}
            {shownResources.map((r) => (
              <button
                key={r.id}
                type="button"
                disabled={busy}
                onClick={() => shareResource(r.id)}
                className="flex w-full items-center gap-3 rounded-xl border border-gray-100 px-4 py-3 text-left transition-colors hover:border-brand hover:bg-brand-tint/40 disabled:opacity-50"
              >
                <Icon name="book" className="h-5 w-5 shrink-0 text-brand" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{r.title}</span>
                  {r.category && <span className="block truncate text-xs text-smoke">{r.category}</span>}
                </span>
                <span className="shrink-0 text-xs font-medium text-brand">Post →</span>
              </button>
            ))}
          </div>
          </>
        )}
      </Modal>
    </>
  )
}
