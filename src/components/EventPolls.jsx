import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { confirm, notice } from '../lib/confirm'
import { Avatar, Badge, Modal, Spinner } from './ui'
import Icon from './Icon'
import { cx, formatDate } from '../lib/utils'
import { DateField, TimeField } from './DateTimeFields'
import { useMarkets } from '../lib/markets'
import { useMyScopes } from '../lib/scope'
import { announceToMarkets } from '../lib/announce'
import MarketPicker from './calendar/MarketPicker'
import { toast } from '../lib/toast'

// FIND A TIME: an admin proposes time slots, creators tick yes/no per slot, and
// the admin picks the slot most people can make - no external scheduling tool.
//
// IT IS CALLED "FIND A TIME" EVERYWHERE NOW. The section heading said that and
// the button said "Plan a meet", which is two names for one feature on one
// screen. Ethan: 'the button says "plan a meet" change it to "find a time"
// aswell.'
//
// IT IS SCOPED. A poll can be for everybody or for named markets, the same way
// an event can (see components/calendar/MarketPicker), and creators only see
// the ones that are theirs to answer. A Spanish community call in front of 43
// UK creators collects 43 useless votes and buries the one that mattered.
//
// AND IT GOES WHERE PEOPLE ARE. Posting it also drops a line into the
// announcements room of every market it is for - see lib/announce. A poll that
// only exists on the calendar page is a poll only the people who already opened
// the calendar page will answer.
//
// Composer: type a date and times (no native pickers - the fields auto-format
// as you type), then "repeat until" fills the rest of the day in equal slots
// (9:00-9:30, 9:30-10:00, ... until 16:00). Any slot can be removed before
// posting. Voting is one row per (slot, creator) with available true/false;
// admins see who said what.
//
// NOTHING IS RED OR GREEN. "Can make it" was `bg-green-600` and "Can't" was
// `bg-red-500`, which is a traffic light on a page that has exactly two
// permitted colours. Yes is the brand orange filled; no is charcoal. Not being
// free is not an error.

const timeLabel = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

function SlotVoteRow({ slot, myVote, counts, voters, isAdmin, onVote }) {
  const [open, setOpen] = useState(false)
  const voted = counts.yes > 0 || counts.no > 0
  return (
    <div className="rounded-xl border border-gray-100 bg-white px-4 py-3 transition-shadow hover:shadow-card">
      <div className="flex flex-wrap items-center gap-2.5">
        <p className="min-w-0 flex-1 text-sm font-semibold tabular-nums text-ink">
          {timeLabel(slot.starts_at)} – {timeLabel(slot.ends_at)}
        </p>
        {voted && (
          <span className="text-[11px] tabular-nums text-smoke">
            {counts.yes > 0 && <span className="font-semibold text-brand">{counts.yes} can make it</span>}
            {counts.yes > 0 && counts.no > 0 && <span> · </span>}
            {counts.no > 0 && <span className="font-semibold text-ink">{counts.no} can't</span>}
          </span>
        )}
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => onVote(slot, true)}
            className={cx('inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all',
              myVote === true ? 'bg-brand text-white shadow-card' : 'border border-gray-200 text-smoke hover:border-brand hover:text-brand')}
          >
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 12l5 5L20 6"/></svg>
            Can make it
          </button>
          <button
            type="button"
            onClick={() => onVote(slot, false)}
            className={cx('inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all',
              myVote === false ? 'bg-ink text-white shadow-card' : 'border border-gray-200 text-smoke hover:border-ink hover:text-ink')}
          >
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18"/></svg>
            Can't
          </button>
        </div>
        {isAdmin && voted && (
          <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs font-medium text-brand hover:underline">
            {open ? 'Hide' : 'Who?'}
          </button>
        )}
      </div>
      {isAdmin && open && (
        <div className="mt-2 space-y-1 border-t border-gray-50 pt-2">
          {voters.map((v) => (
            <div key={v.creator_id} className="flex items-center gap-2 text-xs text-smoke">
              <Avatar src={v.profiles?.photo_url} name={v.profiles?.name} size="xs" />
              <span className="font-medium text-ink">{v.profiles?.name}</span>
              <span className={v.available ? 'font-semibold text-brand' : 'text-smoke'}>{v.available ? 'yes' : 'no'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// A prominent day header so each date's slots are unmistakable: an orange
// date tile plus the weekday spelled out.
function DayHeader({ iso }) {
  const d = new Date(iso)
  return (
    <div className="mb-2.5 mt-5 flex items-center gap-3 first:mt-0">
      <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-brand text-white shadow-card">
        <span className="text-base font-bold leading-none">{d.getDate()}</span>
        <span className="text-[9px] font-semibold uppercase leading-tight tracking-wide">
          {d.toLocaleDateString([], { month: 'short' })}
        </span>
      </div>
      <div className="leading-tight">
        <p className="text-sm font-bold text-ink">{d.toLocaleDateString([], { weekday: 'long' })}</p>
        <p className="text-xs text-smoke">{d.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </div>
    </div>
  )
}

/** Group consecutive slots by calendar day for display. */
function groupSlotsByDay(slots) {
  const groups = []
  for (const slot of slots) {
    const key = formatDate(slot.starts_at)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.slots.push(slot)
    else groups.push({ key, date: slot.starts_at, slots: [slot] })
  }
  return groups
}

export default function EventPolls() {
  const { user, isAdmin } = useAuth()
  // The always-on scope helper, not CommunityContext: this section renders on a
  // page 45 live creators open whether or not the network preview flag is set.
  const { ids: scopeIds } = useMyScopes()
  const [polls, setPolls] = useState(null)
  const [showComposer, setShowComposer] = useState(false)

  const load = useCallback(async () => {
    // Polls + slots first, then all votes for those slots (with names for admins).
    const { data: pollRows } = await supabase.from('event_polls')
      .select('*, event_poll_slots(*)')
      .order('created_at', { ascending: false })
      .limit(6)
    const open = (pollRows ?? [])
      .filter((p) => isAdmin || !p.closed)
      // A poll with no markets named is everybody's. One with markets named is
      // only for people in them - and an admin sees the lot, because running
      // the programme means seeing every market's polls.
      .filter((p) => {
        if (isAdmin) return true
        const ids = p.community_ids ?? []
        if (!ids.length) return true
        if (!scopeIds) return true          // could not tell: fail open
        return ids.some((id) => scopeIds.has(id))
      })
    const slotIds = open.flatMap((p) => p.event_poll_slots.map((s) => s.id))
    let votes = []
    if (slotIds.length) {
      const { data: v } = await supabase.from('event_poll_votes')
        .select('*, profiles:creator_id(id, name, photo_url)')
        .in('slot_id', slotIds)
      votes = v ?? []
    }
    setPolls(open.map((p) => ({
      ...p,
      slots: [...p.event_poll_slots].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)),
      votes,
    })))
  }, [isAdmin, scopeIds])

  useEffect(() => { load() }, [load])

  async function vote(slot, available) {
    const { error } = await supabase.from('event_poll_votes')
      .upsert({ slot_id: slot.id, creator_id: user.id, available }, { onConflict: 'slot_id,creator_id' })
    if (error) { notice(`Could not save your vote: ${error.message}`); return }
    load()
  }

  async function closePoll(poll) {
    if (!await confirm(poll.closed ? `Reopen "${poll.title}"?` : `Close voting on "${poll.title}"?`)) return
    await supabase.from('event_polls').update({ closed: !poll.closed }).eq('id', poll.id)
    load()
  }
  async function removePoll(poll) {
    if (!await confirm(`Delete the "${poll.title}" availability poll and all its votes?`)) return
    await supabase.from('event_polls').delete().eq('id', poll.id)
    load()
  }

  if (!polls) return null
  if (polls.length === 0 && !isAdmin) return null

  return (
    <section className="mb-10">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Icon name="clock" className="h-5 w-5 text-brand" /> Find a time</h2>
        {isAdmin && (
          <button onClick={() => setShowComposer(true)} className="btn-secondary !py-2 text-xs">+ Find a time</button>
        )}
      </div>

      {polls.length === 0 ? (
        <p className="rounded-card border border-dashed border-gray-200 px-5 py-6 text-center text-sm text-smoke">
          Nothing to vote on right now. Start one and let creators pick the times that work.
        </p>
      ) : (
        <div className="space-y-5">
          {polls.map((poll) => {
            const votesFor = (slotId) => poll.votes.filter((v) => v.slot_id === slotId)
            return (
              <div key={poll.id} className="card !p-5 sm:!p-6">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold">
                    {poll.title}
                    {poll.closed && <Badge tone="grey">closed</Badge>}
                    <PollScope ids={poll.community_ids} />
                  </h3>
                  {isAdmin && (
                    <span className="flex gap-2">
                      <button onClick={() => closePoll(poll)} className="text-xs font-medium text-smoke hover:text-brand">{poll.closed ? 'Reopen' : 'Close voting'}</button>
                      <button onClick={() => removePoll(poll)} className="text-xs font-medium text-smoke hover:text-ink hover:underline">Delete</button>
                    </span>
                  )}
                </div>
                {poll.note && <p className="mb-3 text-sm text-smoke">{poll.note}</p>}
                {!poll.closed && <p className="mb-3 text-xs text-smoke">Tick every time you could make. You can change your answers any time.</p>}
                {groupSlotsByDay(poll.slots).map((g) => (
                  <div key={g.key}>
                    <DayHeader iso={g.date} />
                    <div className="space-y-2">
                      {g.slots.map((slot) => {
                        const vs = votesFor(slot.id)
                        const mine = vs.find((v) => v.creator_id === user.id)
                        return (
                          <SlotVoteRow
                            key={slot.id}
                            slot={slot}
                            myVote={poll.closed ? null : mine?.available ?? null}
                            counts={{ yes: vs.filter((v) => v.available).length, no: vs.filter((v) => !v.available).length }}
                            voters={vs}
                            isAdmin={isAdmin}
                            onVote={poll.closed ? () => {} : vote}
                          />
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {isAdmin && <PollComposer open={showComposer} onClose={() => setShowComposer(false)} onCreated={() => { setShowComposer(false); load() }} />}
    </section>
  )
}

// ---------------------------------------------------------------- composer

// THE SAME TYPED FIELDS THE FLIGHT LOG AND MANAGE EVENTS USE.
//
// This had its own pair of formatters that rewrote the whole value on every
// keystroke ("150826" -> "15/08/2026"), which is the exact fault the owner
// reported: type one digit and the "DD/MM/YYYY" placeholder vanishes, so from
// then on you are filling in a date from memory. Separate segments with painted
// separators keep every part of the hint on screen until it is filled, and the
// slashes and the colon are never typed. See components/DateTimeFields.

const timeToMinutes = (t) => {
  const m = String(t || '').trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!m || +m[1] > 23 || +m[2] > 59) return null
  return +m[1] * 60 + +m[2]
}

function PollComposer({ open, onClose, onCreated }) {
  const { user } = useAuth()
  const chapters = useMarkets()
  const [markets, setMarkets] = useState([])
  const [announce, setAnnounce] = useState(true)
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('09:30')
  const [repeatUntil, setRepeatUntil] = useState('')
  const [slots, setSlots] = useState([]) // {starts_at, ends_at} ISO strings
  const [saving, setSaving] = useState(false)
  const [slotError, setSlotError] = useState(null)

  function generate() {
    setSlotError(null)
    const startMin = timeToMinutes(startTime)
    const endMin = timeToMinutes(endTime)
    // `date` is already an ISO day from DateField, which only emits one when
    // all three segments are complete AND the result is a real date.
    if (!date || startMin == null) { setSlotError('Pick a date and a start time.'); return }
    if (endMin == null || endMin <= startMin) { setSlotError('Make the slot end later than it starts.'); return }
    const slotMinutes = endMin - startMin
    const limit = repeatUntil ? timeToMinutes(repeatUntil) : endMin
    if (repeatUntil && limit == null) { setSlotError('Repeat until needs to be a time like 16:00 (or leave it empty for a single slot).'); return }
    const [yy, mm, dd] = date.split('-').map(Number)
    const base = new Date(yy, mm - 1, dd, 0, 0, 0, 0)
    const mk = (mins) => {
      const d = new Date(base)
      d.setMinutes(mins)
      return d.toISOString()
    }
    let cursor = startMin
    const fresh = []
    while (cursor + slotMinutes <= limit && fresh.length < 40) {
      fresh.push({ starts_at: mk(cursor), ends_at: mk(cursor + slotMinutes) })
      cursor += slotMinutes
    }
    if (fresh.length === 0) { setSlotError('That range does not fit a single slot. Check the times.'); return }
    // append, skipping duplicates, so you can build slots across several days
    setSlots((prev) => {
      const seen = new Set(prev.map((s) => s.starts_at))
      return [...prev, ...fresh.filter((s) => !seen.has(s.starts_at))].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
    })
  }

  async function create() {
    if (!title.trim()) { notice('Give the meet a title.'); return }
    if (slots.length === 0) { notice('Add at least one time slot.'); return }
    setSaving(true)
    const { data: poll, error } = await supabase.from('event_polls')
      .insert({ title: title.trim(), note: note.trim() || null, created_by: user.id, community_ids: markets })
      .select().single()
    if (error) { setSaving(false); notice(`Could not create it: ${error.message}`); return }
    const { error: slotErr } = await supabase.from('event_poll_slots')
      .insert(slots.map((s) => ({ ...s, poll_id: poll.id })))
    if (slotErr) { setSaving(false); notice(`Created, but the slots failed: ${slotErr.message}`); return }

    // INTO THE ROOMS IT IS FOR. See lib/announce. A failure here is reported
    // and does NOT undo the poll - the poll is the thing that was asked for and
    // an admin can always post the line themselves.
    if (announce) {
      const first = [...slots].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))[0]
      const day = new Date(first.starts_at).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })
      const { posted, error: annErr } = await announceToMarkets({
        communityIds: markets,
        senderId: user.id,
        body: `**Find a time: ${title.trim()}**\n\n${slots.length} slot${slots.length === 1 ? '' : 's'} on offer from ${day}. Tick the ones you could make on the [calendar](/events).${note.trim() ? `\n\n${note.trim()}` : ''}`,
      })
      if (annErr) toast('Posted to the calendar, but the announcement failed')
      else if (posted) toast(`Posted to ${posted} announcement${posted === 1 ? '' : 's'} room${posted === 1 ? '' : 's'}`)
    }

    setSaving(false)
    setTitle(''); setNote(''); setSlots([]); setDate(''); setRepeatUntil(''); setSlotError(null); setMarkets([])
    onCreated()
  }

  return (
    <Modal open={open} onClose={onClose} title="Find a time">
      <div className="space-y-4">
        <div>
          <label htmlFor="poll-title" className="label">What are you finding a time for?</label>
          <input id="poll-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="July community call" />
        </div>
        <div>
          <label htmlFor="poll-note" className="label">Note (optional)</label>
          <input id="poll-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="30 minutes on Google Meet, agenda to follow" />
        </div>

        {/* WHO IS BEING ASKED. Empty means everybody, which is also what the
            column means, so the control and the data agree. */}
        <div>
          <span className="label">Who is this for</span>
          <MarketPicker id="poll-scope" chapters={chapters} value={markets} onChange={setMarkets} />
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-cloud/60 p-3">
          <input
            type="checkbox" checked={announce} onChange={(e) => setAnnounce(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-brand"
          />
          <span className="text-sm">
            <span className="font-medium">Post it in announcements</span>
            <span className="block text-xs text-smoke">
              {markets.length === 0
                ? 'Goes into the worldwide announcements room.'
                : `Goes into the announcements room of ${markets.length === 1 ? 'that market' : `all ${markets.length} markets`}.`}
            </span>
          </span>
        </label>

        <div className="rounded-xl bg-cloud/60 p-4 sm:p-5">
          <p className="mb-3 text-sm font-semibold text-ink">Offer time slots</p>
          <div className="mb-3">
            <DateField id="poll-date" label="Date" value={date} onChange={setDate} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <TimeField id="poll-start" label="First slot" value={startTime} onChange={setStartTime} />
            <TimeField id="poll-end" label="Slot ends" value={endTime} onChange={setEndTime} />
            <TimeField id="poll-repeat" label="Repeat until" value={repeatUntil} onChange={setRepeatUntil} optional />
          </div>
          {slotError && <p className="mt-3 rounded-lg bg-brand-tint px-3 py-2 text-xs font-medium text-brand">{slotError}</p>}
          <button type="button" onClick={generate} className="btn-secondary mt-4 w-full !py-2.5 text-sm sm:w-auto">
            {repeatUntil ? '+ Generate slots' : '+ Add this slot'}
          </button>
          <p className="mt-3 text-[11px] leading-relaxed text-smoke">
            Example: 09:00 to 09:30, repeat until 16:00 makes a slot every 30 minutes. Change the date and add more to offer several days.
          </p>
        </div>

        {slots.length > 0 && (
          <div>
            <p className="label">Proposed slots ({slots.length})</p>
            <div className="max-h-56 space-y-3 overflow-y-auto pr-1">
              {groupSlotsByDay(slots).map((g) => (
                <div key={g.key}>
                  <p className="mb-1.5 text-xs font-bold text-ink">
                    {new Date(g.date).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {g.slots.map((s) => (
                      <span key={s.starts_at} className="inline-flex items-center gap-1.5 rounded-full bg-brand-tint px-3 py-1.5 text-xs font-medium tabular-nums text-brand">
                        {timeLabel(s.starts_at)}–{timeLabel(s.ends_at)}
                        <button
                          type="button"
                          onClick={() => setSlots((prev) => prev.filter((x) => x.starts_at !== s.starts_at))}
                          aria-label="Remove slot"
                          className="text-sm leading-none transition-colors hover:text-ink"
                        >&times;</button>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={create} disabled={saving} className="btn-primary">
            {saving ? <Spinner /> : 'Post it'}
          </button>
        </div>
      </div>
    </Modal>
  )
}


// WHICH MARKETS A POLL IS FOR, as a chip on its heading. Only when it is not
// everybody: a "Worldwide" chip on every poll would be a word repeated down the
// page carrying no information.
function PollScope({ ids }) {
  const chapters = useMarkets()
  if (!ids?.length) return null
  const names = chapters.filter((c) => ids.includes(c.id)).map((c) => c.name)
  if (!names.length) return null
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-tint px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand">
      <Icon name="flag" className="h-3 w-3" />
      {names.length <= 2 ? names.join(' & ') : `${names[0]} +${names.length - 1}`}
    </span>
  )
}
