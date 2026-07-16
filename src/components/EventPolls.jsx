import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { confirm, notice } from '../lib/confirm'
import { Avatar, Badge, Modal, Spinner } from './ui'
import Icon from './Icon'
import { cx, formatDate, parseDateTime } from '../lib/utils'

// Availability polls ("find a time"): an admin proposes time slots, creators
// tick yes/no per slot, and the admin picks the slot most people can make -
// no external scheduling tool needed.
//
// Composer: type a date and times (no native pickers - the fields auto-format
// as you type), then "repeat until" fills the rest of the day in equal slots
// (9:00-9:30, 9:30-10:00, ... until 16:00). Any slot can be removed before
// posting. Voting is one row per (slot, creator) with available true/false;
// admins see who said what.

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
            {counts.yes > 0 && <span className="font-semibold text-green-600">{counts.yes} can make it</span>}
            {counts.yes > 0 && counts.no > 0 && <span> · </span>}
            {counts.no > 0 && <span className="font-semibold text-red-500">{counts.no} can't</span>}
          </span>
        )}
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => onVote(slot, true)}
            className={cx('inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all',
              myVote === true ? 'bg-green-600 text-white shadow-card' : 'border border-gray-200 text-smoke hover:border-green-600 hover:text-green-600')}
          >
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 12l5 5L20 6"/></svg>
            Can make it
          </button>
          <button
            type="button"
            onClick={() => onVote(slot, false)}
            className={cx('inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all',
              myVote === false ? 'bg-red-500 text-white shadow-card' : 'border border-gray-200 text-smoke hover:border-red-500 hover:text-red-500')}
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
              <span className={v.available ? 'text-green-600' : 'text-red-500'}>{v.available ? 'yes' : 'no'}</span>
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
  const [polls, setPolls] = useState(null)
  const [showComposer, setShowComposer] = useState(false)

  const load = useCallback(async () => {
    // Polls + slots first, then all votes for those slots (with names for admins).
    const { data: pollRows } = await supabase.from('event_polls')
      .select('*, event_poll_slots(*)')
      .order('created_at', { ascending: false })
      .limit(6)
    const open = (pollRows ?? []).filter((p) => isAdmin || !p.closed)
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
  }, [isAdmin])

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
          <button onClick={() => setShowComposer(true)} className="btn-secondary !py-2 text-xs">+ Plan a meet</button>
        )}
      </div>

      {polls.length === 0 ? (
        <p className="rounded-card border border-dashed border-gray-200 px-5 py-6 text-center text-sm text-smoke">
          No availability polls right now. Plan a meet and let creators vote on the times.
        </p>
      ) : (
        <div className="space-y-5">
          {polls.map((poll) => {
            const votesFor = (slotId) => poll.votes.filter((v) => v.slot_id === slotId)
            return (
              <div key={poll.id} className="card !p-5 sm:!p-6">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-base font-semibold">
                    {poll.title}
                    {poll.closed && <Badge tone="grey">closed</Badge>}
                  </h3>
                  {isAdmin && (
                    <span className="flex gap-2">
                      <button onClick={() => closePoll(poll)} className="text-xs font-medium text-smoke hover:text-brand">{poll.closed ? 'Reopen' : 'Close voting'}</button>
                      <button onClick={() => removePoll(poll)} className="text-xs font-medium text-red-500 hover:underline">Delete</button>
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

// Auto-format as the admin types, so there's no fiddly native picker:
// "150826" -> "15/08/2026" and "0930" -> "09:30". Rebuilt from digits on every
// keystroke, so backspacing works naturally too.
const typeDate = (v) => {
  const d = v.replace(/\D/g, '').slice(0, 8)
  if (d.length <= 2) return d
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`
}
const typeTime = (v) => {
  const d = v.replace(/\D/g, '').slice(0, 4)
  if (d.length <= 2) return d
  return `${d.slice(0, 2)}:${d.slice(2)}`
}
const timeToMinutes = (t) => {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!m || +m[1] > 23 || +m[2] > 59) return null
  return +m[1] * 60 + +m[2]
}

function TypedField({ id, label, value, onChange, placeholder, hint }) {
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <input
        id={id}
        className="input !py-3 text-center text-base font-semibold tabular-nums tracking-wide"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        inputMode="numeric"
        autoComplete="off"
      />
      {hint && <p className="mt-1 text-center text-[10px] text-smoke">{hint}</p>}
    </div>
  )
}

function PollComposer({ open, onClose, onCreated }) {
  const { user } = useAuth()
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
    const startIso = parseDateTime(date, startTime)
    const startMin = timeToMinutes(startTime)
    const endMin = timeToMinutes(endTime)
    if (!startIso) { setSlotError('Type the date as DD/MM/YYYY and times as HH:MM, e.g. 15/08/2026 and 09:00.'); return }
    if (endMin == null || endMin <= startMin) { setSlotError('Make the slot end later than it starts.'); return }
    const slotMinutes = endMin - startMin
    const limit = repeatUntil ? timeToMinutes(repeatUntil) : endMin
    if (repeatUntil && limit == null) { setSlotError('Repeat until needs to be a time like 16:00 (or leave it empty for a single slot).'); return }
    const base = new Date(startIso)
    base.setHours(0, 0, 0, 0)
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
      .insert({ title: title.trim(), note: note.trim() || null, created_by: user.id })
      .select().single()
    if (error) { setSaving(false); notice(`Could not create the poll: ${error.message}`); return }
    const { error: slotErr } = await supabase.from('event_poll_slots')
      .insert(slots.map((s) => ({ ...s, poll_id: poll.id })))
    setSaving(false)
    if (slotErr) { notice(`Poll created but slots failed: ${slotErr.message}`); return }
    setTitle(''); setNote(''); setSlots([]); setDate(''); setRepeatUntil(''); setSlotError(null)
    onCreated()
  }

  return (
    <Modal open={open} onClose={onClose} title="Plan a meet">
      <div className="space-y-4">
        <div>
          <label htmlFor="poll-title" className="label">What's the meet?</label>
          <input id="poll-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="July community call" />
        </div>
        <div>
          <label htmlFor="poll-note" className="label">Note (optional)</label>
          <input id="poll-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="30 minutes on Google Meet, agenda to follow" />
        </div>

        <div className="rounded-xl bg-cloud/60 p-4 sm:p-5">
          <p className="mb-3 text-sm font-semibold text-ink">Offer time slots</p>
          <div className="mb-3">
            <TypedField
              id="poll-date" label="Date" value={date}
              onChange={(e) => setDate(typeDate(e.target.value))}
              placeholder="DD/MM/YYYY" hint="just type the numbers, e.g. 150826"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <TypedField
              id="poll-start" label="First slot" value={startTime}
              onChange={(e) => setStartTime(typeTime(e.target.value))} placeholder="09:00"
            />
            <TypedField
              id="poll-end" label="Slot ends" value={endTime}
              onChange={(e) => setEndTime(typeTime(e.target.value))} placeholder="09:30"
            />
            <TypedField
              id="poll-repeat" label="Repeat until" value={repeatUntil}
              onChange={(e) => setRepeatUntil(typeTime(e.target.value))} placeholder="optional"
            />
          </div>
          {slotError && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{slotError}</p>}
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
                          className="text-sm leading-none hover:text-red-500"
                        >×</button>
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
            {saving ? <Spinner /> : 'Post to creators'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
