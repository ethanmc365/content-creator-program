import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Modal, Skeleton, Spinner } from './ui'
import ResourcePicker from './ResourcePicker'
import { DateField, TimeField } from './DateTimeFields'
import { CONTINENTS } from '../lib/countries'
import { Select } from './ui'
import { confirm } from '../lib/confirm'
import { zonedTimeToUtc, formatInZone, zoneLabel } from '../lib/localTime'
import { COMMON_ZONES } from '../lib/timezones'
import { useT } from '../lib/i18n'

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
  const tr = useT()
  const [poll, setPoll] = useState(EMPTY_POLL)
  const [game, setGame] = useState(EMPTY_GAME)
  const [busy, setBusy] = useState(false)
  const [schedule, setSchedule] = useState(EMPTY_SCHEDULE)
  const [zone, setZone] = useState(room?.tz || 'Europe/London')
  const [pending, setPending] = useState(null)
  const [nowTick, setNowTick] = useState(0)

  // The room's own clock is the default, because that is the clock the people
  // reading it are on: 09:00 in the Spanish room means 09:00 in Madrid, whoever
  // is typing it and wherever they are.
  useEffect(() => { setZone(room?.tz || 'Europe/London') }, [room?.tz])

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
      <Modal open={tool === 'poll'} onClose={close} title={tr("Create a poll")}>
        <form onSubmit={createPoll} className="space-y-5">
          <div>
            <label htmlFor="poll-q" className="label">{tr("Question")}</label>
            <input id="poll-q" type="text" required className="input" value={poll.question}
              onChange={(e) => setPoll((p) => ({ ...p, question: e.target.value }))}
              placeholder={tr("e.g. Where should our next challenge be?")} />
          </div>
          <div>
            <p className="label">{tr("Options")}</p>
            <div className="space-y-2">
              {poll.options.map((opt, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text" className="input" placeholder={`Option ${i + 1}`} value={opt}
                    onChange={(e) => setPoll((p) => ({ ...p, options: p.options.map((o, j) => (j === i ? e.target.value : o)) }))}
                  />
                  {poll.options.length > 2 && (
                    <button type="button" aria-label={tr("Remove option")} className="btn-ghost !px-3"
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
            <label htmlFor="sched-body" className="label">{tr("Message")}</label>
            <textarea
              id="sched-body" rows={4} required className="input"
              value={schedule.body}
              onChange={(e) => setSchedule((v) => ({ ...v, body: e.target.value }))}
              placeholder={`What should go out to ${roomLabel}?`}
            />
          </div>

          {/* TYPED, NOT PICKED FROM THE OPERATING SYSTEM.
              These were `<input type="date">` and `<input type="time">`, the
              last two native pickers on this form. Ethan: "if I click on
              schedule and then click on the date, it's showing up the weird
              Apple calendar pop up thing instead of me just typing in the
              actual date with my keyboard. And whenever I press the clock,
              it's showing up a pop up that's cut off because it's outside the
              main card."
              Both halves of that are the same fault. A native picker is UA
              shadow DOM: it opens a panel the page does not own, positioned
              against the VIEWPORT rather than against the dialog, so inside a
              modal it lands half off the card and nothing here can move it or
              clip it properly. And the calendar is the wrong instrument
              anyway - somebody scheduling Monday's post knows the date and
              wants to type six digits, not paginate a month grid.
              `DateField` and `TimeField` are the platform's own typed
              segments, already used by the flight log and the challenge form:
              real inputs, painted separators, no panel to be cut off. */}
          <div className="grid grid-cols-2 gap-4">
            <DateField
              id="sched-date"
              label={tr("Date")}
              value={schedule.date}
              onChange={(v) => setSchedule((s2) => ({ ...s2, date: v }))}
            />
            <TimeField
              id="sched-time"
              label={tr("Time")}
              value={schedule.time}
              onChange={(v) => setSchedule((s2) => ({ ...s2, time: v }))}
            />
            {/* THE CLOCK TAKES THE WHOLE ROW. It is the widest of the three -
                a zone name plus a city - and squeezing it into a third of a
                dialog is what made it read as an afterthought. It also sits
                UNDER the two fields it qualifies, which is the order the
                sentence is read in: this date, this time, on this clock.
                It defaults to the MARKET's timezone (see `room.tz`), so the
                Spanish room is already on Madrid time before anybody touches
                it. */}
            <div className="col-span-2">
              <span className="label">{tr("Clock")}</span>
              <Select
                variant="field"
                inFlow
                ariaLabel="Timezone"
                value={zone}
                onChange={setZone}
                options={COMMON_ZONES}
              />
              <p className="mt-1 text-[11px] text-gray-400">
                {roomLabel} runs on {zoneLabel(zone)} time. Everything above is read on this clock.
              </p>
            </div>
          </div>

          {/* The instant, read back. A time typed in one zone and read in
              another is the single easiest thing to get wrong here, so the
              form says out loud what it is about to do. */}
          {scheduledAt && (
            <p className={inThePast ? 'text-sm font-medium text-red-600' : 'text-sm text-smoke'}>
              {inThePast
                ? 'That time has already passed. Pick a later one.'
                : <>{tr("Goes out")} <span className="font-medium text-ink">{formatInZone(scheduledAt, zone)}</span> {zoneLabel(zone)} time.</>}
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

      <Modal open={tool === 'game'} onClose={close} title={tr("Post a game challenge")}>
        <form onSubmit={createGame} className="space-y-5">
          <div>
            <label htmlFor="game-title" className="label">{tr("Challenge title")}</label>
            <input id="game-title" type="text" required className="input" value={game.title}
              onChange={(e) => setGame((g) => ({ ...g, title: e.target.value }))}
              placeholder={tr("e.g. Friday Flag Frenzy")} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="game-mode" className="label">{tr("Mode")}</label>
              <Select
                id="game-mode" variant="field" inFlow ariaLabel="Mode"
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
              <label htmlFor="game-region" className="label">{tr("Region")}</label>
              <Select
                id="game-region" variant="field" inFlow ariaLabel="Region"
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

      {/* The same picker the DMs use. It was inline here, which is why a DM
          could not share a resource at all. */}
      <ResourcePicker
        open={tool === 'resource'}
        onClose={close}
        onPick={shareResource}
        busy={busy}
        where="Post"
      />

    </>
  )
}
